import assert from 'node:assert/strict';
import { normalizeQuery } from '../lib/flight-query.mjs';
import { validateBrowserRecord, hydrateRecord, recordStorageId, validQueryId } from '../lib/browser-records.mjs';
import { compareRecords, total } from '../lib/compare.mjs';
import { googleSingleUrl } from '../lib/google-single.mjs';

// Captured text/URL fixtures are based on the parent's actual Google UI observation.
// Amount variations, invalid records and timestamps below are synthetic tests only.
const query = normalizeQuery({ from: 'SHA', to: 'TYO', out: '2026-12-31', back: '2027-01-04', adults: 1, cabin: 'economy', tripType: 'roundtrip' });
const url = 'https://www.google.com/travel/flights/search?tfs=CBwQAhooEgoyMDI2LTEyLTMxagwIAxIIL20vMDZ3amZyDAgDEggvbS8wN2Rma0ABSAFwAYIBCwj___________8BmAEC&hl=zh-CN&curr=CNY';
const text = '15:00\nPVG\n18:40\nNRT\n¥1,902\n直达2 小时 40 分钟春航\n-10% 排放量';
const now = Date.now(), at = offset => new Date(now + offset).toISOString();
const meta = { from: 'SHA', to: 'TYO', date: query.out, adults: 1, cabin: 'economy', tripType: 'oneway', currency: 'CNY', verified: true, taxIncluded: true, priceBasis: 'party-total', evidence: 'google-search-url' };
const fixture = { id: 'fixture-quote-0001', query, date: query.id, url, text, capturedAt: at(-1000), direction: 'outbound', tripType: 'oneway', pageMeta: meta };
const record = validateBrowserRecord(fixture);
assert.equal(record.normalized.eligible, true, record.normalized.reason);
assert.equal(record.source, 'google'); assert.equal(record.normalized.price, 1902);
assert.equal(record.pageMeta.verified, true); assert.equal(record.pageMeta.taxIncluded, true);
assert.equal(record.date, query.id); assert.equal(validQueryId(query.id), true);
assert.equal(validQueryId('capture:all'), false);

for (const bad of ['https://google.com.evil.example/travel/flights', 'https://evil.example/google.com/travel/flights', 'http://www.google.com/travel/flights', 'https://user:secret@www.google.com/travel/flights', 'https://www.google.com:8443/travel/flights', 'https://www.google.com/travel/flights-malicious']) {
  assert.throws(() => validateBrowserRecord({ ...fixture, url: bad }));
}
assert.throws(() => validateBrowserRecord({ ...fixture, capturedAt: at(61000) }));
assert.throws(() => validateBrowserRecord({ ...fixture, capturedAt: at(-86400001) }));
assert.throws(() => validateBrowserRecord({ ...fixture, id: '../capture' }));
assert.equal(validateBrowserRecord({ ...fixture, source: 'ly' }).source, 'google');
assert.equal(validateBrowserRecord({ ...fixture, query: { ...query, id: 'other-query' } }).query.id, query.id);
assert.equal(validateBrowserRecord({ ...fixture, url: url + '&token=secret#fcq=secret' }).url, url);

// An asserted verified flag cannot override Google's actual URL condition.
const wrongAdults = validateBrowserRecord({ ...fixture, pageMeta: { ...meta, adults: 2 } });
assert.equal(wrongAdults.normalized.eligible, false);
assert.equal(wrongAdults.pageMeta.adults, 1);
assert.equal(wrongAdults.pageMeta.verified, false);
const wrongDate = validateBrowserRecord({ ...fixture, pageMeta: { ...meta, date: '2027-01-01' } });
assert.equal(wrongDate.normalized.eligible, false);
const unknownGoogle = validateBrowserRecord({ ...fixture, url: 'https://www.google.com/travel/flights?q=Shanghai+Tokyo' });
assert.equal(unknownGoogle.normalized.eligible, false); assert.equal(unknownGoogle.pageMeta.verified, false);
const actualRoundtrip = validateBrowserRecord({ ...fixture, url: url.replace('mAEC', 'mAEB') });
assert.equal(actualRoundtrip.normalized.eligible, false);

// Previously stored 0.5.1 records remain visible under the canonical custom query.
const legacy = hydrateRecord({ ...fixture, query: undefined, date: '20261231', pageMeta: undefined });
assert.equal(legacy.query.id, query.id); assert.equal(legacy.normalized.eligible, true, legacy.normalized.reason);
assert.equal(legacy.normalized.taxIncluded, null);
const storedConnectingReturn = hydrateRecord({ ...fixture, direction: 'return', url: googleSingleUrl(query, 'return'), text: '19:50\n – \n17:15+1\n大韩航空、韩亚\n22 小时 25 分钟\nHND–SHA\n经停 1 次\n17 小时 35 分钟 GMP\n174 kg CO2e\n+11% 排放量\n¥2,723', pageMeta: { ...meta, from: 'TYO', to: 'SHA', date: query.back }, normalized: { eligible: false, reason: '未能唯一识别机场与起降时间' } });
assert.equal(storedConnectingReturn.normalized.eligible, true, storedConnectingReturn.normalized.reason);
assert.equal(storedConnectingReturn.normalized.legs[0].from, 'HND');
assert.equal(storedConnectingReturn.normalized.legs[0].to, 'SHA');
const preserved = validateBrowserRecord({ ...fixture, rawText: '官网真实原文', cardEvidence: 'visible airport mapping', evidence: 'visible-text' });
assert.equal(preserved.rawText, '官网真实原文'); assert.equal(preserved.normalized.rawText, '官网真实原文');
assert.equal(preserved.cardEvidence, 'visible airport mapping'); assert.equal(preserved.evidence, 'visible-text');
assert.equal(validateBrowserRecord({ ...fixture, batch: 'AA111111-1111-4111-8111-111111111111' }).batch, 'aa111111-1111-4111-8111-111111111111');
assert.equal(validateBrowserRecord({ ...fixture, batch: 'same-flight-batch' }).batch, undefined);
const issuesRecord = validateBrowserRecord({ ...fixture, captureIssues: ['同程页面未能明确核验币种，暂不参与比价', '礼包金额尚未核验'] });
assert.equal(issuesRecord.captureIssues.length, 2); assert.equal(issuesRecord.normalized.eligible, false);
assert.match(issuesRecord.normalized.reason, /礼包金额尚未核验/);
const canonicalTime = validateBrowserRecord({ ...fixture, capturedAt: '2026-10-10T13:00:00+08:00' }, { historical: true });
assert.equal(canonicalTime.capturedAt, '2026-10-10T05:00:00.000Z');
assert.equal(hydrateRecord({ ...fixture, capturedAt: 'not-a-date' }).normalized.eligible, false);

const roundtripText = '13:35 PVG 17:25 NRT NH920 直飞 全日空\n10:00 HND 12:25 SHA NH969 直飞 全日空\n人民币 4,382 往返含税总价';
const official = validateBrowserRecord({ ...fixture, url: 'https://www.ly.com/iflight/search', text: roundtripText, tripType: 'roundtrip', pageMeta: { ...meta, tripType: 'roundtrip', returnDate: query.back } });
assert.equal(official.pageMeta.back, query.back); assert.equal(official.normalized.eligible, true, official.normalized.reason);
// Ctrip's actual y_s search URL denotes a mixed economy/premium-economy scope.
const mixedCtripUrl = 'https://flights.ctrip.com/online/list/oneway-sha-tyo?depdate=2026-12-31&cabin=y_s&adult=1&child=0&infant=0';
const withoutProductCabin = validateBrowserRecord({ ...fixture, url: mixedCtripUrl });
assert.equal(new URL(withoutProductCabin.url).searchParams.get('depdate'), query.out);
assert.deepEqual(withoutProductCabin.pageMeta.cabinScope, ['economy', 'premium_economy']);
assert.equal(withoutProductCabin.normalized.eligible, false);
const withProductCabin = validateBrowserRecord({ ...fixture, url: mixedCtripUrl, text: text + '\n经济舱', observedCabin: 'economy', cabinEvidence: '经济舱' });
assert.equal(withProductCabin.observedCabin, 'economy'); assert.equal(withProductCabin.cabinEvidence, '经济舱');
assert.equal(withProductCabin.normalized.eligible, true, withProductCabin.normalized.reason);
assert.equal(validateBrowserRecord({ ...fixture, url: mixedCtripUrl, text: text + '\n超级经济舱', observedCabin: 'economy', cabinEvidence: '经济舱' }).normalized.eligible, false);

// Retry IDs and harmless whitespace must not create duplicate stored quotes.
const key = await recordStorageId(record);
assert.match(key, /^capture:[a-f0-9]{64}$/);
assert.equal(await recordStorageId(validateBrowserRecord({ ...fixture, id: 'fixture-quote-9999', capturedAt: at(-500), text: text.replaceAll('\n', '  ') })), key);
assert.notEqual(await recordStorageId(validateBrowserRecord({ ...fixture, text: text.replace('1,902', '2,001') })), key);
assert.notEqual(await recordStorageId(wrongAdults), key);
assert.notEqual(await recordStorageId(validateBrowserRecord({ ...fixture, direction: 'return' })), key);
assert.notEqual(await recordStorageId(validateBrowserRecord({ ...fixture, query: { ...query, out: '2027-01-01' } })), key);

const older = validateBrowserRecord({ ...fixture, id: 'fixture-quote-0002', text: text.replace('1,902', '1,800'), capturedAt: at(-60000) });
const newerUnknownTax = validateBrowserRecord({ ...fixture, id: 'fixture-quote-0003', pageMeta: { ...meta, taxIncluded: undefined }, capturedAt: at(-500) });
let compared = compareRecords([older, record, newerUnknownTax, official], query, { now });
assert.equal(compared.outbound.length, 1); assert.equal(compared.outbound[0].id, newerUnknownTax.id);
assert.equal(compared.outbound[0].normalized.taxIncluded, null); assert.equal(compared.roundtrip.length, 1);
assert.equal(compared.return.length, 0);
const future = validateBrowserRecord({ ...fixture, id: 'fixture-quote-0004', capturedAt: at(120000) }, { historical: true });
compared = compareRecords([future, record], query, { now });
assert.equal(compared.rows.length, 1); assert.equal(compared.stale.length, 1);
const expired = validateBrowserRecord({ ...fixture, capturedAt: at(-86401000) }, { historical: true });
assert.equal(compareRecords([expired], query, { now }).rows.length, 0);
assert.equal(compareRecords([expired], query, { now }).stale.length, 1);
assert.equal(compareRecords([{ ...record, status: 'archived' }], query, { now }).rows.length, 0);
assert.equal(compareRecords([record, official], query, { now, source: 'google' }).rows.length, 1);
assert.equal(compareRecords([record, official], { ...query, adults: 2 }, { now }).rows.length, 0);
assert.equal(compareRecords([record], query, { now, direct: true, daytime: true }).rows.length, 1);
const ambiguous = validateBrowserRecord({ ...fixture, id: 'fixture-quote-0005', capturedAt: at(-300), text: text + '\n¥2,111' });
compared = compareRecords([record, ambiguous], query, { now });
assert.equal(compared.rows.length, 0); assert.equal(compared.pending.length, 1);
assert.equal(total({ price: 1902, priceBasis: 'per-person', passengers: 2 }), 3804);
assert.equal(total({ price: 3804, priceBasis: 'party-total', passengers: 2 }), 3804);
assert.equal(Number.isNaN(total({ price: null, totalPrice: null, passengers: 1 })), true);
assert.equal(Number.isNaN(total({ price: 1902, priceBasis: 'unknown', passengers: 2 })), true);
console.log('PASS: source and URL trust; legacy hydration; raw evidence; normalized timestamps; capture idempotency; latest-price dedupe; stale/future isolation; independent single/round-trip totals.');
