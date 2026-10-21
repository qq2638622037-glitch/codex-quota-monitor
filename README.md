# Codex Quota Monitor

**A compact unofficial Codex quota, exceptional-reset forecast, and physical RAM overlay for ChatGPT on Edge / Chrome.**

[简体中文说明 / Chinese README](README.zh-CN.md) · [How the forecast works](docs/FORECAST_METHOD.md)

Version **v1.5.0** · MIT License · Not affiliated with OpenAI or the forecast provider.

## Features

- Actual 5-hour and 7-day remaining Codex allowances (only when returned by your own ChatGPT session), with reset timestamps and countdowns.
- **New in v1.5:** community-estimated probability of an **extraordinary global Codex/Work usage-limit reset within the next 24 or 48 hours**, with visible data-source credit, model confidence and update time.
- Compact overlay for split-screen use; draggable, collapsible, and independent per-tab hide/reopen (`Ctrl + Alt + Q`).
- Automatic recovery after ChatGPT page updates, conservative avoidance of the active input area, cross-tab short-term quota and forecast caching.
- Color-only low-quota and high-RAM warnings (no popup, sound, notification, or automatic cleanup).
- Optional Edge/Chrome Manifest V3 companion to show **whole-PC physical RAM** and retrieve forecasts if ChatGPT's CSP blocks an external fetch.

> **Important distinction:** the forecast concerns *unscheduled global top-ups* sometimes publicly announced by Tibo/OpenAI. It does **not** predict the ordinary 5-hour/7-day timers shown above and does **not** include banked reset credits. Probabilities are experimental third-party estimates, **not** promises of a reset or personalized account eligibility.
>
> **Forecast data and attribution:** [codex-reset.com](https://codex-reset.com/) via its [free public JSON API](https://codex-reset.com/developers/). The provider's required attribution is also displayed immediately beside the forecast in the overlay. API terms and estimates are subject to change. We do not copy its code or claim to have created its statistical model.

## Quick start

### 1. Required: Tampermonkey userscript

1. Install a userscript manager such as Tampermonkey in Edge or Chrome. Enable userscripts as directed by that extension.
2. Download the [v1.5.0 installation ZIP](dist/codex-quota-monitor-v1.5.0-install.zip) from this repo (**View raw** / Download), **or** download the repository using **Code → Download ZIP**.
3. Extract it. In Tampermonkey's dashboard use **Utilities → Import from file**, selecting [`userscript/Codex_Quota_Bars_Web_CN_v1.5.user.js`](userscript/Codex_Quota_Bars_Web_CN_v1.5.user.js) (the install ZIP puts the userscript at the root).
4. Disable/delete any old v1.4 (or earlier) version of this userscript to avoid duplicate panels.
5. Open and refresh [chatgpt.com](https://chatgpt.com/) while logged in.

The quota overlay still works without the optional companion extension. Forecast retrieval will try a public HTTPS GET directly; if ChatGPT CSP prevents it, the forecast row may be unavailable until you install the v1.5 companion.

### 2. Optional, recommended: RAM and forecast-bridge extension

1. Unpack the install ZIP into a permanent directory.
2. Open `edge://extensions` in Edge or `chrome://extensions` in Chrome; enable Developer mode if allowed by your organization.
3. **Remove the older local v1.4 RAM bridge extension** if present, then **Load unpacked**, pointing to the new `Edge_RAM_Forecast_Bridge_v1.5/` folder (or `edge-extension/` when using the source ZIP).
4. Refresh ChatGPT. System RAM shows when the `system.memory` API is available. Forecasts can also be fetched by this extension if page CSP blocks direct access.

The v1.5 extension requests only `system.memory` plus a **single HTTPS host permission** for `https://codex-reset.com/*`. It has no access to browser history or any additional domains. The extension never sends RAM values, ChatGPT quota balances, account identifiers, credentials, page contents or session tokens to the forecast provider. Only a fixed public GET is sent, without cookies/referrer.

## Controls

| Action | What it does |
| --- | --- |
| `×` | Hide the overlay in the current tab |
| `Ctrl + Alt + Q` | Reopen/hide the overlay in this tab |
| `−` / `+` | Collapse/expand the small panel |
| Refresh arrow | Refresh quotas and forecast, subject to the forecast source's 1-minute minimum poll spacing |
| Drag title | Move the overlay for this tab |
| Double-click title | Restore default position |
| `Data: codex-reset.com` | Open the third-party forecast source |

The display and position settings are independent in each tab. Shared percentages/time values are cached across same-origin tabs to reduce redundant network requests. Memory uses a short local extension cache. Forecasts are ordinarily checked around every **20 minutes** while a visible, open ChatGPT tab has the panel enabled; this is not a background watchdog.

## Forecast rules and failure handling

- Use only documented `probabilities.rounded_24h`, `probabilities.rounded_48h`, `confidence`, and `updated_at` from `GET https://codex-reset.com/api/forecast`.
- Results are checked for type, ordering (48h ≥ 24h) and freshness; predictions with source timestamps older than **6 hours** are not shown as current. Cached data has a maximum lifetime of **2 hours**.
- A short-term cache is shared across tabs; the site isn't polled more often than once per minute per browser profile on a best-effort basis.
- An unreachable, outdated or invalid provider returns **"预测暂不可用" / "数据已过期"**, rather than an invented probability. Existing quota and RAM rows keep working.
- No averaging of unrelated community estimates; third-party model assumptions, data gaps and forecast accuracy are explained in [FORECAST_METHOD.md](docs/FORECAST_METHOD.md).

## Privacy and limits

- The userscript reads only your **first-party** ChatGPT quota endpoint (`/backend-api/wham/usage`) and may temporarily request `/api/auth/session` after HTTP 401/403 to authenticate the quota request. Bearer tokens stay in runtime memory and are **never** transmitted to codex-reset.com.
- Forecast requests use `credentials:'omit'` and `referrerPolicy:'no-referrer'`. The provider will necessarily see your network IP and ordinary request metadata, but **not** your ChatGPT session/usage. If you do not want an external request, stay on v1.4.0 or disable the v1.5 userscript.
- The extension has no access to other websites, browser history, or individual application memory; `system.memory` reports total RAM capacity and available capacity only. Physical RAM usage is `capacity - available`, which may differ slightly from Task Manager's counters.
- Local storage contains UI state, sanitized usage readings, and the third-party **public forecast only**. No analytics, ads, automatic reset-card redemption, or push notifications.
- ChatGPT quota endpoints are undocumented; community probabilities may be inaccurate, delayed or completely unavailable. Do not treat this product as an official OpenAI client.
- Unpacked extensions can be restricted by company/browser policies; respect those controls. Do not paste session cookies, JWTs, screenshots with personal information, or conversation data into public issues.

## Test and repository layout

```text
userscript/                     Tampermonkey v1.5 userscript
edge-extension/                 Optional Manifest V3 RAM & forecast bridge
tests/                          Node test suite and Playwright UI test
docs/FORECAST_METHOD.md         Model semantics and source attribution
.github/workflows/             Source checks on pushes and PRs
README.zh-CN.md                 Chinese installation and privacy guide
LICENSE                         MIT License
```

Run `node --check userscript/Codex_Quota_Bars_Web_CN_v1.5.user.js`, `node tests/manifest.test.cjs`, and `node tests/bridge.test.cjs`. The optional Playwright smoke suite is `python tests/browser.test.py`. Simulated tests do **not** prove the provider or ChatGPT interface will work on every real account and network.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before submitting issues or pull requests.
