(()=>{
  const core=globalThis.flightProviderSearchCore;
  const patterns={from:/出发(?:城市|地)|From|Departure city/i,to:/到达(?:城市|地)|目的(?:城市|地)|To city|Destination/i,date:/出发日期|去程日期|Departure date/i,back:/返回日期|回程日期|Return date/i,adults:/成人|Adults/i,cabin:/舱位|舱等|Cabin/i};
  function guard(){if(location.hostname!=='flights.ctrip.com'||!/^\/online\/(?:channel|list)(?:\/|$)/.test(location.pathname))throw Error('请从平台打开携程机票搜索页。');core.blocked();}
  function field(key){
    // The channel page also has recommendation filters named owDCity. Only
    // the actual city-or-airport search field carries this visible label.
    if(key==='from'||key==='to')return core.unique(core.all('input.form-input-v3[name="'+(key==='from'?'owDCity':'owACity')+'"][aria-label="可输入城市或机场"]'),'携程搜索表单的'+(key==='from'?'出发地':'目的地')+'未能唯一识别。');
    if(key==='date')return core.unique(core.all('.modifyDate.depart-date input[aria-label="请选择日期"]'),'携程出发日期控件未能唯一识别。');
    if(key==='back')return core.unique(core.all('#owADatewrap input[aria-label="请选择日期"]'),'携程返回日期控件未能唯一识别。');
    if(key==='adults')return core.unique(core.all('span.form-select-txt').filter(e=>/\d\s*成人/.test(core.text(e))),'携程乘客人数控件未能唯一识别。');
    if(key==='cabin')return core.unique(core.all('.form-select-v3 > span').filter(e=>cabinScope(core.text(e)).length),'携程舱位控件未能唯一识别。');
    return core.field(patterns[key]);
  }
  function tripOptions(){return core.all('li').filter(e=>{const labels=core.all('span.radio-label',e);return labels.length===1&&/^(单程|往返)$/.test(core.text(labels[0]));});}
  function tripType(){const selected=tripOptions().filter(e=>e.classList?.contains('active'));if(selected.length===1)return core.text(core.all('span.radio-label',selected[0])[0])==='往返'?'roundtrip':'oneway';return selected.length?null:core.tripType();}
  async function chooseTrip(type){const candidates=tripOptions().filter(e=>core.text(core.all('span.radio-label',e)[0])===(type==='roundtrip'?'往返':'单程'));if(candidates.length){core.unique(candidates,'携程行程类型选项不唯一。').click();await core.wait(150);if(tripType()!==type)throw Error('携程尚未确认所选行程类型，请在官网选择后重试。');}else await core.chooseTrip(type);}
  function controlValue(key){const e=field(key);if(e.tagName==='SELECT')return e.selectedOptions?.[0]?.textContent||e.value;return e.value===undefined?core.text(e):e.value;}
  const label=value=>String(value||'').replace(/[\uE000-\uF8FF]/g,'').replace(/\s+/g,'').trim();
  function cabinScope(value){const clean=label(value);return /^(经济\/超经舱|经济舱\/超级经济舱)$/.test(clean)?['economy','premium_economy']:/^(公务\/头等舱|公务舱\/头等舱)$/.test(clean)?['business','first']:/^(超级经济舱|高端经济舱|超经舱|Premium(?:Economy)?)$/i.test(clean)?['premium_economy']:/^(经济舱|Economy)$/i.test(clean)?['economy']:/^(商务舱|公务舱|Business)$/i.test(clean)?['business']:/^(头等舱|First)$/i.test(clean)?['first']:[];}
  function passengers(){const value=controlValue('adults');const adult=String(value).match(/(?:^|\D)(\d{1,2})\s*成人/),child=String(value).match(/(?:^|\D)(\d{1,2})\s*儿童/),infant=String(value).match(/(?:^|\D)(\d{1,2})\s*婴儿/);if(!adult||!child||!infant)throw Error('无法完整确认携程成人、儿童和婴儿人数，请在官网核对乘客人数。');return {adults:Number(adult[1]),children:Number(child[1]),infants:Number(infant[1])};}
  function conditions(q){guard();const type=tripType();if(!type)throw Error('无法确认携程当前选择的是单程还是往返，请核对官网行程类型。');const target=core.leg(q,type==='roundtrip'?'roundtrip':q.direction||'outbound');const from=controlValue('from'),to=controlValue('to');if(!core.sameCity(from,target.from,target.fromLabel)||!core.sameCity(to,target.to,target.toLabel))throw Error('携程当前出发地或目的地与平台不一致，请先选择正确城市。');const people=passengers();if(people.children||people.infants)throw Error('携程当前包含儿童或婴儿，与本次仅成人查询不一致。');const scope=cabinScope(controlValue('cabin'));if(!scope.includes(q.cabin))throw Error('携程当前舱位与本次查询不一致。');return core.verify(q,{tripType:type,from:target.from,to:target.to,date:core.dateValue(controlValue('date')),returnDate:type==='roundtrip'?core.dateValue(controlValue('back')):undefined,adults:people.adults,cabin:q.cabin,cabinScope:scope,...(scope.length>1?{cabinEvidence:'per-card-required'}:{}),evidence:'visible-ctrip-main-search-controls'});}
  async function chooseCity(input,iata,name){
    input.click();core.setValue(input,name||iata);await core.wait(200);
    for(let attempt=0;attempt<10;attempt++){
      core.blocked();
      const cityQuery=Boolean(globalThis.flightQueryCore?.cities?.[iata]);
      const rows=core.all(cityQuery?'.poi-address > .address':'ul.airport li');
      const matches=rows.filter(row=>{const codes=core.all('span.code',row).filter(e=>!e.classList?.contains('city')).map(e=>core.text(e).trim());return codes.length===1&&codes[0]===iata;});
      if(matches.length===1){matches[0].click();await core.wait(150);if(core.sameCity(input.value,iata,name))return;throw Error('携程尚未确认所选城市或机场，请重试。');}
      if(matches.length>1)throw Error('携程城市或机场候选不唯一，请在官网选择后重试。');
      await core.wait(150);
    }
    throw Error('携程未显示可唯一核验的城市或机场候选，请在官网选择后重试。');
  }
  async function chooseCabin(wanted){if(cabinScope(controlValue('cabin')).includes(wanted))return;field('cabin').click();await core.wait(100);const candidates=core.all('li').filter(e=>cabinScope(core.text(e)).includes(wanted));core.unique(candidates,'携程舱位选项不唯一，请在官网选择。').click();await core.wait(100);if(!cabinScope(controlValue('cabin')).includes(wanted))throw Error('携程尚未确认所选舱位。');}
  function inspect(q){
    guard();if(!location.pathname.startsWith('/online/list/')||!cards().length)throw Error('携程当前尚未显示可识别的航班搜索结果，请完成搜索后读取。');
    const urlMeta=core.inspectCtripUrl(location.href);
    if(urlMeta&&!urlMeta.cabinScope.includes(q.cabin))throw Error('携程当前舱位范围与本次查询不一致。');
    const meta=urlMeta?core.verify(q,{...urlMeta,cabin:q.cabin,cabinEvidence:'per-card-required'}):conditions(q);
    let currency=null;try{currency=core.currency();}catch{
      const values=[...new Set((core.text(globalThis.document?.body).match(/\b(?:CNY|RMB|JPY|USD|HKD|EUR|GBP|KRW)\b|人民币|日元/gi)||[]).map(value=>value==='人民币'||/^(CNY|RMB)$/i.test(value)?'CNY':value==='日元'?'JPY':value.toUpperCase()))];if(values.length===1)currency=values[0];
    }
    return {...meta,currency,verified:true,back:meta.returnDate,currencyEvidence:currency?'explicit-visible-page-currency':'unverified-yen-symbol'};
  }
  function calendarMonths(modal){return core.all('.date-header .date-title .date-m',modal).map(e=>{const year=core.text(core.unique(core.all('span.year',e),'携程日历年份不明确。')).match(/(\d{4})年/);const month=core.text(core.unique(core.all('span.month',e),'携程日历月份不明确。')).match(/(\d{1,2})月/);return year&&month?year[1]+'-'+month[1].padStart(2,'0'):null;}).filter(Boolean);}
  async function date(key,value){
    const input=field(key);if(core.dateValue(input.value)===value)return;
    // The official input is readonly. Click actual calendar cells, never remove
    // readonly or assign a date that the provider has not accepted.
    input.click();await core.wait(100);
    for(let attempt=0;attempt<18;attempt++){
      core.blocked();const modal=core.unique(core.all('.calendar-modal.date-custom.date-custom-v2'),'携程日期面板未能唯一识别。');
      const title=core.all('.cmodal-title strong',modal).map(core.text).join(' ');
      if(!(key==='date'?/选择出发日期/:/选择(?:返回|返程|回程)日期/).test(title))throw Error('携程打开的日期类型与本次操作不一致。');
      const candidates=core.all('.date-day[data-testid="date-day-'+value+'"]',modal).filter(e=>!e.classList?.contains('date-nocurrent')&&!e.classList?.contains('date-disabled')&&!e.disabled&&e.getAttribute('aria-disabled')!=='true');
      if(candidates.length>1)throw Error('携程日期候选不唯一，请在官网选择日期。');
      if(candidates.length===1){candidates[0].click();for(let check=0;check<10;check++){await core.wait(100);if(core.dateValue(input.value)===value)return;}throw Error('携程尚未确认所选日期，请在官网核对。');}
      const months=calendarMonths(modal).sort();if(!months.length)throw Error('携程日历当前月份无法核验。');
      const target=value.slice(0,7);if(target>=months[0]&&target<=months.at(-1))throw Error('目标日期在携程当前日历中不可选。');
      const previous=target<months[0],panels=core.all('.date-picker.date-picker-block',modal),panel=previous?panels[0]:panels.at(-1);
      const selector=previous?'span.prev-ico.iconf-left':'span.next-ico.iconf-right';
      let buttons=panel?core.all(selector,panel):[];if(!buttons.length)buttons=core.all(selector,modal);
      buttons=buttons.filter(e=>!e.disabled&&!/disabled/.test(e.className||'')&&e.getAttribute('aria-disabled')!=='true');
      core.unique(buttons,'目标日期超过携程当前可选择的日历范围。').click();
      let moved=false;for(let check=0;check<10;check++){await core.wait(100);const current=core.all('.calendar-modal.date-custom.date-custom-v2');if(current.length===1&&calendarMonths(current[0]).sort().join()!==months.join()){moved=true;break;}}
      if(!moved)throw Error('携程日历月份没有更新，请稍候重试。');
    }
    throw Error('携程日历未找到指定日期，请在官网选择后重试。');
  }
  async function fillSearch(q){guard();const target=core.leg(q,q.direction||(q.tripType==='roundtrip'?'roundtrip':'outbound'));const currentUrl=core.inspectCtripUrl(location.href);if(currentUrl&&target.tripType==='oneway'&&currentUrl.cabinScope.includes(q.cabin)&&['from','to','date','adults'].every(key=>currentUrl[key]===target[key]))return {message:'已处于携程指定路线、日期和人数的查询。结果显示后点②读取并回传，具体舱位按产品核验。'};if(tripType()!==target.tripType)await chooseTrip(target.tripType);for(const key of ['from','to']){const input=field(key);if(!core.sameCity(input.value,target[key],target[key+'Label']))await chooseCity(input,target[key],target[key+'Label']);}await date('date',target.date);if(target.returnDate)await date('back',target.returnDate);const people=passengers();if(people.adults!==q.adults||people.children||people.infants)throw Error('请在携程将乘客调整为 '+q.adults+' 成人、0儿童、0婴儿后重试。');await chooseCabin(q.cabin); // A broad cabin search can run; exact fare cabin must still be verified on results.
    const current=conditions(q);if(current.tripType!==target.tripType)throw Error('携程行程类型未确认，已暂停搜索。');const buttons=core.all('button.search-btn[type="submit"]').filter(e=>/^(搜索|搜索航班|查询航班|Search)$/i.test(label(core.text(e)||e.value||e.getAttribute('aria-label')||'')));core.unique(buttons,'携程搜索按钮未能唯一识别，请点击官网搜索。').click();return {message:'已核对并提交携程查询。报价显示后读取；往返仅收录含完整往返航段的总价。'};
  }
  const content=(selector,root)=>core.all(selector,root).map(core.text).filter(Boolean);
  function one(selector,root){const nodes=core.all(selector,root);return nodes.length===1?nodes[0]:null;}
  function rowMain(item){const boxes=core.all('.flight-box',item).filter(e=>e.parentElement===item);return boxes.length===1?boxes[0]:null;}
  function flightText(main){
    const departure=core.text(one('.flight-detail .depart-box .time',main)),arrival=core.text(one('.flight-detail .arrive-box .time',main));
    const from=core.text(one('.flight-detail .depart-box .airport .name',main)),to=core.text(one('.flight-detail .arrive-box .airport .name',main));
    if(!departure||!arrival||!from||!to)return null;
    const mapped=core.airportText(from+'\n'+to),airports=mapped.match(/\b[A-Z]{3}\b/g)||[];
    if(airports.length!==2)return null;
    const times=[departure,arrival].map(value=>(value.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*\+\s*[1-3])?/g)||[]));
    if(times.some(value=>value.length!==1))return null;
    const transfer=content('.flight-detail .transfer-info-group',main).join(' ');
    const domestic=main.parentElement?.classList?.contains('domestic');
    // Domestic UI has a combined "直飞/经停" checkbox, never use it as
    // nonstop evidence. Require the single-flight arrow and empty stop lane.
    const domesticDirect=domestic&&core.all('.flight-detail .transfer-info-group',main).length===1&&core.all('i.arrow-oneway',main).length===1&&!/中转|转机|经停|转\d+次/.test(core.text(main))&&content('.plane .plane-No',main).length===1;
    const stops=/中转|转机|经停/.test(transfer)?'中转':(/直飞|直达/.test(core.text(main))||nonstopSelected()||domesticDirect)?'直飞':'';
    return [...content('.flight-row .flight-airline .airline-name',main),...content('.plane .plane-No',main),airports.join(' → '),times.map(value=>value[0]).join(' → '),stops].filter(Boolean).join('\n');
  }
  function fareAmount(value){const prices=Array.from(value.matchAll(/(?:CNY|RMB|人民币|¥|￥)\s*[0-9]+(?:[,，][0-9]{3})*(?:\.[0-9]{1,2})?/g),match=>match[0]);return prices.length===1?prices[0]+(/起/.test(value)?'起':''):null;}
  function cardFor(main,product=null){
    const base=flightText(main);if(!base)return null;
    const domestic=main.parentElement?.classList?.contains('domestic');
    const selector=domestic?(product?'.domestic-cabin-price > .price > span.price':'.domestic-flight-price > .price > span.price'):(product?'.seat-operate .operate .seat-price .price-box > div.price.price-b':'.flight-operate .flight-price');
    const priceText=core.text(one(selector,product||main));
    const price=fareAmount(priceText);if(!price)return null;
    const raw=[nonstopSelected()?'官网直飞筛选已选中':'',core.text(main),product?core.text(product):''].filter(Boolean).join('\n').slice(0,2500);
    const cabinEvidence=product?core.text(one(domestic?'.domestic-seat-type .domestic-cabin-item':'.seat-type',product)):'';
    const scope=cabinScope(domestic?cabinEvidence.replace(/[\d.]+折|全价/g,''):cabinEvidence),observedCabin=scope.length===1?scope[0]:null;
    const captureIssues=[];
    if(!observedCabin)captureIssues.push('携程当前报价尚未明确显示唯一的具体舱位');
    if(product&&/(?:限.{0,24}(?:周岁|年龄|乘客|会员|新客)|仅限|券后|需领券|新客专享|会员专享|首单专享)/.test(core.text(product)))captureIssues.push('该票价包含年龄、身份或优惠资格限制，尚未核验是否适用');
    if(product&&/(?:多人特惠|学生|青年|老人|长者|\+\s*[¥￥]\s*\d+.*服务包)/.test(core.text(product)))captureIssues.push('该票价有身份、人数限制或额外服务包费用，暂不参与比价');
    const taxes=content('.flight-operate .flight-price .tip',main).join(' ');
    const negativeTax=product?core.text(product).match(/(?:不含|未含|不包含|未包含|不包括).{0,6}税(?:费)?/)?.[0]:null;
    return {innerText:[base,cabinEvidence,price,negativeTax||taxes].filter(Boolean).join('\n'),rawText:raw,observedCabin,cabinEvidence:observedCabin?cabinEvidence:null,captureIssues,
      evidence:product?'ctrip-visible-dom:flight-item>flight-box+flight-seats; exact product seat-price only; rules/vouchers retained in rawText':'ctrip-visible-dom:flight-box; starting price and mixed cabin retained for review'};
  }
  function itemCards(item){const main=rowMain(item);if(!main)return [];const products=core.all('.flight-seats > .seat-row.seat-row-v3',item);return (products.length?products.map(product=>cardFor(main,product)):[cardFor(main)]).filter(Boolean);}
  function nonstopFilter(){const nodes=core.all('.filter-key.no-options .form-label').filter(node=>core.text(node).trim()==='直飞');return nodes.length===1?nodes[0]:null;}
  function nonstopSelected(){const node=nonstopFilter();return !!node?.querySelector?.('i.ico-checkbox.active');}
  async function ensureNonstop(){const node=nonstopFilter();if(!node)return; if(!nonstopSelected()){node.click();for(let i=0;i<20&&!nonstopSelected();i++)await core.wait(100);if(!nonstopSelected())throw Error('官网直飞筛选未能选中，请手动选择直飞后重试。');await core.wait(350);}}
  function cards(){guard();return core.all('.flight-item').flatMap(itemCards);}
  async function prepareCapture(q){
    guard();await ensureNonstop();
    guard();if(!location.pathname.startsWith('/online/list/'))throw Error('请先在携程完成查询后读取。');
    const queryUrl=()=>{const url=new URL(location.href);url.hash='';return url.href;};
    const initialUrl=queryUrl();
    const verifyPage=()=>{guard();if(queryUrl()!==initialUrl)throw Error('携程页面在读取期间发生跳转，已停止。');const meta=core.inspectCtripUrl(location.href);if(meta){if(!meta.cabinScope.includes(q.cabin))throw Error('携程查询舱位范围已改变。');core.verify(q,{...meta,cabin:q.cabin});}else conditions(q);};
    verifyPage();const snapshots=new Map(),visited=new Set();
    const deadline=Date.now()+15000;let expanded=0,attempted=0;
    for(let page=0;page<12&&Date.now()<deadline;page++){
     const items=core.all('.flight-item');
     for(const item of items){
      if(visited.has(item))continue;
      if(item.classList?.contains('domestic')&&Date.now()<deadline){
        // Flight numbers are lazy-rendered when a domestic card enters the
        // viewport. Read after scrolling, including already-open products.
        item.scrollIntoView?.({block:'center',behavior:'instant'});
        for(let step=0;step<8&&Date.now()<deadline;step++){
          await core.wait(100);verifyPage();
          const main=rowMain(item);
          if(main&&content('.plane .plane-No',main).length)break;
        }
      }
      visited.add(item);snapshots.set(item,itemCards(item));
      if(attempted>=40||Date.now()>=deadline)continue;
      verifyPage();if(core.all('.flight-seats > .seat-row.seat-row-v3',item).length)continue;
      const main=rowMain(item);if(!main)continue;
      if(item.classList?.contains('domestic')&&/中转|转机|经停|转\d+次/.test(core.text(main)))continue;
      const button=one('button[u_key="flight_action_expand_all_price"]',main);
      if(!button||button.getAttribute('u_remark')!=='航班上展开/收起运价'||/收起/.test(core.text(button)))continue;
      attempted++;button.click();
      for(let step=0;step<6&&Date.now()<deadline;step++){await core.wait(100);verifyPage();if(core.all('.flight-seats > .seat-row.seat-row-v3',item).length){snapshots.set(item,itemCards(item));expanded++;break;}}
     }
     if(attempted>=40||Date.now()>=deadline)break;
     const last=items.at(-1);if(!last?.scrollIntoView)break;
     last.scrollIntoView({block:'end',behavior:'instant'});
     let added=false;
     for(let wait=0;wait<5&&Date.now()<deadline;wait++){
      await core.wait(150);verifyPage();
      if(core.all('.flight-item').some(item=>!visited.has(item))){added=true;break;}
     }
     if(!added)break;
    }
    // Copy each product while it was visible. Opening another item may close
    // the previous accordion; never carry live DOM nodes across that change.
    return {expanded,cards:Array.from(snapshots.values()).flat(),message:'本次读取 '+snapshots.size+' 张已加载航班卡片，展开 '+expanded+' 张明细；未加载的航班未采集。'};
  }
  globalThis.flightCtripAdapter={fillSearch,cards,inspect,prepareCapture};
})();
