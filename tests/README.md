# Verification

1. `node --check userscript/Codex_Quota_Bars_Web_CN_v1.6.user.js`
2. `node --check edge-extension/background.js && node --check edge-extension/bridge.js`
3. `node tests/manifest.test.cjs`
4. `node tests/bridge.test.cjs`
5. `python tests/browser.test.py` (requires Chromium and the Playwright Python package)

The browser UI test uses synthetic percentages, memory and dates and verifies: narrow idle edge handle, two-ring hover preview, 5h/7d + weekly reset, forecast only on hover/details, RAM over-90 badge, three-stage interactions, outside click/Escape, no hover flicker, split widths, true per-tab close/reopen, and ChatGPT SPA DOM recovery.

The extension test checks memory API/cache, hard-coded public forecast GET without credentials, origin restriction, and the backward-compatible forecast message protocol.

No test proves third-party website reliability or current first-party API availability; such claims require actual user-browser testing.
