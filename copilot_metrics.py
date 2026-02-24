#!/usr/bin/env python3
import argparse
import json
import time
from datetime import date
from pathlib import Path
from typing import Any, Dict


def build_jwt(app_id: str, private_key_pem: str) -> str:
    try:
        import jwt
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Missing dependency 'PyJWT'. Install requirements or run local mode only."
        ) from exc

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
    try:
        import requests
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Missing dependency 'requests'. Install requirements to download reports."
        ) from exc

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
    try:
        import requests
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Missing dependency 'requests'. Install requirements to download reports."
        ) from exc

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
    try:
        import requests
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Missing dependency 'requests'. Install requirements to download reports."
        ) from exc

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
    totals_by_day: Dict[str, Dict[str, Any]] = {}
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
                    "total_merged": 0,
                    "total_merged_created_by_copilot": 0,
                    "total_suggestions": 0,
                    "total_applied_suggestions": 0,
                    "total_copilot_suggestions": 0,
                    "total_copilot_applied_suggestions": 0,
                    "_merge_minutes_weighted_sum": 0.0,
                    "_merge_minutes_weight": 0,
                    "_copilot_merge_minutes_weighted_sum": 0.0,
                    "_copilot_merge_minutes_weight": 0,
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
            bucket["total_merged"] += int(pr.get("total_merged", 0))
            bucket["total_merged_created_by_copilot"] += int(
                pr.get("total_merged_created_by_copilot", 0)
            )
            bucket["total_suggestions"] += int(pr.get("total_suggestions", 0))
            bucket["total_applied_suggestions"] += int(
                pr.get("total_applied_suggestions", 0)
            )
            bucket["total_copilot_suggestions"] += int(
                pr.get("total_copilot_suggestions", 0)
            )
            bucket["total_copilot_applied_suggestions"] += int(
                pr.get("total_copilot_applied_suggestions", 0)
            )

            total_merged = int(pr.get("total_merged", 0))
            median_minutes_to_merge = pr.get("median_minutes_to_merge")
            if total_merged > 0 and median_minutes_to_merge is not None:
                bucket["_merge_minutes_weighted_sum"] += (
                    float(median_minutes_to_merge) * total_merged
                )
                bucket["_merge_minutes_weight"] += total_merged

            total_copilot_merged = int(pr.get("total_merged_created_by_copilot", 0))
            copilot_median_minutes_to_merge = pr.get(
                "median_minutes_to_merge_copilot_authored"
            )
            if total_copilot_merged > 0 and copilot_median_minutes_to_merge is not None:
                bucket["_copilot_merge_minutes_weighted_sum"] += (
                    float(copilot_median_minutes_to_merge) * total_copilot_merged
                )
                bucket["_copilot_merge_minutes_weight"] += total_copilot_merged

    timeseries = []
    for day, values in sorted(totals_by_day.items(), key=lambda item: item[0]):
        merge_weight = int(values.get("_merge_minutes_weight", 0))
        copilot_merge_weight = int(values.get("_copilot_merge_minutes_weight", 0))
        timeseries.append(
            {
                "day": day,
                "total_reviewed": values["total_reviewed"],
                "total_created": values["total_created"],
                "total_created_by_copilot": values["total_created_by_copilot"],
                "total_reviewed_by_copilot": values["total_reviewed_by_copilot"],
                "total_merged": values["total_merged"],
                "total_merged_created_by_copilot": values[
                    "total_merged_created_by_copilot"
                ],
                "total_suggestions": values["total_suggestions"],
                "total_applied_suggestions": values["total_applied_suggestions"],
                "total_copilot_suggestions": values["total_copilot_suggestions"],
                "total_copilot_applied_suggestions": values[
                    "total_copilot_applied_suggestions"
                ],
                "median_minutes_to_merge": round(
                    values["_merge_minutes_weighted_sum"] / merge_weight, 2
                )
                if merge_weight
                else 0.0,
                "median_minutes_to_merge_copilot_authored": round(
                    values["_copilot_merge_minutes_weighted_sum"] / copilot_merge_weight,
                    2,
                )
                if copilot_merge_weight
                else 0.0,
            }
        )
    return timeseries


def write_pr_summary_chart(timeseries: list[Dict[str, Any]], output_path: str) -> None:
    if not timeseries:
        raise SystemExit("No pull request data found in reports.")

    try:
        from matplotlib import pyplot as plt
    except ModuleNotFoundError:
        print("matplotlib is not installed; skipping PR summary chart generation.")
        return

    days = [row["day"] for row in timeseries]
    reviewed_total = [row["total_reviewed"] for row in timeseries]
    reviewed_by_ccr = [row["total_reviewed_by_copilot"] for row in timeseries]
    reviewed_human = [max(total - copilot, 0) for total, copilot in zip(reviewed_total, reviewed_by_ccr)]

    created_total = [row["total_created"] for row in timeseries]
    created_by_cca = [row["total_created_by_copilot"] for row in timeseries]
    created_human = [
        max(total - copilot, 0) for total, copilot in zip(created_total, created_by_cca)
    ]

    merged_total = [row["total_merged"] for row in timeseries]
    merged_by_cca = [row["total_merged_created_by_copilot"] for row in timeseries]
    merged_human = [
        max(total - copilot, 0) for total, copilot in zip(merged_total, merged_by_cca)
    ]

    total_suggestions = [row["total_suggestions"] for row in timeseries]
    total_applied_suggestions = [row["total_applied_suggestions"] for row in timeseries]
    copilot_suggestions = [row["total_copilot_suggestions"] for row in timeseries]
    copilot_applied_suggestions = [
        row["total_copilot_applied_suggestions"] for row in timeseries
    ]
    acceptance_rate = [
        (applied / total * 100.0) if total else 0.0
        for applied, total in zip(total_applied_suggestions, total_suggestions)
    ]
    copilot_acceptance_rate = [
        (applied / total * 100.0) if total else 0.0
        for applied, total in zip(copilot_applied_suggestions, copilot_suggestions)
    ]
    median_minutes_to_merge = [row["median_minutes_to_merge"] for row in timeseries]
    median_minutes_to_merge_copilot = [
        row["median_minutes_to_merge_copilot_authored"] for row in timeseries
    ]

    fig, axes = plt.subplots(2, 2, figsize=(14, 10), sharex=True)
    x = list(range(len(days)))
    width = 0.2

    ax = axes[0][0]
    ax.bar(
        [val - width / 2 for val in x],
        reviewed_human,
        width=width,
        color="#1f77b4",
        label="Human",
    )
    ax.bar(
        [val + width / 2 for val in x],
        reviewed_by_ccr,
        width=width,
        color="#ff7f0e",
        label="CCR",
    )
    ax.set_title("PR Review Summary")
    ax.set_ylabel("PRs")
    ax.legend(loc="upper left")
    ax.grid(True, axis="y", alpha=0.3)

    ax = axes[0][1]
    ax.bar(
        [val - 1.5 * width for val in x],
        created_human,
        width=width,
        color="#1f77b4",
        label="Human Created",
    )
    ax.bar(
        [val - 0.5 * width for val in x],
        created_by_cca,
        width=width,
        color="#ff7f0e",
        label="Copilot Created",
    )
    ax.bar(
        [val + 0.5 * width for val in x],
        merged_human,
        width=width,
        color="#2ca02c",
        label="Human Merged",
    )
    ax.bar(
        [val + 1.5 * width for val in x],
        merged_by_cca,
        width=width,
        color="#9467bd",
        label="Copilot-authored Merged",
    )
    ax.set_title("PR Throughput")
    ax.set_ylabel("PRs")
    ax.legend(loc="upper left", fontsize=8)
    ax.grid(True, axis="y", alpha=0.3)

    ax = axes[1][0]
    ax.bar(
        [val - width / 2 for val in x],
        total_suggestions,
        width=width,
        color="#17becf",
        label="Total Suggestions",
    )
    ax.bar(
        [val + width / 2 for val in x],
        copilot_suggestions,
        width=width,
        color="#bcbd22",
        label="Copilot Suggestions",
    )
    ax.set_title("PR Review Suggestions and Acceptance")
    ax.set_ylabel("Suggestions")
    ax.grid(True, axis="y", alpha=0.3)
    rate_ax = ax.twinx()
    rate_ax.plot(x, acceptance_rate, color="#d62728", marker="o", label="Acceptance %")
    rate_ax.plot(
        x,
        copilot_acceptance_rate,
        color="#8c564b",
        marker="o",
        label="Copilot Acceptance %",
    )
    rate_ax.set_ylabel("Acceptance %")
    rate_ax.set_ylim(0, 100)
    handles1, labels1 = ax.get_legend_handles_labels()
    handles2, labels2 = rate_ax.get_legend_handles_labels()
    ax.legend(handles1 + handles2, labels1 + labels2, loc="upper left", fontsize=8)

    ax = axes[1][1]
    ax.plot(
        x,
        median_minutes_to_merge,
        color="#1f77b4",
        marker="o",
        label="Overall",
    )
    ax.plot(
        x,
        median_minutes_to_merge_copilot,
        color="#ff7f0e",
        marker="o",
        label="Copilot-authored",
    )
    ax.set_title("Median Time to Merge")
    ax.set_ylabel("Minutes")
    ax.legend(loc="upper left")
    ax.grid(True, axis="y", alpha=0.3)

    for axis in axes[1]:
        axis.set_xticks(x)
        axis.set_xticklabels(days, rotation=45, ha="right")

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
    parser.add_argument(
        "--input-json",
        help=(
            "Optional path to a local JSON report file to process without downloading. "
            "Supports either a full payload with a 'reports' array or a single report file."
        ),
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
    input_json = pick("INPUT_JSON", args.input_json)

    if input_json:
        return {
            "app_id": app_id,
            "installation_id": installation_id,
            "private_key": private_key,
            "enterprise": enterprise,
            "api_base": api_base or "https://api.github.com",
            "output": output,
            "input_json": input_json,
        }

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
        "input_json": input_json,
    }


def load_reports_from_input_json(input_path: str) -> tuple[Dict[str, Any], list[Dict[str, Any]]]:
    path = Path(input_path)
    if not path.exists():
        raise SystemExit(f"Input JSON file not found: {input_path}")

    payload = json.loads(path.read_text(encoding="utf-8"))

    if isinstance(payload, dict) and isinstance(payload.get("reports"), list):
        reports = payload.get("reports", [])
        return payload, reports

    if isinstance(payload, dict) and isinstance(payload.get("day_totals"), list):
        wrapped_payload = {
            "report_links": {},
            "reports": [payload],
        }
        return wrapped_payload, wrapped_payload["reports"]

    if isinstance(payload, list):
        wrapped_payload = {
            "report_links": {},
            "reports": payload,
        }
        return wrapped_payload, wrapped_payload["reports"]

    raise SystemExit(
        "Unsupported input JSON shape. Expected either a full payload with 'reports', "
        "a single report object with 'day_totals', or a list of report objects."
    )


def main() -> None:
    args = parse_args()
    settings = resolve_settings(args)
    input_json = settings.get("input_json")

    if input_json:
        print(f"Loading report data from local JSON: {input_json}...")
        output_payload, reports = load_reports_from_input_json(input_json)
    else:
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
