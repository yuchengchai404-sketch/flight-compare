// Only current, comparable observations count as ready. Raw captures may still
// need currency or fare validation and must not imply that a leg is complete.
export function providerProgress(comparison, source, hasReturn) {
  const count = key => (comparison[key] || []).filter(c => c.source === source).length;
  const outbound = count('outbound'), inbound = count('return'), roundtrip = count('roundtrip');
  const pending = count('pending'), stale = count('stale');
  const parts = [`去程 ${outbound} 条`, ...(hasReturn ? [`回程 ${inbound} 条`] : []), ...(roundtrip ? [`往返 ${roundtrip} 条`] : [])];
  if (pending) parts.push(`待核验 ${pending} 条`);
  if (stale) parts.push(`过期 ${stale} 条，请重新读取`);
  return parts.join(' · ');
}

export function restoreStep(value, queryId) {
  try { const s = JSON.parse(value || 'null'); return s?.queryId === queryId && [1, 2, 3].includes(s.step) ? s.step : 1; }
  catch { return 1; }
}

// Completion belongs to the current run, not old stored fares or a connected
// helper. API failures and missing directions must keep the run incomplete.
export function comparisonCompletion(run,queryId,snapshots,apiLoading,apiSupported=true){
  if(!run||run.queryId!==queryId)return {complete:false,ready:0,total:5};
  const fliggyWeb=run.tasks?.some(t=>t.label?.startsWith('飞猪 · '));
  const browsers=['Google Flights','携程','同程',...(fliggyWeb?['飞猪']:[])].filter(name=>{
    const tasks=run.tasks?.filter(t=>t.label?.startsWith(name+' · '))||[];
    return tasks.length>0&&tasks.every(t=>t.state==='done');
  }).length;
  const apis=apiSupported&&!apiLoading?(fliggyWeb?['tuniu']:['fliggy','tuniu']).filter(source=>{
    const snapshot=snapshots.find(s=>s.source===source);
    return snapshot?.status==='success'&&!snapshot.warning&&!snapshot.lastAttempt?.error&&
      Date.parse(snapshot.checkedAt)>=run.startedAt&&
      (snapshot.items?.some(i=>i.legs?.length===2)||['outbound','return'].every(direction=>snapshot.items?.some(i=>i.ticketType==='oneway'&&i.direction===direction)))&&
      (!snapshot.directions||snapshot.directions.every(d=>d.status==='success'));
  }).length:0;
  const ready=browsers+apis;
  return {complete:ready===5,ready,total:5};
}
