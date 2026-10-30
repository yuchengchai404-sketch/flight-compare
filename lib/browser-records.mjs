import { normalizeQuery, legQuery, routeMatches, cabins } from './flight-query.mjs';
import { normalizeQuote } from './quote-normalize.mjs';
import { googleSingleMeta } from './google-single.mjs';
import { validatedCurrencyReview, currencyReviewedInput } from './currency-review.mjs';

import '../browser-helper/provider-search-core.js';
const providers = { 'google.com': 'google', 'ctrip.com': 'ctrip', 'ly.com': 'ly', 'sjipiao.fliggy.com':'fliggy' };
const legacy = { '20261231': { out: '2026-12-31', back: '2027-01-04' }, '20270101': { out: '2027-01-01', back: '2027-01-05' } };
export function captureQuery(c) {
  const input = c.query?.from ? c.query : legacy[c.date] ? { from: 'SHA', to: 'TYO', ...legacy[c.date], adults: 1, cabin: 'economy', tripType: 'roundtrip' } : null;
  return normalizeQuery(input);
}
function safeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const safe = {};
  for (const k of ['from', 'to', 'date', 'out', 'back', 'returnDate', 'adults', 'cabin', 'cabinEvidence', 'tripType', 'currency', 'verified', 'taxIncluded', 'priceBasis', 'evidence', 'taxEvidence']) {
    if (['string', 'number', 'boolean'].includes(typeof input[k]) && (typeof input[k] !== 'number' || Number.isFinite(input[k]))) safe[k] = typeof input[k] === 'string' ? input[k].slice(0, 400) : input[k];
  }
  if (Array.isArray(input.cabinScope)) safe.cabinScope = [...new Set(input.cabinScope.filter(x => cabins.includes(x)))].slice(0, 4);
  if (!safe.back && safe.returnDate) safe.back = safe.returnDate;
  return safe;
}
function googleMetadata(url, provided) {
  const actual = googleSingleMeta(url);
  if (!actual) return { meta: { ...provided, verified: false }, issue: 'Google 链接尚不能独立核验单程条件' };
  const disagreement = provided && (
    (provided.from && !routeMatches(actual.from, provided.from)) ||
    (provided.to && !routeMatches(actual.to, provided.to)) ||
    ((provided.date || provided.out) && (provided.date || provided.out) !== actual.date) ||
    (provided.adults !== undefined && Number(provided.adults) !== actual.adults) ||
    (provided.cabin && provided.cabin !== actual.cabin) ||
    (provided.tripType && provided.tripType !== actual.tripType) ||
    (provided.currency && provided.currency !== actual.currency)
  );
  // Never substitute one passenger or economy when an encoding is unknown.
  const complete = actual.adults >= 1 && actual.adults <= 9 && typeof actual.cabin === 'string' && actual.currency === 'CNY';
  const meta = { ...provided, ...actual, evidence: 'google-search-url', verified: Boolean(complete && !disagreement) };
  return { meta, issue: disagreement ? '采集条件与 Google 实际链接不一致' : complete ? undefined : 'Google 人数、舱位或币种尚不能独立核验' };
}
export function validateBrowserRecord(c, { historical = false, trustedReview = undefined } = {}) {
  if (!c || typeof c.id !== 'string' || !/^[-a-z0-9]{16,80}$/i.test(c.id)) throw Error('报价记录编号无效');
  if (typeof c.text !== 'string' || c.text.trim().length < 20 || c.text.length > 4000) throw Error('报价原文过长或不完整');
  const u = new URL(c.url);
  const source = Object.entries(providers).find(([h]) => u.hostname === h || u.hostname.endsWith('.' + h))?.[1];
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !source || u.href.length > 9000) throw Error('报价来源不在支持范围');
  if (source === 'google' && !/^\/travel\/flights(?:\/|$)/.test(u.pathname)) throw Error('请在 Google 机票结果页读取');
  if (source !== 'google' && !/flight|iflight/i.test(u.hostname + u.pathname)) throw Error('请在官方机票结果页读取');
  if(source==='fliggy'&&u.pathname!=='/flight_search_result.htm')throw Error('请在飞猪国内机票结果页读取');
  const timestamp = Date.parse(c.capturedAt), now = Date.now();
  if (!Number.isFinite(timestamp) || (!historical && (timestamp > now + 60000 || now - timestamp > 86400000))) throw Error('采集时间无效或超过24小时，请重新读取');
  const query = captureQuery(c);
  const allowed = source === 'google' ? ['tfs', 'hl', 'curr', 'tfu', 'q'] : source === 'ly' ? ['para', 'from', 'to', 'date', 'back', 'tripType', 'curr', 'currency'] : ['dcity', 'acity', 'ddate', 'depdate', 'rdate', 'searchTime', 'flightWay', 'army', 'adult', 'child', 'infant', 'cabin', 'classType', 'curr', 'currency'];
  if(source==='fliggy')allowed.splice(0,allowed.length,'tripType','depCity','arrCity','depDate','depCityName','arrCityName');
  for (const key of [...u.searchParams.keys()]) if (!allowed.includes(key)) u.searchParams.delete(key);
  u.hash = '';
  let pageMeta = safeMetadata(c.pageMeta || c.metadata), metadataIssue;
  if(source==='fliggy'){
    const actual=globalThis.flightProviderSearchCore.inspectFliggyUrl(u.href);
    if(!actual||!pageMeta||['from','to','date','tripType','adults','cabin'].some(k=>actual[k]!==pageMeta[k]))metadataIssue='飞猪实际链接与采集条件不一致';
    pageMeta={...pageMeta,...actual,verified:!metadataIssue,cabinScope:['economy'],cabinEvidence:'per-card-required'};
  }
  if (source === 'google') {
    const checked = googleMetadata(u.href, pageMeta);
    pageMeta = checked.meta; metadataIssue = checked.issue;
  }
  // The actual Ctrip y_s URL is a mixed economy/premium-economy search.
  // Requested cabin metadata alone cannot turn it into a verified single cabin.
  if (source === 'ctrip' && u.searchParams.get('cabin') === 'y_s') pageMeta = { ...pageMeta, cabinScope: ['economy', 'premium_economy'], cabinEvidence: 'per-card-required' };
  const directions = query.back ? ['outbound', 'return'] : ['outbound'];
  const inferredDirection = directions.find(direction => {
    const leg = legQuery(query, direction);
    return routeMatches(pageMeta?.from, leg.from) && routeMatches(pageMeta?.to, leg.to) && (pageMeta?.date || pageMeta?.out) === leg.date;
  });
  const direction = c.direction === undefined ? inferredDirection || 'outbound' : ['outbound', 'return'].includes(c.direction) ? c.direction : 'unknown';
  const record = {
    id: c.id, date: query.id, query, source, url: u.href, text: c.text.trim(),
    rawText: typeof c.rawText === 'string' ? c.rawText.trim().slice(0, 8000) : c.text.trim(),
    cardEvidence: typeof (c.cardEvidence || c.evidence) === 'string' ? (c.cardEvidence || c.evidence).slice(0, 400) : undefined,
    evidence: typeof c.evidence === 'string' ? c.evidence.slice(0, 400) : undefined,
    observedCabin: cabins.includes(c.observedCabin) ? c.observedCabin : undefined,
    cabinEvidence: typeof c.cabinEvidence === 'string' ? c.cabinEvidence.trim().slice(0, 120) : undefined,
    captureIssues: Array.isArray(c.captureIssues) ? c.captureIssues.filter(x => typeof x === 'string' && x.trim()).slice(0, 12).map(x => x.trim().slice(0, 400)) : [],
    batch: typeof c.batch === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(c.batch) ? c.batch.toLowerCase() : undefined,
    capturedAt: new Date(timestamp).toISOString(), tripType: ['oneway', 'roundtrip'].includes(c.tripType) ? c.tripType : 'unknown',
    direction, currency: typeof c.currency === 'string' && /^[A-Z]{3}$/i.test(c.currency) ? c.currency.toUpperCase() : undefined, pageMeta,
    status: c.status === 'archived' ? 'archived' : 'draft', schemaVersion: 2
  };
  // Capture submissions never read c.currencyReview. Only hydrate/server review
  // code can supply the separately validated trustedReview option.
  const review = historical && trustedReview ? validatedCurrencyReview(record, trustedReview) : undefined;
  const normalized = normalizeQuote(review ? currencyReviewedInput(record) : record);
  if (review) {
    normalized.currencyEvidence = 'user-confirmed';
    normalized.currencyReview = { currency: 'CNY', confirmedAt: review.confirmedAt, reviewId: review.reviewId };
  }
  if (metadataIssue) {
    normalized.eligible = false;
    normalized.reasons = [...new Set([...normalized.reasons, metadataIssue])];
    normalized.reason = normalized.reasons.join('；');
  }
  return { ...record, ...(review ? { currencyReview: review } : {}), normalized };
}
export function hydrateRecord(c) {
  try { return validateBrowserRecord(c, { historical: true, trustedReview: c.currencyReview }); }
  catch {
    return { ...c, normalized: { eligible: false, reason: '旧版记录缺少可核验的行程条件，请重新查询', reasons: ['旧版记录缺少可核验的行程条件，请重新查询'], queryId: null, legs: [], rawText: c.rawText || c.text || '' } };
  }
}
export async function recordStorageId(c) {
  const q = captureQuery(c), meta = c.pageMeta || c.metadata || {};
  // Quote text makes a changed price a new historical record. The comparison
  // selects the newest offer, while repeated delivery of the same offer is idempotent.
  // Actual page context prevents a mismatched capture replacing a valid record.
  const context = [meta.from, meta.to, meta.date || meta.out, meta.back || meta.returnDate, meta.adults, meta.cabin, meta.tripType, meta.currency, meta.verified === true];
  const productEvidence = [
    String(c.rawText || c.text).replace(/\s+/g, ' ').trim(),
    Array.isArray(c.captureIssues) ? [...new Set(c.captureIssues.filter(x => typeof x === 'string').map(x => x.trim()))].sort() : [],
    c.observedCabin || null, c.cabinEvidence || null
  ];
  const data = JSON.stringify([q.id, c.source, c.tripType, c.direction, context, c.text.replace(/\s+/g, ' ').trim(), productEvidence]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return 'capture:' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export const validQueryId = id => typeof id === 'string' && (/^q-[A-Z]{3}-[A-Z]{3}-\d{8}-(?:\d{8}|single)-a[1-9]-(?:economy|premium_economy|business|first)$/.test(id) || Boolean(legacy[id]));
