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
