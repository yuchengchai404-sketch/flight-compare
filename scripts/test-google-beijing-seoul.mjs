import assert from 'node:assert/strict';
import '../browser-helper/query-core.js';
import '../browser-helper/google-search-core.js';
const core=globalThis.flightGoogleSearchCore;
const query={from:'BJS',to:'SEL',out:'2027-03-02',back:'2027-03-09',adults:1,cabin:'economy',tripType:'roundtrip'};
// Verified live: Beijing city, Seoul city, one-way, March 2, CNY, 16 results.
const observed='https://www.google.com/travel/flights/search?tfs=CBwQAhooEgoyMDI3LTAzLTAyagwIAxIIL20vMDE5MTRyDAgDEggvbS8waHNxZkABSAFwAYIBCwj___________8BmAEC&hl=zh-CN&curr=CNY';
assert.equal(core.searchUrl(query),observed);
assert.equal(core.inspect(observed).from,'BJS');
assert.equal(core.inspect(observed).to,'SEL');
for(const direction of ['outbound','return'])for(const adults of [1,2])for(const cabin of ['economy','business']){
 const meta=core.inspect(core.searchUrl({...query,adults,cabin},direction));
 assert.equal(meta.from,direction==='return'?'SEL':'BJS');
 assert.equal(meta.to,direction==='return'?'BJS':'SEL');
 assert.equal(meta.date,direction==='return'?query.back:query.out);
 assert.equal(meta.adults,adults);assert.equal(meta.cabin,cabin);
}
console.log('Beijing/Seoul observed URL regression passed');
