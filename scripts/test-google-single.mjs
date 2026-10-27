import assert from 'node:assert/strict';
import '../browser-helper/google-search-core.js';
import {validateCapture} from '../lib/browser-capture.mjs';
const core=globalThis.flightGoogleSearchCore;
const observed='https://www.google.com/travel/flights/search?tfs=CBwQAhooEgoyMDI2LTEyLTMxagwIAxIIL20vMDZ3amZyDAgDEggvbS8wN2Rma0ABSAFwAYIBCwj___________8BmAEC&hl=zh-CN&curr=CNY';
assert.deepEqual(core.inspect(observed),{from:'SHA',to:'TYO',adults:1,cabin:'economy',tripType:'oneway',direction:'outbound',date:'2026-12-31',currency:'CNY'});
// Regression: our previous generated URL had field2=1 and field19=1.
const broken=observed.replace('CBwQAh','CBwQAQ').replace('mAEC','mAEB');
assert.equal(core.inspect(broken),undefined);
const text='15:00 – 18:40\n春航\n直达\nPVG–NRT\n¥1,900\n单程票价';
const query={id:'20261231',from:'SHA',to:'TYO',adults:1,cabin:'economy',tripType:'roundtrip',out:'2026-12-31',back:'2027-01-04'};
assert.equal(core.searchUrl(query,'outbound'),observed);
const result=validateCapture({id:'single-test-20261231',capturedAt:new Date().toISOString(),date:query.id,query,url:observed,text,tripType:'oneway',direction:'outbound',kind:'visible-quote-draft'});
assert.equal(result.tripType,'oneway');
assert.equal(result.direction,'outbound');
for(const q of [query,{...query,out:'2027-01-01',back:'2027-01-05'}]){
 for(const direction of ['outbound','return']){
  const url=core.searchUrl(q,direction);
  assert.deepEqual(core.inspect(url),{from:direction==='outbound'?'SHA':'TYO',to:direction==='outbound'?'TYO':'SHA',adults:1,cabin:'economy',tripType:'oneway',direction,date:direction==='outbound'?q.out:q.back,currency:'CNY'});
  assert.equal(new URL(url).searchParams.get('tfs').startsWith('CBwQAh'),true);
 }
}
assert.throws(()=>validateCapture({id:'single-test-20261231',capturedAt:new Date().toISOString(),date:query.id,query,url:observed,text:text.replace('单程票价','往返票价'),tripType:'oneway',direction:'outbound'}));
console.log('PASS: observed Google single URL accepted; old broken URL rejected; all four generated date/direction URLs; server single/round-trip isolation.');


