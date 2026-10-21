# Understanding the 24h / 48h forecast

## Exactly what is predicted

This row estimates an **extraordinary, unscheduled global Codex/ChatGPT Work quota reset** that could be initiated by OpenAI, sometimes announced publicly by Tibo. It does **not** refer to the user's normal individual 5-hour or weekly reset clock, nor to a **banked reset credit** that must be manually redeemed.

The 24h and 48h numbers are cumulative: they mean the estimated probability of at least one eligible global reset **at some point in that horizon**, not the chance of a reset exactly 24 or 48 hours from now. Neither number is an official promise, a timer, proof of a reset, or a guarantee about eligibility or propagation to any given account.

## Exact source and model responsibility

The overlay reads the following documented third-party endpoint:

- **Data:** https://codex-reset.com/
- **API:** https://codex-reset.com/api/forecast
- **Documentation and attribution terms:** https://codex-reset.com/developers/
- **Published method / limitations:** https://codex-reset.com/forecast-method/

The provider publishes `probabilities.rounded_24h`, `probabilities.rounded_48h`, `confidence`, and `updated_at`. We present them **without averaging, recalibrating, or inventing probabilities**. The public site states that its statistical model uses a recent-cadence baseline and official public signals; that approach remains an experimental estimate with varying evidence quality and may change. The UI shows the provider's confidence label without treating it as an empirically established personal success rate.

Other independent community pages (such as https://nextreset.ai/ and https://tiboreset.com/) can be checked manually for perspective, but their models and event classifications are **not mechanically mixed** in this version. Sometimes sites disagree substantially. **Do not treat a higher percentage as better evidence.**

## Freshness and failure policy

- Forecast site API documented fields only; predictions and timestamps are range-checked.
- The provider's `updated_at` must be no older than **6 hours**; a cached response is discarded after **2 hours**, even if its source timestamp is newer.
- Successful predictions are usually rechecked around every **20 minutes** while a ChatGPT tab is visible and the monitor is not explicitly closed; failed attempts use bounded retries, with a cooperative cross-tab lock and no more than one attempt per minute per browser profile (best effort).
- If the provider is unavailable, the installed extension and page-level fallback are both blocked, or the response fails validation: display *unavailable*, not an invented number. Account quota and memory functions remain independent.
- The optional companion extension is tried first; where unavailable the page-level GET is attempted with the same privacy restrictions. The extension makes the public read-only GET with `credentials: omit`, without sending account tokens, ChatGPT usage readings, conversation text, or system RAM details.

This tool is not sponsored, endorsed, reviewed, or operated by OpenAI or by the forecast provider. Public forecasts may be wrong, missing events, stale, or poorly calibrated; they are unsuitable as the sole basis of purchasing/spending a reset credit.
