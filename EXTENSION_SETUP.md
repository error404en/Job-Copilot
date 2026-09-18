# JobCopilot Chrome Extension Setup

The JobCopilot browser extension acts as a bridge between the browser DOM (your active tabs) and the backend Hermes Auto-Apply Agent.

## Installation Instructions

1. Locate the `JobCopilot_Extension.zip` file in the root of the repository.
2. Extract the ZIP file to a known folder (e.g., `Desktop/JobCopilot_Extension`).
3. Open Google Chrome or Microsoft Edge.
4. Navigate to `chrome://extensions/` (or `edge://extensions/`).
5. In the top right corner, enable **Developer mode**.
6. Click **Load unpacked**.
7. Select the folder where you extracted the extension.
8. The JobCopilot extension icon should now appear in your browser toolbar.

## Connecting to the Backend

By default, the extension is configured to communicate with the production backend. If you are running the backend locally for development:

1. Click on the JobCopilot extension icon.
2. Open the extension **Options** or **Settings**.
3. Change the `API URL` to `http://localhost:8000`.
4. Ensure your backend is running with `uvicorn main:app --port 8000`.

## Security & Domain Restrictions

The extension is strictly scoped to prevent unauthorized data exfiltration and abuse. It is **not** a general-purpose web scraper.

### Allowed Domains
The extension is architecturally restricted to interact *only* with approved Applicant Tracking System (ATS) domains. The `manifest.json` host permissions explicitly whitelist:
- `*://*.greenhouse.io/*`
- `*://*.lever.co/*`
- `*://*.ashbyhq.com/*`

### Blocked Domains
Bulk job boards and aggregator platforms are strictly **blocked** to prevent automated scraping violations, rate-limiting bans, and malicious misuse. The extension will refuse to operate or inject scripts on:
- `linkedin.com`
- `indeed.com`
- `glassdoor.com`

### Backend Validation
Even if the extension's local restrictions are bypassed (e.g., by a malicious user modifying the unpacked extension), the FastAPI backend strictly enforces the allowed domain whitelist in the `/api/applications/auto-apply` endpoint. Any URL outside the approved ATS domains will be rejected with an HTTP 403 error.

## Hermes Authentication
When the extension sends a request to the backend to autofill a form, it attaches your Clerk JWT (retrieved from the frontend session) in the `Authorization: Bearer` header. The backend validates this JWT before triggering the Playwright agent, ensuring that Hermes only ever pulls your specific profile data and resume.
