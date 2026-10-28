import {rpc,fliggy} from './providers.mjs';
import {normalizeTuniu} from './normalize.mjs';
const restricted=s=>/周岁|年龄|仅限|限.{0,20}(?:乘客|会员|多人)|学生|青年|老人|长者|新客|券后|需领券|多人特惠|首单|会员专享/.test(s);
const money=x=>typeof x==='number'&&Number.isFinite(x)?x:typeof x==='string'&&/^(?:[¥￥]\s*)?\d+(?:\.\d{1,2})?$/.test(x.trim())?Number(x.replace(/[¥￥\s]/g,'')):NaN;
export function normalizeDomesticFliggy(routes,date){
  const read=data=>{if(data.status!==0||!Array.isArray(data.data?.itemList))throw Error('飞猪国内搜索未返回有效结果');return data.data.itemList.flatMap(x=>{
    const price=money(x.adultPrice??x.ticketPrice),j=x.journeys?.[0],s=j?.segments?.[0];
    if(x.journeys?.length!==1||j?.segments?.length!==1||!['直达','直飞'].includes(j.journeyType)||!s||!Number.isFinite(price)||price<=0||restricted(JSON.stringify(x)))return [];
    return [{price,leg:{flight:s.marketingTransportNo,airline:s.marketingTransportName,from:s.depStationCode,to:s.arrStationCode,departure:s.depDateTime,arrival:s.arrDateTime,direct:true,cabin:s.seatClassName,bag:'未返回行李额度'}}];
  });};
  const [a,b]=routes.map(read);
  return {date,source:'fliggy',status:'success',checkedAt:new Date().toISOString(),note:`国内按两次单程查询；去程${a.length}、回程${b.length}条有效结果，每次最多10条；非全量最低价。`,items:a.flatMap((f,i)=>b.map((g,k)=>({id:`fd-${i}-${k}`,source:'fliggy',price:f.price+g.price,ticketType:'split',basis:'两张单程起价合计 · 税费未确认',taxVerified:false,legs:[f.leg,g.leg],url:'https://www.fliggy.com/'})))};
}
export async function fliggyDomestic(key,sign,out,back,from,to,id){
  const a=await fliggy(key,sign,out,undefined,from,to),b=await fliggy(key,sign,back,undefined,to,from);
  return normalizeDomesticFliggy([a,b],id);
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
export async function tuniuDomesticLeg(token,departureDate,departureCityName,arrivalCityName){
  let last=0;
  const call=async(name,args)=>{const delay=13000-(Date.now()-last);if(delay>0)await new Promise(r=>setTimeout(r,delay));last=Date.now();return rpc('https://openapi.tuniu.cn/hybrid/mcp/flight',token,name,args,{'mcp-protocol-version':'2024-11-05'});};
  const route=async(departureCityName,arrivalCityName,departureDate)=>{
    const args={departureCityName,arrivalCityName,departureDate};
    const page=await call('searchLowestPriceFlight',args);
    if(page.successCode!==true||!Array.isArray(page.data))throw Error('途牛国内搜索未返回有效结果，请检查国内机票授权');
    const candidates=page.data.filter(f=>['直飞','直达'].includes(f.type)&&f.cabinClass==='经济舱'&&Number.isFinite(money(f.basePrice))).sort((a,b)=>money(a.basePrice)+money(a.totalTax)-money(b.basePrice)-money(b.totalTax));
    if(!candidates.length)return [];
    const f=candidates[0],detail=await call('multiCabinDetails',{...args,flightNo:f.flightNumber});
    return domesticCabins(f,detail);
  };
  return route(departureCityName,arrivalCityName,departureDate);
}
export function tuniuDomesticSnapshot(a,b,id){
  const snapshot=normalizeTuniu([a,b],id);
  snapshot.note='国内接口限流：本次仅核验首批最低直飞航班的舱位，各方向最多1个航班；缺少购买条件或有年龄限制的票价排除，非全量最低价。';
  return snapshot;
}
