import assert from 'node:assert/strict';
import { normalizeQuery } from '../lib/flight-query.mjs';
import { validateBrowserRecord, hydrateRecord, recordStorageId } from '../lib/browser-records.mjs';
import { confirmCurrencyReview } from '../lib/currency-review.mjs';
import { compareRecords } from '../lib/compare.mjs';

// Synthetic capture records derived from the observed Ctrip card structure.
// These fixtures exercise owner review boundaries and are never written to the site.
const query = normalizeQuery({ from: 'SHA', to: 'TYO', out: '2026-12-31', back: '2027-01-04', adults: 1, cabin: 'economy', tripType: 'roundtrip' });
const batch = '11111111-1111-4111-8111-111111111111';
const now = Date.now(), capturedAt = new Date(now - 300000).toISOString();
const context = { reviewId: '22222222-2222-4222-8222-222222222222', confirmedAt: new Date(now).toISOString() };
const storageId = 'capture:' + 'a'.repeat(64);
const text = '13:35 PVG\n17:25 NRT\nNH920 全日空 直飞\n¥1,860\n经济舱 含税总价';
const input = {
  id: 'fixture-review-0001', query, batch, text, rawText: text, capturedAt, status: 'draft',
  url: 'https://flights.ctrip.com/online/list/oneway-sha-tyo?depdate=2026-12-31&cabin=y_s&adult=1&child=0&infant=0',
  direction: 'outbound', tripType: 'oneway', observedCabin: 'economy', cabinEvidence: '经济舱',
  captureIssues: ['携程页面未能明确核验币种，暂不参与比价'],
  pageMeta: { verified: true, from: 'SHA', to: 'TYO', date: query.out, adults: 1, cabin: 'economy', tripType: 'oneway', taxIncluded: true, priceBasis: 'party-total' }
};
const record = validateBrowserRecord(input);
const selection = { queryId: query.id, source: 'ctrip', currency: 'CNY', batch };
function confirm(item = record, chosen = selection, suppliedContext = context) {
  return confirmCurrencyReview([{ storageId, record: item }], chosen, suppliedContext);
}
assert.equal(record.normalized.eligible, true);
const originalJson = JSON.stringify(record);
let result = confirm();
assert.equal(JSON.stringify(record), originalJson, 'pure helper must not mutate the stored input');
assert.equal(result.updates.length, 1); assert.equal(result.rejected.length, 0);
const reviewed = result.updates[0].record;
assert.equal(reviewed.currencyReview.currency, 'CNY'); assert.equal(reviewed.currencyReview.mode, 'user-confirmed');
assert.equal(reviewed.currencyReview.captureId, record.id); assert.equal(reviewed.currencyReview.queryId, query.id);
assert.equal(reviewed.normalized.currencyEvidence, 'user-confirmed'); assert.equal(reviewed.normalized.eligible, true, reviewed.normalized.reason);
assert.equal(reviewed.normalized.currency, 'CNY'); assert.equal(reviewed.capturedAt, capturedAt);
assert.equal(reviewed.pageMeta.currency, undefined, 'preserve the original observed metadata');
assert.deepEqual(reviewed.captureIssues, record.captureIssues, 'preserve original capture issues; remove only in derived normalization');
assert.equal(hydrateRecord(reviewed).normalized.eligible, true);
assert.equal(hydrateRecord(reviewed).currencyReview.confirmedAt, context.confirmedAt);
assert.equal(confirm(reviewed).unchanged.length, 1);
assert.equal(confirm(reviewed).updates.length, 0);

// A capture POST cannot self-authorize a review, even with a copied valid review.
const forged = validateBrowserRecord({ ...input, currencyReview: reviewed.currencyReview, normalized: { eligible: true, currency: 'CNY' } });
assert.equal(forged.currencyReview, undefined); assert.equal(forged.normalized.eligible, true);
assert.equal(validateBrowserRecord({ ...input, currencyReview: reviewed.currencyReview }, { historical: true }).currencyReview, undefined);
for (const patch of [{ captureId: 'different-capture-id' }, { queryId: query.id.replace('SHA', 'PVG') }, { batch: null }, { currency: 'JPY' }, { source: 'ly' }, { mode: 'automatic' }]) {
  const failed = hydrateRecord({ ...reviewed, currencyReview: { ...reviewed.currencyReview, ...patch } });
  assert.equal(failed.currencyReview, undefined); assert.equal(failed.normalized.eligible, true);
}
assert.equal(hydrateRecord({ ...reviewed, capturedAt: new Date(now - 200000).toISOString() }).currencyReview, undefined);

// Explicit non-CNY evidence is never replaced by manual confirmation.
for (const patch of [
  { text: text + '\nJPY 1860' }, { rawText: text + '\n日元' }, { rawText: text + '\n1860円' },
  { rawText: text + '\n$1860' }, { currency: 'JPY' },
  { pageMeta: { ...input.pageMeta, currency: 'USD' } },
  { url: input.url + '&currency=JPY' }
]) {
  const conflict = validateBrowserRecord({ ...input, ...patch });
  assert.equal(confirm(conflict).updates.length, 0, JSON.stringify(patch));
  assert.equal(confirm(conflict).rejected.length, 1, JSON.stringify(patch));
  assert.equal(hydrateRecord({ ...conflict, currencyReview: reviewed.currencyReview }).currencyReview, undefined);
}

// Query/source/record scope, existing draft state and original quote age remain binding.
assert.equal(confirm(record, { ...selection, source: 'ly' }).updates.length, 0);
assert.equal(confirm(record, { ...selection, queryId: query.id.replace('20261231', '20270101') }).updates.length, 0);
assert.equal(confirm({ ...record, status: 'archived' }).updates.length, 0);
const stale = validateBrowserRecord({ ...input, capturedAt: new Date(now - 86400001).toISOString() }, { historical: true });
assert.equal(confirm(stale).updates.length, 0);
const future = validateBrowserRecord({ ...input, capturedAt: new Date(now + 61000).toISOString() }, { historical: true });
assert.equal(confirm(future).updates.length, 0);
assert.equal(compareRecords([reviewed], query, { now: now + 86400000 }).rows.length, 0);
assert.equal(compareRecords([reviewed], query, { now: now + 86400000 }).stale.length, 1);
assert.throws(() => confirm(record, { ...selection, storageIds: [storageId] }));
assert.throws(() => confirm(record, { ...selection, source: 'google' }));
assert.throws(() => confirm(record, { ...selection, currency: 'JPY' }));
assert.throws(() => confirm(record, selection, { ...context, reviewId: 'from-client' }));
assert.equal(confirm(record, { queryId: query.id, source: 'ctrip', currency: 'CNY', storageIds: [storageId] }).updates.length, 1);
assert.equal(confirmCurrencyReview([], { queryId: query.id, source: 'ctrip', currency: 'CNY', storageIds: [storageId] }, context).rejected.length, 1);
const noBatch = validateBrowserRecord({ ...input, batch: undefined });
const legacyReview = confirm(noBatch, { queryId: query.id, source: 'ctrip', currency: 'CNY', storageIds: [storageId] }).updates[0].record;
assert.equal(legacyReview.currencyReview.batch, null); assert.equal(hydrateRecord(legacyReview).normalized.eligible, true);

// Currency confirmation clears only currency uncertainty, never other product qualifications.
for (const restriction of ['人数限制', '年龄限制', '2人起订', '至少2人', '会员专享', '新客价', '券后价']) {
  const restricted = validateBrowserRecord({ ...input, rawText: text + '\n' + restriction });
  const confirmed = confirm(restricted).updates[0].record;
  assert.equal(confirmed.normalized.eligible, false, restriction);
  assert.match(confirmed.normalized.reason, /资格限制/);
}
for (const unrestricted of ['无人数限制', '不限人数', '无年龄限制', '无需领券', '1成人']) {
  assert.equal(confirm(validateBrowserRecord({ ...input, rawText: text + '\n' + unrestricted })).updates[0].record.normalized.eligible, true, unrestricted);
}
for (const patch of [
  { captureIssues: [...input.captureIssues, '礼包金额尚未核验'] },
  { observedCabin: undefined, cabinEvidence: undefined },
  { pageMeta: { ...input.pageMeta, adults: 2 } }
]) {
  const pending = confirm(validateBrowserRecord({ ...input, ...patch })).updates[0].record;
  assert.equal(pending.normalized.eligible, false, JSON.stringify(patch));
  assert.equal(pending.normalized.currencyEvidence, 'user-confirmed');
}
const taxUnknown = validateBrowserRecord({ ...input, text: text.replace('含税总价', '显示价'), rawText: text.replace('含税总价', '显示价'), pageMeta: { ...input.pageMeta, taxIncluded: undefined } });
assert.equal(confirm(taxUnknown).updates[0].record.normalized.taxIncluded, null);
const taxExcluded = validateBrowserRecord({ ...input, text: text.replace('含税总价', '不包含税费') });
assert.equal(confirm(taxExcluded).updates[0].record.normalized.taxIncluded, false);
// Rehydrate existing Ctrip captures without rereading: the original dedicated
// flight/product raw evidence still contains its standalone tax heading.
const ctripTaxRaw = '春秋航空日本\nIJ006 波音737(中)\n08:55\n浦东国际机场T2\n13:00\n成田国际机场T3\n3小时5分航班详情\n含税价\n收起\n经济舱退改签|行李规定境外电子凭证\n¥1860\n预订';
const rawTaxInput = { ...input, cardEvidence: 'ctrip-visible-dom:flight-item>flight-box+flight-seats', text: '08:55 PVG\n13:00 NRT\nIJ006 春秋航空日本 直飞\n¥1860\n经济舱', rawText: ctripTaxRaw, pageMeta: { ...input.pageMeta, taxIncluded: undefined } };
const rawTaxRecord = validateBrowserRecord(rawTaxInput);
assert.equal(rawTaxRecord.normalized.taxIncluded, true); assert.equal(rawTaxRecord.normalized.eligible, true);
const rawTaxReviewed = confirm(rawTaxRecord).updates[0].record;
assert.equal(hydrateRecord(rawTaxReviewed).normalized.taxIncluded, true);
assert.equal(hydrateRecord(rawTaxReviewed).normalized.eligible, true);
const rawTaxRestricted = confirm(validateBrowserRecord({ ...rawTaxInput, rawText: ctripTaxRaw + '\n人数限制' })).updates[0].record;
assert.equal(rawTaxRestricted.normalized.taxIncluded, true); assert.equal(rawTaxRestricted.normalized.eligible, false);
assert.match(rawTaxRestricted.normalized.reason, /资格限制/);
assert.equal(confirm(validateBrowserRecord({ ...rawTaxInput, rawText: ctripTaxRaw + '\n不包含税费' })).updates[0].record.normalized.taxIncluded, false);

// Old LY captures lost the next-day arrival offset; confirming CNY cannot unlock them.
const overnightText = '23:00 PVG\n07:00 NRT\nNH920 全日空 直飞\n¥1,860\n经济舱 含税总价';
const overnightRaw = overnightText + '\n07:00\n1月1日 周五';
const ly = validateBrowserRecord({ ...input, url: 'https://www.ly.com/iflight/search', text: overnightText, rawText: overnightRaw, captureIssues: ['同程页面未能明确核验币种，暂不参与比价'] });
const lySelection = { ...selection, source: 'ly' };
const lyReviewed = confirm(ly, lySelection).updates[0].record;
assert.equal(lyReviewed.normalized.eligible, false); assert.match(lyReviewed.normalized.reason, /跨日日期/);
const fixedOvernight = validateBrowserRecord({ ...input, url: ly.url, text: overnightText.replace('07:00 NRT', '07:00+1 NRT'), rawText: overnightRaw, captureIssues: ly.captureIssues });
assert.equal(confirm(fixedOvernight, lySelection).updates[0].record.normalized.eligible, true);
for (const marker of ['次日', '+1']) {
  const unresolved = validateBrowserRecord({ ...input, url: ly.url, text: overnightText, rawText: overnightText + '\n' + marker, captureIssues: ly.captureIssues });
  assert.equal(confirm(unresolved, lySelection).updates[0].record.normalized.eligible, false);
}
// Same price/flight with different product terms must not overwrite each other in storage.
assert.notEqual(await recordStorageId(record), await recordStorageId(validateBrowserRecord({ ...input, rawText: text + '\n人数限制' })));
assert.notEqual(await recordStorageId(record), await recordStorageId(validateBrowserRecord({ ...input, captureIssues: [...input.captureIssues, '礼包金额尚未核验'] })));
console.log('PASS: scoped server-only CNY confirmation; forged review rejection; explicit currency conflicts; stale preservation; other qualifications/tax/cabin unchanged; old cross-day capture guard; product evidence IDs.');

const starting = validateBrowserRecord({...input, text: text.replace("¥1,860", "¥1,860起")});
assert.equal(starting.normalized.eligible,true); assert.equal(starting.normalized.priceKind,"from");
for(const patch of [{rawText:text+" 日元"},{rawText:text+" $1860"},{url:input.url+"&currency=JPY"}]) assert.equal(validateBrowserRecord({...input,...patch}).normalized.eligible,false);
