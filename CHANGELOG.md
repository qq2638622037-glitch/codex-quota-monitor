# Changelog

## v1.6.0 - 2026-10-21

- Replaced the persistent quota list with a **dockable two-ring orb** for split-screen use: a 13px edge handle is idle, hover reveals a 100px visual summary, and click reveals a 282px-wide detail panel.
- The hover preview retains the three user-selected essentials: 5-hour remaining percentage, 7-day remaining percentage, and the **7-day reset date/time**. The ordinary 5-hour reset is still visible in details.
- Shows experimental 24h/48h third-party reset predictions only on hover or in details, with attribution. Neither the source nor its probabilities are official.
- Only emphasizes RAM on the hover orb when **above 90%**; detailed RAM readings remain available on click. Quota warnings continue to use color-only indicators. No popup, notifications, or audio.
- Preserves independent per-tab `Ctrl+Alt+Q` hide/reopen, per-tab edge position, refresh, cross-tab cached quota/forecast data and user-script/extension protocols.
- Prioritizes the installed Edge extension for forecast retrieval before attempting direct page-level GET; bounded retries after failures, no auto-opening the provider website. Third-party availability is still not guaranteed.
- Added Playwright simulations for hover persistence, snap-back, narrow windows, RAM threshold, light-weight dock, close/reopen, and SPA remount recovery.


## v1.5.0 - 2026-10-21

- Added an explicitly **third-party** experimental 24h/48h forecast for exceptional *global* Codex resets (not personal scheduled refreshes and not banked reset cards).
- Integrated documented public JSON fields from `codex-reset.com` with visible attribution, confidence and source timestamp.
- Added cross-tab caching, minute-scale minimum polling, strict freshness checks, failure-to-unavailable behavior, and a CSP fallback through the optional v1.5 browser extension.
- Updated the companion extension to allow a single external HTTPS forecast domain while keeping the old system RAM message protocol unchanged.
- Kept v1.4 quota parsing, UI state, color-only warnings, RAM rendering and editor avoidance intact.
- Added simulated tests for forecast parsing, stale/invalid source values, no-credential requests, CSP fallback, source credit and extension caching.


## v1.4.0 - 2026-10-15

First public-source candidate based on a version tested in Windows Edge.

- Two Codex quota windows with reset timestamps and countdowns, when available.
- Per-tab controls, compact overlay, dark/light theme, automatic recovery after ChatGPT page rerendering.
- Best-effort cross-tab quota cache and conservative input-area avoidance.
- Color-only quota and physical RAM thresholds (no popups or desktop notifications).
- Optional local-only system RAM companion extension (Manifest V3, `system.memory`).
- No account credentials or browser profile data bundled in the release.

The underlying quota endpoint is undocumented and may change without notice.
