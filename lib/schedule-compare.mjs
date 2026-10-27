import {total} from './compare.mjs';
// These are schedule candidates, not a claim of identical flight/fare products.
export function scheduleComparisons(records){
 const groups=new Map();
 for(const record of records){const n=record.normalized;
  if(!n?.eligible||n.currency!=='CNY'||n.taxIncluded!==true||!n.legs?.length||!Number.isFinite(total(n)))continue;
  const key=JSON.stringify([n.queryId,n.tripType,n.direction,n.passengers,n.legs.map(l=>[l.from,l.to,l.date,l.departureTime,l.arrivalTime,l.arrivalDayOffset||0])]);
  const g=groups.get(key)||{key,legs:n.legs,offers:[],providers:[]};g.offers.push(record);groups.set(key,g);
 }
 return [...groups.values()].map(g=>{g.providers=[...new Set(g.offers.map(x=>x.source))].sort();g.offers.sort((a,b)=>total(a.normalized)-total(b.normalized));const lows=g.providers.map(p=>Math.min(...g.offers.filter(x=>x.source===p).map(x=>total(x.normalized))));return {...g,minimum:Math.min(...lows),spread:Math.max(...lows)-Math.min(...lows)};}).filter(g=>g.providers.length>1).sort((a,b)=>a.minimum-b.minimum||a.key.localeCompare(b.key));
}
export function fareTerms(raw){
 const lines=String(raw||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 return {baggage:[...new Set(lines.filter(x=>/托运|手提行李|随身行李/.test(x)))].slice(0,2).join('；')||'行李信息未采集',rules:[...new Set(lines.filter(x=>/退票|改期|不得退改|免费退改|退改以/.test(x)))].slice(0,2).join('；')||'退改信息未采集'};
}
