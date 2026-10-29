(() => {
  if (globalThis.__flightBridge) return;
  globalThis.__flightBridge = true;
  let stopped = false;
  const controller = new AbortController(), delivering = new Map();
  const post = value => window.postMessage(value, location.origin);
  function stop() { if (stopped) return; stopped = true; controller.abort(); window.removeEventListener('message', receive); post({ type: 'flight-helper-disconnected' }); }
  function fail(e) { if (/context invalidated|extension.*invalidated/i.test(String(e?.message || e))) stop(); }
  async function send(message) {
    if (stopped) throw Error('扩展已更新，请刷新比价平台');
    try {
      if (!chrome.runtime?.id) throw Error('Extension context invalidated');
      const result = await chrome.runtime.sendMessage(message);
      if (result?.error) throw Error(result.error);
      return result;
    } catch (e) { fail(e); throw e; }
  }
  function ready() {
    try {
      if (!chrome.runtime?.id) throw Error('Extension context invalidated');
      post({ type: 'flight-helper-ready', version: chrome.runtime.getManifest().version });
    } catch (e) { fail(e); }
  }
  function captureBatches(captures) {
    const batches = [], oversized = [];
    const overhead = JSON.stringify({ action: 'capture-batch', captures: [] }).length;
    let batch = [], length = overhead;
    for (const capture of captures) {
      const itemLength = JSON.stringify(capture).length;
      if (itemLength + overhead > 240000) { oversized.push(capture.id); continue; }
      if (batch.length && (batch.length >= 60 || length + itemLength + 1 > 240000)) {
        batches.push(batch); batch = []; length = overhead;
      }
      length += itemLength + (batch.length ? 1 : 0); batch.push(capture);
    }
    if (batch.length) batches.push(batch);
    return { batches, oversized };
  }
  async function deliver(date, query) {
    if (delivering.has(date)) return delivering.get(date);
    const task = (async () => {
      let count = 0;
      const errors = [];
      try {
        const { captures = [] } = await send({ type: 'pending', date });
        const { batches, oversized } = captureBatches(captures);
        if (oversized.length) errors.push(oversized.length + ' 条旧记录内容过大，已保留在本机；请清空后重新读取');
        for (const batch of batches) {
          const response = await fetch('/api/browser-quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'capture-batch', captures: batch }), signal: controller.signal });
          const result = await response.json().catch(() => ({}));
          const acceptedIds = Array.isArray(result.acceptedIds) ? [...new Set(result.acceptedIds)].filter(id => batch.some(c => c.id === id)) : [];
          if (acceptedIds.length) { await send({ type: 'ack', ids: acceptedIds }); count += typeof result.count === 'number' ? result.count : acceptedIds.length; }
          if (Array.isArray(result.errors)) errors.push(...result.errors.map(e => String(e.error || '报价待核验')));
          if (!response.ok) throw Error(result.error || '平台同步失败（' + response.status + '）');
          if (acceptedIds.length < batch.length && !result.errors?.length) errors.push('部分报价尚未获得平台确认，已保留供重试');
        }
        const pendingCount = (await send({ type: 'pending', date })).captures.length;
        const result = { count, pending: pendingCount, ...(errors.length ? { error: [...new Set(errors)].join('；') } : {}) };
        post({ type: 'flight-captures-updated', date, queryId: date, query, ...result });
        return result;
      } catch (e) {
        const result = { count, error: '已同步 ' + count + ' 条。' + e.message };
        post({ type: 'flight-captures-updated', date, queryId: date, query, ...result });
        return result;
      }
    })();
    delivering.set(date, task);
    try { return await task; } finally { delivering.delete(date); }
  }
  function receive(event) {
    if (stopped || event.source !== window || event.origin !== location.origin) return;
    const m = event.data;
    if (m?.type === 'flight-helper-ping') { ready(); return; }
    if (m?.type === 'flight-query-context') { void send({ type: 'query', query: m.query }).catch(fail); return; }
    if (!['flight-sync-request', 'flight-clear-pending','auto-start','auto-progress','auto-focus','auto-resume'].includes(m?.type)) return;
    (async () => {
      if(m.type.startsWith('auto-'))return send({type:m.type,query:m.query,date:m.date,tasks:m.tasks,tabId:m.tabId,runId:m.runId});
      if (m.type === 'flight-clear-pending') {
        if (delivering.has(m.date)) throw Error('正在同步，请稍后清空');
        await send({ type: 'clear-pending', date: m.date });
        return { cleared: true };
      }
      return deliver(m.date, m.query);
    })().then(result => post({ type: 'flight-sync-result', requestId: m.requestId, ...result })).catch(error => post({ type: 'flight-sync-result', requestId: m.requestId, error: error.message }));
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (stopped || message?.type !== 'flight-deliver-pending') return;
    deliver(message.date, message.query).then(reply).catch(e => reply({ error: e.message }));
    return true;
  });
  window.addEventListener('message', receive);
  ready();
  void send({ type: 'bridge-ready' }).catch(fail);
})();
