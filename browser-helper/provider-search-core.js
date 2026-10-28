(()=>{
  const cabins={economy:'Y',premium_economy:'S',business:'C',first:'F'};
  const cabinNames={economy:'经济舱',premium_economy:'超级经济舱',business:'公务舱',first:'头等舱'};
  const mainland=new Set(globalThis.flightQueryCore.mainlandCities.flatMap(c=>[c,...globalThis.flightQueryCore.cities[c].airports]));
  const isDomestic=q=>mainland.has(q.from)&&mainland.has(q.to);
  const airportNames=globalThis.flightQueryCore.airportAliases;
  function airportText(raw){if(new RegExp('\\b(?:'+Object.values(airportNames).join('|')+')\\b').test(raw))return raw;const matches=Array.from(raw.matchAll(new RegExp('(?:'+Object.keys(airportNames).join('|')+')(?!航空|机场大巴)','g'))).map(m=>airportNames[m[0]]);return matches.length===2||matches.length===4?raw+'\n机场代码（按可见机场名对应）：'+matches.join(' → '):raw;}
  const code=value=>typeof value==='string'&&/^[A-Z]{3}$/.test(value);
  const iso=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value;};
  function validate(q){if(!q||!code(q.from)||!code(q.to)||q.from===q.to||!iso(q.out)||(q.back!==undefined&&(!iso(q.back)||q.back<q.out))||(q.tripType==='roundtrip'&&!q.back)||!Number.isInteger(q.adults)||q.adults<1||q.adults>9||!cabins[q.cabin])throw Error('查询城市、日期、成人数或舱位无效');return q;}
  function leg(q,direction='outbound'){validate(q);if(!['outbound','return','roundtrip'].includes(direction)||direction!=='outbound'&&!iso(q.back))throw Error('查询方向或回程日期无效');const back=direction==='return';const from=back?q.to:q.from,to=back?q.from:q.to;return {from,to,date:back?q.back:q.out,returnDate:direction==='roundtrip'?q.back:undefined,tripType:direction==='roundtrip'?'roundtrip':'oneway',direction:direction==='roundtrip'?'outbound':direction,adults:q.adults,cabin:q.cabin,fromLabel:(back?q.toLabel||q.toName:q.fromLabel||q.fromName)||globalThis.flightQueryCore?.routeName(from)||from,toLabel:(back?q.fromLabel||q.fromName:q.toLabel||q.toName)||globalThis.flightQueryCore?.routeName(to)||to};}
  const capabilities={ctrip:{name:'携程',home:'https://flights.ctrip.com/online/channel/international',automaticLinks:true,roundtrip:'needs-visible-complete-total',status:'needs-live-test',note:'城市间经济/超经单程可带条件打开；其他查询由官网表单完成，报价仍需核验。'},ly:{name:'同程',home:'https://www.ly.com/iflight/',automaticLinks:true,roundtrip:'needs-visible-complete-total',status:'needs-live-test',note:'已按官方公开导航格式生成查询链接，实际结果读取待实测。'}};
  function searchUrl(provider,q,direction=q.direction||'outbound'){
    const target=leg(q,direction),config=capabilities[provider];if(!config)throw Error('不支持的官网');
    if(provider==='ctrip'){
      const cityCodes=new Set(Object.keys(globalThis.flightQueryCore.cities));
      // The official UI generated this single-city-pair route and y_s scope.
      // Airport-specific search semantics and other cabin/roundtrip routes have
      // not yet been observed, so those still use the official form.
      if(target.tripType!=='oneway'||!cityCodes.has(target.from)||!cityCodes.has(target.to)||!['economy','premium_economy'].includes(target.cabin))return isDomestic(target)?'https://flights.ctrip.com/online/channel/domestic':config.home;
      const url=new URL('https://flights.ctrip.com/online/list/oneway-'+target.from.toLowerCase()+'-'+target.to.toLowerCase());
      for(const [key,value] of Object.entries({depdate:target.date,cabin:'y_s',adult:String(target.adults),child:'0',infant:'0'}))url.searchParams.set(key,value);
      return url.href;
    }
    if(isDomestic(target)){
      // Observed official domestic navigation. Empty airport fields retain all
      // airports in a city; PEK is Beijing's city route in this UI.
      if(target.tripType!=='oneway'||target.adults!==1||target.cabin!=='economy'||![target.from,target.to].every(c=>globalThis.flightQueryCore.mainlandCities.includes(c)))return 'https://www.ly.com/flights/home';
      const map=c=>c==='BJS'?'PEK':c==='SIA'?'XIY':c;
      const url=new URL('https://www.ly.com/flights/itinerary/oneway/'+map(target.from)+'-'+map(target.to));
      for(const [k,v] of Object.entries({date:target.date,from:target.fromLabel,to:target.toLabel,fromairport:'',toairport:'',p:'',childticket:'0,0'}))url.searchParams.set(k,v);
      return url.href;
    }
    const url=new URL('https://www.ly.com/iflight/book1.html');
    url.searchParams.set('para',[target.from,target.to,target.date,target.returnDate||'1900-01-01',target.tripType==='roundtrip'?'RT':'OW',target.adults+'_0_0',cabins[target.cabin]].join('*'));
    return url.href;
  }
  function inspectLyUrl(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='www.ly.com'||u.pathname!=='/iflight/book1.html')return null;const a=(u.searchParams.get('para')||'').split('*');if(a.length!==7||!code(a[0])||!code(a[1])||a[0]===a[1]||!iso(a[2])||!['OW','RT'].includes(a[4])||!/^[1-9]_0_0$/.test(a[5]))return null;const cabin=Object.entries(cabins).find(([,v])=>v===a[6])?.[0];if(!cabin||(a[4]==='RT'?(!iso(a[3])||a[3]<a[2]):a[3]!=='1900-01-01'))return null;return {from:a[0],to:a[1],date:a[2],returnDate:a[4]==='RT'?a[3]:undefined,tripType:a[4]==='RT'?'roundtrip':'oneway',adults:Number(a[5][0]),cabin,evidence:'official-visible-url'};}catch{return null;}}
  function inspectCtripUrl(raw){try{const u=new URL(raw),route=u.pathname.match(/^\/online\/list\/oneway-([a-z]{3})-([a-z]{3})$/);if(u.protocol!=='https:'||u.hostname!=='flights.ctrip.com'||!route||route[1]===route[2])return null;const p=u.searchParams;if(['depdate','cabin','adult','child','infant'].some(k=>p.getAll(k).length!==1)||!iso(p.get('depdate'))||p.get('cabin')!=='y_s'||!/[1-9]/.test(p.get('adult'))||!/^\d$/.test(p.get('adult'))||p.get('child')!=='0'||p.get('infant')!=='0')return null;return {from:route[1].toUpperCase(),to:route[2].toUpperCase(),date:p.get('depdate'),tripType:'oneway',adults:Number(p.get('adult')),cabinScope:['economy','premium_economy'],evidence:'official-visible-ctrip-search-url'};}catch{return null;}}
  function inspectLyDomesticUrl(raw){try{const u=new URL(raw),m=u.pathname.match(/^\/flights\/itinerary\/oneway\/([A-Z]{3})-([A-Z]{3})$/);if(u.protocol!=='https:'||u.hostname!=='www.ly.com'||!m||m[1]===m[2])return null;const p=u.searchParams;if(['date','fromairport','toairport','childticket'].some(k=>p.getAll(k).length!==1)||!iso(p.get('date'))||p.get('fromairport')!==''||p.get('toairport')!==''||p.get('childticket')!=='0,0')return null;const code=c=>c==='PEK'?'BJS':c==='XIY'?'SIA':c;if(![code(m[1]),code(m[2])].every(c=>globalThis.flightQueryCore.mainlandCities.includes(c)))return null;return {from:code(m[1]),to:code(m[2]),date:p.get('date'),tripType:'oneway',adults:1,cabin:'economy',evidence:'official-visible-domestic-search-url'};}catch{return null;}}
  const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest?.('[aria-hidden="true"]');
  const text=e=>(e?.innerText||e?.textContent||'').trim();
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function all(selector,root=document){return Array.from(root.querySelectorAll(selector)).filter(visible);}
  function fieldLabel(e){return [e.getAttribute('aria-label'),e.getAttribute('placeholder'),...Array.from(e.labels||[]).map(text),text(e.closest?.('dl')?.querySelector('dt'))].filter(Boolean).join(' ');}
  function unique(items,message){if(items.length!==1)throw Error(message);return items[0];}
  function field(pattern,root=document){return unique(all('input,select',root).filter(e=>!['hidden','password','email','tel'].includes(e.type)&&pattern.test(fieldLabel(e))),'当前官网未能唯一识别 '+pattern+'，请手动选择后重试。');}
  function blocked(){const dialogs=all('[role="dialog"],iframe[title]').map(e=>text(e)||e.getAttribute('title')).join('\n');const body=text(document.body).slice(0,9000);if(/滑动.{0,15}(?:验证|滑块)|拖动.{0,15}(?:验证|滑块)|访问.{0,8}(?:频繁|受限)|请完成安全验证|验证您是人类|verify you are human|whaleguard/i.test(dialogs+'\n'+body))throw Error('官网要求人工安全验证，请完成后再继续；助手已暂停。');if(/请先登录|登录后.{0,8}(?:查询|查看航班)/.test(dialogs))throw Error('官网要求登录，请登录后再继续。');}
  function setValue(e,value){if(e.disabled||e.readOnly)throw Error('该控件需要从官网选项中选择。');const prototype=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(prototype,'value')?.set;if(!setter)throw Error('官网输入控件不支持填写。');setter.call(e,String(value));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
  const normal=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').toUpperCase();
  function sameCity(value,iata,label){const v=normal(value);return v===iata||!!label&&v===normal(label)||new RegExp('(?:^|[^A-Z])'+iata+'(?:$|[^A-Z])').test(String(value).toUpperCase());}
  async function chooseCity(e,iata,label){e.click();setValue(e,label||iata);await wait(250);for(let i=0;i<10;i++){blocked();const options=all('[role="option"],.v-citypicker-options li,.v-citypicker-options a').filter(o=>sameCity(text(o),iata,label));if(options.length===1){options[0].click();await wait(150);return;}if(options.length>1)throw Error('城市候选不唯一，请在官网选择 '+(label||iata)+' 后重试。');await wait(120);}throw Error('已填写 '+(label||iata)+'，官网城市候选未能确认，请手动选择后重试。');}
  function dateValue(value){const match=String(value||'').match(/(\d{4})[年\/-](\d{1,2})[月\/-](\d{1,2})/);return match?match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0'):null;}
  function selected(e){return e?.checked||e?.getAttribute('aria-selected')==='true'||e?.getAttribute('aria-checked')==='true'||e?.getAttribute('aria-pressed')==='true';}
  function tripType(){const values=all('input[type="radio"],[role="radio"],[role="tab"],button[aria-pressed]').filter(selected).map(e=>fieldLabel(e)+' '+text(e)).join(' ');return /往返|round.?trip/i.test(values)?'roundtrip':/单程|one.?way/i.test(values)?'oneway':null;}
  async function chooseTrip(type){const wanted=type==='roundtrip'?/^(往返|Round trip)$/i:/^(单程|One way)$/i;const candidates=all('button,label,[role="tab"],[role="radio"],.single-btn,.return-btn').filter(e=>wanted.test(text(e)));unique(candidates,'请先在官网选择 '+(type==='roundtrip'?'往返':'单程')+'。').click();await wait(150);}
  function priceCards(root=document,selector='li,[role="listitem"],article'){
    const eligible=e=>{const s=text(e);return s.length>=25&&s.length<=2500&&(s.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g)||[]).length>=2&&/(?:CNY|RMB|人民币|¥|￥)\s*\d|\d\s*元/.test(s);};
    const nodes=all(selector,root).filter(eligible);
    // Modern result lists often use divs instead of list semantics. Start at a
    // visible price, then walk a bounded number of parents to the smallest card.
    for(const price of all('span,strong,b,em',root).filter(e=>text(e).length<60&&/(?:CNY|RMB|人民币|¥|￥)\s*\d|\d\s*元/.test(text(e))).slice(0,150)){
      let parent=price;for(let depth=0;depth<7&&parent;depth++,parent=parent.parentElement){if(text(parent).length>2500)break;if(eligible(parent)){nodes.push(parent);break;}}
    }
    const uniqueNodes=[...new Set(nodes)];
    return uniqueNodes.filter(e=>!uniqueNodes.some(other=>other!==e&&e.contains(other))).map(e=>({innerText:airportText(text(e)),rawText:text(e),evidence:'visible-dom-with-explicit-airport-name-mapping'}));
  }
  function currency(root=document){const s=text(root.body||root);if(/(?:人民币|\bCNY\b|\bRMB\b)/i.test(s)&&!/(?:日元|\bJPY\b)/i.test(s))return 'CNY';throw Error('页面尚未明确显示人民币币种，请切换人民币后读取。');}
  function verify(q,meta){const target=leg(q,meta.tripType==='roundtrip'?'roundtrip':q.direction||(meta.from===q.to?'return':'outbound'));if(['from','to','date','tripType','adults','cabin'].some(key=>meta[key]!==target[key])||target.returnDate!==meta.returnDate)throw Error('官网当前路线、日期、乘客或舱位与平台条件不一致，请先填写搜索。');return {...meta,direction:target.direction};}
  globalThis.flightProviderSearchCore={capabilities,searchUrl,inspectLyUrl,inspectLyDomesticUrl,isDomestic,inspectCtripUrl,validate,leg,cabinNames,airportText,visible,text,all,field,unique,blocked,setValue,normal,sameCity,chooseCity,dateValue,selected,tripType,chooseTrip,priceCards,currency,verify,wait};
})();
