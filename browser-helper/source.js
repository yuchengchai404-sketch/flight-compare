(() => {
  if (globalThis.__flightHelperManual) return;
  globalThis.__flightHelperManual = true;
  const core = globalThis.flightQueryCore;
  let query = null, busy = false, statusEl, queryEl;
  const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  const adapter = () => location.hostname === 'www.google.com' ? globalThis.flightGoogleAdapter : location.hostname === 'flights.ctrip.com' ? globalThis.flightCtripAdapter : ['www.ly.com', 'flight.ly.com'].includes(location.hostname) ? (location.pathname.startsWith('/flights/')?globalThis.flightLyDomesticAdapter:globalThis.flightLyAdapter) : null;
  const supported = () => location.hostname === 'www.google.com' ? /^\/travel\/flights(?:\/|$)/.test(location.pathname) : location.hostname === 'flights.ctrip.com' ? /^\/(?:online|international)(?:\/|$)/.test(location.pathname) : location.hostname === 'www.ly.com' ? /^\/(?:iflight|flights)(?:\/|$)/.test(location.pathname) : location.hostname === 'flight.ly.com' ? /^\/(?:intl|international|search)(?:\/|$)/.test(location.pathname) : false;
  if (!supported()) return;
  function say(message) { if (statusEl) statusEl.textContent = message; return { message }; }
  async function send(message) {
    try {
      if (!chrome.runtime?.id) throw Error('Extension context invalidated');
      const response = await chrome.runtime.sendMessage(message);
      if (response?.error && !['capture-batch'].includes(message.type)) throw Error(response.error);
      return response;
    } catch (e) {
      if (/context invalidated/i.test(e.message)) throw Error('扩展已更新，请刷新当前官网页面再使用。');
      throw e;
    }
  }
  function normalize(value) { try { return core.normalizeQuery(value); } catch { return null; } }
  function autoTag(){try{const raw=JSON.parse(decodeURIComponent(location.hash.slice(5)));return {autoRunId:raw.autoRunId,autoTaskIndex:raw.autoTaskIndex};}catch{return {};}}
  async function context() {
    let hash, local;
    try { hash = location.hash.startsWith('#fcq=') ? normalize(JSON.parse(decodeURIComponent(location.hash.slice(5)))) : null; } catch {}
    try { local = normalize(JSON.parse(sessionStorage.getItem('flight-query') || 'null')); } catch {}
    const bound = await send({ type: 'context' });
    query = hash || normalize(bound?.query) || local;
    if (!query) return null;
    for(let attempt=0;attempt<6;attempt++){const tag=autoTag(),bound=await send({type:'bind-query',query,...tag});if(!tag.autoRunId||bound.autoBound)break;await new Promise(r=>setTimeout(r,250));}
    sessionStorage.setItem('flight-query', JSON.stringify(query));
    const leg = core.legQuery(query, query.direction || 'outbound');
    if (queryEl) queryEl.textContent = core.routeName(leg.from) + ' → ' + core.routeName(leg.to) + ' · ' + leg.date + ' · ' + query.adults + ' 成人';
    return query;
  }
  function blocked() {
    if (Array.from(document.querySelectorAll('input[type="password"]')).some(visible)) throw Error('官网需要登录，请完成登录后再读取');
    const challenge = Array.from(document.querySelectorAll('iframe[title], [role="alert"], h1')).filter(visible).some(e => /验证码|安全验证|确认您是人类|verify you are human|recaptcha challenge/i.test(e.getAttribute('title') || e.innerText || ''));
    if (challenge) throw Error('官网需要验证，请完成验证后再读取');
  }
  async function inspect(actualAdapter) {
    const meta = actualAdapter.inspect ? await actualAdapter.inspect(query) : null;
    if (!meta || meta.error || meta.reason) throw Error(meta?.error || meta?.reason || '当前查询条件尚未识别。请用①搜索，核对官网结果后重试');
    const isGoogle = location.hostname === 'www.google.com';
    const direction = meta.direction || query.direction || 'outbound';
    const leg = core.legQuery(query, direction);
    if (!['oneway', 'roundtrip'].includes(meta.tripType) || (isGoogle && meta.tripType !== 'oneway')) throw Error('请打开单程查询结果后再读取');
    const expected = meta.tripType === 'roundtrip' ? { from: query.from, to: query.to, date: query.out } : leg;
    if (!core.routeMatches(meta.from, expected.from) || !core.routeMatches(meta.to, expected.to) || meta.date !== expected.date) throw Error('官网结果的地点或日期与本次查询不一致，请用①重新搜索');
    if (meta.tripType === 'roundtrip' && (query.tripType !== 'roundtrip' || (meta.returnDate || meta.back) !== query.back)) throw Error('官网回程日期与本次查询不一致');
    const currencyUnknown = meta.currency === undefined || meta.currency === null || meta.currency === '';
    const isLy = ['www.ly.com', 'flight.ly.com'].includes(location.hostname);
    const isCtrip = location.hostname === 'flights.ctrip.com';
    if (meta.currency !== 'CNY' && !((isLy || isCtrip) && currencyUnknown)) throw Error('请将官网币种切换为人民币后再读取');
    if (meta.adults !== query.adults || meta.cabin !== query.cabin) throw Error('官网人数或舱位与本次查询不一致，请核对后重试');
    return { ...meta, direction, verified: true, ...((isLy || isCtrip) && currencyUnknown ? { captureIssues: [(isCtrip ? '携程' : '同程') + '页面未能明确核验币种，暂不参与比价'] } : {}) };
  }
  async function fillSearch() {
    if (!await context()) return say('没有查询条件，请从比价平台打开官网入口');
    blocked();
    const current = adapter();
    if (!current?.fillSearch) throw Error('当前官网尚无专用搜索适配');
    const result = await current.fillSearch(query);
    return say(result?.message || '已填写搜索条件，结果显示后点击读取并回传');
  }
  async function capture(automatic = false) {
    if (!await context()) return say('没有查询条件，请从比价平台打开官网入口');
    blocked();
    const current = adapter();
    if (!current?.cards) throw Error('当前官网尚无专用报价适配');
    let prepared;
    if (typeof current.prepareCapture === 'function') {
      say('正在展开可见票价详情…');
      prepared = await current.prepareCapture(query);
      blocked();
    }
    const metadata = await inspect(current);
    // Official result adapters carry product/cabin qualifications. Free text
    // must not bypass them when the user happens to have a selection on a page.
    const selected = !automatic && location.hostname === 'www.google.com' ? window.getSelection()?.toString().trim() : '';
    const nodes = selected ? [{ innerText: selected }] : Array.isArray(prepared?.cards) ? prepared.cards : current.cards();
    const seen = new Set(), captures = [], batch = crypto.randomUUID(), captureLimit = 500;
    let limited = false, skippedNonstop = 0;
    for (const node of nodes) {
      const text = (node.innerText || '').trim();
      if (!globalThis.flightNonstop.only(text, metadata.tripType)) { skippedNonstop++; continue; }
      if (text.length < 25 || text.length > 2500 || !/(?:CNY|RMB|人民币|¥|￥)\s*[0-9]|[0-9]\s*(?:元|CNY)/i.test(text) || !/(?:[01]?\d|2[0-3]):[0-5]\d/.test(text)) continue;
      if (metadata.tripType === 'oneway' && /往返票价|往返总价|round.?trip/i.test(text)) continue;
      const captureIssues = [...new Set([...(metadata.captureIssues || []), ...(Array.isArray(node.captureIssues) ? node.captureIssues : [])].filter(issue => typeof issue === 'string').map(issue => issue.slice(0, 400)))].slice(0, 12);
      const observedCabin = core.cabins.includes(node.observedCabin) ? node.observedCabin : undefined;
      const cabinEvidence = typeof node.cabinEvidence === 'string' ? node.cabinEvidence.slice(0, 160) : undefined;
      if (Array.isArray(metadata.cabinScope) && metadata.cabinScope.length > 1) {
        if (!observedCabin || !cabinEvidence) captureIssues.unshift('官网合并多个舱位，当前票价的具体舱位尚未核验');
        else if (observedCabin !== query.cabin || !metadata.cabinScope.includes(observedCabin)) captureIssues.unshift('当前票价舱位与查询舱位不一致，暂不参与比价');
      }
      const rawText = typeof node.rawText === 'string' ? node.rawText.slice(0, 8000) : text;
      const cardEvidence = typeof node.evidence === 'string' ? node.evidence.slice(0, 100) : 'visible-dom';
      const issues = captureIssues.slice(0, 12);
      // A price row can look identical while its fare qualifications differ.
      // Keep the product evidence in the identity before removing duplicates.
      const fingerprint = JSON.stringify([text, rawText, metadata, issues, observedCabin, cabinEvidence, cardEvidence]);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      if (captures.length >= captureLimit) { limited = true; break; }
      captures.push({ text, rawText, cardEvidence, captureIssues: issues, observedCabin, cabinEvidence, query, date: query.id, url: location.href, batch, tripType: metadata.tripType, direction: metadata.direction, metadata });
    }
    if (!captures.length) return say('未找到已确认直飞的报价（已跳过 '+skippedNonstop+' 条中转或直飞状态不明记录）。请等搜索结束，展开报价列表' + (location.hostname === 'www.google.com' ? '；也可选中一张含时间和价格的报价，再点读取并回传' : '和具体票价产品后重试'));
    const limitNote = '仅采集直飞，跳过 '+skippedNonstop+' 条。'+(limited ? '本次仅采集前 ' + captureLimit + ' 条，其余未读取。请缩小官网结果范围后继续。' : '');
    say('已读取 ' + captures.length + ' 条，正在回传平台…' + limitNote);
    const result = await send({ type: 'capture-batch', captures, batch });
    // Currency policy and eligibility are decided by the receiving platform.
    // Raw adapter issues must not be reported as a final pending count.
    const reviewNote = '可比数量以平台检查结果为准。';
    const captured = message => ({...say(message), read: captures.length, pending: !!(result?.error || result?.queued || result?.pending)});
    const preparationNote = typeof prepared?.message === 'string' ? prepared.message.slice(0, 220) : '';
    if (result?.queued) return captured('已读取 ' + captures.length + ' 条，平台打开后会自动接收。' + reviewNote + '可回平台查看结果。' + preparationNote + limitNote);
    if (result?.error) return captured('已读取 ' + captures.length + ' 条，已回传 ' + (result.count || 0) + ' 条，待处理 ' + (result.pending ?? captures.length) + ' 条。' + result.error + limitNote);
    return captured('已读取 ' + captures.length + ' 条，已回传 ' + (result?.count || 0) + ' 条。' + reviewNote + '回平台即可查看结果' + (result?.pending ? '；还有 ' + result.pending + ' 条待同步' : '') + (preparationNote ? '。' + preparationNote : '') + (limitNote ? '。' + limitNote : ''));
  }
  let autoGeneration=0;
  async function reportAuto(state,message){say(message);try{await send({type:'auto-status',state,message,...autoTag()});}catch{}}
  async function startAuto(){
    const generation=++autoGeneration;
    await globalThis.flightAutoCore.run({
      cancelled:()=>generation!==autoGeneration, wait:ms=>new Promise(r=>setTimeout(r,ms)), report:reportAuto,
      probe:async()=>{if(busy)return '';blocked();const a=adapter();if(a?.readiness)return a.readiness(query);await inspect(a);const cards=(a.cards()||[]).map(n=>n.innerText||'').join('\n');if(cards)return cards;return Array.from(document.querySelectorAll('.flight-item')).filter(visible).map(n=>n.innerText).filter(t=>/[¥￥]/.test(t)&&/\d{2}:\d{2}/.test(t)).join('\n');},
      capture:async()=>{if(busy)return {};busy=true;try{return await capture(true);}finally{busy=false;}}
    });
  }
  async function run(type) {
    autoGeneration++;
    if (busy) return { message: '上一步仍在执行，请稍候' };
    busy = true; say('正在执行…');
    try { const result=type === 'fill-search' ? await fillSearch() : await capture(); if(result?.read)await reportAuto(result.pending?'waiting':'done',result.message);return result; }
    catch (e) { say('执行失败：' + e.message); return { error: e.message }; }
    finally { busy = false; }
  }
  function panel() {
    if (document.getElementById('flight-helper-manual')) return;
    const host = document.createElement('div');
    host.id = 'flight-helper-manual';
    host.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<style>:host{font:13px/1.6 sans-serif}section{width:320px;background:#173f3c;color:white;padding:16px;border-radius:10px;box-shadow:0 4px 22px #0004}button{display:block;width:100%;padding:10px;margin:8px 0;border:0;border-radius:5px;background:white;color:#173f3c;text-align:left;cursor:pointer}button.secondary{background:#dcece8}p{font-size:12px;margin:7px 0;white-space:pre-wrap}</style><section><b>机票查价助手 · 0.6.22</b><p id="query"></p><button id="capture">手动重试读取并回传</button><button class="secondary" id="fill">① 填写条件并搜索</button><p id="status" role="status">正在等待结果，稍后自动读取并回传。登录或验证码请本人完成。</p></section>';
    statusEl = shadow.querySelector('#status'); queryEl = shadow.querySelector('#query');
    shadow.querySelector('#fill').onclick = () => void run('fill-search');
    shadow.querySelector('#capture').onclick = () => void run('capture-now');
    document.body.append(host);
    context().then(q => { if (!q) queryEl.textContent = '请从比价平台打开官网入口'; else if(location.hash.startsWith('#fcq='))void startAuto().catch(e=>reportAuto('waiting',e.message)); }).catch(e => say(e.message));
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if(message?.type==='auto-navigate'){
      try{const tag=autoTag(),url=new URL(message.url),raw=JSON.parse(decodeURIComponent(url.hash.slice(5)));
       if(message.runId!==tag.autoRunId||raw.autoRunId!==tag.autoRunId||message.taskIndex!==tag.autoTaskIndex+1||raw.autoTaskIndex!==message.taskIndex||!['www.google.com','flights.ctrip.com','www.ly.com'].includes(url.hostname)||url.protocol!=='https:'||normalize(raw)?.id!==query?.id)throw Error('查询导航不匹配');
       autoGeneration++;reply({ok:true});setTimeout(()=>location.assign(url.href),0);
      }catch(e){reply({error:e.message});}return;
    }
    if(message?.type==='auto-resume'){context().then(q=>{if(q)void startAuto().catch(e=>reportAuto('waiting',e.message));});reply({ok:true});return;}
    if (!['fill-search', 'capture-now'].includes(message?.type)) return;
    run(message.type).then(reply); return true;
  });
  if (document.body) panel(); else window.addEventListener('DOMContentLoaded', panel, { once: true });
})();
