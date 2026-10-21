import asyncio, json
from pathlib import Path
import os, tempfile
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
JS=(ROOT/'userscript/Codex_Quota_Bars_Web_CN_v1.5.user.js').read_text()
PAGE='''<!doctype html><html class="dark"><head><meta charset="utf-8"><style>
html,body{margin:0;background:#161616;color:white;font-family:sans-serif;}
main{padding:10px} #composer{position:fixed;right:15px;bottom:50px;width:350px;}
#composer textarea{width:100%;height:55px}
</style></head><body><main><h2>模拟 ChatGPT</h2><p>此页面仅用于界面测试</p><button id="t">Test</button></main>
<form id="composer"><textarea id="prompt" placeholder="Prompt"></textarea><button type="button">send</button></form>
</body></html>'''
SETUP='''() => {
  window.__lsData={};window.__ssData={};window.__requests=0;window.__forecastRequests=0;window.__forecastMode='ok';window.__forecastOptions=[];
  const createStore=key=>({getItem:x=>(window[key][x]??null),setItem:(x,v)=>{window[key][x]=String(v)},removeItem:x=>{delete window[key][x]}});
  Object.defineProperty(window,'localStorage',{configurable:true,value:createStore('__lsData')});
  Object.defineProperty(window,'sessionStorage',{configurable:true,value:createStore('__ssData')});
  window.postMessage = () => {}; // about:blank origin 'null' is not a valid postMessage targetOrigin
  window.fetch = async (path, opts={})=>{
    if(String(path).startsWith('https://codex-reset.com/')) {
      window.__forecastRequests++;
      window.__forecastOptions.push({credentials:opts.credentials,referrerPolicy:opts.referrerPolicy});
      if(window.__forecastMode==='blocked') throw new TypeError('CSP blocks external fetch');
      const d=new Date(Date.now()-(window.__forecastMode==='stale'?24*3600000:30000)).toISOString();
      const p24=window.__forecastMode==='invalid'?85:22;
      return new Response(JSON.stringify({updated_at:d,confidence:'low',
        probabilities:{rounded_24h:p24,rounded_48h:39}}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    window.__requests++;
    return new Response(JSON.stringify({rate_limit:{
      primary_window:{limit_window_seconds:18000,used_percent:86,reset_at:Math.floor(Date.now()/1000)+14400},
      secondary_window:{limit_window_seconds:604800,used_percent:98,reset_at:Math.floor(Date.now()/1000)+604800}}}),
      {status:200,headers:{'Content-Type':'application/json'}})
  };
}'''
HOST='#codex-quota-cn-overlay-v1'

async def add_script(p,cache=None,forecast_cache=None):
 await p.set_content(PAGE)
 await p.evaluate(SETUP)
 if cache:
  await p.evaluate('v=>localStorage.setItem("codex-quota-cn-shared-data-v14",v)',cache)
 if forecast_cache:
  await p.evaluate('v=>localStorage.setItem("codex-quota-cn-forecast-data-v15",v)',forecast_cache)
 await p.evaluate(JS)
 await p.wait_for_timeout(850)

async def ui(p,expression):
 return await p.locator(HOST).evaluate('e => { const s=e.shadowRoot;return '+expression+'; }')

async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CODEX_TEST_CHROMIUM_PATH') or None,headless=True)
  ctx=await browser.new_context(viewport={'width':810,'height':840})
  a=await ctx.new_page();await add_script(a)
  data=await ui(a,'''({txt:s.querySelector('.panel').innerText,
      five:s.querySelector('#five').dataset.risk,week:s.querySelector('#week').dataset.risk})''')
  print('case01 initial parsing, warnings',data)
  assert '剩余 14%' in data['txt'] and '剩余 2%' in data['txt']
  assert data['five']=='warn' and data['week']=='critical'
  assert await a.evaluate('window.__requests')==1
  forecast=await ui(a,'''({value:s.querySelector('#forecast .value').textContent,
      source:s.querySelector('#forecast a').href,meta:s.querySelector('#forecast .forecast-meta').textContent})''')
  assert '24h 22%' in forecast['value'] and '48h 39%' in forecast['value'],forecast
  assert 'codex-reset.com' in forecast['source'] and '低置信度' in forecast['meta'],forecast
  assert await a.evaluate('window.__forecastRequests')==1
  assert (await a.evaluate('window.__forecastOptions'))==[{'credentials':'omit','referrerPolicy':'no-referrer'}]
  print('case01b forecast 24/48, low confidence, visible attribution, no credentials PASS',forecast)
  cache=await a.evaluate('localStorage.getItem("codex-quota-cn-shared-data-v14")')
  fc=await a.evaluate('localStorage.getItem("codex-quota-cn-forecast-data-v15")')
  assert cache and fc
  # Both caches should be reusable without cross-origin requests in the next tab.
  b=await ctx.new_page();await add_script(b,cache,fc)
  assert await b.evaluate('window.__requests')==0, 'cache not reused'
  assert await b.evaluate('window.__forecastRequests')==0,'forecast cache not reused'
  print('case02 cross-tab cached quota and forecast reads PASS')
  # Page visibility independent
  await ui(a,'''s.querySelector('#close').click()''')
  assert await a.locator(HOST).evaluate('e=>e.style.display')=='none'
  assert await b.locator(HOST).evaluate('e=>e.style.display')=='block'
  print('case03 independently hidden tabs PASS')
  await a.keyboard.press('Control+Alt+q')
  await a.wait_for_timeout(100)
  assert await a.locator(HOST).evaluate('e=>e.style.display')=='block'
  print('case04 Ctrl+Alt+Q reopen PASS')
  await ui(a,'''s.querySelector('#collapse').click()''')
  comp=await ui(a,'''s.querySelector('#compact').textContent''')
  assert all(x in comp for x in ['5h','7d','RAM'])
  await ui(a,'''s.querySelector('#collapse').click()''')
  print('case05 collapse keeps summary PASS',comp)
  # Mock extension result is a MessageEvent, nothing gets sent to network.
  await a.evaluate('''() => window.dispatchEvent(new MessageEvent('message',{
    source:window, origin:location.origin,
    data:{channel:'codex-quota-ram-v14',type:'RAM_RESULT',capacity:16*1024**3,availableCapacity:1*1024**3}}))''')
  await a.wait_for_timeout(150)
  risk=await ui(a,'''({risk:s.querySelector('#memory').dataset.risk,
    text:s.querySelector('#memory .value').textContent})''')
  assert risk['risk']=='critical' and '15.0' in risk['text'] and '16.0' in risk['text'],risk
  print('case06 RAM % and thresholds PASS',risk)
  # No warning toast, notification, external popup code.
  assert not any(x in JS for x in ['new Notification','Notification.requestPermission','window.alert(','alert(','showNotification'])
  print('case07 color-only warning PASS')
  # Store position independently; B has no copy of A per-tab storage.
  await a.evaluate('sessionStorage.setItem("codex-quota-cn-tab-ui-v14",JSON.stringify({left:38,top:120,collapsed:false}))')
  assert await b.evaluate('sessionStorage.getItem("codex-quota-cn-tab-ui-v14")') is None
  print('case08 per-tab location storage PASS')
  # Overlap with active textarea should trigger one move.
  await a.evaluate('''() => {let x=document.querySelector('#composer');
    x.style.right='5px';x.style.bottom='88px';x.style.width='330px';
    x.querySelector('textarea').style.height='240px';}''')
  before=await a.locator(HOST).bounding_box()
  await a.locator('#prompt').focus();await a.wait_for_timeout(400)
  after=await a.locator(HOST).bounding_box()
  print('case09 smart avoid before/after',before,after)
  assert abs(after['y']-before['y'])>30 or abs(after['x']-before['x'])>30, 'did not avoid overlapping focused editor'
  # after blur moves back near base
  await a.locator('#t').focus();await a.wait_for_timeout(400)
  revert=await a.locator(HOST).bounding_box()
  print('case10 reset after focusout',revert)
  assert abs(revert['y']-before['y'])<5
  # SPA removes host; it is restored once
  await a.evaluate('document.body.innerHTML="<main>Hydrated replacement</main>"')
  await a.wait_for_timeout(450)
  assert await a.locator(HOST).count()==1
  print('case11 SPA reattach PASS')
  # A hidden tab stays hidden even after host removed
  await ui(a,'''s.querySelector('#close').click()''')
  await a.evaluate('document.body.innerHTML="<main>Hydrated replacement again</main>"')
  await a.wait_for_timeout(450)
  assert await a.locator(HOST).evaluate('e=>e.style.display')=='none'
  print('case12 SPA hidden preserved PASS')
  # Invalid or very old values are never shown as active probabilities.
  for mode in ('stale','invalid'):
   c=await ctx.new_page(); await c.set_content(PAGE); await c.evaluate(SETUP)
   await c.evaluate('(mode)=>window.__forecastMode=mode',mode)
   await c.evaluate(JS);await c.wait_for_timeout(600)
   value=await ui(c,'''s.querySelector('#forecast .value').textContent''')
   assert '22%' not in value and '85%' not in value,value
   assert '预测暂不可用' in value or '数据已过期' in value,value
   await c.close()
  print('case13 old or inconsistent community odds fail closed PASS')
  # A ChatGPT CSP error can be bypassed through the OPTIONAL permission-limited
  # Edge bridge; no app credentials are sent to the provider.
  c=await ctx.new_page();await c.set_content(PAGE);await c.evaluate(SETUP)
  await c.evaluate('''() => {
    window.__forecastMode='blocked';
    window.postMessage=(payload)=>{
      if(payload?.type!=='FORECAST_REQUEST') return;
      queueMicrotask(()=>window.dispatchEvent(new MessageEvent('message', {
        source:window,origin:location.origin,
        data:{channel:'codex-quota-forecast-v15',type:'FORECAST_RESULT',nonce:payload.nonce,
          ok:true,forecast:{updated_at:new Date().toISOString(),confidence:'medium',
            probabilities:{rounded_24h:28,rounded_48h:44}}}}
      )));
    };
  }''')
  await c.evaluate(JS);await c.wait_for_timeout(600)
  value=await ui(c,'''s.querySelector('#forecast .value').textContent''')
  assert '24h 28%' in value and '48h 44%' in value,value
  print('case14 CSP-blocked external fetch uses optional browser bridge PASS')
  await c.close()
  # real screenshot illustrating compact panel (mock values - not user's real account)
  preview=await ctx.new_page();await preview.set_viewport_size({'width':825,'height':600})
  await add_script(preview)
  await preview.evaluate('''() => window.dispatchEvent(new MessageEvent('message',{
    source:window,origin:location.origin,data:{channel:'codex-quota-ram-v14',type:'RAM_RESULT',
    capacity:16*1024**3,availableCapacity:3.0*1024**3}}))''')
  await preview.wait_for_timeout(150)
  await preview.screenshot(path=str(Path(tempfile.gettempdir())/'codex_v15_preview_mock.png'))
  print('case15 preview screenshot saved')
  await browser.close()

asyncio.run(main())
