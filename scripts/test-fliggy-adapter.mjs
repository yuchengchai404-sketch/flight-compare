import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {providerSearchUrl} from '../lib/provider-links.mjs';
import {validateBrowserRecord} from '../lib/browser-records.mjs';
import {comparisonCompletion} from '../lib/workflow.mjs';
const q={from:'SHA',to:'CKG',out:'2026-12-19',back:'2026-12-21',tripType:'roundtrip',adults:1,cabin:'economy',direction:'outbound'};
const base=globalThis.flightProviderSearchCore,url=providerSearchUrl('fliggy',q,'outbound');
assert.equal(new URL(url).searchParams.get('depDate'),q.out);
assert.equal(base.inspectFliggyUrl(providerSearchUrl('fliggy',q,'return')).from,'CKG');
assert.equal(base.inspectFliggyUrl(url+'&depDate=2027-01-01'),null);
assert.throws(()=>providerSearchUrl('fliggy',{...q,adults:2}));
assert.throws(()=>providerSearchUrl('fliggy',{...q,to:'TYO'}));
const node=(innerText='',fields={})=>({innerText,...fields});
const product=(price,cabin='经济舱',restriction='')=>node('¥'+price+'\n'+cabin+'\n'+restriction,{kind:'product',price,cabin,restriction});
let clicks=0,reserves=0,blocked=false;
function fixture({stop=false,tax='机建+燃油：¥140',products=[product('300'),product('200','经济舱','限12–81周岁（不含）'),product('100','商务舱')]}={}){
 const item={kind:'item',stop,tax,products,open:false};
 item.head=node('春秋9C6107\n22:55\n02:05\n第2天\n浦东国际机场T2\n江北国际机场T3'+(stop?'\n经停':''),{kind:'head',item});
 item.button={getAttribute:()=> '订票',click(){clicks++;for(const f of flights)f.open=false;item.open=true;}};
 item.reserve={click(){reserves++;throw Error('Do not book');}};return item;
}
let flights=[fixture(),fixture({stop:true})];
// The visible custom radio uses a display:none native input in the real page.
const form=node('',{kind:'form',querySelector:()=>({value:'0'})}),document={body:node('')};
function all(selector,root=document){
 if(root===document){if(selector==='#J_NeSearch')return [form];if(selector==='#J_FlightListBox .J_FlightItem')return flights;return [];}
 if(root===form){const values={'input[name="depDate"]':q.out,'input[name="tripType"]:checked':'0','input[name="depCityName"]':'上海','input[name="arrCityName"]':'重庆'};return selector in values?[{value:values[selector]}]:[];}
 if(root.kind==='item'){
  if(selector==='.flight-item-tr')return [root.head];
  if(selector==='.flight-item-tr .J_SelectFlight')return [root.button];
  if(selector==='.J_AgentItem')return root.open?root.products:[];
  if(selector==='.J_Agents .tax')return root.open?[node(root.tax)]:[];
 }
 if(root.kind==='head'){
  const fields={'.J_TestFlight':'春秋9C6107','.flight-time-deptime':'22:55','.s-time':'02:05','.port-dep':'浦东国际机场T2','.port-arr':'江北国际机场T3'};
  if(selector==='.J_Stop')return root.item.stop?[node('经停')]:[];
  return selector in fields?[node(fields[selector])]:[];
 }
 if(root.kind==='product'){
  if(selector==='.J_DisplayPrice')return [node(root.price)];
  if(selector==='.cabin-no-tip')return [node(root.cabin)];
  if(selector==='[data-content],[title]')return [{getAttribute:()=>root.restriction}];
 }
 return [];
}
const ctx=vm.createContext({URL,console,document,location:{href:url},Date,globalThis:undefined});
ctx.globalThis=ctx;ctx.flightQueryCore=globalThis.flightQueryCore;ctx.flightProviderSearchCore={...base,all,wait:async()=>{},blocked(){if(blocked)throw Error('官网要求人工安全验证');}};
vm.runInContext(fs.readFileSync('browser-helper/fliggy-adapter.js','utf8'),ctx);
const a=ctx.flightFliggyAdapter;
assert.equal(a.inspect(q).currency,'CNY');
const prepared=await a.prepareCapture(q);
assert.equal(clicks,1);assert.equal(reserves,0);assert.equal(prepared.cards.length,1,'stopover, restricted and other cabins excluded before sync');
const card=prepared.cards[0];assert.match(card.innerText,/¥440起/);assert.match(card.innerText,/02:05 \+1/);
const capture={id:randomUUID(),text:card.innerText,rawText:card.rawText,observedCabin:card.observedCabin,cabinEvidence:card.cabinEvidence,cardEvidence:card.evidence,captureIssues:[],query:q,url,capturedAt:new Date().toISOString(),tripType:'oneway',direction:'outbound',metadata:a.inspect(q)};
const accepted=validateBrowserRecord(capture);assert.equal(accepted.source,'fliggy');assert.equal(accepted.normalized.eligible,true,accepted.normalized.reason);assert.equal(accepted.normalized.totalPrice,440);assert.equal(accepted.normalized.taxIncluded,true);assert.equal(accepted.normalized.legs[0].direct,true);
assert.equal(validateBrowserRecord({...capture,rawText:card.rawText+'\n限12–81周岁'}).normalized.eligible,false);
assert.equal(validateBrowserRecord({...capture,url:url.replace('2026-12-19','2026-12-20')}).normalized.eligible,false);
flights=[fixture({tax:''})];assert.equal((await a.prepareCapture(q)).cards.length,0,'no invented taxes');
blocked=true;await assert.rejects(()=>a.prepareCapture(q),/安全验证/);assert.equal(reserves,0);
const run={queryId:'q',startedAt:1000,tasks:['Google Flights','携程','同程','飞猪'].flatMap(name=>['去程','回程'].map(d=>({label:name+' · '+d,state:'done'})))};
const tuniu={source:'tuniu',status:'success',checkedAt:new Date(2000).toISOString(),items:['outbound','return'].map(direction=>({ticketType:'oneway',direction}))};
assert.equal(comparisonCompletion(run,'q',[tuniu],false).complete,true);
assert.equal(comparisonCompletion({...run,tasks:run.tasks.map((t,i)=>i===7?{...t,state:'waiting'}:t)},'q',[tuniu],false).complete,false);
console.log('PASS Fliggy domestic URL, tax sum, exact cabin, stopover/age exclusion, no booking, server verification and five-platform completion.');
