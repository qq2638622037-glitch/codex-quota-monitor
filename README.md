# Codex Quota Monitor

**An unofficial, lightweight quota + PC RAM overlay for ChatGPT in Edge/Chrome.**

[**Simplified Chinese installation guide / README**](README.zh-CN.md)

**Version:** v1.4.0 | **License:** MIT

This repository contains the tested v1.4 userscript and an **optional** Manifest V3 browser extension that exposes system physical RAM. It is designed for split-screen workflows and multiple ChatGPT tabs.

> **Unofficial project.** Not affiliated with, endorsed by, or supported by OpenAI, ChatGPT, Codex, Microsoft, Edge, or Tampermonkey. The quota endpoint is undocumented and may change, become unavailable, or restrict access. Use at your own discretion.

## Features

- Remaining quota for **5-hour** and **7-day** windows, when reported by ChatGPT; reset time and countdown.
- Small, movable overlay for split-screen work. Per-tab close/reopen (`Ctrl + Alt + Q`), collapse, and position.
- Conservative editor avoidance: repositions only when covering an active editing area; restores the user-chosen position.
- Color-only quota alerts: no sound, popups, system notifications, or background monitoring service.
- Cross-tab quota result cache (best-effort sharing; helps avoid redundant fetches).
- Optional **total physical RAM** information (usage % and used/total GB) from a local extension, with color thresholds.
- Chinese UI, dark/light theme, no third-party JavaScript dependencies, no telemetry.

### Alert colors

| Metric | Orange | Red |
| --- | --- | --- |
| 5-hour quota remaining | 30% or less | 10% or less |
| 7-day quota remaining | 20% or less | 5% or less |
| Physical RAM used | 80% or more | 90% or more |

## Install

### Step 1: userscript (required)

1. Install a userscript manager such as **Tampermonkey** on Edge or Chrome and permit userscripts in browser extension settings as needed.
2. Download this repository (`Code` -> `Download ZIP`) and unzip it.
3. In Tampermonkey, open the dashboard, choose **Utilities -> Import from file** (exact labels vary by version), and select:
   [`userscript/Codex_Quota_Bars_Web_CN_v1.4.user.js`](userscript/Codex_Quota_Bars_Web_CN_v1.4.user.js)
4. **Disable older versions** of the same userscript, to prevent duplicate overlays.
5. Open or refresh `https://chatgpt.com/` while signed in.

The two quota rows work **without** the RAM extension. Missing server fields are shown as unavailable rather than inferred.

### Step 2: local RAM extension (optional)

1. Navigate to `edge://extensions` in Edge (`chrome://extensions` in Chrome).
2. Turn on **Developer mode**. Choose **Load unpacked**.
3. Choose the repository's [`edge-extension`](edge-extension/) **directory** containing `manifest.json` (not the repository ZIP).
4. Keep that directory on disk, leave the extension enabled, then reload ChatGPT.

This extension requests only `system.memory` and runs its content script only on `https://chatgpt.com/*`. It reports **whole-device RAM**, including other applications; it does not report per-Edge-tab RAM. Browser/organization policies may block unpacked extensions; do not bypass such policies.

### Controls

| Control | Action |
| --- | --- |
| `x` | Hide overlay in this tab |
| `Ctrl + Alt + Q` | Show/hide overlay in the active tab |
| `-` / `+` | Collapse/expand |
| Refresh icon | Fetch current data again |
| Drag title | Move this tab's overlay |
| Double-click title | Reset to default position |

Per-tab overlay state uses `sessionStorage`; sanitized quota snapshots (percent and reset timestamps) use same-origin `localStorage`. The RAM extension keeps a short-lived, in-memory cache.

## Privacy and security

- The userscript makes **same-origin requests** to ChatGPT's quota endpoint (`/backend-api/wham/usage`); on HTTP 401/403 it may read ChatGPT's own `/api/auth/session` to acquire a temporary bearer token **in memory** and retry the first-party endpoint.
- **No tokens or full API responses are saved** to localStorage or sessionStorage by this script. Only displayed quota percentages/reset times and UI preferences are stored locally.
- The userscript performs no requests to external analytics or telemetry services. The optional extension makes no network requests; it only uses the browser's `system.memory` API and a page-local message bridge.
- Page-local scripts running in the same origin can in principle access quota cache and shared RAM messages. This is not an authentication/security boundary.
- Review the source and install from this repository; avoid modified copies and never share session tokens or authentication cookies.

## Known limitations

- The endpoint is **not a public, versioned API**; breakage may require code updates. No guarantee is made about account policy, quota availability, or continued compatibility.
- The server may expose only one quota window. We do **not** synthesize missing quotas.
- The RAM figure is `(physical capacity - available capacity)`; it may differ slightly from Windows Task Manager's individual counters.
- Data refresh is opportunistic while an enabled ChatGPT tab is visible; this is **not** a 24/7 background alert agent.
- The same-origin short-term cache uses a best-effort lease rather than an atomic lock; simultaneous refreshes can occasionally duplicate requests.

## Source tree

```text
userscript/            Tampermonkey v1.4.0 source
edge-extension/        Optional Edge/Chrome RAM bridge (Manifest V3)
tests/                 Local smoke tests (Node, optional Playwright)
.github/workflows/     GitHub Actions lightweight source checks
README.zh-CN.md        Chinese instructions
LICENSE                MIT license
```

## Verify from source

With Node.js installed:

```bash
node --check userscript/Codex_Quota_Bars_Web_CN_v1.4.user.js
node --check edge-extension/background.js
node --check edge-extension/bridge.js
node tests/bridge.test.cjs
```

Optional full mock-browser test requires Python + Playwright and a Chromium browser; see [`tests/README.md`](tests/README.md). Tests cannot guarantee that a real logged-in ChatGPT endpoint will remain compatible.

## Contributing and support

For bugs, use GitHub Issues, but **do not include tokens, cookies, full session payloads, or personal conversations**. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

Licensed under [MIT](LICENSE). Copyright (c) 2026 Codex Quota Monitor contributors.
