import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {googleSingleUrl,googleSingleMeta} from '../lib/google-single.mjs';
import {normalizeQuote} from '../lib/quote-normalize.mjs';
const observed=JSON.parse(readFileSync(new URL('./fixtures/google-observed-20261015.json',import.meta.url)));
for(const [key,to,cabin] of [['premiumUrl','NRT','premium_economy'],['firstUrl','NRT','first'],['bangkokUrl','BKK','first'],['londonUrl','LON','first'],['parisUrl','PAR','first'],['nycUrl','NYC','first']]){
 const m=googleSingleMeta(observed[key]);assert.equal(m.from,'PVG');assert.equal(m.to,to);assert.equal(m.cabin,cabin);assert.equal(m.date,'2027-03-02');
}
for(const to of ['BKK','LON','PAR','NYC'])for(const cabin of ['economy','premium_economy','business','first'])for(const adults of [1,2]){
 const q={from:'SHA',to,out:'2027-03-02',back:'2027-03-09',adults,cabin,tripType:'roundtrip'};
 for(const dir of ['outbound','return']){const m=googleSingleMeta(googleSingleUrl(q,dir));assert.equal(m.cabin,cabin);assert.equal(m.adults,adults);assert.equal(m.from,dir==='return'?to:'SHA');assert.equal(m.to,dir==='return'?'SHA':to);}
}
function quote(label,cabin='first') {const query={from:'PVG',to:'NRT',out:'2027-03-02',adults:1,cabin,tripType:'oneway'};return normalizeQuote({source:'google',query,direction:'outbound',tripType:'oneway',text:`17:15 – 15:50 +1\nPVG–NRT\n经停 1 次\nCNY 22251 含税\n${label}`,pageMeta:{verified:true,from:'PVG',to:'NRT',date:query.out,adults:1,cabin,tripType:'oneway',currency:'CNY'}});}
assert.equal(quote('商务舱 + 头等舱').eligible,false);
assert.equal(quote('business class + first class').eligible,false);
assert.equal(quote('经济舱＋豪华经济舱','premium_economy').eligible,false);
assert.equal(quote('头等舱').eligible,true);
assert.equal(quote('豪华经济舱','premium_economy').eligible,true);
console.log('PASS observed city/cabin fixtures, 64 generated directions, mixed-cabin exclusion');
