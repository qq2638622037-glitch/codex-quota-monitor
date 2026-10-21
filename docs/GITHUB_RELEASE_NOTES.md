# v1.6.0 — dockable two-ring quota orb

Replaces the permanently visible bar panel with a small edge-docked handle, hover orb, and compact on-click details. Hover shows 5h remaining, 7d remaining, weekly reset date/time and optional 24h/48h experimental global-reset estimates. RAM only appears on the hover orb when above 90%; full RAM data remains in the details.

Forecast reads now prefer the Edge companion first, followed by the read-only page GET where allowed. Stale/missing third-party data is never disguised as certain. Existing first-party quota parsing, shared cache and per-tab hide/reopen continue working. Compatible with the v1.5 companion extension.

**Install:** disable your older Tampermonkey userscript, import `Codex_Quota_Bars_Web_CN_v1.6.user.js`, and refresh ChatGPT. The v1.5 memory/forecast Edge companion can remain; new users can install `Edge_RAM_Forecast_Bridge_v1.6` from the release ZIP via Load unpacked.

**Data disclosure:** Third-party experimental estimates from https://codex-reset.com/ are not OpenAI-provided, not related to scheduled personal allowance refresh, and not a guarantee. Only read-only public API requests are sent, without session tokens or personal quota data.
