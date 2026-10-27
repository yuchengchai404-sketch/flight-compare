import { normalizeQuery } from './flight-query.mjs';

function captureTime(record) { const n = Date.parse(record.capturedAt); return Number.isFinite(n) ? n : -Infinity; }
function collectionKey(record) {
  return typeof record.batch === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(record.batch)
    ? `batch:${record.batch.toLowerCase()}` : `time:${captureTime(record)}`;
}
function stableId(record) { return String(record.storageId || record.id || record.text || ''); }
function lowerOffer(a, b) {
  return total(a.normalized) - total(b.normalized) || captureTime(b) - captureTime(a) || stableId(a).localeCompare(stableId(b));
}
function identity(record) {
  const n = record.normalized;
  if (!Array.isArray(n.legs) || !n.legs.length) return undefined;
  const meta = record.pageMeta || record.metadata || {};
  return JSON.stringify([record.source, n.tripType, n.direction, meta.date || meta.out, meta.back || meta.returnDate, meta.adults, meta.cabin, n.legs.map(l => [
    l.from, l.to, l.date, l.departureTime, l.arrivalTime, l.arrivalDayOffset || 0,
    l.airline || l.flight || '', l.direct
  ])]);
}
export function compareRecords(records, query, options = {}) {
  const q = normalizeQuery(query), now = Number.isFinite(options.now) ? options.now : Date.now();
  const flights = new Map(), pending = [], stale = [], rows = [];
  let unresolved = 0;
  for (const c of records) {
    const n = c.normalized;
    if (!n || n.queryId !== q.id || c.status === 'archived') continue;
    if (options.direct && (!n.legs?.length || !n.legs.every(l => l.direct === true))) continue;
    if (options.source && options.source !== 'all' && c.source !== options.source) continue;
    const timestamp = captureTime(c);
    // A malformed/future clock must not supersede a valid current observation.
    if (!Number.isFinite(timestamp) || timestamp > now + 60000) { stale.push(c); continue; }
    const key = identity(c) || `unresolved:${stableId(c) || ++unresolved}`;
    const collections = flights.get(key) || new Map();
    const batch = collectionKey(c), collection = collections.get(batch) || { key: batch, time: -Infinity, records: [] };
    collection.time = Math.max(collection.time, timestamp); collection.records.push(c);
    collections.set(batch, collection); flights.set(key, collections);
  }
  for (const collections of flights.values()) {
    // Never borrow an older low fare when the newest collection is pending.
    // Legacy records without a batch may join only at an identical timestamp;
    // a guessed time window could combine different user searches.
    const latest = [...collections.values()].sort((a, b) => b.time - a.time || a.key.localeCompare(b.key))[0];
    const cheapest = new Map();
    for (const c of latest.records) {
      const n = c.normalized;
      if (now - captureTime(c) > 86400000) { stale.push(c); continue; }
      if (!n.eligible || !Number.isFinite(total(n)) || total(n) <= 0 || n.currency !== 'CNY' || !Array.isArray(n.legs) || !n.legs.length) { pending.push(c); continue; }
      if (options.direct && !n.legs.every(l => l.direct === true)) continue;
      if (options.daytime && !n.legs.every(l => l.departureTime >= '10:00' && l.departureTime <= '17:00')) continue;
      // Only compare prices with the same tax scope. A cheaper untaxed/unknown
      // product must not hide a verified tax-inclusive offer from this batch.
      const taxScope = n.taxIncluded === true ? 'included' : n.taxIncluded === false ? 'excluded' : 'unknown';
      const previous = cheapest.get(taxScope);
      if (!previous || lowerOffer(c, previous) < 0) cheapest.set(taxScope, c);
    }
    rows.push(...cheapest.values());
  }
  rows.sort(lowerOffer);
  return {
    rows, pending, stale,
    outbound: rows.filter(c => c.normalized.tripType === 'oneway' && c.normalized.direction === 'outbound'),
    return: rows.filter(c => c.normalized.tripType === 'oneway' && c.normalized.direction === 'return'),
    roundtrip: rows.filter(c => c.normalized.tripType === 'roundtrip'),
    split: rows.filter(c => c.normalized.tripType === 'split')
  };
}
export function total(n) {
  if (!n || typeof n.price !== 'number' || !Number.isFinite(n.price) || n.price <= 0) return NaN;
  if (typeof n.totalPrice === 'number' && Number.isFinite(n.totalPrice) && n.totalPrice > 0) return n.totalPrice;
  if (n.priceBasis === 'per-person') return Number.isInteger(n.passengers) && n.passengers > 0 ? n.price * n.passengers : NaN;
  if (n.priceBasis === 'party-total' || n.passengers === 1) return n.price;
  return NaN;
}
