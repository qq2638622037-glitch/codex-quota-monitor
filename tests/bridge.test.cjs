const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const assert=require('node:assert/strict');
const BG=fs.readFileSync(path.join(ROOT,'edge-extension','background.js'),'utf8');
const BRIDGE=fs.readFileSync(path.join(ROOT,'edge-extension','bridge.js'),'utf8');
(async()=>{
 let handler=null,ramCalls=0,forecastCalls=0,opts=null;
 const date=new Date().toISOString();
 const chrome={
   system:{memory:{async getInfo(){ramCalls++;return {capacity:16*2**30,availableCapacity:3*2**30};}}},
   runtime:{onMessage:{addListener(h){handler=h;}}},
 };
 const fetcher=async (url,options)=>{
   forecastCalls++;opts=options;
   assert.equal(url,'https://codex-reset.com/api/forecast');
   return {ok:true,async json(){return {
     updated_at:date,confidence:'low',probabilities:{rounded_24h:24,rounded_48h:43},
     secret:'not echoed',untrusted:'not echoed'};}};
 };
 vm.runInNewContext(BG,{chrome,fetch:fetcher,Date,Number,Error,Promise,AbortController,setTimeout,clearTimeout});
 assert.equal(typeof handler,'function');
 const fromChat={url:'https://chatgpt.com/c/test'};
 const send=(type,sender=fromChat)=>new Promise(resolve=>{
   const accepted=handler({type},sender,resolve);
   if (!accepted) resolve({rejected:true});
 });
 const a=await send('CQ14_MEMORY');
 assert.equal(a.capacity,16*2**30);
 assert.equal(ramCalls,1);
 await send('CQ14_MEMORY');
 assert.equal(ramCalls,1,'RAM cache TTL failed');
 assert.deepEqual(await send('CQ14_MEMORY',{url:'https://evil.example'}),{rejected:true});
 const f=await send('CQ15_FORECAST');
 assert.equal(f.ok,true);
 assert.equal(f.forecast.probabilities.rounded_24h,24);
 assert.equal(f.forecast.secret,undefined,'untrusted field forwarded');
 assert.equal(forecastCalls,1);
 assert.equal(opts.credentials,'omit');
 assert.equal(opts.referrerPolicy,'no-referrer');
 await send('CQ15_FORECAST');
 assert.equal(forecastCalls,1,'forecast cache TTL failed');
 console.log('Background worker: memory unchanged, fixed public GET, sender check, forecast cache PASS');

 let eventHandler=null;
 const messages=[];
 const fakeWindow={
   addEventListener(event,cb){if(event==='message')eventHandler=cb;},
   postMessage(payload,origin){messages.push({payload,origin});},
 };
 const bridgeChrome={runtime:{lastError:null,sendMessage(req,cb){
   if(req.type==='CQ14_MEMORY') cb({ok:true,capacity:16*2**30,availableCapacity:3*2**30});
   else if(req.type==='CQ15_FORECAST') cb({ok:true,forecast:f.forecast});
   else throw new Error('Unknown bridge operation');
 }}};
 vm.runInNewContext(BRIDGE,{window:fakeWindow,location:{origin:'https://chatgpt.com'},chrome:bridgeChrome});
 const ram={source:fakeWindow,origin:'https://chatgpt.com',data:{channel:'codex-quota-ram-v14',type:'RAM_REQUEST'}};
 eventHandler(ram);
 assert.equal(messages[0].payload.type,'RAM_RESULT');
 assert.equal(messages[0].payload.availableCapacity,3*2**30);
 const fore={source:fakeWindow,origin:'https://chatgpt.com',data:{channel:'codex-quota-forecast-v15',type:'FORECAST_REQUEST',nonce:'test-123'}};
 eventHandler(fore);
 assert.equal(messages[1].payload.type,'FORECAST_RESULT');
 assert.equal(messages[1].payload.nonce,'test-123');
 assert.equal(messages[1].payload.forecast.probabilities.rounded_48h,43);
 eventHandler({...fore,origin:'https://another.example'});
 assert.equal(messages.length,2,'foreign origin accepted');
 eventHandler({...fore,data:{...fore.data,nonce:123}});
 assert.equal(messages.length,2,'bad nonce accepted');
 console.log('Page bridge: RAM and forecast channels, nonce, origin checks PASS');
})();
