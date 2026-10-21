# Changelog

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
