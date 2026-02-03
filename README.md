# Copilot Metrics via GitHub App

This script generates a GitHub App JWT, exchanges it for an installation token, retrieves the latest 28‑day enterprise Copilot usage report links, and downloads the report data.

## Setup: Create the Enterprise GitHub App and collect IDs

### 1) Create the Enterprise GitHub App

1. As an **enterprise owner**, go to your enterprise account.
2. Open **Settings** → **GitHub Apps**.
3. Select **New GitHub App**.
4. Register the app (name, dummy homepage URL, and leave the rest of the metadata blank).
5. Save the app. The app is now owned by the enterprise and can only be installed within it.

### 2) Configure app permissions

For Copilot metrics, set the following permissions in the app settings:

- **Enterprise permissions** → **Enterprise Copilot metrics**: **Read**

If you intend to call organization-level metrics endpoints instead, also set:

- **Organization permissions** → **Organization Copilot metrics**: **Read**

Save the changes.

### 3) Generate and download the private key

1. In the app settings, go to **Private keys**.
2. Select **Generate a private key**.
3. Download the `.pem` file and store it securely. Remember the path for later.

### 4) Find the App ID

On the app’s settings page, note the **App ID** value. This is the `--app-id` argument.

### 5) Install the app and get the Installation ID

1. From the app’s settings page in the enterprise account, open **Install App**.
2. Install the app on the enterprise (or on specific organizations within the enterprise if required by your setup).
3. After installation, copy the Installation ID:
  - From the browser URL: it ends with `/installations/<ID>`.
  - Or via the API using a JWT: `GET /app/installations`.

## 1) Activate a venv

```bash
python3 -m venv .venv
source .venv/bin/activate
```

## 2) Install dependencies

```bash
pip install -r requirements.txt
```

## 3) Invoke the script

```bash
python copilot_metrics.py \
  --app-id <GITHUB_APP_ID> \
  --private-key <PATH_TO_PRIVATE_KEY_PEM> \
  --installation-id <APP_INSTALLATION_ID> \
  --enterprise <ENTERPRISE_SLUG>
```

### Arguments

- `--app-id`: GitHub App ID.
- `--private-key`: Path to the GitHub App private key PEM file.
- `--installation-id`: GitHub App installation ID for the enterprise installation.
- `--enterprise`: GitHub enterprise slug (used for enterprise metrics endpoint).
- `--api-base`: Optional GitHub API base URL (default: https://api.github.com).
- `--output`: Optional file path to write the JSON response.
