#!/usr/bin/env python3
import argparse
import json
import time
from pathlib import Path
from typing import Any, Dict

import jwt
import requests


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


def fetch_copilot_usage(
    api_base: str, installation_token: str, org: str
) -> Dict[str, Any]:
    url = f"{api_base}/orgs/{org}/copilot/usage"
    headers = {
        "Authorization": f"Bearer {installation_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a GitHub App JWT and call Copilot metrics API."
    )
    parser.add_argument("--app-id", required=True, help="GitHub App ID")
    parser.add_argument(
        "--private-key",
        required=True,
        help="Path to the GitHub App private key PEM file",
    )
    parser.add_argument(
        "--installation-id", required=True, help="GitHub App installation ID"
    )
    parser.add_argument("--org", required=True, help="GitHub organization name")
    parser.add_argument(
        "--api-base",
        default="https://api.github.com",
        help="GitHub API base URL (default: https://api.github.com)",
    )
    parser.add_argument(
        "--output",
        help="Optional path to write JSON response (default: stdout)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    private_key_pem = Path(args.private_key).read_text(encoding="utf-8")

    jwt_token = build_jwt(args.app_id, private_key_pem)
    installation_token = request_installation_token(
        args.api_base, jwt_token, args.installation_id
    )
    usage = fetch_copilot_usage(args.api_base, installation_token, args.org)

    output = json.dumps(usage, indent=2)
    if args.output:
        Path(args.output).write_text(output + "\n", encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
