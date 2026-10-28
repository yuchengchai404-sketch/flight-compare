import {readJson} from './read-json.mjs';
export async function refreshProvider(query,source,{read=readJson,wait=ms=>new Promise(r=>setTimeout(r,ms)),active=()=>Boolean(true)}={}) {
  let jobId;
  for(let step=0;step<5;step++) {
    if(!active())return null;
    const result=await read('/api/fares',{timeoutMs:120000,request:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,source,...(jobId?{jobId}:{})})}});
    if(result.snapshot)return result.snapshot;
    if(source!=='tuniu'||result.pending!==true||!result.jobId||!Number.isFinite(result.retryAfterMs)||result.retryAfterMs<0||result.retryAfterMs>15000)throw Error('报价查询进度异常，已有结果已保留；请重试。');
    jobId=result.jobId;
    if(!active())return null;
    await wait(result.retryAfterMs);
  }
  throw Error('途牛查询尚未完成，已有结果已保留；请稍后重试。');
}
