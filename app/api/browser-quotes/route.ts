import {database} from '@/db/store';
import {confirmCurrencyReview} from '@/lib/currency-review.mjs';
import {allowed,sameOrigin,reply} from '@/lib/access';
import {hydrateRecord,validateBrowserRecord,recordStorageId,validQueryId} from '@/lib/browser-records.mjs';
import {capturePageQuery,capturePage,capturePageSize} from '@/lib/capture-pages.mjs';

export async function GET(request:Request){
 if(!await allowed(request))return reply({error:'请先登录'},401);
 const queryId=new URL(request.url).searchParams.get('query');
 if(queryId&&!validQueryId(queryId))return reply({error:'查询编号无效'},400);
 try{
  const db=database();
  const legacyId=queryId==='q-SHA-TYO-20261231-20270104-a1-economy'?'20261231':queryId==='q-SHA-TYO-20270101-20270105-a1-economy'?'20270101':'';
  let statement;try{statement=capturePageQuery(queryId,legacyId,new URL(request.url).searchParams.get('cursor'));}catch{return reply({error:'分页位置无效'},400);}
  const rows=await db.prepare(statement.sql).bind(...statement.values).all<{id:string;payload:string;updated_at:string}>();
  const page=capturePage(rows.results);
  const captures=page.rows.map((r:any)=>({...hydrateRecord(JSON.parse(r.payload)),storageId:r.id})).filter((c:any)=>c.status==='draft');
  return reply({captures,limit:capturePageSize,nextCursor:page.nextCursor});
 }catch{return reply({error:'采集记录暂不可用，请稍后重试'},503);}
}
export async function POST(request:Request){
 if(!await allowed(request)||!sameOrigin(request))return reply({error:'请在自己的比价台中操作'},403);
 try{
  const raw=await request.text();if(raw.length>300000)return reply({error:'报价内容过长'},413);
  const b=JSON.parse(raw),db=database();
  if(b.action==='capture'||b.action==='capture-batch'){
   const inputs=b.action==='capture'?[b.capture]:b.captures;
   if(!Array.isArray(inputs)||!inputs.length||inputs.length>60)throw Error('每次读取须为1至60条记录');
   const acceptedIds:string[]=[],errors:{id:string;error:string}[]=[];
   const prepared:{id:string;statement:D1PreparedStatement}[]=[];
   const skippedIds:string[]=[];
   for(const input of inputs){try{
    const c=validateBrowserRecord(input);
    if(!c.normalized.legs?.length||!c.normalized.legs.every((l:any)=>l.direct===true)){acceptedIds.push(c.id);skippedIds.push(c.id);continue;}
    const key=await recordStorageId(c);
    prepared.push({id:c.id,statement:db.prepare('INSERT INTO fare_snapshots (id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=CASE WHEN excluded.updated_at>fare_snapshots.updated_at THEN excluded.payload ELSE fare_snapshots.payload END,updated_at=MAX(excluded.updated_at,fare_snapshots.updated_at)').bind(key,JSON.stringify(c),c.capturedAt)});
   }catch(e){errors.push({id:String(input?.id||'').slice(0,80),error:e instanceof Error?e.message:'记录无效'});}}
   for(let i=0;i<prepared.length;i+=20){const batch=prepared.slice(i,i+20);try{await db.batch(batch.map(p=>p.statement));acceptedIds.push(...batch.map(p=>p.id));}catch{errors.push(...batch.map(p=>({id:p.id,error:'保存暂时失败，待下次同步重试'})));}}
   return reply({captured:acceptedIds.length>0,count:acceptedIds.length-skippedIds.length,acceptedIds,skippedIds,errors},b.action==='capture'&&errors.length?400:200);
  }
  if(b.action==='confirm-currency'){
   if(!validQueryId(b.queryId)||!['ctrip','ly'].includes(b.source)||b.currency!=='CNY')throw Error('请明确选择当前查询的一批人民币报价');
   const rows=await db.prepare("SELECT id,payload FROM fare_snapshots WHERE id LIKE 'capture:%' AND json_extract(payload,'$.query.id')=? AND json_extract(payload,'$.source')=? AND json_extract(payload,'$.status')='draft' ORDER BY updated_at DESC LIMIT 500").bind(b.queryId,b.source).all<{id:string;payload:string}>();
   const entries=rows.results.map(r=>({storageId:r.id,record:JSON.parse(r.payload)}));
   const selection={queryId:b.queryId,source:b.source,currency:'CNY',...(b.batch?{batch:b.batch}:{storageIds:b.storageIds})};
   const reviewed=confirmCurrencyReview(entries,selection,{reviewId:crypto.randomUUID(),confirmedAt:new Date().toISOString()});
   let count=0;
   for(let i=0;i<reviewed.updates.length;i+=20){const subset=reviewed.updates.slice(i,i+20);const results=await db.batch(subset.map((x:any)=>db.prepare("UPDATE fare_snapshots SET payload=? WHERE id=? AND json_extract(payload,'$.id')=? AND json_extract(payload,'$.capturedAt')=? AND json_extract(payload,'$.status')='draft'").bind(JSON.stringify(x.record),x.storageId,x.record.id,x.record.capturedAt)));count+=results.reduce((n:number,r:any)=>n+(r.meta.changes||0),0);}
   return reply({count,rejected:reviewed.rejected,unchanged:reviewed.unchanged.length});
  }
  if(['clear-drafts','restore-drafts'].includes(b.action)){
   const queryId=b.queryId||b.date;if(!validQueryId(queryId))throw Error('查询编号无效');
   const from=b.action==='clear-drafts'?'draft':'archived',to=b.action==='clear-drafts'?'archived':'draft';
   const legacyId=queryId==='q-SHA-TYO-20261231-20270104-a1-economy'?'20261231':queryId==='q-SHA-TYO-20270101-20270105-a1-economy'?'20270101':'';
   const result=await db.prepare("UPDATE fare_snapshots SET payload=json_set(payload,'$.status',?) WHERE id LIKE 'capture:%' AND (json_extract(payload,'$.date')=? OR json_extract(payload,'$.query.id')=? OR json_extract(payload,'$.date')=?) AND json_extract(payload,'$.status')=?").bind(to,queryId,queryId,legacyId,from).run();
   return reply({count:result.meta.changes,archived:to==='archived'});
  }
  if(b.action==='discard'){
   if(typeof b.storageId!=='string'||!/^capture:[a-z0-9-]{16,80}$/i.test(b.storageId))throw Error('记录无效');
   await db.prepare("UPDATE fare_snapshots SET payload=json_set(payload,'$.status','archived') WHERE id=?").bind(b.storageId).run();return reply({discarded:true});
  }
  if(b.action==='diagnostic'){
   const x=b.diagnostic,u=new URL(x?.url);
   if(u.protocol!=='https:'||!['google.com','ctrip.com','ly.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))||!Array.isArray(x.controls)||x.controls.length>160||JSON.stringify(x).length>30000)throw Error('诊断格式无效');
   const diagnostic={url:u.origin+u.pathname,version:String(x.version||'').slice(0,20),action:String(x.action||'').slice(0,30),capturedAt:new Date().toISOString(),controls:x.controls.map((v:any)=>({tag:String(v.tag||'').slice(0,20),role:String(v.role||'').slice(0,30),label:String(v.label||'').slice(0,140)}))};
   await db.prepare('INSERT INTO fare_snapshots (id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind('diagnostic:'+u.hostname,JSON.stringify(diagnostic),diagnostic.capturedAt).run();return reply({saved:true});
  }
  throw Error('操作无效');
 }catch(e){return reply({error:e instanceof Error?e.message:'保存失败，请稍后重试'},400);}
}

