'use client';
import {useState} from 'react';
import {readTuniuCredential} from '@/lib/import-tuniu.mjs';
import {readJson} from '@/lib/read-json.mjs';
export default function TuniuConnection(){
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 async function upload(file?:File){if(!file)return;setBusy(true);setStatus('正在保存授权…');try{if(file.size>524288)throw Error('授权文件过大，请选择途牛官方授权文件。');const credentials=readTuniuCredential(JSON.parse(await file.text()));await readJson('/api/connect',{request:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'tuniu',credentials})}});setStatus('途牛连接已恢复，请回到自动查价，点击“仅重试未完成接口”。');}catch(e){setStatus(e instanceof SyntaxError?'文件格式不正确，请选择途牛官方授权文件。':e instanceof Error?e.message:'授权保存失败');}finally{setBusy(false);}}
 return <details><summary>恢复途牛连接</summary><p>仅在提示授权失效时使用。先完成途牛官方重新授权，再选择本机授权文件。只将途牛连接信息加密保存到当前平台，不显示密钥。</p><label>途牛授权文件<input type="file" accept="application/json,.json" disabled={busy} onChange={e=>{void upload(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/></label><p role="status">{status}</p></details>;
}
