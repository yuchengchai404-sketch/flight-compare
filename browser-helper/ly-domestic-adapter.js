(()=>{
  const core=globalThis.flightProviderSearchCore;
  const one=(s,r)=>{const a=core.all(s,r);return a.length===1?a[0]:null;};
  const text=(s,r)=>core.text(one(s,r));
  function inspect(q){
    core.blocked();const meta=core.inspectLyDomesticUrl(location.href);
    if(!meta)throw Error('同程国内查询条件未能确认，请从平台重新打开单程入口。');
    const verified=core.verify(q,meta);
    if(!core.all('.flight-item-head').length)throw Error('同程国内尚未显示航班结果，请等待结果或完成官网验证。');
    return {...verified,currency:null,verified:true,cabinEvidence:'per-card-required',cabinScope:['economy','premium_economy','business','first']};
  }
  function rowCards(item){
    const head=one('.flight-item-head',item);if(!head)return [];
    const title=text('.flight-item-name',head),depart=text('.f-startTime > strong',head),arrive=text('.f-endTime > strong',head);
    const from=text('.f-startTime em',head),to=text('.f-endTime em',head);
    const route=core.airportText(from+'\n'+to).match(/\b[A-Z]{3}\b/g)||[];
    const line=text('.f-line-to',head),headText=core.text(head);
    // A domestic single-leg duration line contains just duration. Stop labels,
    // multiple flight numbers or an unfamiliar line layout are not collected.
    if(route.length!==2||!/^\d{2}:\d{2}$/.test(depart)||!/^\d{2}:\d{2}$/.test(arrive)||!/^(?:\d+h)?(?:\d+m)?$/.test(line)||!line||/中转|转机|经停|转\d+次/.test(headText)||(title.match(/\b[A-Z0-9]{2}\d{3,4}\b/g)||[]).length!==1)return [];
    const offset=(text('.f-endTime',head).match(/\+\s*([1-3])/)||[])[1];
    if(!offset&&arrive<depart)return [];
    return core.all('.cabins-item',item).map(product=>{
      const price=text('.price-show em',product)||text('.price-show strong',product);
      const cabin=text('.price-show .gray-style',product);
      const observedCabin=/超经|超级经济|高端经济/.test(cabin)?'premium_economy':/经济舱/.test(cabin)?'economy':/公务舱|商务舱/.test(cabin)?'business':/头等舱/.test(cabin)?'first':null;
      const raw=core.text(product),issues=[];
      if(!/^[¥￥]\s*\d+(?:\.\d{1,2})?$/.test(price))return null;
      if(!observedCabin)issues.push('官网品牌运价未注明具体舱位，保留原文但不参与排名');
      if(/周岁|年龄|仅限|限.{0,15}(?:乘客|会员|多人)|多人特惠|学生|青年|老人|长者|新客|券后|需领券|首单|会员专享/.test(raw))issues.push('该票价有年龄、身份、人数或优惠资格限制，不参与比价');
      return {innerText:[title,route.join(' → '),depart+' → '+arrive+(offset?' +'+offset:''),'直飞',cabin,price].join('\n'),rawText:[headText,raw].join('\n').slice(0,2500),observedCabin,cabinEvidence:cabin,captureIssues:issues,evidence:'ly-domestic-visible-products; single-flight duration lane; exact product price; tax not asserted'};
    }).filter(Boolean);
  }
  function cards(){core.blocked();return core.all('.flight-item').flatMap(rowCards);}
  async function prepareCapture(q){
    inspect(q);const original=location.href,snapshots=new Map(),deadline=Date.now()+20000;let expanded=0;
    for(const item of core.all('.flight-item').slice(0,100)){
      if(Date.now()>deadline)break;
      core.blocked();if(location.href!==original)throw Error('同程页面已跳转，停止读取。');
      const btn=one('.btn-select',item);
      if(!core.all('.cabins-item',item).length&&btn&&/^选择$/.test(core.text(btn).replace(/立减\d+/g,'').trim())){
        btn.click();expanded++;
        for(let i=0;i<8&&!core.all('.cabins-item',item).length;i++){await core.wait(100);core.blocked();if(location.href!==original)throw Error('同程页面已跳转，停止读取。');}
      }
      snapshots.set(item,rowCards(item));
    }
    return {expanded,cards:[...snapshots.values()].flat(),message:'已读取 '+snapshots.size+' 张国内航班卡片的可见产品；未展开或未加载部分未采集。'};
  }
  globalThis.flightLyDomesticAdapter={inspect,cards,prepareCapture,async fillSearch(q){inspect(q);return {message:'已处于同程国内指定单程查询，点击②读取并回传。'};}};
})();
