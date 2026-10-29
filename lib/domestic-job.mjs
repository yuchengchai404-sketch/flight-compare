import {tuniuDomesticSnapshot} from './domestic-api.mjs';
// Keep intermediate fares on the server. A client can resume only the exact
// route/date job, and an incomplete trip never replaces a complete snapshot.
export async function domesticJob({day,from,to,jobId,read,write,queryLeg,now=()=>Date.now(),newId=()=>crypto.randomUUID()}) {
  const scope=JSON.stringify([day.id,day.out,day.back,from,to]);
  if (!jobId) {
    const outbound=await queryLeg(day.out,from,to);
    const id=newId(), completedAt=now();
    await write(id,{scope,outbound,createdAt:completedAt,lastCallAt:completedAt});
    return {pending:true,jobId:id,retryAfterMs:13000};
  }
  if (!/^[a-f0-9-]{36}$/i.test(jobId)) throw Error('途牛查询进度无效，请重新获取报价');
  const state=await read(jobId);
  if (!state||state.scope!==scope||now()-state.createdAt>600000||now()<state.createdAt) throw Error('途牛查询进度已失效，请重新获取报价');
  if (state.snapshot) return {snapshot:state.snapshot};
  const wait=13000-(now()-state.lastCallAt);
  if (wait>0) return {pending:true,jobId,retryAfterMs:wait};
  const inbound=await queryLeg(day.back,to,from);
  const snapshot=tuniuDomesticSnapshot(state.outbound,inbound,day.id);
  await write(jobId,{...state,snapshot});
  return {snapshot};
}
