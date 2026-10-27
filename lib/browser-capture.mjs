import {googleSingleMeta} from './google-single.mjs';
const domains={'google.com':'google','skyscanner.net':'skyscanner','ctrip.com':'ctrip','ly.com':'ly','ch.com':'spring','airchina.com.cn':'airchina','ceair.com':'ceair','ana.co.jp':'ana','jal.co.jp':'jal'};
export function validateCapture(c){if(!c||!/^[-a-z0-9]{16,50}$/i.test(c.id)||!['20261231','20270101'].includes(c.date)||typeof c.text!=='string'||c.text.length<25||c.text.length>2500)throw Error('报价草稿格式无效');const u=new URL(c.url);if(u.protocol!=='https:')throw Error('只接受官方 HTTPS 页面');const source=Object.entries(domains).find(([h])=>u.hostname===h||u.hostname.endsWith('.'+h))?.[1];if(!source)throw Error('报价来源不在支持范围');if(!Number.isFinite(Date.parse(c.capturedAt))||Math.abs(Date.now()-Date.parse(c.capturedAt))>86400000)throw Error('采集时间无效或超过24小时');if(source==='google'){for(const key of Array.from(u.searchParams.keys()))if(!['tfs','hl','curr','tfu'].includes(key))u.searchParams.delete(key);}else u.search='';u.hash='';let single;if(c.tripType==='oneway'){single=googleSingleMeta(u.href);const expected=single?.direction==='outbound'?(c.date==='20261231'?'2026-12-31':'2027-01-01'):(c.date==='20261231'?'2027-01-04':'2027-01-05');if(source!=='google'||!single||single.currency!=='CNY'||single.date!==expected||single.direction!==c.direction||/往返票价|往返总价|round.?trip/i.test(c.text))throw Error('报价不是当前日期的人民币单程查询');}return {id:c.id,date:c.date,text:c.text,url:u.href,source,tripType:single?'oneway':undefined,direction:single?.direction,currency:single?.currency,batch:/^[a-f0-9-]{36}$/i.test(c.batch||'')?c.batch:undefined,capturedAt:c.capturedAt,status:'draft'};}
export function validateFare(f,c){const out=c.date==='20261231'?'2026-12-31':'2027-01-01',back=c.date==='20261231'?'2027-01-04':'2027-01-05';if(f.currency!=='CNY'||typeof f.price!=='number'||!Number.isFinite(f.price)||f.price<=0||f.price>1000000||f.attested!==true||typeof f.direct!=='boolean'||typeof f.taxVerified!=='boolean'||!Array.isArray(f.legs)||f.legs.length!==2)throw Error('请核验人民币往返总价及完整航段');const legs=f.legs.map((l,i)=>{if(!/^[A-Z0-9]{2}\d{1,4}$/.test(l.flight)||!['经济舱','商务舱','头等舱'].includes(l.cabin)||typeof l.airline!=='string'||l.airline.length>60)throw Error('航班号或舱位无效');const from=i?['NRT','HND']:['PVG','SHA'],to=i?['PVG','SHA']:['NRT','HND'];if(!from.includes(l.from)||!to.includes(l.to))throw Error('往返机场方向无效');if(!/^\d{4}-\d{2}-\d{2}T[0-2]\d:[0-5]\d$/.test(l.departure)||!/^\d{4}-\d{2}-\d{2}T[0-2]\d:[0-5]\d$/.test(l.arrival)||l.departure.slice(0,10)!==(i?back:out)||!Number.isFinite(Date.parse(l.departure))||!Number.isFinite(Date.parse(l.arrival))||Number(l.departure.slice(11,13))>23||Number(l.arrival.slice(11,13))>23)throw Error('航段当地日期或时间无效');return {...l,direct:f.direct,bag:'行李待核验'};});return {id:c.id,source:c.source,price:f.price,basis:f.taxVerified?'用户核验含税往返总价':'浏览器显示价 · 税费待核验',taxVerified:f.taxVerified,ticketType:'roundtrip',legs,url:c.url,checkedAt:c.capturedAt};}


const shanghai=['PVG','SHA'],tokyo=['NRT','HND'];
const flightPattern=/\b(?:NH|CA|9C|HO|MU|FM|JL|IJ|OZ|KE|CZ|GK|MM|3U)\s?\d{1,4}\b/g;
const airlinePattern=/全日空(?:航空)?|春秋航空日本|春航|春秋航空|韩亚(?:航空)?|大韩航空|南航|中国南方航空|东航|中国东方航空|上航|上海航空|国航|中国国际航空|日本航空|日航|吉祥航空|乐桃航空|捷星日本(?:航空)?/g;
export function suggestFields(text){
 const priceMatches=Array.from(text.matchAll(/(?:CNY|RMB|人民币|¥|￥)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi));
 const prices=[...new Set(priceMatches.map(m=>Number(m[1].replaceAll(',',''))))];
 const flights=Array.from(text.matchAll(flightPattern)).map(m=>m[0].replaceAll(' ',''));
 const timeMatches=Array.from(text.matchAll(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*\+([12]))?/g));
 const times=timeMatches.map(m=>m[0].replace(/\s*\+[12]/,'').padStart(5,'0'));
 const airports=Array.from(text.matchAll(/\b(?:PVG|SHA|NRT|HND)\b/g)).map(m=>m[0]);
 /** @type {Array<null|{from:string,to:string,time?:string,arrivalTime?:string,arrivalDayOffset?:number,flight?:string,airline?:string,direct?:boolean}>} */
 const legs=[null,null];const warnings=[];
 if(airports.length===2||airports.length===4){
  const count=airports.length/2;
  for(let j=0;j<count;j++){
   const from=airports[j*2],to=airports[j*2+1];const index=shanghai.includes(from)&&tokyo.includes(to)?0:tokyo.includes(from)&&shanghai.includes(to)?1:-1;
   if(index<0||legs[index])continue;
   const exactTimes=times.length===count*2;const start=exactTimes?timeMatches[j*2].index:0;const end=exactTimes&&j+1<count?timeMatches[(j+1)*2].index:text.length;
   const segment=text.slice(start,end);const airlines=[...new Set(segment.match(airlinePattern)||[])];
   const direct=/经停\s*[1-9]|中转|转机|\b[1-9]\s*stop/i.test(segment)?false:/直达|直飞|nonstop|non-stop/i.test(segment)?true:undefined;
   legs[index]={from,to,time:exactTimes?times[j*2]:undefined,arrivalTime:exactTimes?times[j*2+1]:undefined,arrivalDayOffset:exactTimes?Number(timeMatches[j*2+1][1]||0):undefined,flight:(segment.match(flightPattern)||[]).length===1?(segment.match(flightPattern)||[])[0].replaceAll(' ',''):undefined,airline:airlines.length===1?airlines[0]:undefined,direct};
  }
 }
 const stage=legs[0]&&legs[1]?'roundtrip':legs[0]?'outbound':legs[1]?'return':'unknown';
 if(stage==='outbound')warnings.push('尚缺回程；此处往返显示价没有确定回程航班');
 if(stage==='return')warnings.push('尚缺去程；需关联同一搜索的已选去程');
 if(stage==='unknown')warnings.push('未能唯一识别机场方向，请核对原文');
 if(prices.length!==1)warnings.push('价格不唯一，请填入最终往返总价');
 if(legs.some(l=>l&&!l.flight))warnings.push('未唯一识别航班号，请展开官网航班详情补全');
 if(timeMatches.length!==legs.filter(Boolean).length*2)warnings.push('时间数量不明确，未自动填入');
 return {price:prices.length===1?prices[0]:undefined,flights,times,airports,legs,stage,warnings};
}
