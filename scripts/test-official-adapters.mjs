import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {providerSearchUrl,inspectTongchengUrl,inspectCtripUrl,providerCapabilities} from '../lib/provider-links.mjs';
import {normalizeQuote} from '../lib/quote-normalize.mjs';
const q={id:'test',from:'SHA',to:'TYO',out:'2026-12-31',back:'2027-01-04',adults:1,cabin:'economy',tripType:'roundtrip'};
// Fixed navigation format transcribed from the official public frontend;
// these tests do not assert that its live flight inventory is accessible.
const outward='https://www.ly.com/iflight/book1.html?para=SHA*TYO*2026-12-31*1900-01-01*OW*1_0_0*Y';
assert.equal(new URL(providerSearchUrl('ly',q,'outbound')).searchParams.get('para'),new URL(outward).searchParams.get('para'));
assert.deepEqual(inspectTongchengUrl(outward),{from:'SHA',to:'TYO',date:'2026-12-31',returnDate:undefined,tripType:'oneway',adults:1,cabin:'economy',evidence:'official-visible-url'});
assert.equal(new URL(providerSearchUrl('ly',q,'return')).searchParams.get('para'),'TYO*SHA*2027-01-04*1900-01-01*OW*1_0_0*Y');
assert.equal(new URL(providerSearchUrl('ly',{...q,adults:2,cabin:'business'},'roundtrip')).searchParams.get('para'),'SHA*TYO*2026-12-31*2027-01-04*RT*2_0_0*C');
for(const bad of [outward.replace('www.ly.com','ly.com.evil.test'),outward.replace('https:','http:'),outward.replace('book1','book2'),outward.replace('12-31','02-30'),outward.replace('1_0_0','1_1_0'),outward.replace('*Y','*Y%7CS')])assert.equal(inspectTongchengUrl(bad),null);
assert.throws(()=>providerSearchUrl('ly',{...q,from:'SHA?evil=1'},'outbound'));
assert.throws(()=>providerSearchUrl('ly',{...q,out:'2026-02-30'},'outbound'));
const ctrip='https://flights.ctrip.com/online/list/oneway-sha-tyo?depdate=2026-12-31&cabin=y_s&adult=1&child=0&infant=0';
assert.equal(providerSearchUrl('ctrip',q,'outbound'),ctrip);
assert.equal(providerSearchUrl('ctrip',q,'return'),'https://flights.ctrip.com/online/list/oneway-tyo-sha?depdate=2027-01-04&cabin=y_s&adult=1&child=0&infant=0');
assert.equal(providerSearchUrl('ctrip',q,'roundtrip'),'https://flights.ctrip.com/online/channel/international');
assert.equal(providerSearchUrl('ctrip',{...q,from:'PVG'},'outbound'),'https://flights.ctrip.com/online/channel/international');
assert.equal(providerSearchUrl('ctrip',{...q,cabin:'business'},'outbound'),'https://flights.ctrip.com/online/channel/international');
assert.deepEqual(inspectCtripUrl(ctrip),{from:'SHA',to:'TYO',date:'2026-12-31',tripType:'oneway',adults:1,cabinScope:['economy','premium_economy'],evidence:'official-visible-ctrip-search-url'});
for(const bad of [ctrip.replace('https:','http:'),ctrip.replace('flights.ctrip.com','ctrip.evil.test'),ctrip.replace('12-31','02-30'),ctrip.replace('adult=1','adult=0'),ctrip.replace('adult=1','adult=11'),ctrip.replace('child=0','child=1'),ctrip+'&adult=2',ctrip.replace('y_s','c_f')])assert.equal(inspectCtripUrl(bad),null);
assert.equal(providerCapabilities.ctrip.automaticLinks,true);
assert.equal(new URL(providerSearchUrl('ly',{...q,back:undefined,tripType:'oneway'},'outbound')).searchParams.get('para'),'SHA*TYO*2026-12-31*1900-01-01*OW*1_0_0*Y');
assert.throws(()=>providerSearchUrl('ly',{...q,back:undefined,tripType:'oneway'},'return'));
const core=globalThis.flightProviderSearchCore;
assert.throws(()=>core.verify({...q,direction:'return'},inspectTongchengUrl(outward)),/不一致/);
assert.equal(core.airportText('首都航空 上海 东京 13:00 16:00 CNY 1000'),'首都航空 上海 东京 13:00 16:00 CNY 1000');
assert.match(core.airportText('首都航空 浦东T2 成田T1 13:00 16:00 CNY 1000'),/PVG → NRT$/);
assert.equal(core.airportText('PVG NRT 13:00 16:00 CNY 1000'),'PVG NRT 13:00 16:00 CNY 1000');
assert.equal(core.sameCity('香港HKG','HKG','香港'),true);
assert.equal(core.sameCity('上海浦东','SHA','上海'),false);
const source=await fs.readFile(new URL('../browser-helper/ly-adapter.js',import.meta.url),'utf8');
// Small rendered-tree fixture supports CSS descendants/children and visibility.
// Class names and text below are transcribed from the real official result UI;
// these fixtures are regression tests, not a claim that this script is a browser.
class Element{
  constructor(classes='',text='',children=[],tag='div',hidden=false){this.classes=classes.split(' ');this.value=text;this.children=children;this.tag=tag;this.hidden=hidden;children.forEach(c=>c.parentElement=this);}
  get innerText(){return this.hidden?'':[this.value,...this.children.filter(c=>!c.hidden).map(c=>c.innerText)].filter(Boolean).join('\n');}
  get textContent(){return this.innerText;}
  matches(part){const [tag,...classes]=part.split('.');return (!tag||this.tag===tag)&&classes.every(c=>this.classes.includes(c));}
  querySelectorAll(selector){
    const tokens=selector.replaceAll('>',' > ').trim().split(/\s+/),nodes=[];
    const matches=(node,index)=>{if(!node||!node.matches(tokens[index]))return false;if(index===0)return true;if(tokens[index-1]==='>')return matches(node.parentElement,index-2);for(let p=node.parentElement;p;p=p.parentElement)if(matches(p,index-1))return true;return false;};
    const visit=node=>{for(const child of node.children){if(matches(child,tokens.length-1))nodes.push(child);visit(child);}};visit(this);return nodes;
  }
}
const el=(classes,text='',children=[],tag='div',hidden=false)=>new Element(classes,text,children,tag,hidden);
function priceBox(classes,amount,starting=false){return el(classes,'',[el('price-info','¥'+amount),...(starting?[el('','起',[],'i')]:[])]);}
function product(amount,{pack='',hidden=false,cabin='经济舱',restriction=''}={}){
  return el('pro-item','',[
    el('pro-left-info',cabin),el('pro-main','退改费 ¥1350起\n保险 ¥60 × 2'+(restriction?'\n'+restriction:'')),
    priceBox('pro-price',amount),el('inclue-tax','',[el('tax-text','含税总价')]),
    ...(pack?[el('price-pack',pack)]:[])
  ],'div',hidden);
}
function flight({amount=1896,starting=true,products=[],transfer='',direct='',hidden=false,airport='PVG',arrival='',arrivalDate=''}={}){
  return el('flight-item','',[
    el('flight-item-main','',[
      el('flight-left','',[el('airways-title',transfer?'韩亚航空':'春秋航空'),el('airways-model',transfer?'OZ366/OZ178':'9C6217')]),
      el('flight-center','',[el('trip-info',direct,[el('depart-time',transfer?'16:25':'15:00'),el('arrive-time',arrival||(transfer?'23:25':'18:40'),arrivalDate?[el('add-days',arrivalDate,[],'span')]:[]),el('depart-airport',airport),el('arrive-airport',transfer?'HND':'NRT'),el('arrow-list','',transfer?[el('arrow-item',transfer)]:[])])]),
      ...(products.length?[]:[priceBox('flight-right',amount,starting),el('price-tax','',[el('tax-text','含税总价')])])
    ]),el('flight-product','',products)
  ],'div',hidden);
}
let actualUrl=outward,assignedUrl='',tree=el('document'),visibleCurrency='CNY',blocked=false;
const isVisible=e=>{for(let n=e;n;n=n.parentElement)if(n.hidden)return false;return true;};
const mockedCore={...core,all(selector,root=tree){return root.querySelectorAll(selector).filter(isVisible);},blocked(){if(blocked)throw Error('人工安全验证');},currency(){if(!visibleCurrency)throw Error('币种未核验');return visibleCurrency;}};
const context={flightProviderSearchCore:mockedCore,document:{get body(){return tree;}},location:{hostname:'www.ly.com',pathname:'/iflight/book1.html',get href(){return actualUrl;},assign(value){assignedUrl=value;}},URL,Error,JSON,encodeURIComponent};vm.createContext(context);vm.runInContext(source,context);
assert.throws(()=>context.flightLyAdapter.inspect({...q,direction:'outbound'}),/没有可核验/);
tree=el('document','',[el('flight-list','',[flight()])]);
assert.equal(context.flightLyAdapter.inspect({...q,direction:'outbound'}).verified,true);
const normalized=card=>normalizeQuote({query:q,text:card.innerText,rawText:card.rawText,captureIssues:card.captureIssues,tripType:'oneway',direction:'outbound',metadata:context.flightLyAdapter.inspect({...q,direction:'outbound'})});
let cards=context.flightLyAdapter.cards();
assert.equal(cards.length,1);
assert.match(cards[0].innerText,/¥1896起/);
assert.equal(normalized(cards[0]).price,1896);
assert.equal(normalized(cards[0]).eligible,true);
assert.equal(normalized(cards[0]).legs[0].direct,undefined,'empty transfer arrow must not invent nonstop');
tree=el('document','',[el('flight-list','',[flight({transfer:'首尔 ICN',products:[product(1654),product(1792),product(1654,{pack:'+¥140 出行礼包'}),product(1718,{pack:'出行礼包'}),product(1731),product(999,{hidden:true})]}),flight({hidden:true})])]);
cards=context.flightLyAdapter.cards();
assert.equal(cards.length,5,'visible product offers only, no hidden rows or duplicate collapsed price');
assert.deepEqual(Array.from(cards,c=>normalized(c).price),[1654,1792,null,1718,1731]);
assert.match(cards[0].rawText,/¥1350/);
assert.match(cards[0].rawText,/¥60/);
assert.doesNotMatch(cards[0].innerText,/¥1350|¥60/,'refund and insurance must not become fares');
assert.equal(normalized(cards[0]).eligible,true);
assert.equal(normalized(cards[0]).legs[0].direct,false);
assert.equal(normalized(cards[0]).taxIncluded,true);
assert.equal(cards[2].captureIssues.length,1);
assert.equal(cards[3].captureIssues.length,1,'unknown package price explicitly blocks verification');
assert.equal(normalized(cards[3]).eligible,false,'unknown package amount must not enter price ranking');
assert.match(normalized(cards[3]).reason,/礼包/);
tree=el('document','',[el('flight-list','',[flight({products:[product(1654,{restriction:'人数限制'}),product(1792,{restriction:'无人数限制'}),product(1718,{restriction:'2人起订'}),product(1800,{restriction:'限\n12-81周岁乘客'}),product(1850,{restriction:'不限 人数'})]})])]);
cards=context.flightLyAdapter.cards();
assert.equal(normalized(cards[0]).eligible,false,'visible passenger restriction cannot silently become an unrestricted fare');
assert.match(normalized(cards[0]).reason,/人数/);
assert.match(cards[0].rawText,/人数限制/);
assert.equal(normalized(cards[1]).eligible,true,'explicitly no passenger restriction remains valid');
assert.equal(normalized(cards[2]).eligible,false,'minimum party fare remains pending when eligibility is unverified');
assert.equal(normalized(cards[3]).eligible,false,'visible multiline age restriction remains pending');
assert.equal(normalized(cards[4]).eligible,true,'whitespace cannot turn explicit no restriction into a restriction');
for(const [arrivalDate,offset] of [['12月31日 周四',0],['1月1日 周五',1],['2027年1月2日 周六',2],['1月3日 周日',3]]){
  tree=el('document','',[el('flight-list','',[flight({starting:false,arrival:'07:00',arrivalDate})])]);
  cards=context.flightLyAdapter.cards();assert.equal(normalized(cards[0]).eligible,true);
  assert.equal(normalized(cards[0]).legs[0].arrivalDayOffset,offset,'visible arrival day must survive year rollover: '+arrivalDate);
  assert.match(cards[0].rawText,new RegExp(arrivalDate));
}
for(const arrivalDate of ['1月4日 周一','2月30日','12月30日','2026年1月1日','日期待定','1月1日 / 1月2日']){
  tree=el('document','',[el('flight-list','',[flight({starting:false,arrival:'07:00',arrivalDate})])]);
  cards=context.flightLyAdapter.cards();assert.equal(normalized(cards[0]).eligible,false,'unknown/out-of-range arrival date cannot silently become same-day');
  assert.match(normalized(cards[0]).reason,/到达日期/);
}
tree=el('document','',[el('flight-list','',[flight({starting:false,arrival:'07:00 +2',arrivalDate:'1月1日 周五'})])]);
cards=context.flightLyAdapter.cards();assert.equal(normalized(cards[0]).eligible,false,'conflicting explicit offset and visible date must stay pending');
tree=el('document','',[el('flight-list','',[flight({amount:2000,starting:false,direct:'直飞'}),flight({airport:'PVG SHA'})])]);
cards=context.flightLyAdapter.cards();
assert.equal(cards.length,1,'ambiguous airport fields are not guessed');
assert.equal(normalized(cards[0]).legs[0].direct,true);
visibleCurrency='';assert.equal(context.flightLyAdapter.inspect({...q,direction:'outbound'}).currency,null);
assert.equal(normalized(cards[0]).eligible,true);
assert.equal(normalized(cards[0]).currency,"CNY");
tree.value='日元';assert.equal(context.flightLyAdapter.inspect({...q,direction:'outbound'}).currency,'JPY');tree.value='';
visibleCurrency='CNY';
tree=el('document','',[el('flight-list','',[flight({products:[product(2400,{cabin:'公务舱'})]})])]);
cards=context.flightLyAdapter.cards();
assert.match(cards[0].captureIssues.join('；'),/舱位/);
assert.equal(normalized(cards[0]).eligible,false,'visible product cabin must not silently override search cabin');
actualUrl=providerSearchUrl('ly',q,'roundtrip');
const incompleteReturn=normalizeQuote({query:q,text:cards[0].innerText,tripType:'roundtrip',direction:'outbound',metadata:context.flightLyAdapter.inspect(q)});
assert.equal(incompleteReturn.eligible,false);
assert.match(incompleteReturn.reason,/往返/,'roundtrip search URL is not evidence of a complete roundtrip offer');
await context.flightLyAdapter.fillSearch({...q,direction:'outbound'});
assert.equal(inspectTongchengUrl(assignedUrl).tripType,'oneway','new explicit single-leg context must supersede old roundtrip tab');
assert.equal(JSON.parse(decodeURIComponent(new URL(assignedUrl).hash.slice(5))).direction,'outbound');
actualUrl=outward;await context.flightLyAdapter.fillSearch(q);
assert.equal(inspectTongchengUrl(assignedUrl).tripType,'roundtrip');
assert.equal(JSON.parse(decodeURIComponent(new URL(assignedUrl).hash.slice(5))).direction,undefined);

// Preparing OW results expands only main-card selection controls; snapshots
// survive accordion closure and never click fare booking buttons.
actualUrl=outward;visibleCurrency='CNY';let clicks=0;
const rows=Array.from({length:10},()=>flight());
for(const [index,row] of rows.entries()){
  const main=row.querySelectorAll('.flight-item-main')[0];
  const button=el('flight-btn','余3张\n选择');button.parentElement=main;main.children.push(button);
  button.click=()=>{clicks++;for(const other of rows)other.querySelectorAll('.flight-product')[0].children=[];const panel=row.querySelectorAll('.flight-product')[0];const fare=product(2000+index);fare.parentElement=panel;panel.children=[fare];};
}
tree=el('document','',[el('flight-list','',rows)]);mockedCore.wait=async()=>{};
let prepared=await context.flightLyAdapter.prepareCapture({...q,direction:'outbound'});
assert.equal(clicks,8,'bounded expansion');assert.equal(prepared.expanded,8);
assert.equal(prepared.cards.length,10);assert.match(prepared.cards[0].innerText,/¥2000/);
assert.doesNotMatch(prepared.cards[0].innerText,/¥2000起/);
assert.match(prepared.cards[9].innerText,/起/,'unopened starting fares remain pending');
actualUrl=providerSearchUrl('ly',q,'roundtrip');clicks=0;
await assert.rejects(()=>context.flightLyAdapter.prepareCapture(q),/先在同程选择/);assert.equal(clicks,0,'RT leg selection cannot be auto-expanded');
actualUrl=outward;tree.value='您的停留时间过长，当前价格可能发生变化，请重新查询';
await assert.rejects(()=>context.flightLyAdapter.prepareCapture({...q,direction:'outbound'}),/过期/);
tree.value='';await assert.rejects(()=>context.flightLyAdapter.prepareCapture({...q,direction:'return'}),/不一致/);
const first=rows[0].querySelectorAll('.flight-btn')[0];first.click=()=>{actualUrl=providerSearchUrl('ly',q,'return');};
await assert.rejects(()=>context.flightLyAdapter.prepareCapture({...q,direction:'outbound'}),/跳转/);
actualUrl=outward;

// Visible selected-outbound summary + return product fixture transcribed from LY.
context.flightQueryCore=globalThis.flightQueryCore;
actualUrl=providerSearchUrl('ly',q,'roundtrip');
const summary=el('repeatChooseGo','',[
 el('hasChooseTitle','去程已选'),el('airway-name','韩亚航空'),el('airNum','OZ366'),
 el('depInfo','',[el('time','12-31 16:25'),el('airportInfo','上海浦东国际机场T1')]),
 el('transform-item','转 首尔'),
 el('arrInfo','',[el('time','12-31 23:25'),el('airportInfo','羽田机场T3')]),el('repeatButton','重选去程')]);
const returnRow=flight({products:[product(3290),product(3108,{restriction:'人数限制'})]});
returnRow.querySelectorAll('.depart-airport')[0].value='NRT';returnRow.querySelectorAll('.arrive-airport')[0].value='PVG';
returnRow.querySelectorAll('.depart-time')[0].value='13:20';returnRow.querySelectorAll('.arrive-time')[0].value='21:55';
returnRow.querySelectorAll('.airways-title')[0].value='韩亚航空';returnRow.querySelectorAll('.airways-model')[0].value='OZ101/OZ367';
tree=el('document','',[summary,el('flight-title','',[el('s-trip','选择返程：东京-上海')]),el('flight-list','',[returnRow])]);
const roundNormalize=card=>normalizeQuote({query:q,source:'ly',text:card.innerText,rawText:card.rawText,cardEvidence:card.evidence,captureIssues:card.captureIssues,tripType:'roundtrip',direction:'outbound',metadata:context.flightLyAdapter.inspect(q)});
let rtCards=context.flightLyAdapter.cards();let rt=roundNormalize(rtCards[0]);
assert.equal(rt.eligible,true,rt.reason);assert.equal(rt.price,3290);assert.equal(rt.legs.length,2);assert.equal(rt.legs[0].departureTime,'16:25');assert.equal(rt.legs[1].departureTime,'13:20');assert.equal(rt.legs[1].date,q.back);
assert.equal(roundNormalize(rtCards[1]).eligible,false,'restricted RT products cannot rank');
assert.equal(roundNormalize({...rtCards[0],evidence:'visible-dom'}).eligible,false,'generic RT page cannot prove total');
assert.equal(roundNormalize({...rtCards[0],rawText:rtCards[0].rawText.replace('去程已选','')}).eligible,false,'missing selected-leg evidence blocks complete fare');
summary.querySelectorAll('.depInfo .time')[0].value='12-30 16:25';
assert.equal(roundNormalize(context.flightLyAdapter.cards()[0]).eligible,false,'wrong selected outbound date');
await assert.rejects(()=>context.flightLyAdapter.prepareCapture(q),/先在同程选择/);
summary.querySelectorAll('.depInfo .time')[0].value='12-31 16:25';
// The return arrival date must be relative to Jan 4, not the outbound Dec 31.
const arriveNode=returnRow.querySelectorAll('.arrive-time')[0];arriveNode.value='01:10';const arrivalDay=el('add-days','1月5日 周二',[],'span');arrivalDay.parentElement=arriveNode;arriveNode.children=[arrivalDay];
rt=roundNormalize(context.flightLyAdapter.cards()[0]);assert.equal(rt.eligible,true,rt.reason);assert.equal(rt.legs[1].arrivalDayOffset,1);
actualUrl=outward;
// Observed 2026-10-21: selected .filter-item.active, header 34 flights / 34 nonstop.
actualUrl=outward;visibleCurrency='CNY';
const priorAll=context.flightProviderSearchCore.all;let directSelected=false;
context.flightProviderSearchCore.all=(selector,...args)=>selector==='.filter-box .filter-item'?[{innerText:'直飞',value:'直飞',classList:{contains:name=>name==='active'&&directSelected}}]:priorAll(selector,...args);
tree=el('document','',[el('flight-list','',[flight({starting:false})])]);
assert.equal(normalized(context.flightLyAdapter.cards()[0]).legs[0].direct,undefined);
directSelected=true;assert.equal(normalized(context.flightLyAdapter.cards()[0]).legs[0].direct,true);
tree=el('document','',[el('flight-list','',[flight({starting:false,transfer:'首尔 ICN'})])]);
assert.equal(normalized(context.flightLyAdapter.cards()[0]).legs[0].direct,false,'transfer evidence wins even if filter active');
context.flightProviderSearchCore.all=priorAll;
visibleCurrency='CNY';blocked=true;assert.throws(()=>context.flightLyAdapter.inspect({...q,direction:'outbound'}),/人工安全验证/);
console.log('PASS: official links and LY visible-card fixtures; product prices exclude penalties/insurance, starting fares and unverified currencies stay pending, transfers and visibility retained. This test is not a live extension pass.');
