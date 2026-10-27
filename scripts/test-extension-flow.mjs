import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeQuote } from '../lib/quote-normalize.mjs';
import { validateBrowserRecord } from '../lib/browser-records.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = path.join(root, 'browser-helper');
const read = name => readFileSync(path.join(helper, name), 'utf8');
const clone = value => structuredClone(value);
const pause = () => new Promise(resolve => setTimeout(resolve, 1));
const state = {}, createdTabs = [];
let workerListener, platformAvailable = false, platformListener;
const site = 'https://flight-compare.example.com';
const siteSender = { url: site + '/', tab: { id: 90 } };
const googleSender = id => ({ url: 'https://www.google.com/travel/flights/search?tfs=test&curr=CNY', tab: { id } });
const dispatch = (message, sender = siteSender) => new Promise(resolve => workerListener(message, sender, resolve));
const worker = vm.createContext({ console, URL, TextEncoder, crypto: { randomUUID }, structuredClone,
  chrome: {
    storage: { local: {
      async get(keys) { await pause(); const list = typeof keys === 'string' ? [keys] : keys; return Object.fromEntries(list.filter(key => key in state).map(key => [key, clone(state[key])])); },
      async set(value) { await pause(); Object.assign(state, clone(value)); }
    } },
    runtime: { onMessage: { addListener(fn) { workerListener = fn; } } },
    tabs: { async query() { return platformAvailable ? [{ id: 90 }] : []; }, async create(value) { createdTabs.push(value); return { id: 90 }; },
      async sendMessage(id, message) { return new Promise(resolve => platformListener(message, { id: 'test-helper' }, resolve)); }, onRemoved: { addListener() {} } }
  },
  importScripts(name) { vm.runInContext(read(name), worker, { filename: name }); }
});
vm.runInContext(read('background.js'), worker, { filename: 'background.js' });
const qA = worker.flightQueryCore.normalizeQuery({ from: 'SHA', to: 'TYO', out: '2026-12-31', back: '2027-01-04', adults: 1, cabin: 'economy', direction: 'outbound' });
const qB = worker.flightQueryCore.normalizeQuery({ from: 'CAN', to: 'HKG', out: '2027-02-03', adults: 2, cabin: 'business' });
const makeCapture = (query, n) => ({ query, url: googleSender(10).url, tripType: 'oneway', direction: 'outbound', text: '10:00 – 13:00 SHA–TYO 直达 测试夹具¥' + (1000 + n) + ' 单程报价', metadata: { verified: true, ...worker.flightQueryCore.legQuery(query), currency: 'CNY', tripType: 'oneway' } });
const bind = (q, tab) => dispatch({ type: 'bind-query', query: q }, googleSender(tab));
assert.equal((await bind(qA, 10)).query.id, qA.id);
assert.equal((await bind(qB, 11)).query.id, qB.id);
await dispatch({ type: 'query', query: qB });
assert.equal((await dispatch({ type: 'context' }, googleSender(10))).query.id, qA.id, 'platform query must not overwrite another tab');
const firstBatch = randomUUID();
const parallel = await Promise.all(Array.from({ length: 20 }, (_, n) => dispatch({ type: 'capture-batch', batch: firstBatch, captures: [makeCapture(qA, n * 2), makeCapture(qA, n * 2 + 1)] }, googleSender(10))));
assert.ok(parallel.every(r => !r.error), 'all concurrent captures succeed');
assert.equal(state.captures.length, 40, 'atomic queue preserves all concurrent records');
assert.equal(new Set(state.captures.map(c => c.id)).size, 40);
assert.ok(createdTabs.length >= 1 && createdTabs.every(t => t.active === false && t.url.startsWith(site + '/#fcq=')), 'missing platform opens only known owner site');
await dispatch({ type: 'capture-batch', batch: firstBatch, captures: [makeCapture(qA, 0)] }, googleSender(10));
assert.equal(state.captures.length, 40, 'repeated pending capture within the same collection is deduplicated');
await dispatch({ type: 'capture-batch', captures: [makeCapture(qB, 300)] }, googleSender(11));
assert.equal(state.captures.length, 41);
assert.match((await dispatch({ type: 'capture-batch', captures: [makeCapture(qB, 1)] }, googleSender(10))).error, /标签页/);
assert.match((await dispatch({ type: 'pending' }, { url: site + '.evil.example/' })).error, /仅比价平台/);
assert.match((await dispatch({ type: 'capture-batch', captures: [makeCapture(qA, 88)] }, { url: 'https://www.google.com/account/', tab: { id: 10 } })).error, /官方机票查询页/);
assert.match((await dispatch({ type: 'capture-batch', captures: [{ ...makeCapture(qA, 99), url: 'https://evil.example/travel/flights/' }] }, googleSender(10))).error, /官方机票查询页/);
state.syncRequests = {};
let fetchMode = 'partial', fetchCalls = 0;
const batchSizes = [], bodyLengths = [], sentPayloads = [];
const posted = [];
const windowListeners = new Map();
const window = { postMessage(value) { posted.push(value); }, addEventListener(type, callback) { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type).add(callback); }, removeEventListener(type, callback) { windowListeners.get(type)?.delete(callback); } };
const pageMessage = (data, origin = site, source = window) => { for (const listener of windowListeners.get('message') || []) listener({ data, origin, source }); };
async function responseFor(requestId) { for (let n = 0; n < 100; n++) { const response = posted.find(p => p.type === 'flight-sync-result' && p.requestId === requestId); if (response) return response; await pause(); } throw Error('dashboard protocol response timeout'); }
const bridge = vm.createContext({ console, window, location: { origin: site }, AbortController,
  chrome: { runtime: { id: 'test-helper', getManifest() { return { version: '0.6.0' }; }, sendMessage: message => dispatch(message), onMessage: { addListener(fn) { platformListener = fn; } } } },
  async fetch(url, options) {
    fetchCalls++;
    assert.equal(url, '/api/browser-quotes');
    const body = JSON.parse(options.body);
    sentPayloads.push(body);
    bodyLengths.push(options.body.length);
    assert.ok(options.body.length <= 240000, 'bridge bounds serialized request size below the server limit');
    assert.equal(body.action, 'capture-batch');
    batchSizes.push(body.captures.length);
    assert.ok(body.captures.length <= 60, 'bridge respects the API batch limit');
    if (fetchMode === 'fail') throw Error('network offline');
    if (fetchMode === 'partial') {
      const foreign = state.captures.find(c => c.date === qB.id).id;
      return { ok: true, async json() { return { acceptedIds: [body.captures[0].id, body.captures[0].id, foreign, 'forged-id'], errors: body.captures.slice(1).map(c => ({ id: c.id, error: '测试待核验' })) }; } };
    }
    await pause();
    return { ok: true, async json() { return { acceptedIds: body.captures.map(c => c.id), errors: [] }; } };
  }
});
vm.runInContext(read('bridge.js'), bridge, { filename: 'bridge.js' });
await pause();
const deliver = date => new Promise(resolve => platformListener({ type: 'flight-deliver-pending', date }, { id: 'test-helper' }, resolve));
let result = await deliver(qA.id);
assert.equal(result.count, 1, 'partial success counts only unique acknowledgements for submitted records');
assert.equal(state.captures.filter(c => c.date === qA.id).length, 39);
assert.equal(state.captures.filter(c => c.date === qB.id).length, 1, 'foreign acknowledgement never clears another query');
fetchMode = 'fail';
result = await deliver(qA.id);
assert.match(result.error, /network offline/);
assert.equal(state.captures.filter(c => c.date === qA.id).length, 39, 'network failure preserves pending records');
fetchMode = 'all';
result = await deliver(qA.id);
assert.equal(result.count, 39);
assert.equal(state.captures.filter(c => c.date === qA.id).length, 0);
const beforeRepeat = fetchCalls;
result = await deliver(qA.id);
assert.equal(result.count, 0);
assert.equal(fetchCalls, beforeRepeat, 'acknowledged batch is never sent again');
platformAvailable = true;
const auto = await dispatch({ type: 'capture-batch', captures: [makeCapture(qA, 90), makeCapture(qA, 91)] }, googleSender(10));
assert.equal(auto.count, 2, 'one click both captures and synchronizes');
assert.equal(auto.pending, 0);
assert.ok(posted.some(message => message.type === 'flight-captures-updated' && message.date === qA.id && message.count === 2));
const largeBatch = randomUUID();
const large = await dispatch({ type: 'capture-batch', batch: largeBatch, captures: Array.from({ length: 500 }, (_, i) => makeCapture(qA, 500 + i)) }, googleSender(10));
assert.equal(large.count, 500);
assert.deepEqual(batchSizes.slice(-9), [...Array(8).fill(60), 20]);
assert.ok(sentPayloads.slice(-9).every(body => body.captures.every(c => c.batch === largeBatch)), 'transport chunking preserves the entire collection batch');
const longCards = Array.from({ length: 60 }, (_, i) => { const text = (makeCapture(qA, 1000 + i).text + '\n' + '航班可见文字'.repeat(400)).slice(0, 2500); return { ...makeCapture(qA, 1000 + i), text, rawText: text }; });
const sizesBefore = batchSizes.length;
const longResult = await dispatch({ type: 'capture-batch', captures: longCards }, googleSender(10));
assert.equal(longResult.count, 60);
assert.ok(batchSizes.length - sizesBefore > 1, 'legal long cards split by body size even below 60 records');
assert.equal(batchSizes.slice(sizesBefore).reduce((sum, n) => sum + n, 0), 60);
assert.equal(state.captures.filter(c => c.date === qB.id).length, 1, 'other query remains untouched by new query capture');
assert.equal((await dispatch({ type: 'clear-pending', date: qB.id })).ok, true);
assert.equal(state.captures.length, 0);
platformAvailable = false;
const waiting = await dispatch({ type: 'capture-batch', captures: [makeCapture(qA, 199)] }, googleSender(10));
assert.equal(waiting.queued, true);
assert.equal(state.captures.length, 1);
platformAvailable = true;
await dispatch({ type: 'bridge-ready' });
assert.equal(state.captures.length, 0, 'opening or refreshing the platform resumes only a user-requested pending sync');
// Actual visible cards and tax notice read from the Google results page during
// the live browser test. Accessible labels must not be appended a second time.
const observedUrl = 'https://www.google.com/travel/flights/search?tfs=CBwQAhooEgoyMDI2LTEyLTMxagwIAxIIL20vMDZ3amZyDAgDEggvbS8wN2Rma0ABSAFwAYIBCwj___________8BmAEC&hl=zh-CN&curr=CNY';
const actualCards = [
  '15:00\nPVG\n18:40\nNRT\n¥1,902\n直达2 小时 40 分钟春航\n-10% 排放量',
  '01:30\nPVG\n17:55\nNRT\n¥1,792\n经停 1 次15 小时 25 分钟韩亚\n+35% 排放量'
];
let actualNotice = '价格包含所需税费和 1 名成人的费用。可能需要支付可选费用和行李费';
const element = innerText => ({ innerText, getClientRects: () => [1], getAttribute: () => innerText });
const googleContext = vm.createContext({ URL, TextEncoder, TextDecoder, atob, btoa, getComputedStyle: () => ({ visibility: 'visible' }),
  location: { href: observedUrl, pathname: '/travel/flights/search' },
  document: { querySelectorAll(selector) { return selector === 'li,[role="listitem"]' ? actualCards.map(element) : [element(actualNotice)]; } }
});
for (const name of ['query-core.js', 'google-search-core.js', 'google-adapter.js']) vm.runInContext(read(name), googleContext, { filename: name });
const extracted = googleContext.flightGoogleAdapter.cards();
assert.equal(extracted.length, 2);
assert.deepEqual(Array.from(extracted, row => row.innerText), actualCards, 'visible text is preserved without duplicated accessibility labels');
const actualMeta = googleContext.flightGoogleAdapter.inspect(qA);
assert.equal(actualMeta.taxIncluded, true);
assert.equal(actualMeta.priceBasis, 'party-total');
for (let i = 0; i < extracted.length; i++) {
  const quote = normalizeQuote({ query: qA, queryId: qA.id, tripType: 'oneway', direction: 'outbound', source: 'google', currency: 'CNY',
    pageMeta: { ...actualMeta, verified: true }, text: extracted[i].innerText, capturedAt: new Date().toISOString(), url: observedUrl });
  assert.equal(quote.eligible, true, quote.reason);
  assert.equal(quote.price, [1902, 1792][i], 'captured price equals the actual visible Google card');
  assert.equal(quote.taxIncluded, true);
  assert.equal(quote.legs[0].direct, i === 0);
}
actualNotice = '价格包含所需税费和 2 名成人的费用。';
assert.equal(googleContext.flightGoogleAdapter.inspect(qA).taxIncluded, undefined, 'tax/party-total claim requires matching visible adult count');
actualNotice = '';
assert.equal(googleContext.flightGoogleAdapter.inspect(qA).taxIncluded, undefined, 'missing visible tax notice stays unknown');

// Upgrade compatibility: 0.5.1 fixed-date records stay intact and are exposed only
// in their original default query, not arbitrary routes or passenger counts.
const legacyA = { id: randomUUID(), date: '20261231', query: { id: '20261231', out: '2026-12-31', back: '2027-01-04' },
  url: observedUrl, text: actualCards[0], tripType: 'oneway', direction: 'outbound', capturedAt: new Date().toISOString() };
const qSecond = worker.flightQueryCore.normalizeQuery({ from: 'SHA', to: 'TYO', out: '2027-01-01', back: '2027-01-05', adults: 1, cabin: 'economy' });
const legacyB = { ...legacyA, id: randomUUID(), date: '20270101', query: { id: '20270101', out: '2027-01-01', back: '2027-01-05' }, url: googleContext.flightGoogleSearchCore.searchUrl(qSecond) };
const unknownLegacy = { id: randomUUID(), date: 'unrecognized-old-query', text: 'retained unknown record' };
state.captures = [clone(legacyA), clone(legacyB), clone(unknownLegacy)];
assert.equal((await dispatch({ type: 'pending', date: qA.id })).captures.length, 1);
assert.equal((await dispatch({ type: 'pending', date: qB.id })).captures.length, 0);
const twoAdultId = worker.flightQueryCore.queryKey({ ...qA, adults: 2 });
assert.equal((await dispatch({ type: 'pending', date: twoAdultId })).captures.length, 0);
assert.deepEqual(state.captures[0], legacyA, 'looking up upgraded queue does not rewrite original evidence');
const upgraded = validateBrowserRecord(legacyA);
assert.equal(upgraded.date, qA.id);
assert.equal(upgraded.normalized.eligible, true, upgraded.normalized.reason);
assert.equal(upgraded.normalized.taxIncluded, null, 'old record without tax evidence stays unverified');
const beforePing = posted.length;
pageMessage({ type: 'flight-helper-ping' });
assert.equal(posted[beforePing].type, 'flight-helper-ready');
assert.equal(posted[beforePing].version, '0.6.0');
const manualId = randomUUID();
pageMessage({ type: 'flight-sync-request', date: qA.id, queryId: qA.id, query: qA, requestId: manualId });
const manualResult = await responseFor(manualId);
assert.equal(manualResult.count, 1, 'new dashboard manual sync imports original 0.5.1 queue');
assert.equal(state.captures.length, 2);
assert.ok(posted.some(p => p.type === 'flight-captures-updated' && p.queryId === qA.id && p.query?.id === qA.id));
const foreignRequest = randomUUID(), beforeForeign = posted.length;
pageMessage({ type: 'flight-clear-pending', date: qSecond.id, requestId: foreignRequest }, 'https://evil.example');
await pause();
assert.equal(posted.length, beforeForeign, 'bridge ignores messages from another origin');
assert.equal(state.captures.length, 2);
const clearId = randomUUID();
pageMessage({ type: 'flight-clear-pending', date: qSecond.id, queryId: qSecond.id, query: qSecond, requestId: clearId });
assert.equal((await responseFor(clearId)).cleared, true);
assert.equal(state.captures.length, 1);
assert.deepEqual(state.captures[0], unknownLegacy, 'upgrade never silently drops an unknown legacy record');

// Source-level uncertainty handling: only Tongcheng may retain an unknown
// currency as a pending record; visible non-CNY and unknown Google currency stop.
async function readSource(hostname, currency, options = {}) {
  const calls = [], sequence = [];
  let listener;
  const isLy = hostname === 'www.ly.com';
  const isCtrip = hostname === 'flights.ctrip.com';
  const sourceUrl = isLy ? 'https://www.ly.com/iflight/book1.html?para=SHA*TYO*2026-12-31*1900-01-01*OW*1_0_0*Y' : isCtrip ? 'https://flights.ctrip.com/online/list/oneway-sha-tyo?depdate=2026-12-31&cabin=y_s&adult=1&child=0&infant=0' : observedUrl;
  const provider = {
    inspect() { sequence.push('inspect'); return { from: 'SHA', to: 'TYO', date: qA.out, adults: 1, cabin: 'economy', direction: 'outbound', tripType: 'oneway', currency, verified: true, ...(options.meta || {}) }; },
    cards() { sequence.push('cards'); return options.nodes || [{ innerText: actualCards[0], rawText: actualCards[0] + '\n产品礼包', captureIssues: ['产品礼包金额未确认'] }]; }
  };
  if (options.prepared || options.prepareError) provider.prepareCapture = async () => { sequence.push('prepare:start'); await pause(); if (options.prepareError) throw Error(options.prepareError); sequence.push('prepare:done'); return options.prepared; };
  const sourceContext = vm.createContext({ URL, crypto: { randomUUID }, location: { hostname, pathname: new URL(sourceUrl).pathname, href: sourceUrl, hash: '' },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    document: { body: null, querySelectorAll() { return []; } },
    window: { getSelection() { return options.selection || null; }, addEventListener() {} },
    flightLyAdapter: provider, flightGoogleAdapter: provider, flightCtripAdapter: provider,
    chrome: { runtime: { id: 'test-helper', onMessage: { addListener(fn) { listener = fn; } }, async sendMessage(message) {
      if (message.type === 'context') return { query: qA };
      if (message.type === 'bind-query') return { query: message.query };
      if (message.type === 'capture-batch') { calls.push(message); return { count: message.captures.length, pending: 0 }; }
      throw Error('unexpected message');
    } } }
  });
  vm.runInContext(read('query-core.js'), sourceContext);
  vm.runInContext(read('nonstop-core.js'), sourceContext);
  vm.runInContext(read('source.js'), sourceContext);
  const response = await new Promise(resolve => listener({ type: 'capture-now' }, {}, resolve));
  return { response, calls, sourceUrl, sequence };
}
const lyPending = await readSource('www.ly.com', null);
assert.equal(lyPending.calls.length, 1);
const sourceIssues = lyPending.calls[0].captures[0].captureIssues;
assert.ok(sourceIssues.some(issue => /币种/.test(issue)));
assert.ok(sourceIssues.includes('产品礼包金额未确认'));
assert.match(lyPending.response.message, /可比数量以平台检查结果为准/);
assert.doesNotMatch(lyPending.response.message, /\d+ 条待核验/,'source must not claim server eligibility before normalization');
const lyForeignCurrency = await readSource('www.ly.com', 'JPY');
assert.equal(lyForeignCurrency.calls.length, 0);
assert.match(lyForeignCurrency.response.error, /人民币/);
const googleUnknownCurrency = await readSource('www.google.com', undefined);
assert.equal(googleUnknownCurrency.calls.length, 0);
assert.match(googleUnknownCurrency.response.error, /人民币/);
const lySender = { url: lyPending.sourceUrl, tab: { id: 12 } };
await dispatch({ type: 'bind-query', query: qA }, lySender);
const lyAuto = await dispatch(lyPending.calls[0], lySender);
assert.equal(lyAuto.count, 1);
assert.deepEqual(sentPayloads.at(-1).captures[0].captureIssues, Array.from(sourceIssues), 'issues survive source → background → bridge API transport');
const cabinMeta = { cabinScope: ['economy', 'premium_economy'], cabinEvidence: 'per-card-required' };
const cabinCard = { innerText: actualCards[0] + '\n经济舱', rawText: actualCards[0] + '\n经济舱', observedCabin: 'economy', cabinEvidence: '经济舱' };
const ctripPending = await readSource('flights.ctrip.com', null, { meta: cabinMeta, nodes: [cabinCard], selection: '01:00 02:00 PVG NRT ¥1 直达 经济舱 selected text must not bypass the adapter' });
assert.equal(ctripPending.calls.length, 1);
const ctripRecord = ctripPending.calls[0].captures[0];
assert.equal(ctripRecord.text, cabinCard.innerText, 'selected page text cannot bypass provider card qualifications');
assert.ok(ctripRecord.captureIssues.some(issue => /携程.*币种/.test(issue)));
assert.equal(ctripRecord.observedCabin, 'economy');
assert.equal(ctripRecord.cabinEvidence, '经济舱');
const ctripMissingCabin = await readSource('flights.ctrip.com', 'CNY', { meta: cabinMeta, nodes: [{ innerText: actualCards[0] }] });
assert.ok(ctripMissingCabin.calls[0].captures[0].captureIssues.some(issue => /具体舱位/.test(issue)), 'pageMeta.cabin target cannot substitute per-card evidence');
const ctripWrongCabin = await readSource('flights.ctrip.com', 'CNY', { meta: cabinMeta, nodes: [{ ...cabinCard, observedCabin: 'premium_economy', cabinEvidence: '超级经济舱' }] });
assert.ok(ctripWrongCabin.calls[0].captures[0].captureIssues.some(issue => /舱位不一致/.test(issue)));
const ctripForeignCurrency = await readSource('flights.ctrip.com', 'JPY');
assert.equal(ctripForeignCurrency.calls.length, 0);
const ctripSender = { url: ctripPending.sourceUrl, tab: { id: 13 } };
await dispatch({ type: 'bind-query', query: qA }, ctripSender);
assert.equal((await dispatch(ctripPending.calls[0], ctripSender)).count, 1);
const sentCtrip = sentPayloads.at(-1).captures[0];
assert.equal(sentCtrip.url, ctripPending.sourceUrl, 'actual Ctrip dates, cabin and passenger query parameters survive sanitization');
assert.equal(sentCtrip.observedCabin, 'economy');
assert.equal(sentCtrip.cabinEvidence, '经济舱');
assert.ok(sentCtrip.captureIssues.some(issue => /币种/.test(issue)));
assert.equal(validateBrowserRecord(sentCtrip).batch, ctripPending.calls[0].batch, 'collection batch survives the server record validator');
const snapshots = [cabinCard, { ...cabinCard, innerText: cabinCard.innerText.replace('1,902', '2,002') }, { ...cabinCard, innerText: cabinCard.innerText.replace('1,902', '2,102') }];
const preparedResult = await readSource('flights.ctrip.com', 'CNY', { meta: cabinMeta, nodes: [cabinCard], prepared: { cards: snapshots, expanded: 3, message: '已展开3张可见航班。' } });
assert.deepEqual(preparedResult.sequence, ['prepare:start', 'prepare:done', 'inspect'], 'source waits for bounded preparation before inspecting or reading');
assert.equal(preparedResult.calls[0].captures.length, 3, 'accordion snapshots preserve earlier cards after the provider collapses them');
assert.match(preparedResult.response.message, /已展开3张/);
const verificationStopped = await readSource('flights.ctrip.com', 'CNY', { prepareError: '官网要求人工安全验证，请完成后再继续' });
assert.equal(verificationStopped.calls.length, 0);
assert.deepEqual(verificationStopped.sequence, ['prepare:start']);
assert.match(verificationStopped.response.error, /安全验证/);
const restrictedCard = { ...cabinCard, rawText: cabinCard.rawText + '\n限18至25周岁', captureIssues: ['限18至25周岁，不适用于所有成人'] };
const productVariants = await readSource('flights.ctrip.com', 'CNY', { meta: cabinMeta, nodes: [restrictedCard, cabinCard, { ...cabinCard }] });
assert.equal(productVariants.calls[0].captures.length, 2, 'same visible price with different product qualifications is not collapsed; exact duplicates are');
assert.ok(productVariants.calls[0].captures.some(c => c.captureIssues.some(issue => /18至25/.test(issue))));
assert.ok(productVariants.calls[0].captures.some(c => c.captureIssues.length === 0));
const manyNodes = Array.from({ length: 501 }, (_, i) => ({ innerText: actualCards[0].replace('1,902', String(1902 + i)) }));
const limitedCapture = await readSource('www.google.com', 'CNY', { nodes: manyNodes });
assert.equal(limitedCapture.calls[0].captures.length, 500, 'a source click preserves up to 500 distinct visible quotes');
assert.equal(new Set(limitedCapture.calls[0].captures.map(c => c.batch)).size, 1);
assert.equal(limitedCapture.calls[0].batch, limitedCapture.calls[0].captures[0].batch);
assert.match(limitedCapture.response.message, /仅采集前 500 条.*其余未读取/, 'the limit is explicit instead of silently dropping the remaining quotes');
const exactlyLimit = await readSource('www.google.com', 'CNY', { nodes: manyNodes.slice(0, 500) });
assert.equal(exactlyLimit.calls[0].captures.length, 500);
assert.doesNotMatch(exactlyLimit.response.message, /其余未读取/, 'exactly 500 results do not claim additional unobserved quotes exist');
platformAvailable = false;
await dispatch({ type: 'capture-batch', captures: [makeCapture(qA, 9999)] }, googleSender(10));
await dispatch({ type: 'capture-batch', captures: [{ ...makeCapture(qA, 9999), captureIssues: ['changed evidence must be delivered independently'] }] }, googleSender(10));
const changedRecords = (await dispatch({ type: 'pending', date: qA.id })).captures;
assert.equal(changedRecords.length, 2);
assert.notEqual(changedRecords[0].id, changedRecords[1].id, 'updated evidence cannot be removed by an acknowledgement for an older payload');
await dispatch({ type: 'ack', ids: [changedRecords[0].id] });
assert.equal((await dispatch({ type: 'pending', date: qA.id })).captures.length, 1);
const latestInput = { ...makeCapture(qA, 9999), captureIssues: ['new cabin evidence observed during acknowledgement'] };
await Promise.all([
  dispatch({ type: 'capture-batch', captures: [latestInput] }, googleSender(10)),
  dispatch({ type: 'ack', ids: [changedRecords[1].id] })
]);
const afterConcurrentAck = (await dispatch({ type: 'pending', date: qA.id })).captures;
assert.equal(afterConcurrentAck.length, 1);
assert.equal(afterConcurrentAck[0].captureIssues[0], latestInput.captureIssues[0], 'concurrent old acknowledgement preserves the newly read evidence');
state.captures.find(c => c.id === afterConcurrentAck[0].id).capturedAt = new Date(Date.now() - 120000).toISOString();
await dispatch({ type: 'capture-batch', captures: [latestInput] }, googleSender(10));
const reread = (await dispatch({ type: 'pending', date: qA.id })).captures;
assert.equal(reread.length, 2);
assert.ok(reread.some(c => c.id !== afterConcurrentAck[0].id && Date.now() - Date.parse(c.capturedAt) < 60000), 're-reading a stale pending card records a fresh capture instead of permanently reusing its old timestamp');
await dispatch({ type: 'clear-pending', date: qA.id });
const clickA = randomUUID(), clickB = randomUUID(), clickC = randomUUID();
await dispatch({ type: 'capture-batch', batch: clickA, captures: [makeCapture(qA, 12000)] }, googleSender(10));
const oldClick = (await dispatch({ type: 'pending', date: qA.id })).captures[0];
await dispatch({ type: 'capture-batch', batch: clickB, captures: [makeCapture(qA, 12000), makeCapture(qA, 12001)] }, googleSender(10));
let clicks = (await dispatch({ type: 'pending', date: qA.id })).captures;
assert.equal(clicks.filter(c => c.batch === clickB).length, 2, 'unchanged and changed prices from the new click stay together in the new batch');
await dispatch({ type: 'capture-batch', batch: clickB, captures: [makeCapture(qA, 12000), makeCapture(qA, 12001)] }, googleSender(10));
assert.equal((await dispatch({ type: 'pending', date: qA.id })).captures.length, 3, 'replaying the same batch does not add duplicate pending products');
await Promise.all([
  dispatch({ type: 'capture-batch', batch: clickC, captures: [makeCapture(qA, 12000)] }, googleSender(10)),
  dispatch({ type: 'ack', ids: [oldClick.id] })
]);
clicks = (await dispatch({ type: 'pending', date: qA.id })).captures;
assert.equal(clicks.length, 3);
assert.equal(clicks.filter(c => c.batch === clickC).length, 1, 'an old batch acknowledgement cannot erase an identical quote read in a new batch');
assert.equal(clicks.filter(c => c.batch === clickB).length, 2);
await dispatch({ type: 'clear-pending', date: qA.id });
const beforeLimits = clone(state.captures);
const tooMany = await dispatch({ type: 'capture-batch', captures: Array.from({ length: 501 }, (_, i) => makeCapture(qA, 14000 + i)) }, googleSender(10));
assert.match(tooMany.error, /500/);
assert.deepEqual(state.captures, beforeLimits, 'an oversized input does not partially save or erase existing records');
const savedQueue = clone(state.captures);
state.captures = clone(Array.from({ length: 1000 }, (_, i) => ({ ...makeCapture(qB, i), id: randomUUID(), date: qB.id })));
const fullQueue = clone(state.captures);
const fullResult = await dispatch({ type: 'capture-batch', captures: [makeCapture(qA, 15000)] }, googleSender(10));
assert.match(fullResult.error, /尚未保存/);
assert.deepEqual(state.captures, fullQueue, 'record capacity refusal preserves the entire existing queue');
state.captures = clone(savedQueue);
const byteHeavy = Array.from({ length: 200 }, (_, i) => ({ ...makeCapture(qA, 16000 + i), rawText: '汉'.repeat(8000) }));
assert.equal((await dispatch({ type: 'capture-batch', captures: byteHeavy }, googleSender(10))).queued, true);
const byteQueue = clone(state.captures);
const byteResult = await dispatch({ type: 'capture-batch', captures: byteHeavy }, googleSender(10));
assert.match(byteResult.error, /容量上限/);
assert.deepEqual(state.captures, byteQueue, 'UTF-8 byte capacity refusal preserves queued evidence even when record count is below the limit');
state.captures = savedQueue;
console.log('PASS extension queue: 40 concurrent records, per-tab isolation, URL/sender restrictions, deduplication, partial acknowledgement, failure retry, one-click batch sync and cross-query separation. No external requests were made.');
console.log('PASS actual Google card fixtures: ¥1,902 direct and ¥1,792 connecting; no duplicated accessibility text; visible matching tax/adult notice only.');
console.log('PASS 0.5.1 queue upgrade and dashboard postMessage contract: original evidence retained, exact-query import only, unknown records preserved, manual sync/clear response and update event match.');
console.log('PASS official uncertainty transport: unknown Ctrip/Tongcheng currency retained for review; explicit non-CNY and unknown Google currency blocked; per-card cabin proof and actual Ctrip query parameters preserved.');
console.log('PASS batch/product identity and limits: separate clicks keep consistent batches, same-batch retries deduplicate, old acknowledgements preserve new reads, fare qualifications remain distinct, 500 rows chunk safely, and capacity refusals preserve the queue.');
