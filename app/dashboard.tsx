'use client';
import {isDomesticQuery} from '@/lib/provider-links.mjs';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeftRight,Plane,RefreshCw,Check,ArrowUpRight,Download} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {normalizeQuery,routeName,cities,airports} from '@/lib/flight-query.mjs';
import {googleSingleUrl} from '@/lib/google-single.mjs';
import {providerSearchUrl} from '@/lib/provider-links.mjs';
import {compareRecords,total} from '@/lib/compare.mjs';
import type {Snapshot} from '@/lib/model';
import {apiDate,apiQuotes} from '@/lib/api-quotes.mjs';
import ScheduleComparison from './schedule-comparison';
import PendingRecords from './pending-records';
import {resolvePlace,placeHint} from '@/lib/place-input.mjs';
import {readJson} from '@/lib/read-json.mjs';
import {providerProgress,restoreStep} from '@/lib/workflow.mjs';
import {readCapturePages} from '@/lib/capture-pages.mjs';
import {refreshProvider} from '@/lib/refresh-provider.mjs';

type Query={id:string;from:string;to:string;out:string;back?:string;adults:number;cabin:string;tripType:string;fromName?:string;toName?:string;direction?:string};
type Quote={id:string;storageId?:string;query?:Query;source:string;batch?:string;currencyReview?:any;capturedAt:string;url:string;text:string;normalized:any};
const preset=(second=false):Query=>normalizeQuery({from:'SHA',to:'TYO',out:second?'2027-01-01':'2026-12-31',back:second?'2027-01-05':'2027-01-04',adults:1,cabin:'economy',tripType:'roundtrip'});
const names:Record<string,string>={google:'Google Flights',ctrip:'携程',ly:'同程',fliggy:'飞猪',tuniu:'途牛'};
const cabins:Record<string,string>={economy:'经济舱',premium_economy:'超级经济舱',business:'商务舱',first:'头等舱'};
const money=(n:number)=>'¥'+n.toLocaleString('zh-CN',{maximumFractionDigits:2});
const stamp=(s:string)=>new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const places=[...Object.entries(cities).map(([code,v]:[string,any])=>({code,name:v.name+'（全部机场）'})),...Object.entries(airports).filter(([code])=>!cities[code]).map(([code,name])=>({code,name:String(name)}))];
export default function Dashboard({initial}:{initial:Snapshot[]}){
 const [query,setQuery]=useState<Query>(preset),[draft,setDraft]=useState<Query>(preset),[history,setHistory]=useState<Query[]>([]);
 const [captures,setCaptures]=useState<Quote[]>([]),[version,setVersion]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[direct,setDirect]=useState(true),[daytime,setDaytime]=useState(false),[source,setSource]=useState('all'),[tab,setTab]=useState('outbound'),[limit,setLimit]=useState(10),[step,setStep]=useState(1),[apiData,setApiData]=useState<Snapshot[]>([]),[apiLoading,setApiLoading]=useState(false),[apiError,setApiError]=useState('');
 const [autoRun,setAutoRun]=useState<any>(null),[starting,setStarting]=useState(false);
 const [flowReady,setFlowReady]=useState(false);
 const apiKey=apiDate(query);
 useEffect(()=>{let alive=true;setApiData([]);setApiError('');if(apiKey)readJson('/api/fares?query='+encodeURIComponent(JSON.stringify(query))).then((j:any)=>{if(alive){if(j.error)setApiError(j.error);else setApiData(old=>(j.snapshots||[]).filter((s:Snapshot)=>['fliggy','tuniu'].includes(s.source)).map((s:Snapshot)=>{const newer=old.find(x=>x.source===s.source&&Date.parse(x.checkedAt)>Date.parse(s.checkedAt));return newer||s;}));}}).catch(()=>{if(alive)setApiError('接口记录暂时无法加载');});return()=>{alive=false;};},[apiKey]);
 async function refreshApi(){
  if(!apiKey||apiLoading)return;
  const id=query.id;setApiLoading(true);setApiError('');
  await Promise.allSettled(['fliggy','tuniu'].map(async source=>{
   try{
    const snapshot=await refreshProvider(query,source,{active:()=>active.current.id===id});
    if(snapshot&&active.current.id===id)setApiData(old=>[...old.filter(s=>s.source!==source),snapshot]);
   }catch(e){if(active.current.id===id)setApiError(old=>[old,names[source]+'：'+(e instanceof Error?e.message:'查询失败')].filter(Boolean).join('；'));}
  }));
  setApiLoading(false);
 }
 const active=useRef(query);active.current=query;
 const requestCounter=useRef(0);
 const reload=useCallback(async(q=active.current)=>{
  const token=++requestCounter.current;setLoading(true);
  try{const j=await readCapturePages((cursor:string|null)=>readJson('/api/browser-quotes?query='+encodeURIComponent(q.id)+(cursor?'&cursor='+encodeURIComponent(cursor):'')),()=>token===requestCounter.current);if(j&&token===requestCounter.current){setCaptures(j.captures);setMessage(old=>/读取报价超时|采集记录暂不可用/.test(old)?'报价列表已更新。':old);}return j;}
  finally{if(token===requestCounter.current)setLoading(false);}
 },[]);
 useEffect(()=>{
  let q=preset();
  try{const saved=JSON.parse(localStorage.getItem('flight-query-v2')||'null');if(saved)q=normalizeQuery(saved);
   if(location.hash.startsWith('#fcq='))q=normalizeQuery(JSON.parse(decodeURIComponent(location.hash.slice(5))));
   setQuery(q);setDraft(q);setStep(restoreStep(sessionStorage.getItem('flight-flow-v1'),q.id));
   const h=JSON.parse(localStorage.getItem('flight-query-history-v2')||'[]');setHistory(h.map((x:unknown)=>{try{return normalizeQuery(x);}catch{return null;}}).filter(Boolean).slice(0,8));
  }catch{/* Ignore invalid saved preferences. */}finally{setFlowReady(true);}
 },[]);
 useEffect(()=>{if(flowReady)try{sessionStorage.setItem('flight-flow-v1',JSON.stringify({queryId:query.id,step}));}catch{}},[flowReady,query.id,step]);
 useEffect(()=>{setCaptures([]);void reload(query).catch(e=>setMessage(e.message));setTab('outbound');setLimit(10);
  window.postMessage({type:'flight-query-context',query},location.origin);
 },[query,reload]);
 useEffect(()=>{
  const receive=(e:MessageEvent)=>{if(e.source!==window||e.origin!==location.origin)return;const m=e.data;
   if(m?.type==='flight-helper-ready'){setVersion(m.version||'');window.postMessage({type:'flight-query-context',query:active.current},location.origin);}
   if(m?.type==='flight-helper-disconnected'){setVersion('');setMessage('助手已更新，请刷新本页和官网页面。');}
   if(m?.type==='flight-captures-updated'){if(!m.queryId||m.queryId===active.current.id){void reload().catch(e=>setMessage(e.message));setMessage(m.error||'已收到官网报价，结果已更新。');}else setMessage('另一组行程已收到报价，可在最近查询中切换查看。');}
  };
  const focus=()=>void reload().catch(e=>setMessage(e.message));
  window.addEventListener('message',receive);window.addEventListener('focus',focus);window.postMessage({type:'flight-helper-ping'},location.origin);
  return()=>{window.removeEventListener('message',receive);window.removeEventListener('focus',focus);};
 },[reload]);
 function apply(input:Query){try{const q=normalizeQuery({...input,from:resolvePlace(input.from),to:resolvePlace(input.to)});if(q.id!==query.id){setSource('all');setDirect(true);setDaytime(false);}setQuery(q);setDraft(q);setStep(2);setMessage('行程已设置，点击“一键获取比价”即可开始。');const h=[q,...history.filter(x=>x.id!==q.id)].slice(0,8);setHistory(h);localStorage.setItem('flight-query-v2',JSON.stringify(q));localStorage.setItem('flight-query-history-v2',JSON.stringify(h));}catch(e){setMessage(e instanceof Error?e.message:'请检查行程条件');}}
 function helper(type:string,extra:any={}){return new Promise<any>((resolve,reject)=>{const requestId=crypto.randomUUID();const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('助手未响应，请确认已加载0.6.19并刷新页面。'));},45000);
  function receive(e:MessageEvent){if(e.source!==window||e.origin!==location.origin||e.data?.type!=='flight-sync-result'||e.data.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);e.data.error?reject(Error(e.data.error)):resolve(e.data);}
  window.addEventListener('message',receive);window.postMessage({type,date:query.id,queryId:query.id,query,requestId,...extra},location.origin);
 });}
 async function sync(){setBusy(true);try{if(!['0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7','0.6.8','0.6.9','0.6.10','0.6.11','0.6.12','0.6.13','0.6.14','0.6.15','0.6.16','0.6.19'].includes(version))throw Error('请加载助手0.6.19，并刷新平台和官网页面。');const result=await helper('flight-sync-request');await reload();setMessage('同步完成：'+(result.count||0)+'条。官网“读取并回传”已会自动完成这一步。');}catch(e){setMessage(e instanceof Error?e.message:'同步失败');}finally{setBusy(false);}}
 async function archive(restore=false){setBusy(true);try{
  if(!restore&&['0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7','0.6.8','0.6.9','0.6.10','0.6.11','0.6.12','0.6.13','0.6.14','0.6.15','0.6.16','0.6.19'].includes(version))await helper('flight-clear-pending');
  const r=await fetch('/api/browser-quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:restore?'restore-drafts':'clear-drafts',queryId:query.id})});const j=await r.json() as any;if(!r.ok)throw Error(j.error);await reload();setMessage(restore?'这组记录已恢复。':'这组测试记录已收起，可以从头测试；点击恢复记录可撤销。');
 }catch(e){setMessage(e instanceof Error?e.message:'操作失败');}finally{setBusy(false);}}
 async function confirmCurrency(group:{source:string;batch?:string;ids:string[];count:number}){setBusy(true);try{
  const r=await fetch('/api/browser-quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'confirm-currency',queryId:query.id,source:group.source,currency:'CNY',...(group.batch?{batch:group.batch}:{storageIds:group.ids})})});const j=await r.json() as any;if(!r.ok)throw Error(j.error||'币种确认失败');await reload();setMessage('已将'+j.count+'条记录标为人民币经你确认。'+(j.rejected?.length?'另有'+j.rejected.length+'条不符合确认条件，继续保留待核验。':'其他价格和行程条件仍分别核验。'));
 }catch(e){setMessage(e instanceof Error?e.message:'币种确认失败');}finally{setBusy(false);}}
 function link(provider:string,direction:string){
  const q={...query,direction:direction==='roundtrip'?undefined:direction,searchMode:direction==='roundtrip'?'roundtrip':'oneway'};
  const url=provider==='google'?googleSingleUrl(q,direction):providerSearchUrl(provider,q,direction);
  const u=new URL(url);u.hash='fcq='+encodeURIComponent(JSON.stringify(q));return u.href;
 }

 async function startComparison(){
  if(starting)return;
  if(version!=='0.6.19'){setMessage('一键获取需要助手0.6.19，请加载新版并刷新平台。');return;}
  setStarting(true);setStep(2);
  try{
   const tasks=['google','ctrip','ly'].flatMap(id=>(query.back?['outbound','return']:['outbound']).map(direction=>({url:link(id,direction),label:names[id]+' · '+(direction==='return'?'回程':'去程')})));
   const result=await helper('auto-start',{tasks});setAutoRun(result.run);setMessage('已启动官网自动采集。请保持平台和查询标签打开，结果会自动汇总。');
   if(apiKey)void refreshApi();
  }catch(e){setMessage(e instanceof Error?e.message:'启动失败');}finally{setStarting(false);}
 }
 async function taskAction(type:string,tabId:number){try{await helper(type,{tabId});const r=await helper('auto-progress');setAutoRun(r.run);}catch(e){setMessage(e instanceof Error?e.message:'请重新打开官网查询');}}
 useEffect(()=>{
  if(version!=='0.6.19')return;
  let live=true,timer:ReturnType<typeof setTimeout>;let first=true;
  const poll=async()=>{try{const r=await helper('auto-progress');if(!live)return;setAutoRun(r.run);
    if(r.run?.tasks?.some((t:any)=>t.state==='running'||t.state==='waiting'))timer=setTimeout(poll,4000);
    else if(r.run&&!first){await reload();if(live)setMessage('官网自动采集已结束，接口状态见下方；可查看比较结果。');}
   }catch{}first=false;};void poll();return()=>{live=false;clearTimeout(timer);};
 },[query.id,version,starting]);

 useEffect(()=>{if(autoRun?.queryId===query.id&&autoRun.tasks.length&&autoRun.tasks.every((t:any)=>t.state==='done')&&!apiLoading&&!starting){setStep(3);}},[autoRun,apiLoading,starting,query.id]);
 const allComparison=compareRecords([...captures,...apiQuotes(apiData,query)],query,{direct:true});
 const comparison=compareRecords([...captures,...apiQuotes(apiData,query)],query,{source,direct,daytime}),rows=(comparison as any)[tab]||[];
 const taxed=rows.filter((c:Quote)=>c.normalized.taxIncluded===true),unverified=rows.filter((c:Quote)=>c.normalized.taxIncluded!==true);
 const currencyGroups=Object.values((comparison.pending as Quote[]).filter(c=>['ctrip','ly'].includes(c.source)&&/币种|人民币/.test(c.normalized.reason||'')).reduce((acc:Record<string,{source:string;batch?:string;ids:string[];count:number;at:string}>,c)=>{const key=c.source+':'+(c.batch||c.capturedAt);const group=acc[key]||(acc[key]={source:c.source,batch:c.batch,ids:[],count:0,at:c.capturedAt});if(c.storageId)group.ids.push(c.storageId);group.count++;return acc;},{}));
 function showResults(){if(!rows.length)setTab(['outbound','return','roundtrip','split'].find(k=>(comparison as any)[k].length)||'outbound');setStep(3);}
 function table(items:Quote[],tax:boolean){if(!items.length)return null;return <section className="compare-group"><div className="results-head"><h3>按起价从低到高排列 <span>{items.length}</span></h3>{items.length>0&&<strong>{money(total(items[0].normalized))} 起</strong>}</div>{!items.length?<p className="muted">暂无结果。打开官网读取后将自动显示在这里。</p>:<div className="compare-table-wrap"><table className="compare-table"><thead><tr><th>平台 / 更新时间</th><th>航班与机场</th><th>当地起降时间</th><th>{query.adults}位成人{tab==='roundtrip'?'往返':tab==='split'?'两张单程合计':'单程'}显示价</th><th>核对来源</th></tr></thead><tbody>{items.slice(0,limit).map(c=><tr key={c.storageId||c.id}><td><b>{names[c.source]||c.source}</b><small>{stamp(c.capturedAt)}</small></td><td>{c.normalized.legs.map((l:any,i:number)=><div key={i}>{l.flight||l.airline||'航班信息待展开'}<small>{l.from} → {l.to} · {l.direct===true?'直飞':l.direct===false?'中转':'经停待核验'}</small></div>)}</td><td>{c.normalized.legs.map((l:any,i:number)=><div key={i}><b>{l.departureTime} → {l.arrivalTime}{l.arrivalDayOffset?' +'+l.arrivalDayOffset+'天':''}</b><small>{l.date}</small></div>)}</td><td><strong>{money(total(c.normalized))} 起</strong><small>{c.normalized.taxIncluded===true?'页面注明含税':c.normalized.taxIncluded===false?'页面注明不含税':'税费待核验'}{c.normalized.priceBasis==='per-person'&&query.adults>1?' · 按人均价合计':''}{c.currencyReview?' · 币种经你确认':''}{c.normalized.priceScopeEvidence==='selected-outbound-return-product'?' · 总价按已选去程和返程产品识别':''}</small></td><td><a href={c.url} target="_blank" rel="noopener noreferrer">官网 ↗</a><details><summary>采集原文</summary><pre>{c.normalized.rawText||c.text}</pre></details></td></tr>)}</tbody></table></div>}</section>;}
 return <div className="shell"><header><a className="brand" href="/"><span className="brand-mark"><Plane size={22}/></span>机票比价<span className="brand-sub">轻松比较机票</span></a><span className="private"><Check size={14}/>直飞比价</span></header><main>
 <div className="title-row"><div><div className="eyebrow">FLIGHT COMPARE</div><h1>去哪儿，先比一比</h1><p>填好行程，一键比较多个平台的直飞机票</p></div><details className="setup-menu"><summary>使用帮助</summary><p>首次使用：下载查价助手，解压后在浏览器扩展管理页加载。安装一次即可。</p><a className="download-link" href="/browser-helper-0.6.19.zip" download><Download size={16}/>下载查价助手</a><small>当前版本 0.6.19</small></details></div>
 <nav className="flow-steps" aria-label="查询步骤">{['填行程','自动查价','看结果'].map((label,i)=><button key={label} aria-current={step===i+1?'step':undefined} onClick={()=>i===2?showResults():setStep(i+1)}><span>{i+1}</span>{label}</button>)}</nav>{step===1&&<section className="query-card" aria-labelledby="query-heading"><h2 id="query-heading">1. 你想去哪里？</h2><form onSubmit={e=>{e.preventDefault();apply(draft);}}><div className="query-fields">
 <label>行程类型<select aria-label="行程类型" value={draft.tripType} onChange={e=>setDraft({...draft,tripType:e.target.value})}><option value="roundtrip">往返</option><option value="oneway">单程</option></select></label>
 <label>出发地<input required aria-label="出发地" list="flight-places" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value.toUpperCase()})} placeholder="输入中文城市、机场或三字码"/><small>{placeHint(draft.from)}</small></label>
 <button className="swap-button" type="button" aria-label="交换出发地和目的地" onClick={()=>setDraft({...draft,from:draft.to,to:draft.from})}><ArrowLeftRight size={18}/></button>
 <label>目的地<input required aria-label="目的地" list="flight-places" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value.toUpperCase()})} placeholder="输入中文城市、机场或三字码"/><small>{placeHint(draft.to)}</small></label>
 <label>出发日期<input required type="date" value={draft.out} onInput={e=>{const value=e.currentTarget.value;setDraft(d=>({...d,out:value}));}} onChange={e=>setDraft({...draft,out:e.target.value})}/></label>
 {draft.tripType==='roundtrip'&&<label>回程日期<input required type="date" min={draft.out} value={draft.back||''} onInput={e=>{const value=e.currentTarget.value;setDraft(d=>({...d,back:value}));}} onChange={e=>setDraft({...draft,back:e.target.value})}/></label>}
 <label>成人<select aria-label="成人" value={draft.adults} onChange={e=>setDraft({...draft,adults:Number(e.target.value)})}>{[1,2,3,4,5,6,7,8,9].map(n=><option key={n} value={n}>{n}位</option>)}</select></label>
 <label>舱位<select aria-label="舱位" value={draft.cabin} onChange={e=>setDraft({...draft,cabin:e.target.value})}>{Object.entries(cabins).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>
 <Button type="submit">下一步：开始比价</Button></div><datalist id="flight-places">{places.map(p=><option key={p.code} value={p.name}>{p.code}</option>)}</datalist></form>
 <details><summary>最近查询与测试行程</summary><div className="query-shortcuts"><span>测试行程</span><button onClick={()=>apply(preset(false))}>上海—东京 12/31–1/4</button><button onClick={()=>apply(preset(true))}>上海—东京 1/1–1/5</button>{history.length>0&&<select aria-label="最近查询" value="" onChange={e=>{const q=history.find(q=>q.id===e.target.value);if(q)apply(q);}}><option value="">最近查询…</option>{history.map(q=><option value={q.id} key={q.id}>{routeName(q.from)}—{routeName(q.to)} {q.out} {q.back||''} · {q.adults}位 · {cabins[q.cabin]}</option>)}</select>}</div></details>
 </section>}
 <p className="active-query"><b>当前行程：</b>{routeName(query.from)}→ {routeName(query.to)} · {query.out}{query.back?' / 回程 '+query.back:''} · {query.adults}位成人 · {cabins[query.cabin]} · 人民币起价</p>
 {step===2&&<section className="query-card"><div className="manual-head"><div><h2>2. 让我们帮你查价</h2><p className="muted">只比较直飞。开始后请保持浏览器打开，报价会自动汇总。</p></div><span className={version==='0.6.19'?'helper-ready':'helper-pending'}>{version==='0.6.19'?'助手已连接':'请先安装或更新助手'}</span></div>
 <div className="api-collection"><Button disabled={starting||apiLoading||autoRun?.tasks?.some((t:any)=>t.state==='running')} onClick={()=>void startComparison()}>{starting?'正在启动…':'一键获取比价'}</Button><p>依次查询各平台的去程和回程、读取直飞报价并汇总。请保持查询标签打开；登录和验证码需本人处理。</p>{autoRun&&<p role="status">官网进度：{autoRun.tasks.filter((t:any)=>t.state==='done').length} / {autoRun.tasks.length} 已完成{apiLoading?' · 接口查询中':''}</p>}{apiError&&<p role="alert">部分接口暂未完成：{apiError}</p>}{autoRun?.tasks?.filter((t:any)=>t.state==='waiting').map((task:any,i:number)=><div className="attention-card" key={i} role="alert"><b>{task.label}需要你处理</b><p>{/登录|验证/.test(task.message)?'请在官网完成登录或验证，再回来继续。':'这项查询还未完成，请打开官网检查后继续。'}</p>{Number.isInteger(task.tabId)?<><Button variant="outline" onClick={()=>void taskAction('auto-focus',task.tabId)}>打开官网</Button> <Button variant="outline" onClick={()=>void taskAction('auto-resume',task.tabId)}>已处理，继续</Button></>:<p>请更新助手后重新点击“一键获取比价”。</p>}<details><summary>查看原因</summary>{task.message}</details></div>)}<details><summary>查看各平台进度</summary>{autoRun?.tasks?.map((t:any,i:number)=><p key={i}>{t.label} · {t.state==='done'?'已完成':t.state==='waiting'?'等待处理':t.state==='queued'?'排队中':'查询中'}</p>)}</details></div><details className="manual-tools"><summary>单独查询某个平台</summary><div className="api-collection"><b>飞猪 · 途牛</b><p className="muted">{apiKey?(isDomesticQuery(query)?'国内接口分别查询去程和回程，结果放入“两张单程合计”。途牛需核验购买条件，查询约需一分钟，当前为部分航班。':'点击查询，报价自动加入结果。飞猪在“完整往返”，途牛在“两张单程合计”。'):'接口暂支持列表中的城市、1位成人、经济舱往返。其他条件请使用下方官网入口。'}</p><Button disabled={!apiKey||apiLoading} onClick={()=>void refreshApi()}>{apiLoading?'正在获取…':'获取飞猪和途牛报价'}</Button>{apiError&&<p role="alert">{apiError}</p>}<small>{apiData.map(s=>names[s.source]+"："+(s.items?.length||0)+"条 · "+stamp(s.checkedAt)).join("；")}</small></div><div className="provider-grid">{Object.entries(names).filter(([id])=>['google','ctrip','ly'].includes(id)).map(([id,name])=><article className="provider-choice" key={id}><h3>{name}</h3><p>{id==='google'?'去程、回程各查一次，分别比较。':id==='ly'?(isDomesticQuery(query)?'国内去程、回程分别读取，分别比较。支持1位成人经济舱；其他条件需在官网确认。':'单程直接读取；往返先选一条去程，再读取对应回程总价。'):'城市查询可直接打开结果；读取时自动展开可见运价。'}</p><div><a href={link(id,'outbound')} target="_blank" rel="noopener noreferrer">查去程 <ArrowUpRight size={14}/></a>{query.back&&<a href={link(id,'return')} target="_blank" rel="noopener noreferrer">查回程 <ArrowUpRight size={14}/></a>}{query.back&&id==='ly'&&!isDomesticQuery(query)&&<a href={link(id,'roundtrip')} target="_blank" rel="noopener noreferrer">尝试往返 <ArrowUpRight size={14}/></a>}</div><small>{providerProgress(allComparison,id,!!query.back)}</small></article>)}</div>
 </details><Button className="flow-next" onClick={showResults}>查看比较结果{allComparison.rows.length>0?'（'+allComparison.rows.length+'条）':''}</Button><details><summary>同步与记录管理</summary><div className="capture-actions"><Button variant="outline" disabled={busy} onClick={()=>void sync()}><RefreshCw size={15}/>手动同步待传结果</Button><Button variant="ghost" disabled={busy||loading} onClick={()=>void reload().catch(e=>setMessage(e.message))}>刷新列表</Button><Button variant="ghost" disabled={busy} onClick={()=>void archive()}>收起官网采集记录</Button><Button variant="ghost" disabled={busy} onClick={()=>void archive(true)}>恢复记录</Button></div></details></section>}
 {message&&<p className="import-message" role="status">{message}</p>}
 {step===3&&<section className="query-card" aria-labelledby="results-title"><div className="results-head"><h2 id="results-title">3. 选个合适的价格</h2><span>{loading&&!captures.length?'加载中…':comparison.rows.length+'条可比较结果'+(loading?' · 更新中':'')}</span></div><div className="capture-actions"><Button variant="outline" onClick={()=>setStep(2)}>重新获取报价</Button><Button variant="ghost" disabled={loading} onClick={()=>void reload().catch(e=>setMessage(e.message))}>刷新已采集结果</Button></div><div className="compare-tabs">{[['outbound','去程'],...(query.back?[['return','回程'],['roundtrip','往返票'],['split','两张单程合计']]:[])].filter(([k])=>['outbound','return'].includes(k)||(comparison as any)[k].length>0).map(([k,n])=><button key={k} aria-pressed={tab===k} className={tab===k?'selected':''} onClick={()=>{setTab(k);setLimit(10);}}>{n} <span>{(comparison as any)[k].length}</span></button>)}</div>
 <div className="filters"><span>仅直飞</span><label><input type="checkbox" checked={daytime} onChange={e=>setDaytime(e.target.checked)}/>10:00–17:00起飞</label><label>平台<select aria-label="结果平台" value={source} onChange={e=>setSource(e.target.value)}><option value="all">全部</option>{Object.entries(names).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label></div>
 <details><summary>价格说明与来源</summary><p className="muted">当前分类：{Object.entries(names).map(([id,name])=>name+" "+rows.filter((c:Quote)=>c.source===id).length+"条").join(" · ")}。{isDomesticQuery(query)?'国内飞猪、途牛请看两张单程合计。':'飞猪请看完整往返，途牛请看两张单程合计。'}仅显示已确认直飞的报价。价格均按起价比较，¥/￥默认人民币。</p>
 <p className="muted">同一行程、人数和舱位内按价格排序。去程、回程与完整往返分别比较；仅显示已读取结果，同一航班保留最新一批中的最低可比报价。超过24小时的记录移至历史区。</p></details>
 {!rows.length&&!loading&&<div className="muted"><p>{comparison.stale.length?'这组已采集报价已超过24小时，请重新获取报价。':comparison.pending.length?'已收到报价，但当前分类仍缺少可比较结果；请查看待核验原因或切换分类。':'当前分类暂无可比报价，请切换分类或重新获取报价。'}</p>{(direct||daytime||source!=='all')&&<Button variant="outline" onClick={()=>{setDirect(true);setDaytime(false);setSource('all');}}>清除时间和平台筛选</Button>}</div>}{table([...rows].sort((a:Quote,b:Quote)=>total(a.normalized)-total(b.normalized)),false)}<details><summary>展开多平台并排比较</summary><ScheduleComparison key={query.id+tab+source+direct+daytime} records={rows}/></details>{rows.length>limit&&<Button variant="outline" onClick={()=>setLimit(n=>n+10)}>显示更多</Button>}
 {currencyGroups.length>0&&<div className="currency-review"><h3>确认报价币种</h3><p className="muted">以下官网只显示“¥”。核对为人民币后，可整批确认；舱位、税费、起价和适用条件会继续核验。</p>{currencyGroups.map(g=><div key={g.source+':'+(g.batch||g.at)}><span>{names[g.source]} · {stamp(g.at)} · {g.count}条</span> <Button variant="outline" disabled={busy} onClick={()=>void confirmCurrency(g)}>确认这批{g.count}条为人民币</Button></div>)}</div>} <details className="review-inbox"><summary>待核验记录（{comparison.pending.length}）</summary><PendingRecords key={query.id} records={comparison.pending} names={names} stamp={stamp}/></details>
 <details className="review-inbox"><summary>过期记录（{comparison.stale.length}）</summary>{comparison.stale.map((c:Quote)=><p key={c.id}>{names[c.source]} · {stamp(c.capturedAt)} · {money(total(c.normalized))} · 请重新查询</p>)}</details>
 </section>}

 <details className="query-card"><summary>使用说明与支持范围</summary><ol><li>设置城市或机场（可直接输入中文）、日期、人数和舱位。上海选 SHA 包含虹桥和浦东；指定浦东可选 PVG。</li><li>飞猪、途牛点击一次获取；也可点击“一键获取比价”自动打开各官网、等待结果并回传。遇到登录或验证码，按提示处理后点击“已处理，继续”。Google 和携程的去程、回程各查一次；同程也可先选去程再读取往返。</li><li>回到“比较结果”查看价格，切换去程、回程、完整往返或两张单程合计。无需重复手动同步。</li></ol><p>当前内置23个主要国内城市（含上海、北京、广州、深圳、成都、西安等）及东京、大阪、首尔、曼谷、伦敦、巴黎、纽约。上海包含虹桥和浦东，北京包含首都和大兴，成都包含双流和天府。官网库存和支持舱位以实际页面为准。飞猪、途牛暂支持这些城市之间的1位成人、经济舱往返。</p><p>不同票种分开排序；按你的设置，¥/￥默认人民币，显示价格均按起价比较；明确标注其他币种的记录不换算。混合舱位和条件不足的报价留在待核验区；超过24小时归入历史。读取的是已展开的可见报价，不代表全网最低。</p><p>没有回传：先刷新官网和本页；仍无结果，再打开“获取报价 → 同步与记录管理”。扩展更新后需重新加载并刷新两边页面。登录、验证码需在官网完成。</p></details>
 <footer>价格、库存、行李和退改条件以官网最终确认页为准。这里只查询与比较，不创建订单。</footer>
 </main></div>;
}


