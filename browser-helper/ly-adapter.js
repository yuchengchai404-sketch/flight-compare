(()=>{
  const core=globalThis.flightProviderSearchCore;
  function guard(){if(location.hostname!=='www.ly.com'||!/^\/iflight\/(?:book1\.html)?$/.test(location.pathname))throw Error('请从平台打开同程国际机票查询入口。');core.blocked();if(/您的停留时间过长|当前价格可能发生变化，请重新查询/.test(core.text(globalThis.document?.body)))throw Error('同程查询已过期，请点击官网重新查询，待结果显示后再读取。');}
  const content=(selector,root)=>core.all(selector,root).map(core.text).filter(Boolean);
  function one(selector,root){const nodes=core.all(selector,root);return nodes.length===1?nodes[0]:null;}
  function airport(selector,root){const value=core.text(one(selector,root));const codes=value.match(/\b[A-Z]{3}\b/g)||[];return codes.length===1?codes[0]:null;}
  function clock(selector,root){const value=core.text(one(selector,root));const times=value.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*\+\s*[1-3])?/g)||[];return times.length===1?times[0]:null;}
  function arrivalClock(trip,departureDate){
    const time=clock('.arrive-time',trip),node=one('.arrive-time',trip),labels=node?content('span.add-days',node):[];
    if(!labels.length)return {time,issues:[]};
    const issue='官网显示了到达日期，但尚未能唯一核验与出发日相差0至3天；该报价暂不参与比价';
    if(!time||labels.length!==1||!departureDate)return {time,issues:[issue]};
    const dates=Array.from(labels[0].matchAll(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g));
    if(dates.length!==1)return {time,issues:[issue]};
    const [,year,month,day]=dates[0],base=Date.parse(departureDate+'T00:00:00Z'),offsets=[];
    for(let offset=0;offset<=3;offset++){const date=new Date(base+offset*86400000);if((!year||date.getUTCFullYear()===Number(year))&&date.getUTCMonth()+1===Number(month)&&date.getUTCDate()===Number(day))offsets.push(offset);}
    if(offsets.length!==1)return {time,issues:[issue]};
    const explicitOffset=time.match(/\+\s*([1-3])/);
    if(explicitOffset&&Number(explicitOffset[1])!==offsets[0])return {time,issues:[issue]};
    return {time:time.split(/\s*\+/)[0]+(offsets[0]?' +'+offsets[0]:''),issues:[]};
  }
  function selectedOutbound(){
    const meta=core.inspectLyUrl(location.href);if(meta?.tripType!=='roundtrip')return null;
    const summary=one('.repeatChooseGo'),heading=one('.flight-title .s-trip');
    if(!summary||!/^去程已选$/.test(core.text(one('.hasChooseTitle',summary)))||!/^选择返程/.test(core.text(heading)))return null;
    const departure=core.text(one('.depInfo .time',summary)).match(/^(\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
    const arrival=core.text(one('.arrInfo .time',summary)).match(/^(\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
    const names=[core.text(one('.depInfo .airportInfo',summary)),core.text(one('.arrInfo .airportInfo',summary))];
    const codes=core.airportText(names.join('\n')).match(/\b[A-Z]{3}\b/g)||[];
    if(!departure||!arrival||departure[1]!==meta.date.slice(5)||codes.length!==2)return null;
    const route=globalThis.flightQueryCore?.routeMatches;if(!route||!route(codes[0],meta.from)||!route(codes[1],meta.to))return null;
    const base=Date.parse(meta.date+'T00:00:00Z'),offsets=[];
    for(let i=0;i<=3;i++)if(new Date(base+i*86400000).toISOString().slice(5,10)===arrival[1])offsets.push(i);
    if(offsets.length!==1)return null;
    const transfer=core.all('.transform-item',summary).length>0;
    const airline=core.text(one('.airway-name',summary));
    // Transfer summaries show only the first flight number, so do not label it
    // as the complete journey's unique flight number.
    const flight=transfer?'':core.text(one('.airNum',summary));
    return {text:[codes.join(' → '),airline,flight,departure[2]+' → '+arrival[2]+(offsets[0]?' +'+offsets[0]:''),transfer?'中转':''].filter(Boolean).join('\n'),raw:core.text(summary),heading:core.text(heading)};
  }
  function flightText(main){
    const trips=core.all('.flight-center .trip-info',main),parts=[],issues=[],query=core.inspectLyUrl(location.href),outbound=selectedOutbound();
    if(!trips.length||trips.length>2)return null;
    for(const [index,trip] of trips.entries()){
      const from=airport('.depart-airport',trip),to=airport('.arrive-airport',trip),departure=clock('.depart-time',trip),arrivalInfo=arrivalClock(trip,outbound?query?.returnDate:index===0?query?.date:query?.returnDate),arrival=arrivalInfo.time;
      if(!from||!to||!departure||!arrival)return null;
      issues.push(...arrivalInfo.issues);
      const transfer=content('.arrow-list .arrow-item',trip);
      const visibleText=core.text(trip);
      // These arrow rows are the visible transfer stops. An empty arrow is not
      // evidence of a nonstop flight: only an explicit visible label adds it.
      const stops=transfer.length?'中转':(/直飞|直达/.test(visibleText)||nonstopSelected())?'直飞':'';
      parts.push([from,to,departure,arrival,stops].filter(Boolean).join(' '));
    }
    return {text:[...content('.flight-left .airways-title',main),...content('.flight-left .airways-model',main),...parts].join('\n'),issues};
  }
  function fare(base,main,scope,expanded){
    const priceNode=one(expanded?'.pro-price .price-info':'.flight-right .price-info',scope);
    const price=core.text(priceNode);
    if(!/(?:CNY|RMB|人民币|¥|￥)\s*\d|\d\s*元/i.test(price))return null;
    const priceArea=expanded?one('.pro-price',scope):one('.flight-right',scope);
    const starting=content('i',priceArea||priceNode).some(value=>value==='起')||/起/.test(price);
    const tax=content(expanded?'.inclue-tax .tax-text':'.price-tax .tax-text',scope).join(' ');
    const cabin=expanded?content('.pro-left-info',scope).join(' '):'';
    const packs=expanded?content('.price-pack',scope):[];
    const captureIssues=[...base.issues];
    // The dedicated fare amount excludes unrelated refund/change penalties and
    // insurance in .pro-main. A separately listed package remains unresolved.
    if(packs.length)captureIssues.push('该舱位另列礼包或附加费用，尚未核验是否必选及完整应付总价');
    if(expanded){
      const restrictions=core.text(scope).replace(/\s+/g,'').replace(/无(?:人数|年龄)限制|不限(?:人数|年龄)|(?:人数|年龄)不限|(?:人数|年龄)限制[：:]无/g,'');
      if(/人数限制|年龄限制|至少\s*\d+\s*(?:位|名)?\s*(?:成人|乘客|人)|\d+\s*人(?:起订|起售|成行|及以上|以上)|限.{0,24}(?:周岁|年龄|乘客|会员|新客)|仅限|券后|需领券|新客专享|会员专享|首单专享/.test(restrictions))captureIssues.push('该票价有人数、年龄、身份或优惠资格限制，尚未核验是否适用');
    }
    const shownCabin=/超级经济|超经|高端经济/.test(cabin)?'premium_economy':/头等/.test(cabin)?'first':/公务|商务/.test(cabin)?'business':/经济/.test(cabin)?'economy':null;
    const searchedCabin=core.inspectLyUrl(location.href)?.cabin;
    if(shownCabin&&searchedCabin&&shownCabin!==searchedCabin)captureIssues.push('该报价显示舱位与本次查询舱位不同');
    return {innerText:[base.text,cabin,price+(starting&&!/起/.test(price)?'起':''),tax,...packs].filter(Boolean).join('\n'),
      rawText:[nonstopSelected()?'官网直飞筛选已选中':'',base.outbound?.heading,base.outbound?.raw,core.text(main),expanded?core.text(scope):''].filter(Boolean).join('\n').slice(0,2500),captureIssues,
      evidence:base.outbound&&expanded&&/含税总价/.test(tax)?'ly-roundtrip:selected-outbound+return-product-total:v1':expanded?'ly-visible-dom:flight-item-main+pro-item; fare=.pro-price .price-info; refund/change/insurance prices excluded; packages retained':'ly-visible-dom:flight-item-main; fare=.flight-right .price-info; starting-price label retained'};
  }
  function itemCards(item){
    const main=one('.flight-item-main',item);if(!main)return [];
    const base=flightText(main);if(!base)return [];
    const outbound=selectedOutbound();
    if(outbound){
      // Put the return route before its airline so the two leg boundaries remain explicit.
      const lines=base.text.split('\n'),route=lines.pop();
      base.text=outbound.text+'\n'+route+'\n'+lines.join('\n');base.outbound=outbound;
    }
    const products=core.all('.flight-product .pro-item',item);
    return (products.length?products.map(product=>fare(base,main,product,true)):[fare(base,main,main,false)]).filter(Boolean);
  }
  function nonstopFilter(){const nodes=core.all('.filter-box .filter-item').filter(node=>core.text(node).trim()==='直飞');return nodes.length===1?nodes[0]:null;}
  function nonstopSelected(){const node=nonstopFilter();return node?.classList?.contains('active');}
  async function ensureNonstop(){const node=nonstopFilter();if(!node)return; if(!nonstopSelected()){node.click();for(let i=0;i<20&&!nonstopSelected();i++)await core.wait(100);if(!nonstopSelected())throw Error('官网直飞筛选未能选中，请手动选择直飞后重试。');await core.wait(350);}}
  function cards(){guard();return core.all('.flight-list > .flight-item').flatMap(itemCards);}
  async function prepareCapture(q){
    guard();await ensureNonstop();
    guard();const initial=core.inspectLyUrl(location.href);
    if(!initial)throw Error('请先在同程完成查询后读取。');
    core.verify(q,initial);
    // RT selection changes the selected leg. Never treat it as an accordion.
    const selected=selectedOutbound();
    if(initial.tripType==='roundtrip'&&!selected)throw Error('请先在同程选择一条去程；显示去程已选和返程列表后，再点②读取完整往返报价。');
    const pageUrl=()=>{const url=new URL(location.href);url.hash='';return url.href;};
    const initialUrl=pageUrl();
    const verifyPage=()=>{guard();if(pageUrl()!==initialUrl)throw Error('同程页面在读取期间发生跳转，已停止。');const meta=core.inspectLyUrl(location.href);if(!meta||meta.tripType!==initial.tripType)throw Error('同程查询类型已改变，已停止。');core.verify(q,meta);if(selected&&selectedOutbound()?.raw!==selected.raw)throw Error('已选去程发生变化，已停止读取。');};
    const items=core.all('.flight-list > .flight-item'),snapshots=new Map(items.map(item=>[item,itemCards(item)]));
    const deadline=Date.now()+8000;let expanded=0,attempted=0;
    for(const item of items){
      if(attempted>=8||Date.now()>=deadline)break;
      verifyPage();if(core.all('.flight-product .pro-item',item).length)continue;
      const main=one('.flight-item-main',item);if(!main)continue;
      const button=one('.flight-btn',main);
      if(!button||!/^(?:余\d+张)?选择$/.test(core.text(button).replace(/\s+/g,'')))continue;
      attempted++;button.click();
      for(let step=0;step<15&&Date.now()<deadline;step++){
        await core.wait(100);verifyPage();
        if(core.all('.flight-product .pro-item',item).length){snapshots.set(item,itemCards(item));expanded++;break;}
      }
    }
    verifyPage();
    return {cards:Array.from(snapshots.values()).flat(),expanded,message:'自动展开 '+expanded+' 张运价明细；仅同步已确认直飞的报价。'};
  }
  function inspect(q){
    guard();const meta=core.inspectLyUrl(location.href);
    if(!meta)throw Error('同程尚未进入可识别的机票结果页，请先填写条件并搜索。');
    if(!cards().length)throw Error('同程结果尚未加载或报价结构待适配；当前没有可核验的可见报价。');
    let currency=null;try{currency=core.currency();}catch{
      // A bare ¥ is ambiguous. Explicit foreign currency can still be reported
      // so the caller refuses it instead of silently treating it as unknown.
      const visible=core.text(globalThis.document?.body);
      const matches=[...new Set((visible.match(/\b(?:CNY|RMB|JPY|USD|HKD|EUR|GBP|KRW)\b|人民币|日元/gi)||[]).map(value=>value==='人民币'||/^(CNY|RMB)$/i.test(value)?'CNY':value==='日元'?'JPY':value.toUpperCase()))];
      if(matches.length===1)currency=matches[0];
    }
    return {...core.verify(q,{...meta,currency}),verified:true,back:meta.returnDate,
      currencyEvidence:currency?'explicit-visible-page-currency':'unverified-yen-symbol'};
  }
  async function fillSearch(q){guard();const direction=q.direction||(q.tripType==='roundtrip'?'roundtrip':'outbound');const target=core.searchUrl('ly',q,direction);const actual=new URL(location.href);actual.hash='';if(actual.href!==target){const context={...q};if(direction==='roundtrip')delete context.direction;else context.direction=direction;location.assign(target+'#fcq='+encodeURIComponent(JSON.stringify(context)));return {message:'已打开同程指定路线和日期的查询。结果显示后读取；如官网要求验证，请完成后继续。'};}return {message:'已处于同程指定查询。请等报价显示后读取。'};}
  // The calendar fallback uses attributes observed on the official /iflight/ page.
  // It is available for pages whose router does not retain the public search URL.
  async function selectDate(input,iso){if(!core.dateValue(iso))throw Error('日期无效');input.click();for(let attempt=0;attempt<15;attempt++){core.blocked();const cells=core.all('.v-dpicker_wrap .v-dpicker_date-cell span[date]').filter(e=>e.getAttribute('date')===iso&&!e.parentElement.classList.contains('disabled'));if(cells.length===1){cells[0].click();await core.wait(100);if(core.dateValue(input.value)!==iso)throw Error('同程日历尚未确认所选日期，请手动选择。');return;}const panels=core.all('.v-dpicker_wrap');const panel=core.unique(panels,'未能唯一识别同程日期面板，请手动选择日期。');const months=core.all('.v-dpicker_title',panel).map(e=>core.text(e).match(/(\d{4})\s*年\s*(\d{1,2})\s*月/)).filter(Boolean).map(m=>m[1]+'-'+m[2].padStart(2,'0'));if(!months.length)break;const button=core.unique(core.all(iso.slice(0,7)<months[0]?'.prev-month':'.next-month',panel).filter(e=>!e.disabled&&!/disabled/.test(e.className)),'目标日期不在同程当前可选择范围。');button.click();await core.wait(100);}throw Error('同程日历未找到目标日期，请在官网手动选择。');}
  globalThis.flightLyAdapter={fillSearch,cards,inspect,selectDate,prepareCapture};
})();
