import assert from 'node:assert/strict';
import { normalizeQuery, queryKey, legQuery, routeMatches } from '../lib/flight-query.mjs';
import { normalizeQuote } from '../lib/quote-normalize.mjs';
import '../browser-helper/google-search-core.js';

const google = globalThis.flightGoogleSearchCore;
const query = normalizeQuery({ from: 'sha', to: 'TYO', out: '2026-12-31', back: '2027-01-04', adults: 1, cabin: 'economy', tripType: 'roundtrip' });
assert.equal(query.id, 'q-SHA-TYO-20261231-20270104-a1-economy');
assert.equal(queryKey({ ...query, direction: 'return', id: 'untrusted-id' }), query.id);
assert.notEqual(queryKey({ ...query, adults: 2 }), query.id);
assert.notEqual(queryKey({ ...query, cabin: 'business' }), query.id);
assert.deepEqual(legQuery(query, 'return'), { from: 'TYO', to: 'SHA', date: '2027-01-04', adults: 1, cabin: 'economy' });
assert.equal(routeMatches('PVG', 'SHA'), true);
assert.equal(routeMatches('NRT', 'TYO'), true);
assert.equal(routeMatches('SHA', 'PVG'), false);
for (const patch of [{ out: '2027-02-29' }, { out: '2026-13-01' }, { back: '2026-12-01' }, { adults: 0 }, { adults: 10 }, { adults: 1.5 }, { cabin: 'invalid' }, { from: 'Shanghai' }, { to: 'SHA' }]) {
  assert.throws(() => normalizeQuery({ ...query, ...patch }));
}
assert.throws(() => legQuery({ ...query, tripType: 'oneway' }, 'return'));
assert.equal(normalizeQuery({ ...query, out: '2028-02-29', back: '2028-03-01' }).out, '2028-02-29');

// Real browser URL supplied by the user after selecting one-way (0.5.1 regression).
const observed = 'https://www.google.com/travel/flights/search?tfs=CBwQAhooEgoyMDI2LTEyLTMxagwIAxIIL20vMDZ3amZyDAgDEggvbS8wN2Rma0ABSAFwAYIBCwj___________8BmAEC&hl=zh-CN&curr=CNY';
assert.equal(google.searchUrl(query), observed);
assert.deepEqual(google.inspect(observed), { from: 'SHA', to: 'TYO', date: '2026-12-31', adults: 1, cabin: 'economy', tripType: 'oneway', currency: 'CNY', direction: 'outbound' });
assert.equal(google.inspect(observed.replace('CBwQAh', 'CBwQAQ').replace('mAEC', 'mAEB')), undefined);
assert.equal(google.inspect(observed.replace('www.google.com', 'www.google.com.example.org')), undefined);
assert.equal(google.inspect(observed.replace('https:', 'http:')), undefined);
assert.equal(google.inspect('https://www.google.com/travel/flights/search?tfs=AAAA'), undefined);
for (const q of [query, { ...query, out: '2027-05-21', back: '2027-06-03' }]) for (const direction of ['outbound', 'return']) {
  const meta = google.inspect(google.searchUrl(q, direction)), leg = legQuery(q, direction);
  assert.equal(meta.from, leg.from); assert.equal(meta.to, leg.to); assert.equal(meta.date, leg.date);
}
const observedAirport = 'https://www.google.com/travel/flights/search?tfs=CBwQAhojEgoyMDI2LTEyLTMxagcIARIDUFZHcgwIAxIIL20vMDdkZmtAAUgBcAGCAQsI____________AZgBAg&tfu=EgYIABAAGAA&hl=zh-CN&curr=CNY';
assert.equal(google.inspect(observedAirport).from, 'PVG');
assert.equal(google.inspect(observedAirport).to, 'TYO');
assert.equal(google.inspect(google.searchUrl({ ...query, from: 'PVG', to: 'NRT' })).to, 'NRT');
const observedTwoAdults = 'https://www.google.com/travel/flights/search?tfs=CBwQAhojEgoyMDI2LTEyLTMxagcIARIDUFZHcgwIAxIIL20vMDdkZmtAAUABSAFwAYIBCwj___________8BmAEC&tfu=EgYIABAAGAA&hl=zh-CN&curr=CNY';
assert.equal(google.inspect(observedTwoAdults).adults, 2);
assert.equal(google.inspect(google.searchUrl({ ...query, adults: 9 })).adults, 9);
const observedBusiness = 'https://www.google.com/travel/flights/search?tfs=CBwQAhojEgoyMDI2LTEyLTMxagcIARIDUFZHcgwIAxIIL20vMDdkZmtAAUABSANwAYIBCwj___________8BmAEC&tfu=EgYIABAAGAA&hl=zh-CN&curr=CNY';
assert.equal(google.inspect(observedBusiness).adults, 2);
assert.equal(google.inspect(observedBusiness).cabin, 'business');
assert.equal(google.inspect(google.searchUrl({ ...query, from: 'PVG', adults: 2, cabin: 'business' })).cabin, 'business');
for (const patch of [{ from: 'ZZZ', to: 'NRT' }]) {
  const info = google.searchInfo({ ...query, ...patch });
  assert.equal(info.verifiedParameters, false);
  assert.equal(google.inspect(info.url), undefined);
  assert.ok(new URL(info.url).searchParams.get('q').includes('One way'));
}

const pageMeta = { verified: true, from: 'SHA', to: 'TYO', date: query.out, adults: 1, cabin: 'economy', tripType: 'oneway', currency: 'CNY', taxIncluded: true, priceBasis: 'party-total' };
// Real visible card text captured by the parent from the current Google one-way page.
const actualCard = '15:00\nPVG\n18:40\nNRT\n¥1,902\n直达2 小时 40 分钟春航\n-10% 排放量';
const capture = { query, queryId: query.id, direction: 'outbound', tripType: 'oneway', source: 'google', currency: 'CNY', pageMeta, text: actualCard, capturedAt: '2026-10-10T08:00:00Z', url: observed };
const actual = normalizeQuote(capture);
assert.equal(actual.eligible, true, actual.reason);
assert.equal(actual.price, 1902); assert.equal(actual.taxIncluded, true); assert.equal(actual.currency, 'CNY');
assert.equal(actual.legs[0].departureTime, '15:00'); assert.equal(actual.legs[0].arrivalTime, '18:40');
assert.equal(actual.legs[0].from, 'PVG'); assert.equal(actual.legs[0].to, 'NRT'); assert.equal(actual.legs[0].direct, true);
assert.equal(actual.legs[0].flight, undefined);
const transfer = normalizeQuote({ ...capture, text: '01:30\nPVG\n17:55\nNRT\n¥1,792\n经停 1 次15 小时 25 分钟韩亚\n+35% 排放量' });
assert.equal(transfer.eligible, true, transfer.reason); assert.equal(transfer.legs[0].direct, false);
// Real return card: the GMP layover airport must not replace the explicit HND–SHA endpoints.
const actualConnectingReturn = '19:50\n – \n17:15+1\n大韩航空、韩亚\n22 小时 25 分钟\nHND–SHA\n经停 1 次\n17 小时 35 分钟 GMP\n174 kg CO2e\n+11% 排放量\n¥2,723';
const returnCapture = { ...capture, direction: 'return', text: actualConnectingReturn, pageMeta: { ...pageMeta, from: 'TYO', to: 'SHA', date: query.back } };
const connectingReturn = normalizeQuote(returnCapture);
assert.equal(connectingReturn.eligible, true, connectingReturn.reason);
assert.equal(connectingReturn.price, 2723); assert.equal(connectingReturn.rawText, actualConnectingReturn);
assert.equal(connectingReturn.legs[0].from, 'HND'); assert.equal(connectingReturn.legs[0].to, 'SHA');
assert.equal(connectingReturn.legs[0].departureTime, '19:50'); assert.equal(connectingReturn.legs[0].arrivalTime, '17:15');
assert.equal(connectingReturn.legs[0].arrivalDayOffset, 1); assert.equal(connectingReturn.legs[0].direct, false);
assert.equal(normalizeQuote({ ...returnCapture, source: 'ctrip' }).eligible, false);
assert.equal(normalizeQuote({ ...returnCapture, source: 'ly' }).eligible, false);
assert.equal(normalizeQuote({ ...returnCapture, text: actualConnectingReturn + '\nGMP–SHA' }).eligible, false);
assert.equal(normalizeQuote({ ...returnCapture, text: actualConnectingReturn + '\n中转时间 23:45' }).eligible, false);
assert.equal(normalizeQuote({ ...returnCapture, text: actualConnectingReturn.replace('HND–SHA', '路线 HND–SHA') }).eligible, false);
assert.equal(normalizeQuote({ ...returnCapture, text: actualConnectingReturn.replaceAll('\n', '\r\n') }).eligible, true);

// Synthetic boundary records below are parser fixtures, never inserted as actual quotes.
for (const patch of [
  { text: actualCard + '\n¥1,999' },
  { text: actualCard + '\nJPY 20,000' },
  { text: actualCard + '\n$1,902' },
  { text: actualCard.replace('¥1,902', '¥1,90') },
  { text: actualCard + '\n往返票价' },
  { text: actualCard.replace('PVG', 'CAN') },
  { text: actualCard.replace('15:00', '25:00') },
  { text: actualCard.replace('¥1,902', '¥0') },
  { pageMeta: { ...pageMeta, date: '2027-01-01' } },
  { pageMeta: { ...pageMeta, adults: 2 } },
  { pageMeta: { ...pageMeta, cabin: 'business' } },
  { pageMeta: { ...pageMeta, verified: false } },
  { pageMeta: undefined },
  { query: undefined }
]) {
  const parsed = normalizeQuote({ ...capture, ...patch });
  assert.equal(parsed.eligible, false, JSON.stringify(patch));
  assert.ok(parsed.reason.length > 0); assert.equal(parsed.rawText, (patch.text || actualCard).trim());
}
const unknownTax = normalizeQuote({ ...capture, pageMeta: { ...pageMeta, taxIncluded: undefined } });
assert.equal(unknownTax.eligible, true); assert.equal(unknownTax.taxIncluded, null);
// Actual dedicated Ctrip flight/product raw text; older canonical text lost its tax heading.
const ctripTaxRaw = '春秋航空日本\nIJ006 波音737(中)\n08:55\n浦东国际机场T2\n13:00\n成田国际机场T3\n3小时5分航班详情\n含税价\n收起\n经济舱退改签|行李规定境外电子凭证\n¥1860\n预订';
const ctripTaxCapture = { ...capture, source: 'ctrip', cardEvidence: 'ctrip-visible-dom:flight-item>flight-box+flight-seats', text: '08:55 PVG\n13:00 NRT\nIJ006 春秋航空日本 直飞\n¥1860\n经济舱', rawText: ctripTaxRaw, pageMeta: { ...pageMeta, taxIncluded: undefined } };
assert.equal(normalizeQuote(ctripTaxCapture).taxIncluded, true);
assert.equal(normalizeQuote(ctripTaxCapture).eligible, true);
for (const patch of [{ source: 'ly' }, { source: 'google' }, { cardEvidence: undefined }, { cardEvidence: 'ctrip-visible-dom:generic' }, { rawText: ctripTaxRaw.replace('含税价', '请核实含税价') }]) {
  assert.equal(normalizeQuote({ ...ctripTaxCapture, ...patch }).taxIncluded, null);
}
for (const denial of ['不含税', '不包含税费']) {
  assert.equal(normalizeQuote({ ...ctripTaxCapture, rawText: ctripTaxRaw + '\n' + denial, text: ctripTaxCapture.text + '\n含税总价', pageMeta }).taxIncluded, false);
}
const packageUnknown = normalizeQuote({ ...capture, captureIssues: [' 礼包金额及是否必选尚未核验 ', 123, '', ...Array(15).fill('X'.repeat(450))] });
assert.equal(packageUnknown.eligible, false); assert.match(packageUnknown.reason, /礼包金额及是否必选尚未核验/);
assert.ok(packageUnknown.reasons.every(x => x.length <= 400)); assert.ok(packageUnknown.reasons.length <= 12);
// Synthetic mixed-cabin list/product boundary cases; query cabin is not product evidence.
const mixedCabin = { ...capture, source: 'ctrip', pageMeta: { ...pageMeta, cabinScope: ['economy', 'premium_economy'], cabinEvidence: 'per-card-required' } };
assert.equal(normalizeQuote(mixedCabin).eligible, false);
const economyProduct = { ...mixedCabin, text: actualCard + '\n经济舱', observedCabin: 'economy', cabinEvidence: '经济舱' };
assert.equal(normalizeQuote(economyProduct).eligible, true);
assert.equal(normalizeQuote({ ...economyProduct, rawText: actualCard }).eligible, false);
assert.equal(normalizeQuote({ ...economyProduct, text: actualCard + '\n超级经济舱' }).eligible, false);
assert.equal(normalizeQuote({ ...economyProduct, text: actualCard + '\n经济舱/超级经济舱' }).eligible, false);
assert.equal(normalizeQuote({ ...economyProduct, observedCabin: 'premium_economy', cabinEvidence: '超级经济舱' }).eligible, false);
assert.equal(normalizeQuote({ ...economyProduct, pageMeta: { ...mixedCabin.pageMeta, cabinScope: 'economy,premium_economy' } }).eligible, false);
const premiumQuery = normalizeQuery({ ...query, cabin: 'premium_economy' });
assert.equal(normalizeQuote({ ...mixedCabin, query: premiumQuery, text: actualCard + '\n超级经济舱', observedCabin: 'premium_economy', cabinEvidence: '超级经济舱', pageMeta: { ...mixedCabin.pageMeta, cabin: 'premium_economy' } }).eligible, true);
for (const denial of ['不包含税费', '未包含税费', '不包括税费', '不含机场税', 'taxes are not included']) {
  assert.equal(normalizeQuote({ ...capture, text: actualCard + '\n' + denial }).taxIncluded, false, denial);
}
const nightReturn = normalizeQuote({ ...capture, direction: 'return', text: '22:40\nHND\n01:15+1\nPVG\nCNY 2,010\nNH972 直飞 全日空', pageMeta: { ...pageMeta, from: 'TYO', to: 'SHA', date: query.back } });
assert.equal(nightReturn.eligible, true, nightReturn.reason);
assert.equal(nightReturn.legs[0].arrivalDayOffset, 1); assert.equal(nightReturn.legs[0].flight, 'NH972');
const multiQuery = normalizeQuery({ ...query, adults: 2 });
assert.equal(normalizeQuote({ ...capture, query: multiQuery, pageMeta: { ...pageMeta, adults: 2, priceBasis: undefined } }).eligible, false);
assert.equal(normalizeQuote({ ...capture, query: multiQuery, pageMeta: { ...pageMeta, adults: 2, priceBasis: 'party-total' } }).eligible, true);
assert.equal(normalizeQuote({ ...capture, query: multiQuery, pageMeta: { ...pageMeta, adults: 2, priceBasis: 'party-total' } }).totalPrice, 1902);
assert.equal(normalizeQuote({ ...capture, query: multiQuery, pageMeta: { ...pageMeta, adults: 2, priceBasis: 'per-person' } }).totalPrice, 3804);
for (const party of ['合计1人', 'total for 1 adult']) {
  const mismatch = normalizeQuote({ ...capture, query: multiQuery, text: actualCard + '\n' + party, pageMeta: { ...pageMeta, adults: 2 } });
  assert.equal(mismatch.eligible, false); assert.match(mismatch.reason, /乘客人数/);
}
const fullRoundTrip = normalizeQuote({ ...capture, tripType: 'roundtrip', text: '13:35 PVG 17:25 NRT NH920 直飞 全日空\n10:00 HND 12:25 SHA NH969 直飞 全日空\n人民币 4,382 往返含税总价', pageMeta: { ...pageMeta, tripType: 'roundtrip', back: query.back } });
assert.equal(fullRoundTrip.eligible, true, fullRoundTrip.reason); assert.equal(fullRoundTrip.legs.length, 2);
assert.equal(normalizeQuote({ ...capture, tripType: 'roundtrip', pageMeta: { ...pageMeta, tripType: 'roundtrip', back: query.back } }).eligible, false);
const splitSamePrice = normalizeQuote({ ...capture, tripType: 'roundtrip', text: '去程 PVG NRT 13:00 17:00 CNY1000 含税 回程 NRT PVG 10:00 12:00 CNY1000 含税', pageMeta: { ...pageMeta, tripType: 'roundtrip', back: query.back } });
assert.equal(splitSamePrice.eligible, false); assert.match(splitSamePrice.reason, /往返总价/);
const unstatedScope = normalizeQuote({ ...capture, tripType: 'roundtrip', text: '13:00 PVG 17:00 NRT 直飞\n10:00 NRT 12:00 PVG 直飞\nCNY1000含税', pageMeta: { ...pageMeta, tripType: 'roundtrip', back: query.back } });
assert.equal(unstatedScope.eligible, false); assert.match(unstatedScope.reason, /金额覆盖完整往返/);
console.log('PASS: custom query identities and validation; observed Google one-way URL regression; route/date/currency/passenger/cabin guards; real visible cards; ambiguous/partial quote retention.');

// Google economy results may include visibly labelled business alternatives.
for (const label of ['商务舱', 'Business class', '超级经济舱', '头等舱']) {
  const mismatch = normalizeQuote({ ...capture, rawText: actualCard + '\n' + label });
  assert.equal(mismatch.eligible, false, label);
  assert.match(mismatch.reason, /舱位/);
}
assert.equal(normalizeQuote({ ...capture, rawText: actualCard + '\n经济舱' }).eligible, true);
assert.equal(normalizeQuote({ ...capture, query: { ...query, cabin: 'business' }, pageMeta: { ...pageMeta, cabin: 'business' }, rawText: actualCard + '\n商务舱' }).eligible, true);

assert.equal(normalizeQuote({...capture,text:actualCard.replace("¥1,902","¥1,902 起")}).eligible,true);
