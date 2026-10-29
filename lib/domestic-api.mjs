import {rpc,fliggy} from './providers.mjs';
import {normalizeTuniu,normalizeFliggy} from './normalize.mjs';
import {searchWithRetry,fliggyItems} from './provider-retry.mjs';
import {airportAliases} from './flight-query.mjs';
const restricted=s=>/周岁|年龄|仅限|限.{0,20}(?:乘客|会员|多人)|学生|青年|老人|长者|新客|券后|需领券|多人特惠|首单|会员专享/.test(s);
const money=x=>typeof x==='number'&&Number.isFinite(x)?x:typeof x==='string'&&/^(?:[¥￥]\s*)?\d+(?:\.\d{1,2})?$/.test(x.trim())?Number(x.replace(/[¥￥\s]/g,'')):NaN;
export function normalizeDomesticFliggy(routes,date){
  const read=data=>{return fliggyItems(data,'飞猪国内').flatMap(x=>{
    const price=money(x.adultPrice??x.ticketPrice),j=x.journeys?.[0],s=j?.segments?.[0];
    if(x.journeys?.length!==1||j?.segments?.length!==1||!['直达','直飞'].includes(j.journeyType)||!s||s.stopInfos?.length||s.seatClassName!=='经济舱'||!Number.isFinite(price)||price<=0||restricted(JSON.stringify(x)))return [];
    return [{price,leg:{flight:s.marketingTransportNo,airline:s.marketingTransportName,from:s.depStationCode,to:s.arrStationCode,departure:s.depDateTime,arrival:s.arrDateTime,direct:true,cabin:s.seatClassName,bag:'未返回行李额度'}}];
  });};
  const [a,b]=routes.map(read);
  const single=(rows,direction)=>rows.map((f,i)=>({id:`fd-${direction}-${i}`,source:'fliggy',price:f.price,ticketType:'oneway',direction,basis:'单程起价 · 税费未确认',taxVerified:false,legs:[f.leg],url:'https://www.fliggy.com/'}));
  return {date,source:'fliggy',status:'success',checkedAt:new Date().toISOString(),note:`国内按两次单程查询；去程${a.length}、回程${b.length}条有效结果，每次最多10条；非全量最低价。`,items:[...a.flatMap((f,i)=>b.map((g,k)=>({id:`fd-${i}-${k}`,source:'fliggy',price:f.price+g.price,ticketType:'split',basis:'两张单程起价合计 · 税费未确认',taxVerified:false,legs:[f.leg,g.leg],url:'https://www.fliggy.com/'}))),...single(a,'outbound'),...single(b,'return')]};
}
export async function fliggyDomestic(key,sign,out,back,from,to,id,{search=fliggy,wait}={}){
  // The official full-return search is independently available even when the
  // reverse one-way inventory service fails. Use its quoted total as-is.
  try{
    const data=await searchWithRetry(async()=>{const result=await search(key,sign,out,back,from,to);fliggyItems(result);return result;},{wait});
    const snapshot=normalizeFliggy(data,id);
    if(snapshot.items.length){
      snapshot.note='官方完整往返起价，最多10个直飞方案；不是两张单程推算，非全量最低价。';
      snapshot.directions=[{direction:'outbound',status:'success',count:snapshot.items.length},{direction:'return',status:'success',count:snapshot.items.length}];
      return snapshot;
    }
  }catch(e){if(/授权|额度|频率/.test(e.message))throw e;}
  const legs=[],errors=[];
  for(const [date,origin,destination] of [[out,from,to],[back,to,from]]){
    try{legs.push(await searchWithRetry(async()=>{const result=await search(key,sign,date,undefined,origin,destination);fliggyItems(result);return result;},{wait}));errors.push(null);}
    catch(e){legs.push({status:0,data:{itemList:[]}});errors.push(e.message);}
  }
  const snapshot=normalizeDomesticFliggy(legs,id);
  snapshot.directions=errors.map((error,i)=>({direction:i?'return':'outbound',status:error?'error':'success',error,count:snapshot.items.filter(f=>f.ticketType==='oneway'&&f.direction===(i?'return':'outbound')).length}));
  if(errors.some(Boolean)){
    snapshot.status=errors.every(Boolean)?'error':'partial';
    snapshot.warning=errors.map((error,i)=>error?(i?'回程：':'去程：')+error:'').filter(Boolean).join('；');
    snapshot.note+=' '+snapshot.warning+'；已返回的单程报价可独立比较，不拼接旧报价。';
  }
  return snapshot;
}
export function domesticCabins(search,detail){
  if(detail.successCode!==true||!Array.isArray(detail.flightInfo)||!Array.isArray(detail.cabinInfo))throw Error('途牛国内舱位详情未完整返回');
  const flight=detail.flightInfo.find(f=>f.flightNumber===search.flightNumber&&f.departureTime===search.departureTime&&f.arrivalTime===search.arrivalTime);
  if(!flight||!['直飞','直达'].includes(search.type)||flight.type&&!['直飞','直达'].includes(flight.type))return [];
  return detail.cabinInfo.flatMap(c=>{
    const base=money(c.basePrice),tax=money(c.totalTax);
    // Missing rules are not proof of an unrestricted fare.
    if(typeof c.buyCondition!=='string'||restricted(c.buyCondition)||c.cabinClass!=='经济舱'||!Number.isFinite(base)||base<=0||!Number.isFinite(tax)||tax<0)return [];
    return [{...search,...flight,cabinClass:c.cabinClass,priceWithTax:base+tax,type:'直飞',buyCondition:c.buyCondition}];
  });
}
export async function tuniuDomesticLeg(token,departureDate,departureCityName,arrivalCityName,{call:injectedCall,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  let last=0;
  const call=injectedCall|| (async(name,args)=>{const delay=13000-(Date.now()-last);if(delay>0)await wait(delay);last=Date.now();return rpc('https://openapi.tuniu.cn/hybrid/mcp/flight',token,name,args,{'mcp-protocol-version':'2024-11-05'});});
  const route=async(departureCityName,arrivalCityName,departureDate)=>{
    const args={departureCityName,arrivalCityName,departureDate};
    const page=await call('searchLowestPriceFlight',args);
    if(page.successCode!==true||!Array.isArray(page.data))throw Error('途牛国内搜索未返回有效结果，请检查国内机票授权');
    const candidates=page.data.filter(f=>['直飞','直达'].includes(f.type)&&f.cabinClass==='经济舱'&&Number.isFinite(money(f.basePrice))).sort((a,b)=>money(a.basePrice)+money(a.totalTax)-money(b.basePrice)-money(b.totalTax));
    if(!candidates.length)return [];
    for(const f of candidates.slice(0,3)){
      const detail=await call('multiCabinDetails',{...args,flightNo:f.flightNumber});
      const cabins=domesticCabins(f,detail);if(cabins.length)return cabins;
    }
    return [];
  };
  return route(departureCityName,arrivalCityName,departureDate);
}
export function tuniuDomesticSnapshot(a,b,id){
  const snapshot=normalizeTuniu([a,b],id);
  const single=(rows,direction)=>rows.map((f,i)=>({id:`td-${direction}-${i}`,source:'tuniu',price:+f.priceWithTax,basis:'含税 · 单程起价',taxVerified:true,ticketType:'oneway',direction,legs:[{flight:f.flightNumber,airline:f.airlineCompany,from:airportAliases[f.departureAirport]||f.departureAirport,to:airportAliases[f.arrivalAirport]||f.arrivalAirport,departure:f.departureTime,arrival:f.arrivalTime,direct:true,cabin:f.cabinClass,bag:'详情待核验'}],url:'https://open.tuniu.com/mcp/docs/'}));
  snapshot.items.push(...single(a,'outbound'),...single(b,'return'));
  snapshot.directions=[{direction:'outbound',status:'success',count:a.length},{direction:'return',status:'success',count:b.length}];
  snapshot.note='国内接口限流：按起价核验前3个直飞航班，找到无购买限制的舱位即返回，各方向最多1个航班；缺少购买条件或有年龄限制的票价排除，非全量最低价。';
  return snapshot;
}
