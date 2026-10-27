import assert from 'node:assert/strict';
import {apiQuotes,apiDate} from '../lib/api-quotes.mjs';
import {compareRecords} from '../lib/compare.mjs';
const q={from:'SHA',to:'TYO',out:'2026-12-31',back:'2027-01-04',adults:1,cabin:'economy',tripType:'roundtrip'};
const now=Date.parse('2026-10-12T08:00:00Z');
const fare={price:3000,taxVerified:true,ticketType:'roundtrip',legs:[{from:'PVG',to:'NRT',departure:'2026-12-31 13:00',arrival:'2026-12-31 17:00',cabin:'经济舱',direct:true},{from:'HND',to:'SHA',departure:'2027-01-04 14:00',arrival:'2027-01-04 16:00',cabin:'经济舱',direct:true}]};
const snapshot={date:'20261231',source:'fliggy',status:'success',checkedAt:new Date(now).toISOString(),items:[fare]};
const records=apiQuotes([snapshot,{...snapshot,source:'tuniu',items:[{...fare,price:2800,ticketType:'split'}]}],q);
const results=compareRecords(records,q,{now});assert.equal(results.roundtrip.length,1);assert.equal(results.split.length,1);assert.equal(results.outbound.length,0);assert.equal(results.rows.length,2);
for(const change of [{from:'PEK'},{adults:2},{cabin:'business'},{tripType:'oneway',back:undefined}]){assert.equal(apiDate({...q,...change}),null);assert.equal(apiQuotes([snapshot],{...q,...change}).length,0);}
for(const change of [{price:0},{ticketType:'split'},{legs:[fare.legs[0]]},{legs:[{...fare.legs[0],cabin:'经济舱/商务舱'},fare.legs[1]]},{legs:[{...fare.legs[0],from:'PEK'},fare.legs[1]]},{legs:[{...fare.legs[0],departure:'2026-12-30 13:00'},fare.legs[1]]}])assert.equal(apiQuotes([{...snapshot,items:[{...fare,...change}]}],q)[0].normalized.eligible,false);
assert.equal(compareRecords(records,q,{now:now+86400001}).rows.length,0);
assert.equal(compareRecords(apiQuotes([{...snapshot,checkedAt:'bad'}],q),q,{now}).rows.length,0);
assert.equal(apiQuotes([{...snapshot,items:[{...fare,taxVerified:false}]}],q)[0].normalized.taxIncluded,null);
assert.equal(apiQuotes([{...snapshot,date:'20270101'}],q).length,0);
console.log('API quote isolation, freshness, scope and eligibility passed');

const custom={...q,to:'OSA',out:'2027-03-02',back:'2027-03-09'};assert.ok(apiDate(custom).startsWith('q-SHA-OSA-20270302'));assert.equal(apiQuotes([snapshot],custom).length,0);const cf={...fare,legs:[{...fare.legs[0],to:'KIX',departure:'2027-03-02 13:00',arrival:'2027-03-02 17:00'},{...fare.legs[1],from:'KIX',departure:'2027-03-09 14:00',arrival:'2027-03-09 16:00'}]};assert.equal(apiQuotes([{...snapshot,date:apiDate(custom),items:[cf]}],custom)[0].normalized.eligible,true);console.log('Custom API date, city and legacy cache isolation passed');
