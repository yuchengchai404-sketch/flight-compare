import assert from 'node:assert/strict';
import { normalizeQuery } from '../lib/flight-query.mjs';
import { compareRecords } from '../lib/compare.mjs';

// Synthetic product variants for comparison behavior only; never stored as real quotes.
const query = normalizeQuery({ from: 'SHA', to: 'TYO', out: '2026-12-31', back: '2027-01-04', adults: 1, cabin: 'economy', tripType: 'roundtrip' });
const now = Date.parse('2026-10-10T08:00:00Z');
const batchA = '11111111-1111-4111-8111-111111111111';
const batchB = '22222222-2222-4222-8222-222222222222';
function product(id, price, offset, overrides = {}) {
  const { normalized, ...recordOverrides } = overrides;
  return {
    id, source: 'ctrip', status: 'draft', batch: batchB, capturedAt: new Date(now + offset).toISOString(),
    pageMeta: { date: query.out, adults: 1, cabin: 'economy' },
    normalized: { queryId: query.id, eligible: true, tripType: 'oneway', direction: 'outbound',
      currency: 'CNY', price, totalPrice: price, priceBasis: 'party-total', passengers: 1, taxIncluded: true,
      legs: [{ from: 'PVG', to: 'NRT', date: query.out, departureTime: '13:35', arrivalTime: '17:25', arrivalDayOffset: 0, airline: '全日空', flight: 'NH920', direct: true }],
      ...normalized }, ...recordOverrides
  };
}
const sixProducts = [1860, 1877, 1990, 2090, 2120, 2293].map((price, i) => product(`product-${i}`, price, -1000 + i));
for (const input of [sixProducts, [...sixProducts].reverse(), [sixProducts[3], sixProducts[1], sixProducts[5], sixProducts[0], sixProducts[4], sixProducts[2]]]) {
  const result = compareRecords(input, query, { now });
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].normalized.totalPrice, 1860);
}

// A prior batch's cheap price cannot beat the current batch, even when every current product costs more.
let result = compareRecords([product('old-cheap', 900, -60000, { batch: batchA }), ...sixProducts], query, { now });
assert.equal(result.rows[0].normalized.totalPrice, 1860);
// A batch timestamp can differ slightly per product. Never select merely the last product.
result = compareRecords([product('first-low', 1800, -2000), product('last-high', 2200, -1000)], query, { now });
assert.equal(result.rows[0].id, 'first-low');
// Latest pending capture supersedes an earlier verified batch and remains reviewable.
result = compareRecords([product('old-valid', 900, -60000, { batch: batchA }), product('current-pending', 800, -1000, { normalized: { eligible: false, reason: '礼包未核验' } })], query, { now });
assert.equal(result.rows.length, 0); assert.equal(result.pending.length, 1);
// Pending sibling products must never undercut an eligible sibling from the same batch.
result = compareRecords([...sixProducts, product('pending-cheap', 500, -500, { normalized: { eligible: false, reason: '礼包未核验' } })], query, { now });
assert.equal(result.rows[0].normalized.totalPrice, 1860); assert.equal(result.pending.length, 1);

// Tax-inclusive, tax-exclusive and unknown prices remain separate comparison scopes.
result = compareRecords([
  product('tax-included', 1800, -1000), product('tax-included-high', 2000, -900),
  product('tax-excluded', 1500, -800, { normalized: { taxIncluded: false } }),
  product('tax-excluded-high', 1700, -700, { normalized: { taxIncluded: false } }),
  product('tax-unknown', 1400, -600, { normalized: { taxIncluded: null } })
], query, { now });
assert.equal(result.rows.length, 3);
assert.equal(result.rows.find(x => x.normalized.taxIncluded === true).normalized.totalPrice, 1800);
assert.equal(result.rows.find(x => x.normalized.taxIncluded === false).normalized.totalPrice, 1500);
assert.equal(result.rows.find(x => x.normalized.taxIncluded === null).normalized.totalPrice, 1400);

// Legacy rows without a saved batch share a collection only at exactly the same timestamp.
result = compareRecords([product('legacy-low', 1800, -1000, { batch: undefined }), product('legacy-high', 2000, -1000, { batch: undefined })], query, { now });
assert.equal(result.rows[0].normalized.totalPrice, 1800);
result = compareRecords([product('legacy-older', 1800, -1001, { batch: undefined }), product('legacy-newer', 2000, -1000, { batch: undefined })], query, { now });
assert.equal(result.rows[0].normalized.totalPrice, 2000);
// Invalid batch IDs must not accidentally combine observations from different times.
result = compareRecords([product('invalid-older', 1800, -1001, { batch: 'invalid' }), product('invalid-newer', 2000, -1000, { batch: 'invalid' })], query, { now });
assert.equal(result.rows[0].normalized.totalPrice, 2000);

// Compare normalized party totals, rather than mixing per-person and party-total figures.
const multiQuery = normalizeQuery({ ...query, adults: 2 });
const multi = (id, price, totalPrice, basis) => product(id, price, -1000, { pageMeta: { date: query.out, adults: 2, cabin: 'economy' }, normalized: { queryId: multiQuery.id, totalPrice, priceBasis: basis, passengers: 2 } });
result = compareRecords([multi('per-person', 1000, 2000, 'per-person'), multi('party-total', 1900, 1900, 'party-total')], multiQuery, { now });
assert.equal(result.rows[0].id, 'party-total');

const future = product('future', 500, 61000, { batch: batchA });
result = compareRecords([future, ...sixProducts], query, { now });
assert.equal(result.rows[0].normalized.totalPrice, 1860); assert.equal(result.stale.length, 1);
const expired = product('expired', 500, -86401000, { batch: batchA });
assert.equal(compareRecords([expired], query, { now }).rows.length, 0);
assert.equal(compareRecords([expired], query, { now }).stale.length, 1);
// Flight/source/query separation and existing filters remain in force.
const otherSource = product('other-source', 1700, -1000, { source: 'ly' });
result = compareRecords([...sixProducts, otherSource], query, { now });
assert.equal(result.rows.length, 2);
assert.equal(compareRecords([...sixProducts, otherSource], query, { now, source: 'ctrip', direct: true, daytime: true }).rows.length, 1);
assert.equal(compareRecords(sixProducts, { ...query, out: '2027-01-01' }, { now }).rows.length, 0);
assert.equal(compareRecords(sixProducts.map(c => ({ ...c, status: 'archived' })), query, { now }).rows.length, 0);
console.log('PASS: latest collection priority; deterministic lowest product per tax scope; pending and stale isolation; legacy timestamp fallback; normalized multi-passenger totals.');
