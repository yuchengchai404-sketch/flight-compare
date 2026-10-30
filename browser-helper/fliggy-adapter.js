(()=>{
  const core=globalThis.flightProviderSearchCore,queryCore=globalThis.flightQueryCore;
  const one=(selector,root=document)=>{const nodes=core.all(selector,root);return nodes.length===1?nodes[0]:null;};
  const text=(selector,root)=>core.text(one(selector,root));
  const restricted=raw=>/周岁|\d+\s*岁|年龄限制|仅限|限.{0,15}(?:乘客|会员|多人)|多人特惠|学生|青年|老人|长者|新客|券后|需领券|首单|会员专享/.test(raw.replace(/不限年龄|年龄不限|无年龄限制/g,''));
  function dismissNotice(){
    core.blocked();const panel=one('#J_Flight_Notify_Panel'),button=panel&&one('#J_Flight_Notify_Close_Btn',panel);
    if(button&&core.text(button)==='我知道了'&&/出行提醒/.test(core.text(panel))&&/充电宝限制携带提醒/.test(core.text(panel)))button.click();
  }
  function inspect(q){
    core.blocked();const meta=core.inspectFliggyUrl(location.href);
    if(!meta)throw Error('请从平台打开飞猪国内单程查询入口。');
    const verified=core.verify(q,meta),form=one('#J_NeSearch');
    if(!form||one('input[name="depDate"]',form)?.value!==meta.date||
      form.querySelector('input[name="tripType"]:checked')?.value!=='0'||
      one('input[name="depCityName"]',form)?.value!==queryCore.routeName(meta.from)||
      one('input[name="arrCityName"]',form)?.value!==queryCore.routeName(meta.to))throw Error('飞猪页面实际日期或城市与查询不一致。');
    if(!core.all('#J_FlightListBox .J_FlightItem').length)throw Error('飞猪航班列表尚未加载。');
    return {...verified,currency:'CNY',verified:true,cabinScope:['economy'],cabinEvidence:'per-card-required',priceBasis:'per-person'};
  }
  function flight(item){
    const head=one('.flight-item-tr',item);if(!head)return null;
    const title=text('.J_TestFlight',head),match=title.match(/([A-Z0-9]{2}\d{3,4})$/);
    const depart=text('.flight-time-deptime',head),arrive=text('.s-time',head);
    const route=core.airportText(text('.port-dep',head)+'\n'+text('.port-arr',head)).match(/\b[A-Z]{3}\b/g)||[];
    const raw=core.text(head);
    // This observed domestic layout explicitly marks all stopovers with J_Stop.
    if(!match||route.length!==2||core.all('.J_Stop',head).length||/经停|中转|转机/.test(raw)||!/^\d{2}:\d{2}$/.test(depart)||!/^\d{2}:\d{2}$/.test(arrive))return null;
    const offset=(raw.match(/第([2-4])天/)||[])[1];
    if(arrive<depart&&!offset)return null;
    return {title:title.replace(match[1],' '+match[1]),route,depart,arrive,offset:offset?Number(offset)-1:0,raw};
  }
  function rowCards(item){
    const head=flight(item);if(!head)return [];
    const taxText=text('.J_Agents .tax',item),taxMatch=taxText.match(/^机建\+燃油[：:]\s*[¥￥]\s*(\d+(?:\.\d{1,2})?)$/);
    if(!taxMatch)return [];
    const tax=Number(taxMatch[1]);
    return core.all('.J_AgentItem',item).flatMap(product=>{
      const price=text('.J_DisplayPrice',product),cabin=text('.cabin-no-tip',product);
      // Use the plain economy product, not a branded cabin inferred from its name.
      if(cabin!=='经济舱'||!/^\d+(?:\.\d{1,2})?$/.test(price))return [];
      const tips=core.all('[data-content],[title]',product).map(e=>e.getAttribute('data-content')||e.getAttribute('title')||'').join('\n').replace(/<[^>]*>/g,' ');
      const raw=[head.raw,core.text(product),tips,'票价不含税费',taxText].join('\n');
      if(restricted(raw))return [];
      const total=Math.round((Number(price)+tax)*100)/100;
      return [{innerText:[head.title,head.route.join(' → '),head.depart+' → '+head.arrive+(head.offset?' +'+head.offset:''),'直飞','经济舱','每人含税合计 ¥'+total+'起'].join('\n'),rawText:raw.slice(0,8000),observedCabin:'economy',cabinEvidence:'经济舱',captureIssues:[],evidence:'fliggy-domestic-visible-product:v1; fare plus displayed airport/fuel tax; no stop marker'}];
    });
  }
  async function prepareCapture(q){
    dismissNotice();inspect(q);const original=location.href,results=[],deadline=Date.now()+75000;let expanded=0,skipped=0;
    for(const item of core.all('#J_FlightListBox .J_FlightItem').slice(0,100)){
      if(Date.now()>deadline)break;
      core.blocked();if(location.href!==original)throw Error('飞猪页面已跳转，已停止读取。');
      if(!flight(item)){skipped++;continue;}
      if(!core.all('.J_AgentItem',item).length){
        const button=one('.flight-item-tr .J_SelectFlight',item);
        if(!button||button.getAttribute('aria-label')!=='订票')continue;
        // This button only expands the product list. Never click J_Reserve.
        button.click();expanded++;
        for(let i=0;i<15&&!core.all('.J_AgentItem',item).length;i++){
          await core.wait(100);core.blocked();if(location.href!==original)throw Error('飞猪页面已跳转，已停止读取。');
        }
      }
      results.push(...rowCards(item));
    }
    return {cards:results,message:'飞猪已展开 '+expanded+' 个航班；跳过 '+skipped+' 条经停或不明记录，仅读取已显示税费的普通经济舱产品。'};
  }
  globalThis.flightFliggyAdapter={inspect,rowCards,restricted,prepareCapture,cards:()=>core.all('#J_FlightListBox .J_FlightItem').flatMap(rowCards),readiness(q){dismissNotice();inspect(q);return 'adapter-ready';},async fillSearch(q){const url=core.searchUrl('fliggy',q,q.direction);location.assign(url+'#fcq='+encodeURIComponent(JSON.stringify(q)));return {message:'已打开飞猪指定日期的单程查询。'};}};
})();
