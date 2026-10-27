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
