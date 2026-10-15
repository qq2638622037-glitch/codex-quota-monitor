// ==UserScript==
// @name         Codex Web Quota Bars (5h + 7d + system RAM, CN)
// @namespace    https://chatgpt.com/
// @version      1.4.0
// @description  Split-screen quotas, per-tab controls, color-only warnings, shared read-only quota cache, optional Edge system RAM companion.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  // Unofficial, undocumented first-party quota endpoint; no remote dependencies.
  // System RAM is OPTIONAL and requires the bundled local Edge extension.
  const ID = 'codex-quota-cn-overlay-v1';
  if (document.getElementById(ID)) return;
  const CONFIG = {
    refreshMs: 2 * 60 * 1000,
    timeoutMs: 15000,
    usagePath: '/backend-api/wham/usage',
    sessionPath: '/api/auth/session',
    storageKey: 'codex-quota-cn-tab-ui-v14',
    legacyStorageKey: 'codex-quota-cn-overlay-ui-v1',
    visibilityKey: 'codex-quota-cn-tab-hidden-v1',
    cacheKey: 'codex-quota-cn-shared-data-v14',
    lockKey: 'codex-quota-cn-shared-lock-v14',
    cacheTtlMs: 125000,
    lockLeaseMs: 19000,
    memoryIntervalMs: 30000,
    ramChannel: 'codex-quota-ram-v14',
  };
  const T = {
    heading:'Codex 额度', five:'5 小时限额', week:'7 天限额',
    remaining:'剩余', reset:'重置', until:'距重置', missing:'未提供',
    missingReset:'未提供重置时间', refresh:'立即刷新', collapse:'折叠',
    expand:'展开', loading:'读取中', updated:'更新', error:'刷新失败',
    empty:'接口未返回额度窗口', login:'请检查登录状态', stale:'旧数据',
    now:'待服务器刷新', minute:'分', hour:'时', day:'天', second:'秒',
    memory:'电脑内存', noMemory:'需装内存组件', unavailable:'暂不可用',
  };

  // UI location and fold state are per-tab. Import v1.3 layout once as a starting point.
  let uiState = { collapsed:false, left:null, top:null };
  try {
    const stored = sessionStorage.getItem(CONFIG.storageKey);
    const saved = JSON.parse(stored || localStorage.getItem(CONFIG.legacyStorageKey) || '{}');
    if (saved && typeof saved === 'object') {
      uiState.collapsed = saved.collapsed === true;
      uiState.left = Number.isFinite(saved.left) ? saved.left : null;
      uiState.top = Number.isFinite(saved.top) ? saved.top : null;
    }
  } catch (_) { /* private storage may be restricted */ }
  const persistUi = () => {
    try { sessionStorage.setItem(CONFIG.storageKey, JSON.stringify(uiState)); }
    catch (_) { /* temporary in-memory fallback */ }
  };
  let hidden = false;
  try { hidden = sessionStorage.getItem(CONFIG.visibilityKey) === '1'; }
  catch (_) { /* temporary in-memory fallback */ }
  const persistVisibility = () => {
    try { sessionStorage.setItem(CONFIG.visibilityKey, hidden ? '1' : '0'); }
    catch (_) { /* temporary in-memory fallback */ }
  };
  const tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
  host.id = ID;
  host.style.cssText = [
    'position:fixed', 'z-index:2147483000',
    'right:12px', 'bottom:88px',
    'width:min(290px,calc(100vw - 16px))',
    'font-size:11px', 'pointer-events:auto',
  ].join(';');
  const shadow = host.attachShadow({mode:'open'});
  shadow.innerHTML = `
    <style>
      :host { color-scheme:light dark; }
      * { box-sizing:border-box; }
      .panel { --surface:#fff;--text:#242424;--muted:#666871;--line:#e6e6e8;
        --track:#e9eaed;--bar:#5b6471;--shadow:0 5px 16px rgba(0,0,0,.13);
        font-family:system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;
        background:var(--surface);color:var(--text);border:1px solid var(--line);
        border-radius:9px;box-shadow:var(--shadow);overflow:hidden;
        font-size:10px;font-variant-numeric:tabular-nums; }
      :host([data-dark="true"]) .panel { --surface:#242424;--text:#f3f3f3;
        --muted:#b9b9c2;--line:#414146;--track:#44454a;--bar:#c4c7cc;
        --shadow:0 8px 20px rgba(0,0,0,.34); }
      .head { display:flex;align-items:center;gap:4px;height:25px;
        padding:0 7px 0 9px;cursor:grab;user-select:none;touch-action:none; }
      .head:active { cursor:grabbing; }
      .heading { font-weight:700;font-size:11px;white-space:nowrap; }
      .status { font-size:10px;color:var(--muted);margin-left:auto;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0; }
      button { all:unset;flex:0 0 auto;display:inline-grid;place-items:center;
        width:19px;height:19px;border-radius:4px;color:var(--muted);
        cursor:pointer;font-size:13px;line-height:1; }
      button:hover { color:var(--text);background:var(--track); }
      button:focus-visible { outline:2px solid #4687dc;outline-offset:-2px; }
      .body { padding:0 9px 5px; }
      .metric { padding:3px 0; }
      .metric + .metric { border-top:1px solid var(--line); }
      .line { display:flex;justify-content:space-between;gap:5px;
        align-items:baseline;margin-bottom:2px;line-height:13px; }
      .label { font-weight:550;white-space:nowrap; }
      strong { font-weight:700;font-size:11px;white-space:nowrap; }
      .track { background:var(--track);width:100%;height:4px;
        border-radius:4px;overflow:hidden; }
      .fill { height:100%;width:0%;background:var(--bar);border-radius:4px;
        transition:width .35s ease; }
      .metric[data-risk="warn"] .fill { background:#ce8c2e; }
      .metric[data-risk="critical"] .fill { background:#dd5555; }
      .metric[data-risk="warn"] .value { color:#ce8c2e; }
      .metric[data-risk="critical"] .value { color:#dd5555; }
      .reset { display:flex;justify-content:space-between;gap:5px;margin-top:2px;
        color:var(--muted);font-size:10px;line-height:14px; }
      .reset span { white-space:nowrap; }
      .memory .line { margin-bottom:3px; }
      .memory .value { font-size:10px; }
      .memory .track { height:3px; }
      .compact { display:none;color:var(--muted);padding:0 9px 6px;font-size:10px; }
      .collapsed .body { display:none; }
      .collapsed .compact { display:block; }
      @media (max-width:340px) { .reset { flex-wrap:wrap;gap:0 6px; } }
      @media (prefers-reduced-motion:reduce) { .fill { transition:none; } }
    </style>
    <div class="panel" id="panel" role="region" aria-label="Codex 额度与系统内存">
      <div class="head" id="drag" title="拖动调整位置，双击恢复默认位置">
        <span class="heading">${T.heading}</span>
        <span class="status" id="status"></span>
        <button type="button" id="refresh" title="${T.refresh}" aria-label="${T.refresh}">&#8635;</button>
        <button type="button" id="close" title="关闭（Ctrl+Alt+Q 重开）" aria-label="关闭额度面板">&#215;</button>
        <button type="button" id="collapse" title="${T.collapse}" aria-label="${T.collapse}">-</button>
      </div>
      <div class="body">
        <div class="metric" id="five">
          <div class="line"><span class="label">${T.five}</span><strong class="value">--</strong></div>
          <div class="track" role="progressbar" aria-label="5 hour remaining" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div></div>
          <div class="reset"><span class="time">${T.missingReset}</span><span class="countdown">--</span></div>
        </div>
        <div class="metric" id="week">
          <div class="line"><span class="label">${T.week}</span><strong class="value">--</strong></div>
          <div class="track" role="progressbar" aria-label="7 day remaining" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div></div>
          <div class="reset"><span class="time">${T.missingReset}</span><span class="countdown">--</span></div>
        </div>
        <div class="metric memory" id="memory" title="需要本 ZIP 内 Edge 内存组件；物理内存总量减可用量，并非 Edge 单独内存">
          <div class="line"><span class="label">${T.memory}</span><strong class="value">${T.noMemory}</strong></div>
          <div class="track" role="progressbar" aria-label="System physical RAM used" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div></div>
        </div>
      </div>
      <div class="compact" id="compact">--</div>
    </div>`;

  const el = selector => shadow.querySelector(selector);
  const panel = el('#panel'), status = el('#status'), compact = el('#compact');
  const metrics = {five:el('#five'),week:el('#week')};
  let limits = {five:null,week:null};
  let lastSuccess = null, lastError = null, busy = false, waiting = false;
  let memoryInfo = null, memoryError = null, memorySeen = false;

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
    return usedPercent >= 90 ? 'critical' : usedPercent >= 80 ? 'warn' : 'normal';
  }
  function draw() {
    const now = Date.now();
    for (const key of ['five','week']) {
      const metric = metrics[key], val = limits[key];
      const track = metric.querySelector('.track'), bar = metric.querySelector('.fill');
      if (!val) {
        metric.dataset.risk = 'normal';
        metric.querySelector('.value').textContent = T.missing;
        bar.style.width = '0%';
        track.removeAttribute('aria-valuenow');
        metric.querySelector('.time').textContent = T.missingReset;
        metric.querySelector('.countdown').textContent = '--';
      } else {
        metric.dataset.risk = quotaRisk(key, val.remaining);
        metric.querySelector('.value').textContent = `${T.remaining} ${formatPercent(val.remaining)}`;
        bar.style.width = `${val.remaining}%`;
        track.setAttribute('aria-valuenow',String(val.remaining));
        metric.querySelector('.time').textContent = resetDate(val.resetAt,key==='week');
        metric.querySelector('.countdown').textContent = val.resetAt===null ? '--' :
          `${T.until} ${countdown(val.resetAt,now)}`;
      }
    }
    const ram = el('#memory'), ramTrack = ram.querySelector('.track'), ramBar = ram.querySelector('.fill');
    if (memoryInfo && now-memoryInfo.sampledAt < 120000) {
      const {capacity,availableCapacity} = memoryInfo;
      const used = capacity-availableCapacity;
      const pct = Math.max(0,Math.min(100,used/capacity*100));
      ram.dataset.risk = memoryRisk(pct);
      ram.querySelector('.value').textContent = `${formatPercent(pct)} · ${gb(used)}/${gb(capacity)}`;
      ramBar.style.width = `${pct}%`;
      ramTrack.setAttribute('aria-valuenow',String(pct));
      ram.title = `整机物理内存：已用 ${gb(used)}，可用 ${gb(availableCapacity)}，总量 ${gb(capacity)}；不代表 Edge 单独占用。`;
    } else {
      ram.dataset.risk = 'normal';
      ram.querySelector('.value').textContent = memorySeen ? (memoryError || T.unavailable) : T.noMemory;
      ramBar.style.width = '0%';
      ramTrack.removeAttribute('aria-valuenow');
    }
    const short = key => limits[key] ? formatPercent(limits[key].remaining) : '--';
    const ramShort = memoryInfo && now-memoryInfo.sampledAt<120000 ?
      `${Math.round((memoryInfo.capacity-memoryInfo.availableCapacity)/memoryInfo.capacity*100)}%` : '--';
    compact.textContent = `5h ${short('five')} | 7d ${short('week')} | RAM ${ramShort}`;
    if (busy) status.textContent = T.loading;
    else if (waiting) status.textContent = '共享更新中';
    else if (lastError) status.textContent = lastSuccess ? `${T.error} (${T.stale})` : T.error;
    else if (lastSuccess) status.textContent = `更新 ${new Date(lastSuccess).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`;
    else status.textContent = T.loading;
    status.title = lastError || '';
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

  let drag=null,avoidPosition=null,ignoreAvoidUntilFocus=false,avoidTimer=null;
  function clamp(v,min,max) {return Math.max(min,Math.min(v,max));}
  function panelSize() {
    const r=host.getBoundingClientRect();return {width:r.width||290,height:r.height||130};
  }
  function basePosition() {
    const s=panelSize();
    return {left:Number.isFinite(uiState.left)?uiState.left:window.innerWidth-s.width-12,
      top:Number.isFinite(uiState.top)?uiState.top:window.innerHeight-s.height-88};
  }
  function applyPosition() {
    if (!host.isConnected || hidden) return;
    const s=panelSize(),pos=avoidPosition||basePosition();
    host.style.left=`${clamp(pos.left,8,Math.max(8,window.innerWidth-s.width-8))}px`;
    host.style.top=`${clamp(pos.top,8,Math.max(8,window.innerHeight-s.height-8))}px`;
    host.style.right='auto';host.style.bottom='auto';
  }
  function intersects(a,b,pad=8) {
    return a.left < b.right+pad && a.left+a.width>b.left-pad &&
      a.top < b.bottom+pad && a.top+a.height>b.top-pad;
  }
  function isEditing(node) {
    if (!(node instanceof HTMLElement)) return false;
    return node.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=hidden]),[contenteditable="true"],[role="textbox"]') ||
      Boolean(node.closest('[contenteditable="true"],[role="textbox"]'));
  }
  function checkAvoid() {
    if (hidden || drag || ignoreAvoidUntilFocus) return;
    const active=document.activeElement;
    if (!isEditing(active)) {
      if (avoidPosition) {avoidPosition=null;applyPosition();}
      return;
    }
    const r=active.getBoundingClientRect();
    if (r.width<15 || r.height<12) return;
    const s=panelSize(),base=basePosition();
    const origin={left:clamp(base.left,8,Math.max(8,innerWidth-s.width-8)),
      top:clamp(base.top,8,Math.max(8,innerHeight-s.height-8)),width:s.width,height:s.height};
    const composer=active.closest('[data-testid*="composer"],form');
    const cr=composer?.getBoundingClientRect();
    // Do nothing during normal reading and editing unless the widget actually overlaps.
    if (!intersects(origin,r,12) && !(cr && cr.height<250 && intersects(origin,cr,2))) {
      if (avoidPosition) {avoidPosition=null;applyPosition();}
      return;
    }
    const candidates=[
      {left:origin.left,top:r.top-s.height-16},
      {left:origin.left,top:r.bottom+16},
      {left:8,top:origin.top},
      {left:innerWidth-s.width-8,top:8},
      {left:8,top:8},
    ];
    let best=null,score=Infinity;
    for (const candidate of candidates) {
      const p={left:clamp(candidate.left,8,Math.max(8,innerWidth-s.width-8)),
        top:clamp(candidate.top,8,Math.max(8,innerHeight-s.height-8)),width:s.width,height:s.height};
      if (intersects(p,r,12) || (cr && cr.height<250 && intersects(p,cr,2))) continue;
      const cost=Math.abs(p.left-origin.left)+Math.abs(p.top-origin.top);
      if (cost<score) {score=cost;best=p;}
    }
    if (best) {
      if (!avoidPosition || Math.abs(avoidPosition.left-best.left)>2 ||
          Math.abs(avoidPosition.top-best.top)>2) {
        avoidPosition={left:best.left,top:best.top};applyPosition();
      }
    } else if (avoidPosition) {avoidPosition=null;applyPosition();}
  }
  function scheduleAvoid() {
    if (avoidTimer!==null) clearTimeout(avoidTimer);
    avoidTimer=setTimeout(()=>{avoidTimer=null;checkAvoid();},110);
  }
  function applyCollapsed() {
    panel.classList.toggle('collapsed',uiState.collapsed);
    const button=el('#collapse');button.textContent=uiState.collapsed?'+':'−';
    button.title=uiState.collapsed?T.expand:T.collapse;
    button.setAttribute('aria-label',button.title);
    applyPosition();scheduleAvoid();
  }
  function applyVisibility() {
    host.style.display=hidden?'none':'block';
    host.style.pointerEvents=hidden?'none':'auto';
    host.setAttribute('aria-hidden',hidden?'true':'false');
    if (!hidden) {applyPosition();draw();scheduleAvoid();}
  }
  function setHidden(state) {
    if (hidden===Boolean(state)) return;
    hidden=Boolean(state);persistVisibility();avoidPosition=null;
    applyVisibility();
    if (!hidden) {refresh(true);requestMemory();}
  }
  function dockBottomRight() {
    uiState.left=null;uiState.top=null;avoidPosition=null;
    persistUi();applyPosition();scheduleAvoid();
  }
  el('#refresh').addEventListener('click',ev=>{ev.stopPropagation();refresh(true);requestMemory();});
  el('#close').addEventListener('click',ev=>{ev.stopPropagation();setHidden(true);});
  document.addEventListener('keydown',ev=>{
    if (ev.repeat||ev.defaultPrevented||ev.isComposing||
        !ev.ctrlKey||!ev.altKey||ev.shiftKey||ev.metaKey||
        ev.getModifierState?.('AltGraph')||String(ev.key).toLowerCase()!=='q') return;
    ev.preventDefault();setHidden(!hidden);
  },true);
  el('#collapse').addEventListener('click',ev=>{
    ev.stopPropagation();uiState.collapsed=!uiState.collapsed;
    applyCollapsed();persistUi();
  });
  el('#drag').addEventListener('dblclick',ev=>{
    if (!ev.target.closest('button')) dockBottomRight();
  });
  el('#drag').addEventListener('pointerdown',ev=>{
    if (ev.button!==0||ev.target.closest('button'))return;
    const rect=host.getBoundingClientRect();
    avoidPosition=null;ignoreAvoidUntilFocus=true;
    drag={x:ev.clientX,y:ev.clientY,left:rect.left,top:rect.top};
    el('#drag').setPointerCapture(ev.pointerId);
  });
  el('#drag').addEventListener('pointermove',ev=>{
    if (!drag)return;
    uiState.left=drag.left+ev.clientX-drag.x;
    uiState.top=drag.top+ev.clientY-drag.y;
    applyPosition();
  });
  function endDrag(){if(drag){drag=null;persistUi();}}
  el('#drag').addEventListener('pointerup',endDrag);
  el('#drag').addEventListener('pointercancel',endDrag);
  document.addEventListener('focusin',()=>{ignoreAvoidUntilFocus=false;scheduleAvoid();},true);
  document.addEventListener('focusout',scheduleAvoid,true);
  window.addEventListener('resize',()=>{applyPosition();scheduleAvoid();});
  const sizeObserver=new ResizeObserver(()=>{applyPosition();scheduleAvoid();});
  sizeObserver.observe(host);
  document.addEventListener('visibilitychange',()=>{
    if (document.visibilityState==='visible' && !hidden) {
      refresh();requestMemory();scheduleAvoid();
    }
  });
  // Check only while editing; no scroll, mouse tracking, or continuous DOM scanning.
  setInterval(()=>{if (!hidden && isEditing(document.activeElement))checkAvoid();},2500);

  // Reattach only when removed by a ChatGPT SPA render; intentional hiding persists.
  let watchedBody=null,recoveryTimer=null,mountCount=0;
  function ensureMounted() {
    if (host.isConnected||!document.body?.isConnected)return;
    const other=document.getElementById(ID);
    if (other&&other!==host)return;
    document.body.appendChild(host);mountCount++;
    if (mountCount>1)console.info('[Codex Quota Bars] panel recovered after DOM replacement');
    updateTheme();draw();applyPosition();
  }
  function requestRecovery() {
    if (host.isConnected||recoveryTimer!==null)return;
    recoveryTimer=setTimeout(()=>{recoveryTimer=null;ensureMounted();},120);
  }
  const bodyObserver=new MutationObserver(requestRecovery);
  function observeCurrentBody(){
    if (document.body===watchedBody)return;
    bodyObserver.disconnect();watchedBody=document.body;
    if (watchedBody)bodyObserver.observe(watchedBody,{childList:true});
  }
  new MutationObserver(()=>{observeCurrentBody();requestRecovery();}).observe(document.documentElement,{childList:true});
  observeCurrentBody();ensureMounted();applyCollapsed();applyVisibility();applyPosition();updateTheme();draw();
  new MutationObserver(updateTheme).observe(document.documentElement,{
    attributes:true,attributeFilter:['class','data-theme']});
  setInterval(()=>{if (!hidden)draw();},1000); // locally update countdown only
  setInterval(()=>{observeCurrentBody();requestRecovery();},3000);
  setInterval(()=>{if (!hidden&&document.visibilityState==='visible')refresh();},CONFIG.refreshMs);
  setInterval(requestMemory,CONFIG.memoryIntervalMs);
  // Stagger multiple tabs to reduce quota request collisions at startup.
  setTimeout(()=>{if (!hidden)refresh();requestMemory();},250+Math.floor(Math.random()*240));
})();
