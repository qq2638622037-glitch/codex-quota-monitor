// Quota v1.6 companion (v1.5 protocol compatible). RAM data remains local; forecast fetch is a fixed public
// GET without credentials or any quota, account, memory, chat or session values.
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

let forecastCache=null,forecastAt=0,forecastFlight=null;
const FORECAST_TTL=20*60*1000;
const FORECAST_URL='https://codex-reset.com/api/forecast';
async function publicForecast() {
  if (forecastCache && Date.now()-forecastAt < FORECAST_TTL) return forecastCache;
  if (forecastFlight) return forecastFlight;
  forecastFlight=(async()=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch(FORECAST_URL,{method:'GET',credentials:'omit',
        mode:'cors',referrerPolicy:'no-referrer',cache:'no-store',
        headers:{Accept:'application/json'},signal:controller.signal});
      if(!response.ok) throw new Error(`Forecast HTTP ${response.status}`);
      const data=await response.json();
      // Return only the publicly documented API fields needed by the UI.
      const forecast={updated_at:data?.updated_at,confidence:data?.confidence,
        probabilities:{rounded_24h:data?.probabilities?.rounded_24h,
          rounded_48h:data?.probabilities?.rounded_48h}};
      if (!Number.isInteger(forecast.probabilities.rounded_24h) ||
          !Number.isInteger(forecast.probabilities.rounded_48h) ||
          !Number.isFinite(Date.parse(forecast.updated_at))) throw new Error('Invalid forecast');
      forecastCache=forecast;forecastAt=Date.now();
      return forecast;
    } finally {clearTimeout(timeout);}
  })();
  try {return await forecastFlight;}
  finally {forecastFlight=null;}
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if (!(sender.url?.startsWith('https://chatgpt.com/') ||
        sender.tab?.url?.startsWith('https://chatgpt.com/'))) return false;
  if (message?.type==='CQ14_MEMORY') {
    systemMemory().then(info=>sendResponse({ok:true,...info}),
      ()=>sendResponse({ok:false,error:'system.memory unavailable'}));
    return true;
  }
  if (message?.type==='CQ15_FORECAST') {
    publicForecast().then(forecast=>sendResponse({ok:true,forecast}),
      ()=>sendResponse({ok:false,error:'forecast unavailable'}));
    return true;
  }
  return false;
});
