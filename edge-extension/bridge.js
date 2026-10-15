// Only responds on ChatGPT, only exposes RAM totals, never tokens or page contents.
(() => {
  'use strict';
  const CHANNEL='codex-quota-ram-v14';
  let busy=false;
  window.addEventListener('message',event=>{
    if (event.source!==window || event.origin!==location.origin ||
        event.data?.channel!==CHANNEL || event.data?.type!=='RAM_REQUEST' || busy) return;
    busy=true;
    chrome.runtime.sendMessage({type:'CQ14_MEMORY'},reply=>{
      const err=chrome.runtime.lastError;
      busy=false;
      if (err || !reply?.ok) {
        window.postMessage({channel:CHANNEL,type:'RAM_RESULT',error:'unavailable'},location.origin);
        return;
      }
      window.postMessage({channel:CHANNEL,type:'RAM_RESULT',
        capacity:reply.capacity,availableCapacity:reply.availableCapacity},location.origin);
    });
  });
})();
