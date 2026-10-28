import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import '../lib/provider-links.mjs';
import '../lib/flight-query.mjs';
import {normalizeQuote} from '../lib/quote-normalize.mjs';

const q={from:'SHA',to:'TYO',out:'2026-12-31',back:'2027-01-04',adults:1,cabin:'economy',tripType:'roundtrip'};
const fields={from:{value:'上海(SHA)'},to:{value:'东京(TYO)'},date:{value:q.out},back:{value:q.back},adults:{value:'1成人 0儿童 0婴儿'},cabin:{value:'经济舱'}};
for(const key of ['adults','cabin'])Object.defineProperty(fields[key],'innerText',{get(){return this.value;}});
const recommendations={value:'北京(PEK)'};
const options=[{label:'单程',selected:false},{label:'往返',selected:true}];
for(const option of options){option.click=()=>options.forEach(other=>{other.selected=other===option;});option.classList={contains:className=>className==='active'&&option.selected};}
let pathname='/online/channel',host='flights.ctrip.com',blocked=false,searches=0,activeCity=null,cityClicks=0,airportClicks=0,actualUrl=undefined;
let currencyKnown=true,expandClicks=0,bookClicks=0,blockOnExpand=false,navigateOnExpand=false;
const textNode=innerText=>({innerText});
function flightFixture({cabin='经济舱',expanded=false,prices=[1860,1877,1990,2090,2120,2293]}={}){
  const item={kind:'flight',expanded};
  const main={kind:'main',parentElement:item,innerText:'春秋航空 9C6217\n15:00 浦东国际机场T2\n18:40 成田国际机场T3\n¥1860起\n含税价'};item.main=main;
  item.products=prices.map(price=>({kind:'product',cabin,price,innerText:cabin+'\n退改费¥1350起\n赠券¥50\n'+(price===2090?'限12-81周岁（不含）的乘客预订\n':'')+'¥'+price}));
  main.button={get innerText(){return item.expanded?'收起':'订票';},getAttribute:name=>name==='u_remark'?'航班上展开/收起运价':null,click(){expandClicks++;for(const other of flights)other.expanded=false;item.expanded=true;if(blockOnExpand)blocked=true;if(navigateOnExpand)actualUrl='https://flights.ctrip.com/online/booking';}};
  item.bookButton={click(){bookClicks++;throw Error('Booking must never be clicked');}};
  return item;
}
let flights=[flightFixture()];
for(const key of ['from','to'])fields[key].click=()=>{activeCity=fields[key];};
const cityRows=['SHA','TYO'].map(code=>({code,click(){activeCity.value=code;cityClicks++;}}));
const airportRows=[{code:'SHA',click(){activeCity.value='上海虹桥(SHA)';airportClicks++;}}];
const buttons=[{innerText:'\uE000 搜索',click(){searches++;}}];
let calendarOpen=false,activeDate='date',monthStart=2026*12+9,dayDisabled=false;
const calendar={kind:'calendar'},panels=[{offset:0},{offset:1}],clickedDates=[];
for(const key of ['date','back']){fields[key].readOnly=true;fields[key].click=()=>{activeDate=key;calendarOpen=true;};}
function cell(iso,classes=[]){return {classList:{contains:name=>classes.includes(name)},getAttribute:()=>null,click(){assert.deepEqual(classes,[],'disabled and other-month duplicate cells must never be clicked');fields[activeDate].value=iso;clickedDates.push(iso);calendarOpen=false;}};}
const core=globalThis.flightProviderSearchCore;
const mock={...core,
  blocked(){if(blocked)throw Error('人工安全验证');},wait:async()=>{},
  all(selector,root){
    if(selector==='.flight-item')return flights;
    if(root?.domesticMap?.[selector])return root.domesticMap[selector];
    if(root?.kind==='flight'&&selector==='.flight-box')return [root.main];
    if(root?.kind==='flight'&&selector==='.flight-seats > .seat-row.seat-row-v3')return root.expanded?root.products:[];
    if(root?.kind==='main'){
      const text={'.flight-row .flight-airline .airline-name':'春秋航空','.plane .plane-No':'9C6217','.flight-detail .depart-box .time':'15:00','.flight-detail .arrive-box .time':'18:40','.flight-detail .depart-box .airport .name':'浦东国际机场T2','.flight-detail .arrive-box .airport .name':'成田国际机场T3','.flight-operate .flight-price':'¥1860起\n含税价','.flight-operate .flight-price .tip':'含税价'}[selector];
      if(text)return [textNode(text)];
      if(selector==='button[u_key="flight_action_expand_all_price"]')return [root.button];
    }
    if(root?.kind==='product'){
      if(selector==='.seat-type')return [textNode(root.cabin)];
      if(selector==='.seat-operate .operate .seat-price .price-box > div.price.price-b')return [textNode('¥'+root.price)];
    }
    if(selector==='.calendar-modal.date-custom.date-custom-v2')return calendarOpen?[calendar]:[];
    if(root===calendar&&selector==='.cmodal-title strong')return [{innerText:activeDate==='date'?'选择出发日期':'选择返回日期'}];
    if(root===calendar&&selector==='.date-picker.date-picker-block')return panels;
    if(root===calendar&&selector==='.date-header .date-title .date-m')return panels.map(p=>({month:monthStart+p.offset}));
    if(root?.month&&selector==='span.year')return [{innerText:Math.floor(root.month/12)+'年'}];
    if(root?.month&&selector==='span.month')return [{innerText:(root.month%12+1)+'月'}];
    if(panels.includes(root)&&/^(span.prev-ico.iconf-left|span.next-ico.iconf-right)$/.test(selector))return [{getAttribute:()=>null,click(){monthStart+=selector.includes('next')?1:-1;}}];
    if(root===calendar&&selector.startsWith('.date-day[data-testid=')){
      const iso=selector.match(/date-day-(\d{4}-\d{2}-\d{2})/)[1],month=Number(iso.slice(0,4))*12+Number(iso.slice(5,7))-1;
      return month>=monthStart&&month<=monthStart+1?[cell(iso,['date-nocurrent']),cell(iso,dayDisabled?['date-disabled']:[])]:[];
    }
    if(root&&selector==='span.code')return [{innerText:root.code,classList:{contains:()=>false}}];
    if(root&&selector==='span.radio-label')return [{innerText:root.label}];
    if(root&&selector==='i.iconf-radio-selected')return root.selected?[{}]:[];
    if(selector==='li')return options;
    if(selector==='input.form-input-v3[name="owDCity"][aria-label="可输入城市或机场"]')return [fields.from];
    if(selector==='input.form-input-v3[name="owACity"][aria-label="可输入城市或机场"]')return [fields.to];
    if(selector==='.modifyDate.depart-date input[aria-label="请选择日期"]')return [fields.date];
    if(selector==='#owADatewrap input[aria-label="请选择日期"]')return [fields.back];
    if(selector==='span.form-select-txt')return [fields.adults];
    if(selector==='.form-select-v3 > span')return [fields.cabin];
    if(selector==='.poi-address > .address')return cityRows;
    if(selector==='ul.airport li')return airportRows;
    if(selector==='button.search-btn[type="submit"]')return buttons;
    return [];
  },
  field(pattern){
    if(pattern.test('出发地'))return recommendations;
    if(pattern.test('去程日期'))return fields.date;
    if(pattern.test('回程日期'))return fields.back;
    if(pattern.test('成人'))return fields.adults;
    if(pattern.test('舱位'))return fields.cabin;
    throw Error('Unrecognized labelled field');
  },
  tripType(){return null;},currency(){if(!currencyKnown)throw Error('币种未核验');return 'CNY';},
  setValue(field,value){assert.notEqual(field,recommendations);assert.notEqual(field.readOnly,true,'readonly dates must be chosen in calendar');field.value=value;}
};
const context={flightProviderSearchCore:mock,flightQueryCore:globalThis.flightQueryCore,location:{get hostname(){return host;},get pathname(){return pathname;},get href(){return actualUrl;}},Error,Array,URL};
vm.createContext(context);vm.runInContext(await fs.readFile(new URL('../browser-helper/ctrip-adapter.js',import.meta.url),'utf8'),context);
assert.equal(context.flightCtripAdapter.cards().length,1,'the real no-slash homepage is allowed');
for(const bad of ['/online/channel-evil','/online/payment','/online/channelXYZ']){pathname=bad;assert.throws(()=>context.flightCtripAdapter.cards(),/搜索页/);}
pathname='/online/list/oneway-sha-tyo';
assert.equal(context.flightCtripAdapter.inspect(q).tripType,'roundtrip','selected icon is real trip evidence');
fields.from.value='东京(TYO)';assert.throws(()=>context.flightCtripAdapter.inspect(q),/出发地或目的地/);fields.from.value='上海(SHA)';
options[0].selected=true;assert.throws(()=>context.flightCtripAdapter.inspect(q),/单程还是往返/);options[0].selected=false;
pathname='/online/channel';
await context.flightCtripAdapter.fillSearch({...q,direction:'outbound'});
assert.equal(options[0].selected,true);assert.equal(options[1].selected,false);assert.equal(searches,1);
assert.equal(recommendations.value,'北京(PEK)','recommendation filter is not the search field');
fields.from.value='北京(PEK)';await context.flightCtripAdapter.fillSearch({...q,direction:'outbound'});
assert.equal(fields.from.value,'SHA');assert.equal(cityClicks,1);assert.equal(airportClicks,0,'SHA city query must not select Shanghai Hongqiao airport row');
fields.cabin.value='经济/超经舱';await context.flightCtripAdapter.fillSearch({...q,direction:'outbound'});
assert.equal(searches,3,'a broad cabin filter may search but is not verified as an exact cabin');
pathname='/online/list/oneway-sha-tyo';
assert.equal(context.flightCtripAdapter.inspect({...q,direction:'outbound'}).cabinEvidence,'per-card-required');
let card=context.flightCtripAdapter.cards()[0];assert.equal(card.observedCabin,null);assert.match(card.captureIssues.join(),/舱位/);
flights=[flightFixture({expanded:true})];
card=context.flightCtripAdapter.cards()[0];assert.equal(card.observedCabin,'economy');assert.equal(card.cabinEvidence,'经济舱');
actualUrl='https://flights.ctrip.com/online/list/oneway-sha-tyo?depdate=2026-12-31&cabin=y_s&adult=1&child=0&infant=0';
const pageMeta=context.flightCtripAdapter.inspect({...q,direction:'outbound'});
assert.equal(pageMeta.evidence,'official-visible-ctrip-search-url');
const beforeReadySearch=searches;assert.match((await context.flightCtripAdapter.fillSearch({...q,direction:'outbound'})).message,/已处于携程指定/);assert.equal(searches,beforeReadySearch);
const normalize=record=>normalizeQuote({...record,text:record.innerText,url:actualUrl,source:'ctrip',query:q,tripType:'oneway',direction:'outbound',pageMeta});
assert.equal(normalize(card).eligible,true);assert.equal(normalize(card).price,1860);
assert.equal(normalize(card).legs[0].direct,undefined,'empty transfer control is not nonstop evidence');
assert.match(card.rawText,/¥1350|¥50/);assert.doesNotMatch(card.innerText,/¥1350|¥50/);
const ageRestricted=context.flightCtripAdapter.cards()[3];assert.equal(normalize(ageRestricted).eligible,false);assert.match(normalize(ageRestricted).reason,/年龄/);
flights=[flightFixture({expanded:true,cabin:'超级经济舱'})];
card=context.flightCtripAdapter.cards()[0];assert.equal(card.observedCabin,'premium_economy');
assert.equal(normalize(card).eligible,false,'premium-economy label must not be reduced to economy suffix');
flights=Array.from({length:10},()=>flightFixture());
const prepared=await context.flightCtripAdapter.prepareCapture({...q,direction:'outbound'});
assert.equal(prepared.expanded,10);assert.equal(expandClicks,10);assert.equal(bookClicks,0);
assert.equal(prepared.cards.length,60,'all observed product snapshots survive accordion closure');
assert.equal(prepared.cards.filter(row=>row.observedCabin==='economy').length,60);
assert.equal(context.flightCtripAdapter.cards().length,15,'only last expanded row remains visible, snapshots must be plain captured values');
flights=[flightFixture()];let scrolled=0;
flights[0].scrollIntoView=()=>{scrolled++;flights.push(flightFixture(),flightFixture());};
const lazy=await context.flightCtripAdapter.prepareCapture({...q,direction:'outbound'});
assert.equal(scrolled,1);assert.equal(lazy.expanded,3);assert.equal(lazy.cards.length,18,'newly loaded flights are captured without losing prior accordion products');
flights=Array.from({length:105},()=>flightFixture());
const bounded=await context.flightCtripAdapter.prepareCapture({...q,direction:'outbound'});
assert.equal(bounded.expanded,100);assert.equal(bounded.cards.length,605);assert.equal(bookClicks,0);
currencyKnown=false;assert.equal(context.flightCtripAdapter.inspect({...q,direction:'outbound'}).currency,null);currencyKnown=true;
flights=[flightFixture()];blockOnExpand=true;
await assert.rejects(context.flightCtripAdapter.prepareCapture({...q,direction:'outbound'}),/人工安全验证/);blocked=false;blockOnExpand=false;
flights=[flightFixture()];navigateOnExpand=true;
await assert.rejects(context.flightCtripAdapter.prepareCapture({...q,direction:'outbound'}),/跳转/);navigateOnExpand=false;
actualUrl=undefined;
fields.cabin.value='经济舱';fields.adults.value='1成人 1儿童 0婴儿';assert.throws(()=>context.flightCtripAdapter.inspect({...q,direction:'outbound'}),/儿童或婴儿/);
fields.adults.value='1成人 0儿童 0婴儿';pathname='/online/channel';fields.date.value='2026-10-10';fields.back.value='2026-10-15';
await context.flightCtripAdapter.fillSearch(q);
assert.deepEqual(clickedDates,[q.out,q.back],'both dates are selected through explicit date-testid and re-read');
assert.equal(fields.date.value,q.out);assert.equal(fields.back.value,q.back);
fields.date.value='2026-10-10';dayDisabled=true;
await assert.rejects(context.flightCtripAdapter.fillSearch({...q,direction:'outbound'}),/不可选/);
assert.equal(clickedDates.length,2);dayDisabled=false;
blocked=true;assert.throws(()=>context.flightCtripAdapter.cards(),/人工安全验证/);

actualUrl='https://flights.ctrip.com/online/list/oneway-sha-bjs?depdate=2027-01-01&cabin=y_s&adult=1&child=0&infant=0';
pathname='/online/list/oneway-sha-bjs';blocked=false;
flights=[flightFixture({expanded:true,prices:[470]})];
const domesticItem=flights[0];domesticItem.classList={contains:v=>v==='domestic'};
domesticItem.main.domesticMap={'.flight-detail .arrive-box .airport .name':[textNode('大兴国际机场')],'.flight-detail .transfer-info-group':[textNode('')],'i.arrow-oneway':[textNode('')]};
domesticItem.products[0].domesticMap={'.domestic-cabin-price > .price > span.price':[textNode('¥470')],'.domestic-seat-type .domestic-cabin-item':[textNode('经济舱3.2折')]};
const domesticCard=context.flightCtripAdapter.cards()[0];assert.equal(domesticCard.observedCabin,'economy');assert.match(domesticCard.innerText,/直飞/);assert.match(domesticCard.innerText,/¥470/);
domesticItem.products[0].domesticMap['.domestic-seat-type .domestic-cabin-item']=[textNode('超值折扣2.1折')];
domesticItem.domesticMap={'.cabin-tabs > .tab.tab-active':[textNode('经济舱 ¥450起')]};
const branded=context.flightCtripAdapter.cards()[0];
assert.equal(branded.observedCabin,'economy');
assert.equal(branded.cabinEvidence,'经济舱');
assert.equal((branded.innerText.match(/¥/g)||[]).length,1,'selected tab starting price must not duplicate the product price');
const brandedQ={from:'SHA',to:'BJS',out:'2027-01-01',back:'2027-01-03',adults:1,cabin:'economy',tripType:'roundtrip'};
const brandedMeta={from:'SHA',to:'BJS',date:brandedQ.out,tripType:'oneway',adults:1,cabin:'economy',verified:true,cabinScope:['economy','premium_economy'],cabinEvidence:'per-card-required'};
assert.equal(normalizeQuote({...branded,text:branded.innerText,query:brandedQ,source:'ctrip',url:actualUrl,tripType:'oneway',direction:'outbound',pageMeta:brandedMeta}).eligible,true);
domesticItem.domesticMap['.cabin-tabs > .tab.tab-active']=[textNode('公务/头等舱 ¥1500起')];
assert.equal(context.flightCtripAdapter.cards()[0].observedCabin,null);
domesticItem.domesticMap['.cabin-tabs > .tab.tab-active']=[];
assert.equal(context.flightCtripAdapter.cards()[0].observedCabin,null);
domesticItem.products[0].domesticMap['.domestic-seat-type .domestic-cabin-item']=[textNode('经济舱3.2折')];
let viewportLoads=0;
domesticItem.main.domesticMap['.plane .plane-No']=[];
domesticItem.scrollIntoView=()=>{viewportLoads++;domesticItem.main.domesticMap['.plane .plane-No']=[textNode('FM9103')];};
const domesticQuery={from:'SHA',to:'BJS',out:'2027-01-01',back:'2027-01-03',adults:1,cabin:'economy',tripType:'roundtrip',direction:'outbound'};
const loaded=await context.flightCtripAdapter.prepareCapture(domesticQuery);
assert.ok(viewportLoads>0);assert.match(loaded.cards[0].innerText,/FM9103/);
domesticItem.main.innerText+=' 经停';assert.doesNotMatch(context.flightCtripAdapter.cards()[0].innerText,/直飞/);

console.log('PASS: Ctrip controls/calendar and observed result/product fixtures; exact fare extraction, qualification guards, bounded progressive loading, accordion snapshots, captcha/navigation abort, no booking clicks. Not a live extension import.');
