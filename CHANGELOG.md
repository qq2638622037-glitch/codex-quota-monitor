# Changelog

## v1.4.0 - 2026-10-15

First public-source candidate based on a version tested in Windows Edge.

- Two Codex quota windows with reset timestamps and countdowns, when available.
- Per-tab controls, compact overlay, dark/light theme, automatic recovery after ChatGPT page rerendering.
- Best-effort cross-tab quota cache and conservative input-area avoidance.
- Color-only quota and physical RAM thresholds (no popups or desktop notifications).
- Optional local-only system RAM companion extension (Manifest V3, `system.memory`).
- No account credentials or browser profile data bundled in the release.

The underlying quota endpoint is undocumented and may change without notice.
