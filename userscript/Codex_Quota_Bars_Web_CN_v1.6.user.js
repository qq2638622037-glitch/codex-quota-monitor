// ==UserScript==
// @name         Codex Web Quota Bars (5h + 7d + global reset odds + system RAM, CN)
// @namespace    https://chatgpt.com/
// @version      1.6.0
// @description  Dockable dual-ring quota orb: hover to peek, click for details, 24h/48h community forecast, and local RAM warning.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  // Quota endpoint is unofficial and first-party. The forecast is an optional,
  // unaffiliated public read-only service. No ChatGPT credentials or usage values
  // are sent to the forecast provider. Optional Edge bridge handles CSP fallback.
  const ID = 'codex-quota-cn-overlay-v1';
  if (document.getElementById(ID)) return;
  const CONFIG = {
    refreshMs: 2 * 60 * 1000,
    timeoutMs: 15000,
    usagePath: '/backend-api/wham/usage',
    sessionPath: '/api/auth/session',
    storageKey: 'codex-quota-cn-tab-ui-v16',
    previousStorageKey: 'codex-quota-cn-tab-ui-v14',
    legacyStorageKey: 'codex-quota-cn-overlay-ui-v1',
    visibilityKey: 'codex-quota-cn-tab-hidden-v1',
    cacheKey: 'codex-quota-cn-shared-data-v14',
    lockKey: 'codex-quota-cn-shared-lock-v14',
    cacheTtlMs: 125000,
    lockLeaseMs: 19000,
    memoryIntervalMs: 30000,
    ramChannel: 'codex-quota-ram-v14', // v1.4 memory protocol remains unchanged
    forecastUrl: 'https://codex-reset.com/api/forecast',
    forecastSource: 'https://codex-reset.com/',
    forecastChannel: 'codex-quota-forecast-v15',
    forecastCacheKey: 'codex-quota-cn-forecast-data-v15',
    forecastLockKey: 'codex-quota-cn-forecast-lock-v15',
    forecastAttemptKey: 'codex-quota-cn-forecast-attempt-v15',
    forecastRefreshMs: 20 * 60 * 1000,
    forecastMinGapMs: 60 * 1000,
    forecastLockLeaseMs: 20000,
    forecastTimeoutMs: 16000,
    forecastRetryMs: 2 * 60 * 1000,
    forecastMaxSourceAgeMs: 6 * 60 * 60 * 1000,
    forecastMaxCacheAgeMs: 2 * 60 * 60 * 1000,
  };
  const T = {
    heading:'Codex 额度', five:'5 小时限额', week:'7 天限额',
    remaining:'剩余', reset:'重置', until:'距重置', missing:'未提供',
    missingReset:'未提供重置时间', refresh:'立即刷新', collapse:'折叠',
    expand:'展开', loading:'读取中', updated:'更新', error:'刷新失败',
    empty:'接口未返回额度窗口', login:'请检查登录状态', stale:'旧数据',
    now:'待服务器刷新', minute:'分', hour:'时', day:'天', second:'秒',
    memory:'电脑内存', noMemory:'需装内存组件', unavailable:'暂不可用',
    forecast:'额外全局重置', forecastMissing:'预测暂不可用',
    forecastLoading:'读取预测中', forecastStale:'数据已过期',
  };

  // UI docking, visibility and placement stay per-tab. The prior per-tab
  // v1.4/v1.5 coordinates are migrated once without synchronizing tab layouts.
  let uiState = {side:'right',top:null};
  try {
    const next = JSON.parse(sessionStorage.getItem(CONFIG.storageKey)||'null');
    const old = JSON.parse(sessionStorage.getItem(CONFIG.previousStorageKey)||
      localStorage.getItem(CONFIG.legacyStorageKey)||'null');
    if (next && (next.side==='left'||next.side==='right')) {
      uiState.side=next.side;
      uiState.top=Number.isFinite(next.top)?next.top:null;
    } else if (old && typeof old==='object') {
      if (Number.isFinite(old.left)) uiState.side=old.left<innerWidth/2?'left':'right';
      if (Number.isFinite(old.top)) uiState.top=old.top;
    }
  } catch (_) { /* storage may be restricted */ }
  const persistUi=()=>{
    try {sessionStorage.setItem(CONFIG.storageKey,JSON.stringify(uiState));}
    catch (_) { /* memory fallback */ }
  };
  let hidden=false;
  try {hidden=sessionStorage.getItem(CONFIG.visibilityKey)==='1';}
  catch (_) { /* memory fallback */ }
  const persistVisibility=()=>{
    try {sessionStorage.setItem(CONFIG.visibilityKey,hidden?'1':'0');}
    catch (_) { /* memory fallback */ }
  };
  const tabId=`${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // ----- Parse the official site's changing, undocumented response shape. -----
  function finite(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function firstNumber(...values) {
    for (const value of values) {
      const n = finite(value);
      if (n !== null) return n;
    }
    return null;
  }

  function parseReset(win, now) {
    const raw = win.reset_at ?? win.resetAt ?? win.resets_at ??
      win.reset_time_ms ?? win.resetTimeMs;
    if (raw != null && raw !== '') {
      const n = finite(raw);
      if (n !== null && n > 0) return n >= 1e12 ? n : n * 1000;
      if (typeof raw === 'string') {
        const date = Date.parse(raw);
        if (Number.isFinite(date)) return date;
      }
    }
    const after = firstNumber(win.reset_after_seconds, win.resetAfterSeconds);
    return after !== null && after >= 0 ? now + after * 1000 : null;
  }

  function parsePercent(win) {
    const left = firstNumber(win.percent_left, win.remaining_percent, win.remainingPercent);
    const used = firstNumber(win.used_percent, win.usedPercent,
      win.utilization_percent, win.usage_percent);
    const n = left !== null ? left : used !== null ? 100 - used : null;
    return n === null ? null : Math.max(0, Math.min(100, n));
  }

  function parseUsage(payload, now = Date.now()) {
    const roots = [payload?.rate_limit, payload?.rate_limits?.codex,
      payload?.rate_limits, payload];
    const root = roots.find(x => x && typeof x === 'object' &&
      ['primary_window', 'secondary_window', 'five_hour', 'weekly', 'primary', 'secondary']
        .some(key => x[key] && typeof x[key] === 'object'));
    const result = { five: null, week: null };
    if (!root) return result;
    const keys = ['five_hour', 'weekly', 'primary_window', 'secondary_window',
      'primary', 'secondary'];
    for (const key of keys) {
      const win = root[key];
      if (!win || typeof win !== 'object') continue;
      const remaining = parsePercent(win);
      if (remaining === null) continue;
      const duration = firstNumber(win.limit_window_seconds, win.window_seconds,
        win.window?.seconds, win.limit_window?.seconds);
      let group = null;
      if (duration !== null) {
        if (duration >= 2 * 86400 && duration <= 10 * 86400) group = 'week';
        if (duration >= 2 * 3600 && duration <= 8 * 3600) group = 'five';
      } else if (key === 'five_hour') group = 'five';
      else if (key === 'weekly') group = 'week';
      // Avoid assuming primary_window means 5h: sometimes it is the only 7d window.
      if (!group) continue;
      if (result[group] === null) result[group] = {
        remaining,
        resetAt: parseReset(win, now),
      };
    }
    return result;
  }
  // ----- End pure parser. -----

  const host = document.createElement('div');
  host.id=ID;
  host.style.cssText='position:fixed;z-index:2147483000;width:min(300px,100vw);height:198px;pointer-events:none;';
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML=`
    <style>
      :host {color-scheme:light dark;}
      * {box-sizing:border-box;}
      .widget { --surface:#fff;--text:#242424;--muted:#6b6d72;--line:#e2e3e6;
        --track:#e6e9ee;--five-color:#7890b1;--week-color:#6ba6bd;
        --shadow:0 7px 18px rgba(0,0,0,.2);
        font-family:system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;
        color:var(--text);font-variant-numeric:tabular-nums;position:relative;
        height:100%;width:100%;font-size:10px;pointer-events:none; }
      :host([data-dark="true"]) .widget {--surface:#242528;--text:#f1f2f4;
        --muted:#b2b4bd;--line:#44464d;--track:#484b52;
        --five-color:#c6c9d0;--week-color:#73b4c8;
        --shadow:0 8px 24px rgba(0,0,0,.44);}
      button {font-family:inherit;}
      .handle {position:absolute;top:56px;right:0;width:13px;height:68px;
        border:1px solid var(--line);border-right:0;border-radius:8px 0 0 8px;
        background:var(--surface);box-shadow:var(--shadow);cursor:pointer;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        gap:6px;padding:0;pointer-events:auto;touch-action:none;}
      .handle i {display:block;width:3px;height:18px;border-radius:4px;background:var(--five-color);}
      .handle i.week-rail {height:13px;background:var(--week-color);}
      .handle .handle-alert {width:6px;height:6px;position:absolute;top:3px;left:2px;
        border-radius:50%;background:#e05a51;display:none;}
      .handle[data-alert="true"] .handle-alert {display:block;}
      .widget[data-side="left"] .handle {left:0;right:auto;border-left:0;border-right:1px solid var(--line);
        border-radius:0 8px 8px 0;}
      .peek {position:absolute;right:12px;top:5px;width:126px;text-align:center;
        opacity:0;visibility:hidden;transform:translateX(12px);
        transition:transform .18s ease,opacity .18s ease,visibility .18s;
        pointer-events:none;}
      .widget[data-side="left"] .peek {left:12px;right:auto;transform:translateX(-12px);}
      .widget[data-mode="peek"] .peek {opacity:1;visibility:visible;transform:translateX(0);
        pointer-events:auto;}
      .peek-orb {display:flex;align-items:center;justify-content:center;margin:0 auto;
        width:104px;height:104px;border:0;background:transparent;color:inherit;
        cursor:pointer;position:relative;padding:0;}
      .ring {border-radius:50%;display:flex;align-items:center;justify-content:center;}
      .outer {width:100px;height:100px;
        background:conic-gradient(var(--week-color) var(--week-progress,0%),var(--track) 0);}
      .inner {width:86px;height:86px;
        background:conic-gradient(var(--five-color) var(--five-progress,0%),var(--track) 0);}
      .center {width:74px;height:74px;border-radius:50%;background:var(--surface);
        border:1px solid var(--line);display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:1px;line-height:12px;
        box-shadow:inset 0 0 0 1px rgba(128,128,128,.05);}
      .center span {white-space:nowrap;}
      .center .pct {font-size:11px;font-weight:700;}
      .center .week-pct {font-size:10px;font-weight:600;}
      .center .week-date {font-size:9px;color:var(--muted);}
      .center .week-clock {font-size:9px;color:var(--muted);}
      .peek-orb:hover .center,.peek-orb:focus-visible .center {border-color:var(--week-color);}
      .peek-orb:focus-visible,.handle:focus-visible,button:focus-visible,a:focus-visible
        {outline:2px solid #4c96e1;outline-offset:2px;}
      .ram-alert {position:absolute;bottom:2px;right:-6px;background:#cb4e49;
        color:white;border-radius:7px;padding:2px 4px;font-size:9px;font-weight:700;
        white-space:nowrap;display:none;}
      .ram-alert.visible {display:block;}
      .peek-forecast {margin:2px auto 0;min-height:28px;padding:3px 4px;
        width:126px;color:var(--muted);font-size:9px;line-height:12px;
        background:var(--surface);border:1px solid var(--line);border-radius:8px;
        box-shadow:var(--shadow);white-space:nowrap;}
      .peek-forecast .forecast-odds {display:block;color:var(--text);font-weight:600;}
      .peek-forecast a {color:var(--muted);font-size:8px;}
      .panel {position:absolute;top:4px;right:10px;
        width:min(282px,calc(100vw - 22px));max-height:calc(100vh - 20px);
        border:1px solid var(--line);border-radius:10px;
        background:var(--surface);color:var(--text);
        box-shadow:var(--shadow);overflow:auto;pointer-events:none;
        visibility:hidden;opacity:0;transform:translateX(8px);
        transition:opacity .18s ease,transform .18s ease,visibility .18s;}
      .widget[data-side="left"] .panel {left:10px;right:auto;transform:translateX(-8px);}
      .widget[data-mode="expanded"] .panel {visibility:visible;opacity:1;
        transform:translateX(0);pointer-events:auto;}
      .widget[data-mode="expanded"] .peek {pointer-events:none;visibility:hidden;opacity:0;}
      .head {display:flex;align-items:center;gap:3px;height:28px;
        padding:0 6px 0 8px;cursor:grab;user-select:none;touch-action:none;
        border-bottom:1px solid var(--line);}
      .head:active {cursor:grabbing;}
      .heading {font-weight:700;font-size:11px;white-space:nowrap;}
      .status {font-size:9px;color:var(--muted);margin-left:auto;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
      .head button {background:transparent;color:var(--muted);border:0;
        width:19px;height:19px;flex:0 0 auto;display:grid;place-items:center;
        border-radius:5px;cursor:pointer;font-size:14px;padding:0;}
      .head button:hover {background:var(--track);color:var(--text);}
      .body {padding:5px 7px 7px;}
      .quota-grid {display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;}
      .metric {min-width:0;}
      .line {display:flex;justify-content:space-between;gap:4px;
        align-items:baseline;line-height:13px;}
      .label {font-weight:600;white-space:nowrap;}
      .value {white-space:nowrap;font-size:10px;font-weight:700;}
      .track {height:4px;width:100%;background:var(--track);border-radius:4px;overflow:hidden;margin-top:3px;}
      .fill {height:100%;width:0;background:var(--five-color);border-radius:4px;transition:width .35s ease;}
      #week .fill {background:var(--week-color);}
      .metric[data-risk="warn"] .fill {background:#cc8a29;}
      .metric[data-risk="critical"] .fill {background:#d4514e;}
      .metric[data-risk="warn"] .value {color:#cd8d2e;}
      .metric[data-risk="critical"] .value {color:#df5c55;}
      .reset {font-size:9px;color:var(--muted);line-height:12px;padding-top:3px;}
      .reset span {display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .meta-row {border-top:1px solid var(--line);margin-top:6px;padding-top:5px;}
      .forecast .forecast-meta {display:block;color:var(--muted);font-size:9px;
        line-height:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .forecast a {font-size:9px;color:var(--muted);text-decoration:underline;text-underline-offset:2px;}
      .memory .track {height:3px;margin-top:3px;}
      .memory .fill {background:var(--week-color);}
      .memory .value {font-size:9px;}
      @media (prefers-reduced-motion:reduce) {.panel,.peek,.fill {transition:none;}}
    </style>
    <div class="widget" id="widget" data-side="right" data-mode="docked">
      <button type="button" id="dock" class="handle" title="悬停显示额度球，点击展开详情">
        <span class="handle-alert"></span><i></i><i class="week-rail"></i>
      </button>
      <div class="peek" id="peek">
        <button type="button" class="peek-orb" id="peek-open" title="点击打开额度详情">
          <span class="ring outer"><span class="ring inner"><span class="center">
            <span class="pct" id="peekFive">5h --</span>
            <span class="week-pct" id="peekWeek">7d --</span>
            <span class="week-date" id="peekWeekDate">周重 --</span>
            <span class="week-clock" id="peekWeekClock">--:--</span>
          </span></span></span>
          <span class="ram-alert" id="ramAlert"></span>
        </button>
        <div class="peek-forecast" title="非官方实验预测，仅预测额外全局重置">
          <span class="forecast-odds" id="peekForecast">预测加载中</span>
          <a href="https://codex-reset.com/" target="_blank" rel="noopener noreferrer">来源 codex-reset.com</a>
        </div>
      </div>
      <div class="panel" id="panel" role="region" aria-label="Codex 额度详情">
        <div class="head" id="drag" title="拖动改变贴边位置，双击恢复默认位置">
          <span class="heading">${T.heading}</span><span class="status" id="status"></span>
          <button type="button" id="refresh" title="立即刷新" aria-label="立即刷新">&#8635;</button>
          <button type="button" id="close" title="完全关闭（Ctrl+Alt+Q 重开）" aria-label="关闭额度监控">&#215;</button>
          <button type="button" id="collapse" title="贴边收起" aria-label="贴边收起">&#10140;</button>
        </div>
        <div class="body">
          <div class="quota-grid">
            <div class="metric" id="five">
              <div class="line"><span class="label">5 小时</span><strong class="value">--</strong></div>
              <div class="track" role="progressbar" aria-label="5 小时额度剩余" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div></div>
              <div class="reset"><span class="time">${T.missingReset}</span><span class="countdown">--</span></div>
            </div>
            <div class="metric" id="week">
              <div class="line"><span class="label">7 天</span><strong class="value">--</strong></div>
              <div class="track" role="progressbar" aria-label="7 天额度剩余" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div></div>
              <div class="reset"><span class="time">${T.missingReset}</span><span class="countdown">--</span></div>
            </div>
          </div>
          <div class="metric forecast meta-row" id="forecast" title="第三方实验预测，非 OpenAI 官方承诺，不涉及个人常规重置或重置卡">
            <div class="line"><span class="label">额外全局重置</span><strong class="value">${T.forecastLoading}</strong></div>
            <span class="forecast-meta">预测加载中</span>
            <a href="https://codex-reset.com/" target="_blank" rel="noopener noreferrer">数据源 codex-reset.com</a>
          </div>
          <div class="metric memory meta-row" id="memory" title="整机物理内存，不是 Edge 单独的内存">
            <div class="line"><span class="label">电脑内存</span><strong class="value">${T.noMemory}</strong></div>
            <div class="track" role="progressbar" aria-label="整机物理内存使用率" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div></div>
          </div>
        </div>
      </div>
    </div>`;

  const el=selector=>shadow.querySelector(selector);
  const widget=el('#widget'),panel=el('#panel'),status=el('#status');
  const metrics={five:el('#five'),week:el('#week')};
  let limits={five:null,week:null};
  let lastSuccess=null,lastError=null,busy=false,waiting=false;
  let memoryInfo=null,memoryError=null,memorySeen=false;
  let forecastInfo=null,forecastError=null,forecastBusy=false;
  let forecastFailures=0,forecastRetryAt=0;
  let uiMode='docked';

  function updateTheme() {
    const dark = document.documentElement.classList.contains('dark') ||
      document.documentElement.dataset.theme === 'dark' ||
      document.body?.classList.contains('dark') ||
      (document.documentElement.dataset.theme !== 'light' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    host.dataset.dark = dark ? 'true' : 'false';
  }
  function formatPercent(n) { return `${Math.round(n * 10) / 10}%`; }
  function gb(n) { return `${(n / 1073741824).toFixed(1)} GB`; }
  function resetDate(ms, weekly) {
    if (ms === null || !Number.isFinite(ms)) return T.missingReset;
    const d = new Date(ms);
    const options = weekly
      ? {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}
      : {hour:'2-digit',minute:'2-digit',hour12:false};
    return `${T.reset}: ${new Intl.DateTimeFormat('zh-CN',options).format(d)}`;
  }
  function countdown(ms, now) {
    if (ms === null || !Number.isFinite(ms)) return '--';
    if (ms <= now) return T.now;
    const secs = Math.max(0,Math.floor((ms-now)/1000));
    const days = Math.floor(secs/86400), hrs = Math.floor((secs%86400)/3600);
    const mins = Math.floor((secs%3600)/60), sec = secs%60;
    if (days > 0) return `${days}${T.day}${hrs}${T.hour}${mins}${T.minute}`;
    if (hrs > 0) return `${hrs}${T.hour}${mins}${T.minute}${sec}${T.second}`;
    return `${mins}${T.minute}${sec}${T.second}`;
  }
  function quotaRisk(key, remaining) {
    if (key === 'five') return remaining <= 10 ? 'critical' : remaining <= 30 ? 'warn' : 'normal';
    return remaining <= 5 ? 'critical' : remaining <= 20 ? 'warn' : 'normal';
  }
  function memoryRisk(usedPercent) {
    return usedPercent > 90 ? 'critical' : 'normal';
  }
  function formatWeekPeek(ms) {
    if (!Number.isFinite(ms)) return ['周重 --','--:--'];
    const d=new Date(ms);
    const md=`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    const hm=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    return [`周重 ${md}`,hm];
  }
  function draw() {
    const now=Date.now();
    for (const key of ['five','week']) {
      const metric=metrics[key],val=limits[key];
      const track=metric.querySelector('.track'),bar=metric.querySelector('.fill');
      if (!val) {
        metric.dataset.risk='normal';
        metric.querySelector('.value').textContent=T.missing;
        bar.style.width='0%';track.removeAttribute('aria-valuenow');
        metric.querySelector('.time').textContent=T.missingReset;
        metric.querySelector('.countdown').textContent='--';
      } else {
        metric.dataset.risk=quotaRisk(key,val.remaining);
        metric.querySelector('.value').textContent=formatPercent(val.remaining);
        bar.style.width=`${val.remaining}%`;
        track.setAttribute('aria-valuenow',String(val.remaining));
        metric.querySelector('.time').textContent=resetDate(val.resetAt,key==='week');
        metric.querySelector('.countdown').textContent=val.resetAt===null?'--':
          `${T.until} ${countdown(val.resetAt,now)}`;
      }
    }
    const ram=el('#memory'),ramTrack=ram.querySelector('.track'),ramBar=ram.querySelector('.fill');
    let ramPercent=null;
    if (memoryInfo && now-memoryInfo.sampledAt<120000) {
      const {capacity,availableCapacity}=memoryInfo;
      const used=capacity-availableCapacity;
      ramPercent=Math.max(0,Math.min(100,used/capacity*100));
      ram.dataset.risk=memoryRisk(ramPercent);
      ram.querySelector('.value').textContent=`${formatPercent(ramPercent)} · ${gb(used)}/${gb(capacity)}`;
      ramBar.style.width=`${ramPercent}%`;
      ramTrack.setAttribute('aria-valuenow',String(ramPercent));
      ram.title=`整机物理内存：已用 ${gb(used)}，可用 ${gb(availableCapacity)}，总量 ${gb(capacity)}；不代表 Edge 单独占用。`;
    } else {
      ram.dataset.risk='normal';
      ram.querySelector('.value').textContent=memorySeen?(memoryError||T.unavailable):T.noMemory;
      ramBar.style.width='0%';ramTrack.removeAttribute('aria-valuenow');
    }
    const odds=el('#forecast'),oddsValue=odds.querySelector('.value');
    const oddsMeta=odds.querySelector('.forecast-meta');
    const forecastFresh=forecastInfo && forecastInfo.updatedAt &&
      now-forecastInfo.updatedAt<CONFIG.forecastMaxSourceAgeMs &&
      forecastInfo.updatedAt<=now+5*60000 &&
      now-forecastInfo.fetchedAt<CONFIG.forecastMaxCacheAgeMs;
    if (forecastFresh) {
      oddsValue.textContent=`24h ${forecastInfo.p24}% · 48h ${forecastInfo.p48}%`;
      const conf={low:'低',medium:'中',high:'高'}[forecastInfo.confidence]||'未知';
      const tm=new Date(forecastInfo.updatedAt).toLocaleTimeString('zh-CN',
        {hour:'2-digit',minute:'2-digit'});
      oddsMeta.textContent=forecastError?`上次有效 ${tm} · 最近刷新失败`:
        `${conf}置信度 · 来源更新 ${tm}`;
      el('#peekForecast').textContent=`24h ${forecastInfo.p24}% · 48h ${forecastInfo.p48}%`;
      odds.title=`仅预测临时全局重置，非官方承诺。来源于 ${tm} 更新，${conf}置信度。${forecastError?'最近更新失败。':''}`;
    } else {
      const summary=forecastBusy?T.forecastLoading:forecastInfo?T.forecastStale:T.forecastMissing;
      oddsValue.textContent=summary;
      oddsMeta.textContent=forecastError?`预测源异常：${forecastError.slice(0,70)}`:
        forecastInfo?'数据已过期':'实验估计，不代表官方承诺';
      el('#peekForecast').textContent=summary;
    }
    const five=limits.five,week=limits.week;
    el('#peekFive').textContent=`5h ${five?formatPercent(five.remaining):'--'}`;
    el('#peekWeek').textContent=`7d ${week?formatPercent(week.remaining):'--'}`;
    const [weekDay,weekTime]=formatWeekPeek(week?.resetAt);
    el('#peekWeekDate').textContent=weekDay;
    el('#peekWeekClock').textContent=weekTime;
    widget.style.setProperty('--five-progress',`${five?.remaining??0}%`);
    widget.style.setProperty('--week-progress',`${week?.remaining??0}%`);
    const fRisk=five?quotaRisk('five',five.remaining):'normal';
    const wRisk=week?quotaRisk('week',week.remaining):'normal';
    widget.style.setProperty('--five-color',fRisk==='critical'?'#dd5555':fRisk==='warn'?'#cc8a29':'#8faac0');
    widget.style.setProperty('--week-color',wRisk==='critical'?'#dd5555':wRisk==='warn'?'#cc8a29':'#6ba6bd');
    const ramOver90=ramPercent!==null && ramPercent>90;
    const alert=el('#ramAlert');
    alert.classList.toggle('visible',ramOver90);
    alert.textContent=ramOver90?`RAM ${Math.round(ramPercent)}%`:'';
    el('#dock').dataset.alert=ramOver90||fRisk==='critical'||wRisk==='critical'?'true':'false';
    el('#dock').title=`悬停查看额度：5h ${five?formatPercent(five.remaining):'--'}，7d ${week?formatPercent(week.remaining):'--'}，${weekDay} ${weekTime}`;
    if (busy) status.textContent=T.loading;
    else if (waiting) status.textContent='共享更新中';
    else if (lastError) status.textContent=lastSuccess?`${T.error} (${T.stale})`:T.error;
    else if (lastSuccess) status.textContent=`更新 ${new Date(lastSuccess).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`;
    else status.textContent=T.loading;
    status.title=lastError||'';
  }

  // No auth token or full endpoint response is written to shared storage.
  function sanitizeSnapshot(raw) {
    if (!raw || typeof raw!=='object' || !Number.isFinite(raw.t) ||
        raw.t > Date.now()+60000 || raw.t < Date.now()-86400000) return null;
    const out = {t:raw.t,five:null,week:null};
    for (const key of ['five','week']) {
      const val = raw[key];
      if (val === null || val === undefined) continue;
      if (typeof val!=='object' || !Number.isFinite(val.remaining) ||
          val.remaining<0 || val.remaining>100 ||
          (val.resetAt!==null && !Number.isFinite(val.resetAt))) return null;
      out[key] = {remaining:val.remaining,resetAt:val.resetAt};
    }
    return out.five || out.week ? out : null;
  }
  function readCache() {
    try { return sanitizeSnapshot(JSON.parse(localStorage.getItem(CONFIG.cacheKey)||'null')); }
    catch (_) { return null; }
  }
  function applySnapshot(snapshot) {
    if (!snapshot || (lastSuccess!==null && snapshot.t<lastSuccess)) return;
    limits = {five:snapshot.five,week:snapshot.week};
    lastSuccess = snapshot.t;
    lastError = null; waiting = false;
    draw();
  }
  function receiveShared(ev) {
    if (ev.key !== CONFIG.cacheKey || !ev.newValue) return;
    try { applySnapshot(sanitizeSnapshot(JSON.parse(ev.newValue))); }
    catch (_) { /* invalid cache not accepted */ }
  }
  window.addEventListener('storage',receiveShared);
  const initialCache = readCache();
  if (initialCache) applySnapshot(initialCache);
  function lockOwner(now) {
    try {
      const lock = JSON.parse(localStorage.getItem(CONFIG.lockKey)||'null');
      return lock && typeof lock.id==='string' && Number.isFinite(lock.expiry) &&
        lock.expiry>now ? lock.id : null;
    } catch (_) { return null; }
  }
  function acquireLock() {
    // Best-effort cooperative lease: localStorage lacks an atomic compare-and-swap.
    // A simultaneous start can rarely cause two fetches; data remains read-only.
    const now = Date.now();
    try {
      if (lockOwner(now) && lockOwner(now)!==tabId) return false;
      localStorage.setItem(CONFIG.lockKey, JSON.stringify({id:tabId,expiry:now+CONFIG.lockLeaseMs}));
      return lockOwner(now)===tabId;
    } catch (_) { return true; } // fallback to independent requests if storage denied
  }
  function releaseLock() {
    try { if (lockOwner(Date.now())===tabId) localStorage.removeItem(CONFIG.lockKey); }
    catch (_) { /* nonessential */ }
  }


  // Same-origin, read-only fetch. Session bearer token never leaves memory.
  async function requestUsage(signal) {
    const send = token => fetch(CONFIG.usagePath, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal,
      headers: token ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
        : { Accept: 'application/json' },
    });
    let response = await send(null);
    if (response.status !== 401 && response.status !== 403) return response;
    let token = null;
    try {
      const session = await fetch(CONFIG.sessionPath, {
        method: 'GET', credentials: 'include', cache: 'no-store', signal,
        headers: { Accept: 'application/json' },
      });
      if (session.ok) {
        const data = await session.json();
        token = data?.accessToken ?? data?.access_token ??
          data?.tokens?.access_token ?? null;
      }
    } catch (e) { if (e.name === 'AbortError') throw e; }
    if (typeof token === 'string' && token.length > 20) response = await send(token);
    return response;
  }


  async function refresh(force=false) {
    if (busy || hidden || document.visibilityState==='hidden') return;
    const cached = readCache();
    if (cached) applySnapshot(cached);
    if (!force && cached && Date.now()-cached.t < CONFIG.cacheTtlMs &&
        [cached.five,cached.week].every(x => !x?.resetAt || x.resetAt>Date.now())) return;
    if (!acquireLock()) {
      waiting=true; draw();
      // Try again after the other tab finishes or the lease expires.
      setTimeout(() => {if (!hidden && document.visibilityState==='visible') refresh(false);},4700);
      return;
    }
    waiting=false;busy=true;lastError=null;draw();
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),CONFIG.timeoutMs);
    try {
      const response=await requestUsage(controller.signal);
      if (!response.ok) throw new Error(response.status===401||response.status===403
        ? `${T.login} (HTTP ${response.status})` : `HTTP ${response.status}`);
      const payload=await response.json();
      const parsed=parseUsage(payload);
      if (!parsed.five && !parsed.week) throw new Error(T.empty);
      const snapshot={t:Date.now(),five:parsed.five,week:parsed.week};
      applySnapshot(snapshot);
      try { localStorage.setItem(CONFIG.cacheKey,JSON.stringify(snapshot)); }
      catch (_) { /* cache optional */ }
    } catch (e) {
      lastError=e?.name==='AbortError'?'Request timeout':String(e?.message||e);
      console.warn('[Codex Quota Bars]',lastError);
    } finally {
      clearTimeout(timeout);busy=false;releaseLock();draw();
    }
  }

  // ----- Unofficial exceptional reset probability (read-only third-party) -----
  // Use only documented public API fields; banked credits are not mixed in.
  function sanitizeForecast(raw, receivedAt=Date.now()) {
    if (!raw || typeof raw!=='object') return null;
    const api=raw.probabilities && typeof raw.probabilities==='object' ? raw : null;
    const fetchedAt=api ? receivedAt : raw.fetchedAt;
    if (!Number.isFinite(fetchedAt) || fetchedAt>Date.now()+60000 ||
        fetchedAt<Date.now()-CONFIG.forecastMaxCacheAgeMs) return null;
    const p24=api ? api.probabilities.rounded_24h : raw.p24;
    const p48=api ? api.probabilities.rounded_48h : raw.p48;
    const updatedAt=api ? Date.parse(raw.updated_at) : raw.updatedAt;
    const confidence=String(raw.confidence||'unknown').toLowerCase();
    if (!Number.isInteger(p24)||!Number.isInteger(p48)||p24<0||p24>100||
        p48<0||p48>100||p48<p24 || !Number.isFinite(updatedAt) ||
        updatedAt>Date.now()+5*60000 || Date.now()-updatedAt>CONFIG.forecastMaxSourceAgeMs) return null;
    return {p24,p48,confidence:['low','medium','high'].includes(confidence)?confidence:'unknown',
      updatedAt,fetchedAt};
  }
  function readForecastCache() {
    try {return sanitizeForecast(JSON.parse(localStorage.getItem(CONFIG.forecastCacheKey)||'null'));}
    catch (_) {return null;}
  }
  function applyForecastSnapshot(snapshot) {
    if (!snapshot || (forecastInfo && snapshot.fetchedAt<forecastInfo.fetchedAt)) return;
    forecastInfo=snapshot;forecastError=null;draw();
  }
  window.addEventListener('storage',event=>{
    if (event.key===CONFIG.forecastCacheKey && event.newValue) {
      try {applyForecastSnapshot(sanitizeForecast(JSON.parse(event.newValue)));}
      catch (_) { /* ignore invalid external cache */ }
    }
  });
  const initialForecast=readForecastCache();
  if (initialForecast) applyForecastSnapshot(initialForecast);
  function forecastLockOwner(now) {
    try {const x=JSON.parse(localStorage.getItem(CONFIG.forecastLockKey)||'null');
      return x && typeof x.id==='string' && Number.isFinite(x.expiry) && x.expiry>now?x.id:null;
    } catch (_) {return null;}
  }
  function acquireForecastLock() {
    const now=Date.now();
    try {
      if (forecastLockOwner(now) && forecastLockOwner(now)!==tabId) return false;
      localStorage.setItem(CONFIG.forecastLockKey,JSON.stringify({id:tabId,
        expiry:now+CONFIG.forecastLockLeaseMs}));
      return forecastLockOwner(now)===tabId;
    } catch (_) {return true;}
  }
  function releaseForecastLock() {
    try {if (forecastLockOwner(Date.now())===tabId)
      localStorage.removeItem(CONFIG.forecastLockKey);
    } catch (_) { /* fallback */ }
  }
  // ChatGPT's CSP can deny cross-origin fetch even though the provider allows CORS.
  // The optional v1.5+ Edge companion is used first, avoiding page CSP where possible.
  function requestForecastFromBridge(signal) {
    return new Promise((resolve,reject)=>{
      const nonce=`${tabId}-${Math.random().toString(36).slice(2)}`;
      let done=false;
      const cleanup=()=>{window.removeEventListener('message',receive);
        clearTimeout(timer);signal?.removeEventListener('abort',abort);};
      const finish=(err,value)=>{if(done)return;done=true;cleanup();err?reject(err):resolve(value);};
      const receive=ev=>{
        if (ev.source!==window||ev.origin!==location.origin ||
            ev.data?.channel!==CONFIG.forecastChannel ||
            ev.data?.type!=='FORECAST_RESULT' || ev.data?.nonce!==nonce) return;
        if (!ev.data.ok) finish(new Error('Forecast bridge unavailable'));
        else finish(null,ev.data.forecast);
      };
      const abort=()=>finish(new DOMException('Aborted','AbortError'));
      const timer=setTimeout(()=>finish(new Error('Forecast bridge not installed or timed out')),4500);
      window.addEventListener('message',receive);
      if (signal) signal.addEventListener('abort',abort,{once:true});
      if (signal?.aborted) {abort();return;}
      window.postMessage({channel:CONFIG.forecastChannel,type:'FORECAST_REQUEST',nonce},location.origin);
    });
  }
  async function requestForecast(signal) {
    // Prefer the installed Edge companion: the page's CSP may block direct GET.
    // This never opens a website or transmits account, quota, chat or RAM data.
    let bridgeError=null;
    try {return await requestForecastFromBridge(signal);}
    catch (error) {
      if (error?.name==='AbortError') throw error;
      bridgeError=error;
    }
    try {
      const response=await fetch(CONFIG.forecastUrl,{method:'GET',mode:'cors',
        credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
        headers:{Accept:'application/json'},signal});
      if (!response.ok) throw new Error(`预测源 HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error?.name==='AbortError') throw error;
      throw new Error(`扩展或来源不可用：${String(error?.message||bridgeError?.message||error)}`);
    }
  }
  async function refreshForecast(force=false) {
    if (forecastBusy || hidden || document.visibilityState==='hidden') return;
    if (!force && Date.now()<forecastRetryAt) return;
    const cached=readForecastCache();
    if (cached) applyForecastSnapshot(cached);
    if (!force && cached && Date.now()-cached.fetchedAt<CONFIG.forecastRefreshMs) return;
    // Never poll faster than the provider's documented minimum, even on button presses.
    try {const t=Number(localStorage.getItem(CONFIG.forecastAttemptKey)||0);
      if (Number.isFinite(t) && t>Date.now()-CONFIG.forecastMinGapMs && t<=Date.now()+60000) return;
    } catch (_) { /* optional pacing */ }
    if (!acquireForecastLock()) return;
    forecastBusy=true;forecastError=null;draw();
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),CONFIG.forecastTimeoutMs);
    try {
      try {localStorage.setItem(CONFIG.forecastAttemptKey,String(Date.now()));}
      catch (_) { /* optional throttle */ }
      const response=await requestForecast(controller.signal);
      const snapshot=sanitizeForecast(response);
      if (!snapshot) throw new Error('Invalid or stale third-party forecast');
      applyForecastSnapshot(snapshot);forecastFailures=0;forecastRetryAt=0;
      try {localStorage.setItem(CONFIG.forecastCacheKey,JSON.stringify(snapshot));}
      catch (_) { /* optional cross-tab cache */ }
    } catch (error) {
      forecastError=error?.name==='AbortError'?'预测超时':String(error?.message||error);
      forecastFailures=Math.min(5,forecastFailures+1);
      forecastRetryAt=Date.now()+Math.min(CONFIG.forecastRefreshMs,
        CONFIG.forecastRetryMs*Math.pow(2,forecastFailures-1));
      console.info('[Codex Quota Bars] Forecast unavailable:',forecastError);
    } finally {
      clearTimeout(timer);forecastBusy=false;releaseForecastLock();draw();
    }
  }
  // ----- End forecast reader -----

  // Optional local companion: Edge Manifest V3 system.memory -> content script -> page event.
  // Never guess system RAM from navigator.deviceMemory or JS heap stats.
  window.addEventListener('message',ev=>{
    if (ev.source!==window || ev.origin!==location.origin) return;
    const info=ev.data;
    if (!info || info.channel!==CONFIG.ramChannel || info.type!=='RAM_RESULT') return;
    memorySeen=true;
    if (info.error) { memoryError='内存不可读';memoryInfo=null;draw();return; }
    const {capacity,availableCapacity}=info;
    if (!Number.isFinite(capacity)||capacity<=0 || !Number.isFinite(availableCapacity)||
        availableCapacity<0 || availableCapacity>capacity) return;
    memoryError=null;
    memoryInfo={capacity,availableCapacity,sampledAt:Date.now()};
    draw();
  });
  function requestMemory() {
    if (hidden || document.visibilityState==='hidden') return;
    window.postMessage({channel:CONFIG.ramChannel,type:'RAM_REQUEST'},location.origin);
  }

  // ----- Docking interaction: small edge tab -> hover ring -> click details. -----
  // The 300px host has pointer-events:none; only visible controls catch events.
  // This prevents its transparent area from obstructing ChatGPT text selection.
  const clamp=(value,min,max)=>Math.max(min,Math.min(value,max));
  let hoverCloseTimer=null,drag=null,suppressHandleClick=false;
  function stopHoverTimer() {
    if (hoverCloseTimer!==null) {clearTimeout(hoverCloseTimer);hoverCloseTimer=null;}
  }
  function setMode(next) {
    if (hidden || !['docked','peek','expanded'].includes(next)) return;
    stopHoverTimer();uiMode=next;widget.dataset.mode=next;
    el('#panel').setAttribute('aria-hidden',next==='expanded'?'false':'true');
    el('#peek').setAttribute('aria-hidden',next==='peek'?'false':'true');
    applyPosition();
  }
  function scheduleDock(delay=550) {
    if (hidden || uiMode==='expanded' || drag) return;
    stopHoverTimer();
    hoverCloseTimer=setTimeout(()=>{
      hoverCloseTimer=null;
      if (uiMode==='peek') setMode('docked');
    },delay);
  }
  function reveal() {
    if (!hidden && uiMode!=='expanded') setMode('peek');
  }
  function applyPosition() {
    if (!host.isConnected || hidden) return;
    if (!Number.isFinite(uiState.top)) uiState.top=Math.round(innerHeight*.54);
    // Reserve space for the full detail panel; the thin handle itself remains at
    // exactly the same edge and vertical location in every visual state.
    const h=198;
    uiState.top=clamp(uiState.top,4,Math.max(4,innerHeight-h-4));
    host.style.top=`${uiState.top}px`;
    host.style.left=uiState.side==='left'?'0px':'auto';
    host.style.right=uiState.side==='right'?'0px':'auto';
    widget.dataset.side=uiState.side;
  }
  function applyVisibility() {
    host.style.display=hidden?'none':'block';
    host.setAttribute('aria-hidden',hidden?'true':'false');
    if (!hidden) {setMode('docked');applyPosition();draw();}
  }
  function setHidden(next) {
    if (hidden===Boolean(next)) return;
    hidden=Boolean(next);persistVisibility();
    stopHoverTimer();
    applyVisibility();
    if (!hidden) {refresh(true);refreshForecast(false);requestMemory();}
  }
  function dockDefault() {
    uiState.side='right';uiState.top=null;
    persistUi();applyPosition();setMode('docked');
  }
  const dock=el('#dock'),peek=el('#peek');
  dock.addEventListener('pointerenter',()=>{stopHoverTimer();reveal();});
  dock.addEventListener('pointerleave',()=>scheduleDock());
  dock.addEventListener('focus',reveal);
  peek.addEventListener('pointerenter',stopHoverTimer);
  peek.addEventListener('pointerleave',()=>scheduleDock());
  peek.addEventListener('focusin',()=>{stopHoverTimer();reveal();});
  dock.addEventListener('click',()=>{
    if (suppressHandleClick) {suppressHandleClick=false;return;}
    setMode('expanded');
  });
  el('#peek-open').addEventListener('click',()=>setMode('expanded'));
  el('#collapse').addEventListener('click',event=>{event.stopPropagation();setMode('docked');});
  el('#close').addEventListener('click',event=>{event.stopPropagation();setHidden(true);});
  el('#refresh').addEventListener('click',event=>{
    event.stopPropagation();refresh(true);refreshForecast(true);requestMemory();
  });
  // A real close remains local to this tab and can always be undone by shortcut.
  document.addEventListener('keydown',event=>{
    if (event.key==='Escape' && !hidden && uiMode!=='docked') {setMode('docked');return;}
    if (event.repeat || event.defaultPrevented || event.isComposing ||
        !event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey ||
        event.getModifierState?.('AltGraph') || String(event.key).toLowerCase()!=='q') return;
    event.preventDefault();setHidden(!hidden);
  },true);
  document.addEventListener('pointerdown',event=>{
    if (uiMode==='expanded' && !event.composedPath().includes(host))setMode('docked');
  },true);
  function isEditing(node) {
    if (!(node instanceof HTMLElement)) return false;
    return node.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=hidden]),[contenteditable="true"],[role="textbox"]') ||
      Boolean(node.closest('[contenteditable="true"],[role="textbox"]'));
  }
  // Keep editing friction low: close expanded popup when the user focuses input.
  document.addEventListener('focusin',event=>{
    if (uiMode==='expanded' && isEditing(event.target)) setMode('docked');
  },true);
  function startDrag(event,kind) {
    if (event.button!==0 || (kind==='head' && event.target.closest('button'))) return;
    stopHoverTimer();
    drag={kind,pointerId:event.pointerId,x:event.clientX,y:event.clientY,
      top:uiState.top ?? 0,side:uiState.side,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event) {
    if (!drag || drag.pointerId!==event.pointerId) return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if (Math.abs(dx)+Math.abs(dy)<5 && !drag.moved) return;
    drag.moved=true;
    uiState.top=drag.top+dy;
    if (drag.kind==='head' || Math.abs(dx)>30)
      uiState.side=event.clientX<innerWidth/2?'left':'right';
    applyPosition();
  }
  function finishDrag(event) {
    if (!drag || drag.pointerId!==event.pointerId) return;
    if (drag.moved) {
      persistUi();
      if (drag.kind==='handle') suppressHandleClick=true;
    }
    drag=null;
  }
  for (const [target,kind] of [[el('#drag'),'head'],[dock,'handle']]) {
    target.addEventListener('pointerdown',event=>startDrag(event,kind));
    target.addEventListener('pointermove',moveDrag);
    target.addEventListener('pointerup',finishDrag);
    target.addEventListener('pointercancel',finishDrag);
  }
  el('#drag').addEventListener('dblclick',event=>{
    if (!event.target.closest('button')) dockDefault();
  });
  window.addEventListener('resize',applyPosition);
  document.addEventListener('visibilitychange',()=>{
    if (document.visibilityState==='hidden') {
      if (uiMode==='peek') setMode('docked');
      return;
    }
    if (!hidden) {refresh();refreshForecast();requestMemory();}
  });

  // Reattach if ChatGPT SPA remounts its body. Respect intentional close.
  let watchedBody=null,recoveryTimer=null,mountCount=0;
  function ensureMounted() {
    if (host.isConnected || !document.body?.isConnected) return;
    const other=document.getElementById(ID);
    if (other && other!==host) return;
    document.body.appendChild(host);mountCount++;
    if (mountCount>1)console.info('[Codex Quota Bars] recovered after SPA remount');
    updateTheme();draw();applyPosition();
  }
  function requestRecovery() {
    if (host.isConnected||recoveryTimer!==null)return;
    recoveryTimer=setTimeout(()=>{recoveryTimer=null;ensureMounted();},120);
  }
  const bodyObserver=new MutationObserver(requestRecovery);
  function observeCurrentBody() {
    if (document.body===watchedBody)return;
    bodyObserver.disconnect();watchedBody=document.body;
    if (watchedBody)bodyObserver.observe(watchedBody,{childList:true});
  }
  new MutationObserver(()=>{observeCurrentBody();requestRecovery();})
    .observe(document.documentElement,{childList:true});
  observeCurrentBody();ensureMounted();updateTheme();applyVisibility();applyPosition();draw();
  new MutationObserver(updateTheme).observe(document.documentElement,
    {attributes:true,attributeFilter:['class','data-theme']});
  setInterval(()=>{if (!hidden && document.visibilityState==='visible')draw();},1000);
  setInterval(()=>{observeCurrentBody();requestRecovery();},3000);
  setInterval(()=>{if (!hidden&&document.visibilityState==='visible')refresh();},CONFIG.refreshMs);
  // Timer checks are cheap; requests still honor 20-minute cache, shared lock,
  // source freshness checks and exponential backoff after failures.
  setInterval(()=>{if (!hidden&&document.visibilityState==='visible')refreshForecast();},
    CONFIG.forecastRetryMs);
  setInterval(requestMemory,CONFIG.memoryIntervalMs);
  setTimeout(()=>{if (!hidden) {refresh();refreshForecast();requestMemory();}},
    250+Math.floor(Math.random()*240));
})();
