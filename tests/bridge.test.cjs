const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const assert=require('node:assert/strict');
const BG=fs.readFileSync(path.join(ROOT,'edge-extension','background.js'),'utf8');
const BRIDGE=fs.readFileSync(path.join(ROOT,'edge-extension','bridge.js'),'utf8');
(async()=>{
 let handler=null,ramCalls=0;
 const chrome={
   system:{memory:{async getInfo(){ramCalls++;return {capacity:16*2**30,availableCapacity:3*2**30};}}},
   runtime:{onMessage:{addListener(h){handler=h;}}},
 };
 vm.runInNewContext(BG,{chrome,Date,Number,Error,Promise});
 assert.equal(typeof handler,'function');
 let reply=null;
 const accept=handler({type:'CQ14_MEMORY'}, {url:'https://chatgpt.com/c/test'}, x=>reply=x);
 assert.equal(accept,true);
 await new Promise(r=>setTimeout(r,5));
 assert.equal(reply.ok,true);
 assert.equal(reply.capacity,16*2**30);
 assert.equal(ramCalls,1);
 handler({type:'CQ14_MEMORY'}, {url:'https://chatgpt.com/c/another'}, x=>reply=x);
 await new Promise(r=>setTimeout(r,5));
 assert.equal(ramCalls,1,'service-worker cache TTL failed');
 const reject=handler({type:'CQ14_MEMORY'}, {url:'https://example.com'}, ()=>{});
 assert.equal(reject,false);
 console.log('Background worker: trusted sender check, real-data fields and coalesced cached reads PASS');

 let eventHandler=null;
 const messages=[];
 const fakeWindow={
   addEventListener(event,cb){if(event==='message')eventHandler=cb;},
   postMessage(payload,origin){messages.push({payload,origin});},
 };
 const bridgeChrome={runtime:{lastError:null,sendMessage(req,cb){
   assert.equal(req.type,'CQ14_MEMORY');
   cb({ok:true,capacity:16*2**30,availableCapacity:3*2**30});
 }}};
 vm.runInNewContext(BRIDGE,{window:fakeWindow,location:{origin:'https://chatgpt.com'},chrome:bridgeChrome});
 const event={source:fakeWindow,origin:'https://chatgpt.com',data:{channel:'codex-quota-ram-v14',type:'RAM_REQUEST'}};
 eventHandler(event);
 assert.equal(messages.length,1);
 assert.equal(messages[0].payload.type,'RAM_RESULT');
 assert.equal(messages[0].payload.availableCapacity,3*2**30);
 eventHandler({...event,origin:'https://other.example'});
 assert.equal(messages.length,1,'invalid origin request accepted');
 console.log('Page bridge: request, reply, origin check PASS');
})();
