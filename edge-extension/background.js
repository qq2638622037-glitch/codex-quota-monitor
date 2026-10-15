// Local-only extension worker. No network requests or access to ChatGPT tokens.
let cached = null;
let cachedAt = 0;
let inFlight = null;
const TTL = 15000;
async function systemMemory() {
  if (cached && Date.now()-cachedAt < TTL) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (!chrome.system?.memory?.getInfo) throw new Error('system.memory unavailable');
    const info = await chrome.system.memory.getInfo();
    if (!Number.isFinite(info?.capacity) || info.capacity<=0 ||
        !Number.isFinite(info.availableCapacity) || info.availableCapacity<0 ||
        info.availableCapacity>info.capacity) throw new Error('Invalid system.memory data');
    cached={capacity:info.capacity,availableCapacity:info.availableCapacity};
    cachedAt=Date.now();
    return cached;
  })();
  try { return await inFlight; }
  finally { inFlight=null; }
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if (message?.type!=='CQ14_MEMORY' ||
      !(sender.url?.startsWith('https://chatgpt.com/') ||
        sender.tab?.url?.startsWith('https://chatgpt.com/'))) return false;
  systemMemory().then(info=>sendResponse({ok:true,...info}),
    ()=>sendResponse({ok:false,error:'system.memory unavailable'}));
  return true;
});
