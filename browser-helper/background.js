importScripts('query-core.js');
const SITE = 'https://flight-compare.example.com';
const core = globalThis.flightQueryCore;
let mutations = Promise.resolve();
const syncing = new Map();
function atomic(action) {
  const result = mutations.then(action, action);
  mutations = result.catch(() => {});
  return result;
}
function siteSender(sender) {
  try { return new URL(sender.url).origin === SITE; } catch { return false; }
}
function officialUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password) throw Error('只支持官方 HTTPS 机票查询页');
  let keep = [];
  if (u.hostname === 'www.google.com' && /^\/travel\/flights(?:\/|$)/.test(u.pathname)) keep = ['tfs', 'tfu', 'hl', 'curr', 'q'];
  else if(u.hostname==='sjipiao.fliggy.com'&&u.pathname==='/flight_search_result.htm') keep=['tripType','depCity','arrCity','depDate','depCityName','arrCityName'];
  else if (u.hostname === 'flights.ctrip.com' && /^\/(?:online|international)(?:\/|$)/.test(u.pathname)) keep = ['dcity', 'acity', 'ddate', 'rdate', 'depdate', 'departdate', 'returndate', 'triptype', 'adult', 'adults', 'child', 'infant', 'cabin'];
  else if ((u.hostname === 'www.ly.com' && /^\/(?:iflight|flights)(?:\/|$)/.test(u.pathname)) || (u.hostname === 'flight.ly.com' && /^\/(?:intl|international|search)(?:\/|$)/.test(u.pathname))) keep = ['fromairport','toairport','childticket','p','para', 'departureCity', 'arrivalCity', 'from', 'to', 'date', 'returnDate', 'tripType', 'adults', 'cabin'];
  else throw Error('当前页面不是支持的官方机票查询页');
  for (const key of Array.from(u.searchParams.keys())) if (!keep.includes(key)) u.searchParams.delete(key);
  u.hash = '';
  if (u.href.length > 9000) throw Error('查询链接过长');
  return u;
}
function queryId(value) {
  if (typeof value !== 'string' || !/^(?:q-[A-Z]{3}-[A-Z]{3}-\d{8}-(?:\d{8}|single)-a[1-9]-(?:economy|premium_economy|business|first)|20261231|20270101)$/.test(value)) throw Error('查询标识无效');
  return value;
}
function queueQueryId(capture) {
  // 0.5.1 used two fixed date IDs. Keep the original queued record intact and
  // expose it only under its exact original route/adults/cabin query. The server
  // still checks the actual Google URL and retains unsupported rows for review.
  try {
    if (capture.query?.from) return core.queryKey(capture.query);
    const dates = { '20261231': ['2026-12-31', '2027-01-04'], '20270101': ['2027-01-01', '2027-01-05'] }[capture.date];
    if (dates) return core.queryKey({ from: 'SHA', to: 'TYO', out: dates[0], back: dates[1], adults: 1, cabin: 'economy', tripType: 'roundtrip' });
  } catch {}
  return capture.date;
}
async function bindQuery(sender, value) {
  officialUrl(sender.url);
  if (!Number.isInteger(sender.tab?.id)) throw Error('缺少官网标签页');
  const query = core.normalizeQuery(value);
  await atomic(async () => {
    const { tabQueries = {} } = await chrome.storage.local.get('tabQueries');
    tabQueries[sender.tab.id] = { query, savedAt: Date.now() };
    await chrome.storage.local.set({ tabQueries });
  });
  return { query };
}
async function pending(date) {
  await mutations;
  const { captures = [] } = await chrome.storage.local.get('captures');
  return captures.filter(c => !date || c.date === date || queueQueryId(c) === date);
}
async function rememberSync(query) {
  await atomic(async () => {
    const { syncRequests = {} } = await chrome.storage.local.get('syncRequests');
    syncRequests[query.id] = { query, requestedAt: Date.now() };
    await chrome.storage.local.set({ syncRequests });
  });
}
async function requestSync(query, allowOpen = true, readyTabId) {
  if (syncing.has(query.id)) {
    const previous = await syncing.get(query.id);
    if (!previous.error && !previous.queued && (await pending(query.id)).length) return requestSync(query, allowOpen, readyTabId);
    return previous;
  }
  const work = (async () => {
    await rememberSync(query);
    const tabs = readyTabId ? [{ id: readyTabId }] : await chrome.tabs.query({ url: SITE + '/*' });
    if (!tabs.length) {
      if (allowOpen) await chrome.tabs.create({ url: SITE + '/#fcq=' + encodeURIComponent(JSON.stringify(query)), active: false });
      return { count: 0, pending: (await pending(query.id)).length, queued: true, message: '已读取，正在打开比价平台并回传。' };
    }
    let lastError;
    for (const tab of tabs) {
      try {
        let result, count = 0, remaining;
        for (let attempt = 0; attempt < 8; attempt++) {
          result = await chrome.tabs.sendMessage(tab.id, { type: 'flight-deliver-pending', date: query.id, query });
          if (!result) throw Error('平台页面未响应');
          count += result.count || 0;
          remaining = (await pending(query.id)).length;
          if (!remaining || result.error || !result.count) break;
        }
        if (!remaining) await atomic(async () => {
          const { syncRequests = {} } = await chrome.storage.local.get('syncRequests');
          delete syncRequests[query.id];
          await chrome.storage.local.set({ syncRequests });
        });
        return { ...result, count, pending: remaining };
      } catch (e) { lastError = e; }
    }
    return { count: 0, pending: (await pending(query.id)).length, error: '报价已保存在本机。请刷新比价平台后点击同步。' + (lastError?.message || '') };
  })();
  syncing.set(query.id, work);
  try { return await work; } finally { syncing.delete(query.id); }
}
async function captureBatch(message, sender) {
  const source = officialUrl(sender.url);
  const items = message.captures || (message.capture ? [message.capture] : []);
  if (!Number.isInteger(sender.tab?.id) || !Array.isArray(items) || !items.length || items.length > 500) throw Error('单次最多读取 500 条报价，请缩小官网结果范围后重试');
  const { tabQueries = {} } = await chrome.storage.local.get('tabQueries');
  const bound = tabQueries[sender.tab.id]?.query;
  if (!bound) throw Error('请从平台入口重新打开本页，绑定查询条件');
  const query = core.normalizeQuery(bound);
  const validBatch = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  // One manual click is one collection, including legacy messages without a
  // batch. Do not attach a fresh observation to an older pending collection.
  const batch = (validBatch(message.batch) ? message.batch : validBatch(items[0]?.batch) && items.every(item => item.batch === items[0].batch) ? items[0].batch : crypto.randomUUID()).toLowerCase();
  const captures = items.map(item => {
    const u = officialUrl(item.url);
    if (u.origin !== source.origin || u.pathname !== source.pathname) throw Error('报价来源与当前页面不一致');
    if (core.queryKey(item.query) !== query.id) throw Error('报价查询条件与本标签页不一致');
    if (!['oneway', 'roundtrip'].includes(item.tripType) || !['outbound', 'return'].includes(item.direction)) throw Error('报价行程或方向尚未核验');
    if (typeof item.text !== 'string' || item.text.length < 25 || item.text.length > 2500) throw Error('报价文字长度无效');
    if (!item.metadata || typeof item.metadata !== 'object') throw Error('缺少官网查询条件核验');
    return { text: item.text, rawText: typeof item.rawText === 'string' ? item.rawText.slice(0, 8000) : item.text,
      cardEvidence: typeof item.cardEvidence === 'string' ? item.cardEvidence.slice(0, 100) : 'visible-dom',
      captureIssues: Array.isArray(item.captureIssues) ? [...new Set(item.captureIssues.filter(issue => typeof issue === 'string').map(issue => issue.slice(0, 400)))].slice(0, 12) : [],
      observedCabin: core.cabins.includes(item.observedCabin) ? item.observedCabin : undefined,
      cabinEvidence: typeof item.cabinEvidence === 'string' ? item.cabinEvidence.slice(0, 160) : undefined,
      metadata: item.metadata, query, date: query.id, url: u.href, tripType: item.tripType, direction: item.direction, batch,
      id: crypto.randomUUID(), capturedAt: new Date().toISOString(), kind: 'visible-quote-draft' };
  });
  const ids = await atomic(async () => {
    const stored = await chrome.storage.local.get('captures');
    const queue = stored.captures || [], ids = [];
    for (const item of captures) {
      const evidence = value => JSON.stringify([value.rawText || value.text, value.metadata, value.captureIssues || [], value.observedCabin, value.cabinEvidence, value.cardEvidence]);
      // Changed evidence needs a new ID: an acknowledgement for an older
      // in-flight payload must never delete a newly observed cabin/currency.
      const found = queue.find(c => c.batch === item.batch && c.date === item.date && c.direction === item.direction && c.url === item.url && c.text === item.text
        && Date.now() - Date.parse(c.capturedAt) < 60000 && evidence(c) === evidence(item));
      if (found) ids.push(found.id); else { queue.push(item); ids.push(item.id); }
    }
    if (queue.length > 1000 || new TextEncoder().encode(JSON.stringify(queue)).byteLength > 8 * 1024 * 1024) throw Error('本机待同步报价已达容量上限，本次报价尚未保存。请先回平台同步或清空旧草稿，再重新读取');
    await chrome.storage.local.set({ captures: queue });
    return ids;
  });
  const result = await requestSync(query);
  return { ok: !result.error, read: ids.length, ...result };
}

async function launchNext(run){
  if(run.tasks.some(t=>t.state==='running'||t.state==='waiting'))return;
  const task=run.tasks.find(t=>t.state==='queued');if(!task)return;
  task.state='running';task.updatedAt=Date.now();task.tabId=run.workerTabId;
  try{await chrome.tabs.update(run.workerTabId,{active:true});const result=await chrome.tabs.sendMessage(run.workerTabId,{type:'auto-navigate',url:task.url,runId:run.id,taskIndex:task.index});if(!result?.ok)throw Error('查询窗口拒绝继续');}
  catch(e){task.state='waiting';task.message='查询窗口未能继续，请重新获取报价。';}
}
async function autoStatus(id){const {autoRuns={}}=await chrome.storage.local.get('autoRuns');const run=autoRuns[id];if(run)for(const t of run.tasks)if(t.state==='running'&&Date.now()-t.updatedAt>180000){t.state='waiting';t.message='官网长时间未响应，加载状态尚未确认；请打开查询窗口检查';}return {run:run||null};}
async function startRun(m){
 const query=core.normalizeQuery(m.query);
 if(!/^[a-f0-9-]{36}$/i.test(m.runId||'')||!Array.isArray(m.tasks)||!m.tasks.length||m.tasks.length>8)throw Error('查询任务无效');
 const tasks=m.tasks.map((t,index)=>{officialUrl(t.url);if(t.url.length>9000)throw Error('查询链接过长');const url=new URL(t.url),raw=JSON.parse(decodeURIComponent(url.hash.slice(5))),q=core.normalizeQuery(raw);
 if(!url.hash.startsWith('#fcq=')||q.id!==query.id||!['outbound','return'].includes(q.direction)||raw.searchMode!=='oneway')throw Error('自动查询条件不一致');
 url.hash='fcq='+encodeURIComponent(JSON.stringify({...q,searchMode:'oneway',autoRunId:m.runId,autoTaskIndex:index}));
 return {index,url:url.href,label:String(t.label).slice(0,80),state:index?'queued':'running',message:index?'排队中':'等待查询窗口',updatedAt:Date.now()};});
 return atomic(async()=>{const {autoRuns={}}=await chrome.storage.local.get('autoRuns');
 if(autoRuns[query.id]?.id===m.runId)return {run:autoRuns[query.id]};
 const run={id:m.runId,queryId:query.id,helperVersion:chrome.runtime.getManifest().version,startedAt:Date.now(),tasks};
 autoRuns[query.id]=run;await chrome.storage.local.set({autoRuns:Object.fromEntries(Object.entries(autoRuns).sort((a,b)=>b[1].startedAt-a[1].startedAt).slice(0,8))});return {run};});
}
async function bindAuto(m,sender){
 officialUrl(sender.url);
 return atomic(async()=>{const {autoRuns={}}=await chrome.storage.local.get('autoRuns');const run=Object.values(autoRuns).find(r=>r.id===m.autoRunId),task=run?.tasks[m.autoTaskIndex];
 if(!task||task.state!=='running'||(Number.isInteger(run.workerTabId)&&run.workerTabId!==sender.tab?.id))return {autoBound:false};
 const expected=new URL(task.url),actual=new URL(sender.url);if(expected.origin!==actual.origin||expected.pathname!==actual.pathname||core.normalizeQuery(m.query).id!==run.queryId)throw Error('查询窗口与任务不一致');
 run.workerTabId=sender.tab.id;task.tabId=sender.tab.id;await chrome.storage.local.set({autoRuns});return {autoBound:true};});
}
async function reportRun(m,sender){
 officialUrl(sender.url);
 return atomic(async()=>{const {autoRuns={}}=await chrome.storage.local.get('autoRuns');const run=Object.values(autoRuns).find(r=>r.id===m.autoRunId),task=run?.tasks[m.autoTaskIndex];
 if(!task||task.tabId!==sender.tab?.id||task.state==='done')return {ok:true};
 if(!['running','waiting','done'].includes(m.state))throw Error('状态无效');task.state=m.state;task.message=String(m.message||'').slice(0,600);task.updatedAt=Date.now();
 if(task.state==='done')await launchNext(run);await chrome.storage.local.set({autoRuns});return {ok:true};});
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  (async () => {
    if (!m || typeof m.type !== 'string') throw Error('请求无效');
    if(m.type==='auto-status')return reportRun(m,sender);
    if (m.type === 'bind-query') {const result=await bindQuery(sender,m.query);return m.autoRunId?{...result,...await bindAuto(m,sender)}:result;}
    if (m.type === 'context') {
      officialUrl(sender.url);
      await mutations;
      const { tabQueries = {} } = await chrome.storage.local.get('tabQueries');
      return { query: tabQueries[sender.tab?.id]?.query || null };
    }
    if (m.type === 'capture' || m.type === 'capture-batch') return captureBatch(m, sender);
    if (m.type === 'diagnostic') {
      const u = officialUrl(sender.url);
      await atomic(async () => {
        const { diagnostics = [] } = await chrome.storage.local.get('diagnostics');
        const item = { ...m.diagnostic, id: crypto.randomUUID(), url: u.origin + u.pathname, capturedAt: new Date().toISOString() };
        await chrome.storage.local.set({ diagnostics: [item, ...diagnostics].slice(0, 8) });
      });
      return { ok: true };
    }
    if (!siteSender(sender)) throw Error('仅比价平台可执行此操作');
    if(m.type==='auto-start')return startRun(m);
    if(m.type==='auto-progress')return autoStatus(queryId(m.date));
    if(m.type==='auto-focus'||m.type==='auto-resume'){
      const {run}=await autoStatus(queryId(m.date));const task=run?.tasks.find(t=>t.tabId===m.tabId&&t.state==='waiting');
      if(!task)throw Error('该任务已失效，请重新查询');
      await chrome.tabs.update(task.tabId,{active:true});
      if(m.type==='auto-focus')return {ok:true};
      // Persist running before the content script can report completion or failure.
      // Otherwise a fast report can be overwritten by this optimistic status.
      const sender={url:task.url,tab:{id:task.tabId}};
      await reportRun({state:'running',message:'等待官网结果',autoRunId:run.id,autoTaskIndex:task.index},sender);
      try{await chrome.tabs.sendMessage(task.tabId,{type:'auto-resume'});}
      catch(e){await reportRun({state:'waiting',message:'查询窗口未响应，请打开官网检查后继续',autoRunId:run.id,autoTaskIndex:task.index},sender);throw e;}
      return {ok:true};
    }
    if (m.type === 'query') return { query: core.normalizeQuery(m.query), ok: true };
    if (m.type === 'pending') return { captures: await pending(m.date ? queryId(m.date) : undefined) };
    if (m.type === 'ack' || m.type === 'diagnostic-ack') {
      const key = m.type === 'ack' ? 'captures' : 'diagnostics';
      if (!Array.isArray(m.ids) || m.ids.length > 400) throw Error('同步确认格式无效');
      await atomic(async () => {
        const stored = await chrome.storage.local.get(key);
        await chrome.storage.local.set({ [key]: (stored[key] || []).filter(c => !m.ids.includes(c.id)) });
      });
      return { ok: true };
    }
    if (m.type === 'clear-pending') {
      const date = queryId(m.date);
      await atomic(async () => {
        const { captures = [], syncRequests = {} } = await chrome.storage.local.get(['captures', 'syncRequests']);
        delete syncRequests[date];
        await chrome.storage.local.set({ captures: captures.filter(c => c.date !== date && queueQueryId(c) !== date), syncRequests });
      });
      return { ok: true };
    }
    if (m.type === 'diagnostic-pending') return chrome.storage.local.get('diagnostics');
    if (m.type === 'bridge-ready') {
      const { syncRequests = {} } = await chrome.storage.local.get('syncRequests');
      for (const request of Object.values(syncRequests)) if (Date.now() - request.requestedAt < 86400000) {
        if (syncing.has(request.query.id)) await syncing.get(request.query.id);
        if ((await pending(request.query.id)).length) await requestSync(request.query, false, sender.tab?.id);
      }
      return { ok: true };
    }
    throw Error('请求无效');
  })().then(reply).catch(e => reply({ error: e.message }));
  return true;
});
chrome.tabs.onRemoved?.addListener(id => { void atomic(async () => {
  const { tabQueries = {} } = await chrome.storage.local.get('tabQueries');
  delete tabQueries[id];
  await chrome.storage.local.set({ tabQueries });
}); });
