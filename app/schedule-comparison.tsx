'use client';
import {useState} from 'react';
import {scheduleComparisons,fareTerms} from '@/lib/schedule-compare.mjs';
import {total} from '@/lib/compare.mjs';
const providers:Record<string,string>={google:'Google Flights',ctrip:'携程',ly:'同程',fliggy:'飞猪',tuniu:'途牛'};
const price=(n:number)=>'¥'+n.toLocaleString('zh-CN',{maximumFractionDigits:2});
const time=(s:string)=>new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
export default function ScheduleComparison({records}:{records:any[]}){
 const [limit,setLimit]=useState(6),groups=scheduleComparisons(records);
 if(!groups.length)return <p className="muted">当前筛选下暂无可并排比较的多平台报价。下方仍显示各平台已核验结果。</p>;
 return <section className="schedule-comparison"><h3>同时刻多平台比较 · {groups.length}组</h3><p className="muted">按相同日期、机场和起降时间并列含税报价。航班号、经停、行李和退改条件仍需逐项核对；不同采集时间的价格可能变化。</p>{groups.slice(0,limit).map((g:any)=><article className="schedule-card" key={g.key}><div className="schedule-head"><div>{g.legs.map((l:any,i:number)=><p key={i}><b>{l.from} → {l.to}</b> · {l.date} · {l.departureTime}–{l.arrivalTime}{l.arrivalDayOffset?' +'+l.arrivalDayOffset+'天':''}</p>)}</div><span>各平台最低显示价相差 <b>{price(g.spread)}</b></span></div><div className="schedule-offers">{Object.entries(providers).filter(([source])=>g.providers.includes(source)).map(([source,name])=><section key={source}><h4>{name}</h4>{!g.providers.includes(source)?<p className="muted">未采集到对应报价</p>:g.offers.filter((c:any)=>c.source===source).map((c:any)=>{const terms=fareTerms(c.normalized.rawText||c.text);return <div className="schedule-offer" key={c.storageId||c.id}><strong>{price(total(c.normalized))}</strong>{total(c.normalized)===g.minimum&&<span className="schedule-low">本组显示价最低</span>}<small>{time(c.capturedAt)}采集</small><p>{c.normalized.legs.map((l:any)=>[l.flight||l.airline||'航班号未采集',l.direct===true?'直飞':l.direct===false?'中转':'经停待核验'].join(' · ')).join(' / ')}</p><p>{terms.baggage}</p><p>{terms.rules}</p><a href={c.url} target="_blank" rel="noopener noreferrer">查看官网 ↗</a><details><summary>核对采集原文</summary><pre>{c.normalized.rawText||c.text}</pre></details></div>;})}</section>)}</div></article>)}{groups.length>limit&&<button className="schedule-more" onClick={()=>setLimit(n=>n+6)}>显示更多并排比较</button>}</section>;
}
