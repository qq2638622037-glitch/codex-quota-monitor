# v1.5.0 - Third-party global reset forecast

A compact **24h / 48h experimental community probability** row now appears alongside the existing 5-hour and 7-day account quotas and total physical RAM.

**What changed**
- Forecasts **unscheduled global quota resets only** (not personal quota timers or banked reset-card grants).
- Uses the documented no-key read-only API from https://codex-reset.com/ and displays mandatory clickable source attribution **next to the numbers**.
- Includes provider confidence and update time; displays unavailable/expired rather than fabricating numbers.
- Shares a low-frequency forecast cache across tabs, with optional fallback through an upgraded Edge/Chrome RAM companion if ChatGPT's CSP blocks cross-origin fetch.
- Preserves the v1.4 quota and RAM logic, per-tab toggles, drag/collapse and color-only warnings.

**Update from v1.4:**
1. Disable the old userscript, import `Codex_Quota_Bars_Web_CN_v1.5.user.js`.
2. Remove the unpacked v1.4 RAM extension; load the **new** `Edge_RAM_Forecast_Bridge_v1.5` folder using `edge://extensions` / `chrome://extensions`.
3. Reload ChatGPT and check both account percentages and RAM; the forecast may show unavailable if the external provider/network is inaccessible.

**Permissions and privacy:** the new companion permits HTTPS GET only to `https://codex-reset.com/*`, plus the existing `system.memory` API. Neither the userscript nor extension sends ChatGPT tokens, quota readings, chat contents or RAM readings to the forecast provider. Requests have no cookies or referrer; your IP address is still visible to the third-party site. No popup alerts and no automatic reset-card redemption.

**Experimental warning:** These are third-party probabilities, not OpenAI forecasts. The provider may change its method or availability. API access and attribution requirements: https://codex-reset.com/developers/.

---

# v1.4.0 - First public release

Unofficial ChatGPT Codex quota and Windows/Edge physical-memory overlay for split-screen workflows.

**Highlights**
- Live 5-hour and 7-day remaining quotas when available, with reset timestamps/countdowns.
- Compact per-tab overlay, toggle shortcut, editable-position preservation, and basic smart avoidance.
- Color-coded thresholds only: no toast or OS notifications.
- Optional Edge/Chrome local extension for physical RAM utilization (single permission: `system.memory`).
- Cross-tab quota caching, no third-party analytics or remote dependencies.

**Install:** Download the release ZIP, import the `.user.js` with Tampermonkey; optionally load the `Edge_RAM_Bridge_v1.4` unpacked extension in the Edge/Chrome extensions page. See README for details.

**Important:** This is not an official OpenAI product. It relies on an undocumented quota endpoint that can change or stop working. The memory figure reports system-wide physical RAM, not Edge-only usage. Do not share session tokens or cookies in issues.
