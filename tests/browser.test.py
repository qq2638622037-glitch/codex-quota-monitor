import asyncio, json
from pathlib import Path
import os, tempfile
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
JS=(ROOT/'userscript/Codex_Quota_Bars_Web_CN_v1.4.user.js').read_text()
PAGE='''<!doctype html><html class="dark"><head><meta charset="utf-8"><style>
html,body{margin:0;background:#161616;color:white;font-family:sans-serif;}
main{padding:10px} #composer{position:fixed;right:15px;bottom:50px;width:350px;}
#composer textarea{width:100%;height:55px}
</style></head><body><main><h2>模拟 ChatGPT</h2><p>此页面仅用于界面测试</p><button id="t">Test</button></main>
<form id="composer"><textarea id="prompt" placeholder="Prompt"></textarea><button type="button">send</button></form>
</body></html>'''
SETUP='''() => {
  window.__lsData={};window.__ssData={};window.__requests=0;
  const createStore=key=>({getItem:x=>(window[key][x]??null),setItem:(x,v)=>{window[key][x]=String(v)},removeItem:x=>{delete window[key][x]}});
  Object.defineProperty(window,'localStorage',{configurable:true,value:createStore('__lsData')});
  Object.defineProperty(window,'sessionStorage',{configurable:true,value:createStore('__ssData')});
  window.postMessage = () => {}; // about:blank origin 'null' is not a valid postMessage targetOrigin
  window.fetch = async (path)=>{
    window.__requests++;
    return new Response(JSON.stringify({rate_limit:{
      primary_window:{limit_window_seconds:18000,used_percent:86,reset_at:Math.floor(Date.now()/1000)+14400},
      secondary_window:{limit_window_seconds:604800,used_percent:98,reset_at:Math.floor(Date.now()/1000)+604800}}}),
      {status:200,headers:{'Content-Type':'application/json'}})
  };
}'''
HOST='#codex-quota-cn-overlay-v1'

async def add_script(p,cache=None):
 await p.set_content(PAGE)
 await p.evaluate(SETUP)
 if cache:
  await p.evaluate('v=>localStorage.setItem("codex-quota-cn-shared-data-v14",v)',cache)
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
  cache=await a.evaluate('localStorage.getItem("codex-quota-cn-shared-data-v14")')
  assert cache
  # The same cached quota in another tab avoids a redundant request.
  b=await ctx.new_page();await add_script(b,cache)
  assert await b.evaluate('window.__requests')==0, 'cache not reused'
  print('case02 cross-tab cached read without duplicate endpoint call PASS')
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
  # real screenshot illustrating compact panel (mock values - not user's real account)
  preview=await ctx.new_page();await preview.set_viewport_size({'width':825,'height':600})
  await add_script(preview)
  await preview.evaluate('''() => window.dispatchEvent(new MessageEvent('message',{
    source:window,origin:location.origin,data:{channel:'codex-quota-ram-v14',type:'RAM_RESULT',
    capacity:16*1024**3,availableCapacity:3.0*1024**3}}))''')
  await preview.wait_for_timeout(150)
  await preview.screenshot(path=str(Path(tempfile.gettempdir())/'codex_v14_preview_mock.png'))
  print('case13 preview screenshot saved')
  await browser.close()

asyncio.run(main())
