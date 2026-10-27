import assert from 'node:assert/strict';
import {tokenNeedsRefresh} from '../lib/token-expiry.mjs';
const now = Date.parse('2026-10-20T08:00:00Z');
assert.equal(tokenNeedsRefresh(1792141492346, now), true);
for (const value of [now + 3600000, String(now + 3600000), new Date(now + 3600000).toISOString()]) {
  assert.equal(tokenNeedsRefresh(value, now), false);
}
for (const value of [now - 1, now + 60000, new Date(now - 1).toISOString(), undefined, null, '', 'bad']) {
  assert.equal(tokenNeedsRefresh(value, now), true);
}
console.log('Official CLI numeric expiry, ISO expiry and missing expiry refresh checks passed');
