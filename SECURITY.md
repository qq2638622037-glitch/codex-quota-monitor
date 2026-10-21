# Security policy

## Supported versions

Security fixes are considered for the latest published version (currently v1.6.0).

## Responsible reporting

Please use GitHub's private vulnerability reporting mechanism, if enabled on the repository, or contact the maintainers before posting exploitable details publicly. Do not submit session cookies, bearer tokens, API responses with identity information, or private ChatGPT conversations in public issues.

## Permission and privacy boundary

- The optional extension uses the browser's `system.memory` permission, a ChatGPT-only content script, and exactly one `host_permissions` entry: `https://codex-reset.com/*` for a public read-only forecast API. It has no other host permissions.
- The userscript prefers the optional extension for a fixed public GET and attempts a direct page-level request only as fallback if the extension is unavailable. The request deliberately omits cookies, referrer, bearer tokens and ChatGPT usage data. The provider still sees the requesting device's IP address.
- The userscript may temporarily read a first-party session bearer token **in memory** to query a first-party, read-only quota endpoint after an unauthenticated request is rejected.
- The script stores only UI preferences and a quota percentage/reset-timestamp cache locally. There is no third-party telemetry.
- The extension does **not** capture browser histories, ChatGPT conversations, account usage readings, RAM readings beyond the local browser page, or authentication tokens to external services.
- Predictions, timestamp and confidence are public third-party values, **not** verified OpenAI announcements. Do not treat a probability as evidence that a reset occurred.

This project is not a credential manager or a security boundary. Install only after reviewing the source code and extension permissions.
