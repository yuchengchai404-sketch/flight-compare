import {cities, airports, routeName} from './flight-query.mjs';

// Resolve only explicit names/codes. Never guess a city from a partial string.
export function resolvePlace(value) {
  const text = String(value || '').trim();
  if (/^[a-z]{3}$/i.test(text)) return text.toUpperCase();
  for (const [code, city] of Object.entries(cities)) {
    if ([city.name, city.name+'市', city.name+'（全部机场）'].includes(text)) return code;
  }
  for (const [code, name] of Object.entries(airports)) {
    if ([name, name+'机场', name+'国际机场'].includes(text)) {
      // SHA and BKK are city groups in this app, not airport-only selectors.
      if (cities[code]?.airports.length>1) throw Error('该机场代码在本站代表整个城市，请选择“'+cities[code].name+'（全部机场）”或其他具体机场');
      return code;
    }
  }
  throw Error('未识别城市或机场，请从候选列表选择，或输入三字码');
}
export function placeHint(value) {
  try { const code=resolvePlace(value); return routeName(code)+(cities[code]?' · 全部机场':'')+' · '+code; }
  catch { return '请选择完整城市名、机场名或三字码'; }
}
