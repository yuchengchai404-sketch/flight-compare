'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';

export default function PendingRecords({records,names,stamp}:{records:any[];names:Record<string,string>;stamp:(s:string)=>string}){
 const [limit,setLimit]=useState(10);
 const groups=Object.entries(records.reduce((acc:Record<string,number>,c)=>{
  const reason=c.normalized.reason||'信息尚不完整';
  acc[reason]=(acc[reason]||0)+1;return acc;
 },{})).sort((a,b)=>Number(b[1])-Number(a[1]));
 return <><p className="muted">这些记录暂不参与排名。先查看原因，需要时再展开具体记录。</p>
 <ul>{groups.map(([reason,count])=><li key={reason}>{String(count)}条 · {reason}</li>)}</ul>
 <details><summary>查看具体记录（{records.length}）</summary>
 {records.slice(0,limit).map(c=><article key={c.storageId||c.id}><b>{names[c.source]||c.source} · {stamp(c.capturedAt)}</b><p>{c.normalized.reason}</p><details><summary>查看原文</summary><pre>{c.normalized.rawText||c.text}</pre></details><a href={c.url} target="_blank" rel="noopener noreferrer">回官网补充查询 ↗</a></article>)}
 {records.length>limit&&<Button variant="outline" onClick={()=>setLimit(n=>n+10)}>再显示10条（剩余{records.length-limit}条）</Button>}
 </details></>;
}
