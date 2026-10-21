"""Simulated ChatGPT UI tests for v1.6; uses fake quota and forecast, never a real login."""
import asyncio, os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=(ROOT/'userscript/Codex_Quota_Bars_Web_CN_v1.6.user.js').read_text(encoding='utf-8')
HOST='#codex-quota-cn-overlay-v1'
PAGE='''<!doctype html><html class="dark"><head><meta charset="utf-8"><style>
html,body{margin:0;background:#171719;color:#eee;font:13px system-ui;}
main{padding:25px;} #composer{position:fixed;bottom:65px;right:20px;width:min(480px,75%)}
#composer textarea{width:100%;height:72px;background:#292a2d;border:1px solid #555;border-radius:13px;color:white;padding:12px;}
</style></head><body><main><h1>ChatGPT · 模拟工作视图</h1><p>演示数据并非用户真实账户状态</p>
<button id="sample">按钮</button><p>这是用户正文，悬浮件不应遮挡正常点击。</p></main>
<form id="composer"><textarea id="prompt" placeholder="请输入消息"></textarea></form></body></html>'''
MOCK='''() => {
  window.__lsData={};window.__ssData={};window.__requests=0;
  window.__forecastDirect=0;window.__bridgeForecast=0;
  window.__bridgeEnabled=true;window.__ramUsed=56;
  const store=key=>({getItem:k=>window[key][k]??null,
    setItem:(k,v)=>window[key][k]=String(v),removeItem:k=>delete window[key][k]});
  Object.defineProperty(window,'localStorage',{configurable:true,value:store('__lsData')});
  Object.defineProperty(window,'sessionStorage',{configurable:true,value:store('__ssData')});
  window.fetch=async (url,opts={})=>{
    if(String(url).startsWith('https://codex-reset.com/')) {
      window.__forecastDirect++;
      if(window.__directBlocked) throw new TypeError('Blocked by test CSP');
      return new Response(JSON.stringify({updated_at:new Date().toISOString(),confidence:'low',
         probabilities:{rounded_24h:27,rounded_48h:46}}),{status:200});
    }
    window.__requests++;
    return new Response(JSON.stringify({rate_limit:{
      primary_window:{limit_window_seconds:18000,used_percent:29,reset_at:Math.floor(Date.now()/1000)+3600*4},
      secondary_window:{limit_window_seconds:604800,used_percent:12,reset_at:Math.floor(Date.now()/1000)+86400*6}
    }}),{status:200});
  };
  window.postMessage=payload=>{
    if(payload?.type==='FORECAST_REQUEST' && window.__bridgeEnabled) {
      window.__bridgeForecast++;
      queueMicrotask(()=>window.dispatchEvent(new MessageEvent('message',{
        source:window,origin:location.origin,data:{channel:'codex-quota-forecast-v15',
          type:'FORECAST_RESULT',nonce:payload.nonce,ok:true,
          forecast:{updated_at:new Date().toISOString(),confidence:'medium',
            probabilities:{rounded_24h:22,rounded_48h:39}}}})));
    }
    if(payload?.type==='RAM_REQUEST') {
      queueMicrotask(()=>window.dispatchEvent(new MessageEvent('message',{
        source:window,origin:location.origin,data:{channel:'codex-quota-ram-v14',
          type:'RAM_RESULT',capacity:16*2**30,
          availableCapacity:16*2**30*(1-window.__ramUsed/100)}})));
    }
  };
}'''
async def val(page, expression):
    return await page.locator(HOST).evaluate('e=>{const s=e.shadowRoot;return '+expression+';}')
async def setup(page):
    await page.set_content(PAGE)
    await page.evaluate(MOCK)
    await page.evaluate(SCRIPT)
    await page.wait_for_timeout(650)

async def test_browser():
  async with async_playwright() as pw:
    browser=await pw.chromium.launch(
      executable_path=os.environ.get('CODEX_TEST_CHROMIUM_PATH') or '/usr/bin/chromium',
      headless=True,args=['--no-sandbox'])
    for width in (825,410):
      ctx=await browser.new_context(viewport={'width':width,'height':780})
      page=await ctx.new_page();await setup(page)
      assert await val(page,"s.querySelector('#widget').dataset.mode")=='docked'
      assert await page.evaluate('window.__requests')==1
      assert await page.evaluate('window.__bridgeForecast')==1
      assert await page.evaluate('window.__forecastDirect')==0, 'Bridge should be preferred'
      print('CASE 01 initial dock, quota, background-first forecast',width,'PASS')
      assert '71%' in await val(page,"s.querySelector('#peekFive').textContent")
      assert '88%' in await val(page,"s.querySelector('#peekWeek').textContent")
      assert '周重' in await val(page,"s.querySelector('#peekWeekDate').textContent")
      assert ':' in await val(page,"s.querySelector('#peekWeekClock').textContent")
      print('CASE 02 preview 3 selected information fields PASS')
      await page.locator(HOST).locator('#dock').hover()
      await page.wait_for_timeout(780)
      mode=await val(page,"s.querySelector('#widget').dataset.mode")
      assert mode=='peek',f'hover flickers from handle: {mode}'
      assert '24h 22%' in await val(page,"s.querySelector('#peekForecast').textContent")
      assert 'codex-reset.com' in await val(page,"s.querySelector('.peek-forecast a').href")
      assert not await val(page,"s.querySelector('#ramAlert').classList.contains('visible')")
      print('CASE 03 sustained hover, forecast on hover, RAM quiet below 90% PASS')
      await page.screenshot(path=f'/mnt/data/codex-v1.6-preview-{width}.png')
      await page.locator(HOST).locator('#peek-open').click()
      await page.wait_for_timeout(220)
      assert await val(page,"s.querySelector('#widget').dataset.mode")=='expanded'
      p=await page.locator(HOST).locator('#panel').bounding_box()
      assert p and p['width']<=283 and p['height']<=185,p
      assert p['x']>=0 and p['x']+p['width']<=width
      assert 'RAM' not in await val(page,"s.querySelector('#peekForecast').textContent")
      await page.screenshot(path=f'/mnt/data/codex-v1.6-details-{width}.png')
      print('CASE 04 click details compact, viewport fit',p,'PASS')
      await page.locator('#prompt').focus()
      await page.wait_for_timeout(100)
      assert await val(page,"s.querySelector('#widget').dataset.mode")=='docked'
      print('CASE 05 input focus dismisses popover, does not cover composer PASS')
      await page.locator(HOST).locator('#dock').hover()
      await page.wait_for_timeout(40)
      await page.evaluate('window.__ramUsed=94')
      await page.evaluate('window.postMessage({type:"RAM_REQUEST"})')
      await page.wait_for_timeout(90)
      assert await val(page,"s.querySelector('#ramAlert').classList.contains('visible')")
      assert 'RAM 94%' in await val(page,"s.querySelector('#ramAlert').textContent")
      print('CASE 06 RAM strictly above 90 shown PASS')
      await page.evaluate('window.__ramUsed=90')
      await page.evaluate('window.postMessage({type:"RAM_REQUEST"})')
      await page.wait_for_timeout(90)
      assert not await val(page,"s.querySelector('#ramAlert').classList.contains('visible')")
      print('CASE 07 RAM 90 or under stays invisible in preview PASS')
      await page.locator(HOST).locator('#peek-open').click()
      await page.locator('#sample').click(force=True)
      assert await val(page,"s.querySelector('#widget').dataset.mode")=='docked'
      print('CASE 08 outside click closes details PASS')
      await page.locator(HOST).locator('#dock').hover()
      await page.locator(HOST).locator('#peek-open').click()
      await page.keyboard.press('Escape')
      assert await val(page,"s.querySelector('#widget').dataset.mode")=='docked'
      print('CASE 09 Esc closes details PASS')
      await page.locator(HOST).locator('#dock').hover()
      await page.mouse.move(60,75)
      await page.wait_for_timeout(720)
      assert await val(page,"s.querySelector('#widget').dataset.mode")=='docked'
      print('CASE 10 hover leave auto docks PASS')
      await page.locator(HOST).locator('#dock').hover()
      await page.locator(HOST).locator('#peek-open').click()
      await page.locator(HOST).locator('#close').click()
      assert await page.locator(HOST).evaluate('e=>e.style.display')=='none'
      assert await page.evaluate('sessionStorage.getItem("codex-quota-cn-tab-hidden-v1")')=='1'
      await page.keyboard.press('Control+Alt+q')
      assert await page.locator(HOST).evaluate('e=>e.style.display')=='block'
      print('CASE 11 per-tab close and Ctrl+Alt+Q reopen PASS')
      await page.evaluate('document.body.innerHTML="<main id=\'replacement\'>SPA replaced</main>"')
      await page.wait_for_timeout(340)
      assert await page.locator(HOST).count()==1
      assert await val(page,"s.querySelector('#widget').dataset.mode")=='docked'
      print('CASE 12 SPA recovered PASS')
      await page.locator(HOST).locator('#dock').hover()
      await page.locator(HOST).locator('#peek-open').click()
      await page.locator(HOST).locator('#close').click()
      await page.evaluate('document.body.innerHTML="<main>Replaced again</main>"')
      await page.wait_for_timeout(340)
      assert await page.locator(HOST).evaluate('e=>e.style.display')=='none'
      print('CASE 13 SPA hidden remains hidden PASS')
      await ctx.close()
    # Verify no notification popup; no third-party credentialed fetch.
    assert 'new Notification' not in SCRIPT and 'window.alert(' not in SCRIPT
    assert "credentials:'omit'" in SCRIPT and "sessionPath: '/api/auth/session'" in SCRIPT
    print('CASE 14 color-only warning, forecast uncredentialed PASS')
    # Extremely narrow split window: dock remains visible and details clamp horizontally.
    ctx=await browser.new_context(viewport={'width':320,'height':530})
    page=await ctx.new_page();await setup(page)
    await page.locator(HOST).locator('#dock').hover()
    await page.locator(HOST).locator('#peek-open').click()
    await page.wait_for_timeout(250)
    p=await page.locator(HOST).locator('#panel').bounding_box()
    assert p and p['x']>=0 and p['x']+p['width']<=320,p
    print('CASE 15 narrow window details remain on-screen PASS')
    await ctx.close()
    # With no extension, direct read-only GET fallback works after brief bridge timeout.
    ctx=await browser.new_context(viewport={'width':410,'height':780})
    page=await ctx.new_page();await page.set_content(PAGE);await page.evaluate(MOCK)
    await page.evaluate('window.__bridgeEnabled=false')
    await page.evaluate(SCRIPT)
    await page.wait_for_timeout(5400)
    assert await page.evaluate('window.__forecastDirect')==1
    assert '24h 27%' in await val(page,"s.querySelector('#peekForecast').textContent")
    print('CASE 16 extension fallback uses direct read-only GET PASS')
    await ctx.close()
    # An unreachable provider must not invent numeric predictions.
    ctx=await browser.new_context(viewport={'width':410,'height':780})
    page=await ctx.new_page();await page.set_content(PAGE);await page.evaluate(MOCK)
    await page.evaluate('window.__bridgeEnabled=false;window.__directBlocked=true')
    await page.evaluate(SCRIPT)
    await page.wait_for_timeout(5400)
    result=await val(page,"({odds:s.querySelector('#peekForecast').textContent,meta:s.querySelector('#forecast .forecast-meta').textContent})")
    assert result['odds']=='预测暂不可用' and '异常' in result['meta'],result
    print('CASE 17 both forecast sources unavailable, no invented percentages PASS')
    await ctx.close()
    # Manual drag changes to left edge, saved for this tab; doubleclick resets.
    ctx=await browser.new_context(viewport={'width':825,'height':780})
    page=await ctx.new_page();await setup(page)
    await page.locator(HOST).locator('#dock').hover()
    await page.locator(HOST).locator('#peek-open').click()
    await page.wait_for_timeout(220)
    bbox=await page.locator(HOST).locator('#drag').bounding_box()
    await page.mouse.move(bbox['x']+52,bbox['y']+12)
    await page.mouse.down();await page.mouse.move(150,240,steps=10);await page.mouse.up()
    assert await val(page,"s.querySelector('#widget').dataset.side")=='left'
    saved=await page.evaluate('sessionStorage.getItem("codex-quota-cn-tab-ui-v16")')
    assert saved and '"left"' in saved,saved
    print('CASE 18 drag snap left and per-tab saved placement PASS')
    await page.locator(HOST).locator('#drag').dblclick(position={'x':25,'y':15})
    assert await val(page,"s.querySelector('#widget').dataset.side")=='right'
    print('CASE 19 double-click restores right edge PASS')
    await ctx.close()
    await browser.close()

if __name__=='__main__':asyncio.run(test_browser())
