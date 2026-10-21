# Tests

`bridge.test.cjs` runs with built-in Node.js modules only:

```bash
node tests/bridge.test.cjs
```

`browser.test.py` is an optional interactive/DOM smoke test using Playwright with synthetic quota, forecast and RAM data (no ChatGPT login required). Install the Python `playwright` package and a supported Chromium binary, then run:

```bash
python -m playwright install chromium
python tests/browser.test.py
```

If using a system Chromium binary, set `CODEX_TEST_CHROMIUM_PATH` to its executable path. The test writes a mock-only screenshot to the operating system's temporary directory.

**Limitations:** mock tests verify local logic and UI behavior, not the real-world availability or predictive accuracy of the third-party forecast, the unofficial ChatGPT endpoint or Windows extension integration on a specific device.
