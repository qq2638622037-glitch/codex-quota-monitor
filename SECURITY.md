# Security policy

## Supported versions

Security fixes are considered for the latest published version (currently v1.4.0).

## Responsible reporting

Please use GitHub's private vulnerability reporting mechanism, if enabled on the repository, or contact the maintainers before posting exploitable details publicly. Do not submit session cookies, bearer tokens, API responses with identity information, or private ChatGPT conversations in public issues.

## Permission and privacy boundary

- The optional extension uses the browser's `system.memory` permission and is restricted to ChatGPT pages.
- The userscript may temporarily read a first-party session bearer token **in memory** to query a first-party, read-only quota endpoint after an unauthenticated request is rejected.
- The script stores only UI preferences and a quota percentage/reset-timestamp cache locally. There is no third-party telemetry.
- The extension does **not** capture browser histories, ChatGPT conversations, or authentication tokens.

This project is not a credential manager or a security boundary. Install only after reviewing the source code and extension permissions.
