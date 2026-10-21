// ChatGPT-only content script, no direct access to private conversation data.
(() => {
  'use strict';
  const RAM_CHANNEL='codex-quota-ram-v14'; // backward-compatible with v1.4
  const FORECAST_CHANNEL='codex-quota-forecast-v15';
  let busyRam=false,busyForecast=false;
  window.addEventListener('message',event=>{
    if (event.source!==window || event.origin!==location.origin) return;
    if (event.data?.channel===RAM_CHANNEL &&
        event.data?.type==='RAM_REQUEST' && !busyRam) {
      busyRam=true;
      chrome.runtime.sendMessage({type:'CQ14_MEMORY'},reply=>{
        const err=chrome.runtime.lastError;busyRam=false;
        if (err || !reply?.ok) {
          window.postMessage({channel:RAM_CHANNEL,type:'RAM_RESULT',error:'unavailable'},location.origin);
          return;
        }
        window.postMessage({channel:RAM_CHANNEL,type:'RAM_RESULT',
          capacity:reply.capacity,availableCapacity:reply.availableCapacity},location.origin);
      });
    }
    if (event.data?.channel===FORECAST_CHANNEL &&
        event.data?.type==='FORECAST_REQUEST' && !busyForecast) {
      const nonce=event.data.nonce;
      if (typeof nonce!=='string' || nonce.length>160) return;
      busyForecast=true;
      chrome.runtime.sendMessage({type:'CQ15_FORECAST'},reply=>{
        const err=chrome.runtime.lastError;busyForecast=false;
        window.postMessage({channel:FORECAST_CHANNEL,type:'FORECAST_RESULT',
          nonce,ok:!err && Boolean(reply?.ok),
          forecast:!err&&reply?.ok?reply.forecast:null},location.origin);
      });
    }
  });
})();
