#!/usr/bin/env python3
import argparse
import json
import time
from datetime import date
from pathlib import Path
from typing import Any, Dict

import jwt
import requests
from matplotlib import pyplot as plt


def build_jwt(app_id: str, private_key_pem: str) -> str:
    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + 9 * 60,
        "iss": app_id,
    }
    token = jwt.encode(payload, private_key_pem, algorithm="RS256")
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token


def request_installation_token(
    api_base: str, jwt_token: str, installation_id: str
) -> str:
    url = f"{api_base}/app/installations/{installation_id}/access_tokens"
    headers = {
        "Authorization": f"Bearer {jwt_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    response = requests.post(url, headers=headers, timeout=30)
    response.raise_for_status()
    data = response.json()
    return data["token"]


def fetch_enterprise_usage_report_links(
    api_base: str, installation_token: str, enterprise: str
) -> Dict[str, Any]:
    url = (
        f"{api_base}/enterprises/{enterprise}/copilot/metrics/reports/"
        "enterprise-28-day/latest"
    )
    headers = {
        "Authorization": f"Bearer {installation_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()


def download_report_data(report_links: Dict[str, Any]) -> list[Dict[str, Any]]:
    links = report_links.get("download_links", [])
    if not links:
        return []
    reports: list[Dict[str, Any]] = []
    for link in links:
        response = requests.get(link, timeout=60)
        response.raise_for_status()
        reports.append(response.json())
    return reports


def build_pr_timeseries(reports: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    totals_by_day: Dict[str, Dict[str, int]] = {}
    for report in reports:
        for day_total in report.get("day_totals", []):
            day = day_total.get("day")
            if not day:
                continue
            pr = day_total.get("pull_requests", {})
            bucket = totals_by_day.setdefault(
                day,
                {
                    "total_reviewed": 0,
                    "total_created": 0,
                    "total_created_by_copilot": 0,
                    "total_reviewed_by_copilot": 0,
                },
            )
            bucket["total_reviewed"] += int(pr.get("total_reviewed", 0))
            bucket["total_created"] += int(pr.get("total_created", 0))
            bucket["total_created_by_copilot"] += int(
                pr.get("total_created_by_copilot", 0)
            )
            bucket["total_reviewed_by_copilot"] += int(
                pr.get("total_reviewed_by_copilot", 0)
            )

    timeseries = [
        {"day": day, **values}
        for day, values in sorted(totals_by_day.items(), key=lambda item: item[0])
    ]
    return timeseries


def write_pr_summary_chart(timeseries: list[Dict[str, Any]], output_path: str) -> None:
    if not timeseries:
        raise SystemExit("No pull request data found in reports.")

    days = [row["day"] for row in timeseries]
    reviewed_total = [row["total_reviewed"] for row in timeseries]
    reviewed_by_ccr = [row["total_reviewed_by_copilot"] for row in timeseries]
    reviewed_human = [max(total - copilot, 0) for total, copilot in zip(reviewed_total, reviewed_by_ccr)]

    created_total = [row["total_created"] for row in timeseries]
    created_by_cca = [row["total_created_by_copilot"] for row in timeseries]
    created_human = [max(total - copilot, 0) for total, copilot in zip(created_total, created_by_cca)]

    fig, axes = plt.subplots(2, 1, figsize=(12, 8), sharex=True)
    x = list(range(len(days)))
    width = 0.4

    axes[0].bar([val - width / 2 for val in x], reviewed_human, width=width, color="#1f77b4", label="Human")
    axes[0].bar([val + width / 2 for val in x], reviewed_by_ccr, width=width, color="#ff7f0e", label="CCR")
    axes[0].set_title("CCR Summary")
    axes[0].set_ylabel("PRs")
    axes[0].legend(loc="upper left")
    axes[0].grid(True, axis="y", alpha=0.3)

    axes[1].bar([val - width / 2 for val in x], created_human, width=width, color="#1f77b4", label="Human")
    axes[1].bar([val + width / 2 for val in x], created_by_cca, width=width, color="#ff7f0e", label="CCA")
    axes[1].set_title("CCA Summary")
    axes[1].set_ylabel("PRs")
    axes[1].legend(loc="upper left")
    axes[1].grid(True, axis="y", alpha=0.3)

    axes[1].set_xticks(x)
    axes[1].set_xticklabels(days, rotation=45, ha="right")
    plt.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a GitHub App JWT and call Copilot metrics API."
    )
    parser.add_argument("--app-id", help="GitHub App ID")
    parser.add_argument(
        "--private-key",
        help="Path to the GitHub App private key PEM file",
    )
    parser.add_argument(
        "--installation-id", help="GitHub App installation ID"
    )
    parser.add_argument(
        "--enterprise",
        help="GitHub enterprise slug (used for enterprise metrics endpoint)",
    )
    parser.add_argument(
        "--api-base",
        default="https://api.github.com",
        help="GitHub API base URL (default: https://api.github.com)",
    )
    parser.add_argument(
        "--output",
        help="Optional path to write JSON response (default: metrics-YYYY-MM-DD.json)",
    )
    return parser.parse_args()


def load_env_file(env_path: Path) -> Dict[str, str]:
    data: Dict[str, str] = {}
    if not env_path.exists():
        return data
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        data[key] = value
    return data


def resolve_settings(args: argparse.Namespace) -> Dict[str, str]:
    env_path = Path("test.env")
    env = load_env_file(env_path)

    def pick(env_key: str, arg_value: str | None) -> str | None:
        if env_path.exists() and env.get(env_key):
            return env.get(env_key)
        return arg_value

    app_id = pick("APP_ID", args.app_id) or pick("AppID", args.app_id)
    installation_id = pick("INSTALLATION_ID", args.installation_id) or pick(
        "InstallationID", args.installation_id
    )
    private_key = pick("PRIVATE_KEY", args.private_key) or pick(
        "PemPath", args.private_key
    ) or pick("PRIVATE_KEY_PATH", args.private_key)
    enterprise = pick("ENTERPRISE", args.enterprise)
    api_base = pick("API_BASE", args.api_base)
    output = pick("OUTPUT", args.output)

    missing = [
        name
        for name, value in {
            "--app-id": app_id,
            "--private-key": private_key,
            "--installation-id": installation_id,
            "--enterprise": enterprise,
        }.items()
        if not value
    ]
    if missing:
        raise SystemExit(
            "Missing required settings: "
            + ", ".join(missing)
            + ". Provide args or set them in test.env."
        )

    return {
        "app_id": app_id,
        "installation_id": installation_id,
        "private_key": private_key,
        "enterprise": enterprise,
        "api_base": api_base or "https://api.github.com",
        "output": output,
    }


def main() -> None:
    args = parse_args()
    settings = resolve_settings(args)
    print("Loading private key...")
    private_key_pem = Path(settings["private_key"]).read_text(encoding="utf-8")

    print("Generating JWT...")
    jwt_token = build_jwt(settings["app_id"], private_key_pem)

    print("Requesting installation access token...")
    installation_token = request_installation_token(
        settings["api_base"], jwt_token, settings["installation_id"]
    )

    print("Fetching enterprise 28-day report links...")
    report_links = fetch_enterprise_usage_report_links(
        settings["api_base"], installation_token, settings["enterprise"]
    )

    print("Downloading report data from signed URLs...")
    reports = download_report_data(report_links)

    output_payload = {
        "report_links": report_links,
        "reports": reports,
    }
    output = json.dumps(output_payload, indent=2)
    output_path = settings["output"] or f"metrics-{date.today():%Y-%m-%d}.json"
    print(f"Writing output to {output_path}...")
    Path(output_path).write_text(output + "\n", encoding="utf-8")
    pr_chart_path = f"pr-summary-{date.today():%Y-%m-%d}.png"
    print(f"Generating PR summary chart at {pr_chart_path}...")
    timeseries = build_pr_timeseries(reports)
    write_pr_summary_chart(timeseries, pr_chart_path)
    print("Done.")


if __name__ == "__main__":
    main()
