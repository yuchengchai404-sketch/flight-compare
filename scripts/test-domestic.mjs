import {normalizeQuote} from '../lib/quote-normalize.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {providerSearchUrl,isDomesticQuery} from '../lib/provider-links.mjs';
import {normalizeQuery} from '../lib/flight-query.mjs';
import {normalizeDomesticFliggy,domesticCabins} from '../lib/domestic-api.mjs';
import {apiQuotes,apiDate} from '../lib/api-quotes.mjs';
const q=normalizeQuery({from:'SHA',to:'BJS',out:'2027-01-01',back:'2027-01-03',adults:1,cabin:'economy',tripType:'roundtrip'});
assert.equal(isDomesticQuery(q),true);assert.equal(isDomesticQuery({...q,to:'HKG'}),false);
const core=globalThis.flightProviderSearchCore;
for(const direction of ['outbound','return']){
 const u=providerSearchUrl('ly',q,direction),m=core.inspectLyDomesticUrl(u);
 assert.equal(new URL(u).pathname,direction==='return'?'/flights/itinerary/oneway/PEK-SHA':'/flights/itinerary/oneway/SHA-PEK');
 assert.equal(m.from,direction==='return'?'BJS':'SHA');assert.equal(m.date,direction==='return'?q.back:q.out);
 assert.equal(core.inspectLyDomesticUrl(u.replace('childticket=0%2C0','childticket=1%2C0')),null);
}
assert.equal(providerSearchUrl('ly',q,'roundtrip'),'https://www.ly.com/flights/home');
const flight={flightNumber:'FM9103',departureTime:'2027-01-01 07:00',arrivalTime:'2027-01-01 09:00',type:'直飞'};
const detail={successCode:true,flightInfo:[flight],cabinInfo:[{basePrice:'470',totalTax:'50',cabinClass:'经济舱',buyCondition:''},{basePrice:'400',totalTax:'50',cabinClass:'经济舱',buyCondition:'限12-81周岁'},{basePrice:'399',totalTax:'50',cabinClass:'经济舱'}]};
assert.deepEqual(domesticCabins(flight,detail).map(x=>x.priceWithTax),[520]);
assert.equal(domesticCabins({...flight,type:'经停'},detail).length,0);
const response=(date,from,to)=>({status:0,data:{itemList:[{adultPrice:'¥470.0',journeys:[{journeyType:'直达',segments:[{depStationCode:from,arrStationCode:to,depDateTime:date+' 10:00:00',arrDateTime:date+' 12:00:00',seatClassName:'经济舱',marketingTransportNo:'FM9103'}]}]}]}});
const snapshot=normalizeDomesticFliggy([response(q.out,'SHA','PKX'),response(q.back,'PKX','SHA')],apiDate(q));
assert.equal(snapshot.items[0].price,940);assert.equal(snapshot.items[0].ticketType,'split');assert.equal(apiQuotes([snapshot],q)[0].normalized.eligible,true);assert.equal(apiQuotes([snapshot],q)[0].normalized.taxIncluded,null);
const bad=response(q.out,'SHA','PKX');bad.data.itemList[0].adultPrice='JPY470';assert.equal(normalizeDomesticFliggy([bad,response(q.back,'PKX','SHA')],q.id).items.length,0);
const node=(innerText,map={})=>({innerText,map});
const head=node('上海航空FM9103 07:00 虹桥机场T2 2h0m 09:00 大兴机场 ¥469起');
head.map={'.flight-item-name':[node('上海航空FM9103')],'.f-startTime > strong':[node('07:00')],'.f-endTime > strong':[node('09:00')],'.f-startTime em':[node('虹桥机场T2')],'.f-endTime em':[node('大兴机场')],'.f-line-to':[node('2h0m')]};
const product=node('提前退票免费 ¥469 3.2折经济舱', {'.price-show strong':[node('¥469')],'.price-show .gray-style':[node('3.2折经济舱')]});
const item=node('',{'.flight-item-head':[head],'.cabins-item':[product]});
const mock={...core,blocked(){},all(s,r){return r?r.map?.[s]||[]:s==='.flight-item'?[item]:s==='.flight-item-head'?[head]:[];}};
const ctx=vm.createContext({flightProviderSearchCore:mock,location:{href:providerSearchUrl('ly',q)},Date,Error});
vm.runInContext(fs.readFileSync(new URL('../browser-helper/ly-domestic-adapter.js',import.meta.url),'utf8'),ctx);
assert.equal(ctx.flightLyDomesticAdapter.inspect(q).from,'SHA');
assert.equal(ctx.flightLyDomesticAdapter.cards().length,1);assert.match(ctx.flightLyDomesticAdapter.cards()[0].innerText,/¥469/);
head.innerText+=' 经停';assert.equal(ctx.flightLyDomesticAdapter.cards().length,0);head.innerText=head.innerText.replace(' 经停','');
product.innerText+=' 限12-81周岁';assert.match(ctx.flightLyDomesticAdapter.cards()[0].captureIssues.join(),/年龄/);
console.log('PASS domestic route separation, reverse dates, exact visible LY product price, stop and age exclusion, API split/tax/qualification guards. Live extension acceptance still required.');

const quote={source:'ly',query:q,tripType:'oneway',direction:'outbound',pageMeta:{from:'SHA',to:'BJS',date:q.out,adults:1,cabin:'economy',tripType:'oneway',verified:true,currency:'CNY',cabinScope:['economy','business'],cabinEvidence:'per-card-required'},observedCabin:'economy'};
for(const label of ['经济舱3.2折','3.2折经济舱','全价经济舱']){
 const text='FM9103 SHA → PKX 07:00 → 09:00 直飞 '+label+' ¥470';
 assert.equal(normalizeQuote({...quote,text,rawText:text,cabinEvidence:label}).eligible,true,label);
}
for(const label of ['超级经济舱3.2折','经济舱/商务舱','经济舱优惠未知']){
 const text='FM9103 SHA → PKX 07:00 → 09:00 直飞 '+label+' ¥470';
 assert.equal(normalizeQuote({...quote,text,rawText:text,cabinEvidence:label}).eligible,false,label);
}
