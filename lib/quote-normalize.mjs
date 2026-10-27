import { normalizeQuery, legQuery, routeMatches, airports, cities } from './flight-query.mjs';

const currencies = new Set(['CNY', 'RMB', 'JPY', 'USD', 'HKD', 'TWD', 'KRW', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'THB']);
const currencyNames = { RMB: 'CNY', 人民币: 'CNY', 日元: 'JPY', 美元: 'USD', 港币: 'HKD', 港元: 'HKD', 欧元: 'EUR', 英镑: 'GBP', 韩元: 'KRW', 新台币: 'TWD' };
const airlineNames = /春秋航空日本|中国南方航空|中国东方航空|中国国际航空|中国联合航空|香港航空|港航|国泰航空|英国航空|英航|加拿大航空|加航|美国航空|美航|美国联合航空|美联航|达美航空|芬兰航空|印度航空|阿联酋航空|THAI|泰国航空|深航|山东航空|山航|东方航空|南方航空|中国国航|全日空(?:航空)?|春秋航空|春航|韩亚(?:航空)?|大韩航空|南航|东航|上航|上海航空|国航|日本航空|日航|吉祥航空|乐桃航空|捷星日本(?:航空)?|海南航空|四川航空|厦门航空|深圳航空|越南航空|越捷航空|长荣航空|济州航空|易斯达航空|菲律宾航空|峇迪航空|哈恩航空|大韩航空|ANA|Japan Airlines|Spring Airlines|Air China|China Eastern|China Southern/gi;
const nonAirportTokens = new Set([...currencies, 'ANA', 'COE', 'TAX', 'ALL', 'NON', 'VIA', 'VAT', 'UTC', 'GMT']);
const cabinLabels = /超级经济舱|高级经济舱|豪华经济舱|优选经济舱|超经舱|经济客舱|经济舱|商务舱|公务舱|头等舱|\bpremium economy\b|\bfirst class\b|\bbusiness\b|\beconomy\b/gi;
function cabinFromLabel(label) {
  if (/^(?:超级经济舱|高级经济舱|豪华经济舱|优选经济舱|超经舱|premium economy)$/i.test(label)) return 'premium_economy';
  if (/^(?:经济舱|经济客舱|economy)$/i.test(label)) return 'economy';
  if (/^(?:商务舱|公务舱|business)$/i.test(label)) return 'business';
  if (/^(?:头等舱|first class)$/i.test(label)) return 'first';
}
function cleanCurrency(value) { const s = String(value || '').toUpperCase(); return s === 'RMB' ? 'CNY' : currencies.has(s) ? s : undefined; }
function textCurrency(text) {
  const found = new Set();
  for (const token of text.match(/\b(?:CNY|RMB|JPY|USD|HKD|TWD|KRW|EUR|GBP|CAD|AUD|SGD|THB)\b|人民币|日元|美元|港币|港元|欧元|英镑|韩元|新台币|€|£/gi) || []) {
    const upper = token.toUpperCase(); found.add(token === '€' ? 'EUR' : token === '£' ? 'GBP' : currencyNames[token] || currencyNames[upper] || upper);
  }
  return found;
}
function pricesIn(text) {
  const matches = [];
  const numeric = '([0-9]+(?:[,，][0-9]{3})*(?:\\.[0-9]{1,2})?)';
  const before = new RegExp('(?:CNY|RMB|JPY|USD|HKD|TWD|KRW|EUR|GBP|CAD|AUD|SGD|THB|人民币|日元|美元|港币|港元|欧元|英镑|韩元|新台币|[¥￥$€£])\\s*' + numeric + '(?![0-9.,，])', 'gi');
  const after = new RegExp('(?<![0-9.,，])' + numeric + '\\s*(?:元|CNY|RMB|JPY|USD|HKD|TWD|KRW|EUR|GBP|人民币|日元|美元)(?![A-Z])', 'gi');
  for (const re of [before, after]) for (const hit of text.matchAll(re)) matches.push({ start: hit.index, end: hit.index + hit[0].length, value: Number(hit[1].replaceAll(',', '').replaceAll('，', '')) });
  const mentions = [];
  for (const hit of matches.sort((a, b) => a.start - b.start)) {
    const previous = mentions.at(-1);
    if (previous && hit.start < previous.end && hit.value === previous.value) previous.end = Math.max(previous.end, hit.end);
    else mentions.push(hit);
  }
  return { values: [...new Set(mentions.map(x => x.value).filter(Number.isFinite))], count: mentions.length };
}
function flightNumber(text) {
  // Aircraft models in the observed airline rows are not flight numbers.
  // Require a visible manufacturer prefix: A320 alone could be flight A3 20.
  text = text.replace(/(?:空客|波音|Airbus|Boeing)\s*(?:[AB]\s*)?\d{3}(?:\s*[-－]\s*[A-Z0-9]+)?(?:\s*NEO|\s*MAX\d*)?/gi, '');
  const matches = [...new Set(Array.from(text.matchAll(/\b([A-Z0-9]{2})\s?(\d{1,4})(?![A-Z0-9])/g), m => `${m[1]}${m[2]}`)
    .filter(x => !/^CO2$|^CO0$/.test(x) && /[A-Z]/.test(x.slice(0, 2))))];
  return matches.length === 1 ? matches[0] : undefined;
}
function parseLegs(text, query, tripType, direction, source) {
  const expected = tripType === 'roundtrip' ? [legQuery(query, 'outbound'), legQuery(query, 'return')] : [legQuery(query, direction)];
  let tokens = Array.from(text.matchAll(/\b[A-Z]{3}\b/g), m => ({ code: m[0], index: m.index }))
    .filter(t => !nonAirportTokens.has(t.code) && (airports[t.code] || cities[t.code] || expected.some(x => routeMatches(t.code, x.from) || routeMatches(t.code, x.to))));
  const times = Array.from(text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*\+\s*([1-3]))?/g), m => ({ value: `${m[1].padStart(2, '0')}:${m[2]}`, offset: Number(m[3] || 0), index: m.index }));
  // Google's visible single-flight cards use one independent endpoint line, then
  // list any layover airport separately. Trust that explicit line only for this
  // observed layout, with exactly two endpoint times and no second route line.
  if (source === 'google' && tripType === 'oneway' && times.length === 2) {
    const routes = Array.from(text.matchAll(/^[ \t]*([A-Z]{3})[ \t]*[–—-][ \t]*([A-Z]{3})[ \t\r]*$/gm));
    if (routes.length === 1) {
      const route = routes[0];
      tokens = [{ code: route[1], index: route.index }, { code: route[2], index: route.index + route[0].lastIndexOf(route[2]) }];
    }
  }
  // Exactly one flight card (or a complete two-leg card) is required. More tokens/times
  // may be connection airports or another offer, so keep it for review instead of guessing.
  if (tokens.length !== expected.length * 2 || times.length !== expected.length * 2) return [];
  return expected.map((leg, i) => {
    const from = tokens[i * 2].code, to = tokens[i * 2 + 1].code;
    const start = i === 0 ? 0 : Math.min(tokens[i * 2].index, times[i * 2].index);
    const end = i + 1 === expected.length ? text.length : Math.min(tokens[(i + 1) * 2].index, times[(i + 1) * 2].index);
    const part = text.slice(start, end);
    const names = [...new Set(part.match(airlineNames) || [])];
    const direct = /经停\s*[1-9]|中转|转机|\b[1-9]\s*(?:stops?|connections?)\b/i.test(part) ? false : /直达|直飞|nonstop|non-stop|0\s*stops?/i.test(part) ? true : undefined;
    return { from, to, date: leg.date, departureTime: times[i * 2].value,
      arrivalTime: times[i * 2 + 1].value, arrivalDayOffset: times[i * 2 + 1].offset,
      flight: flightNumber(part), airline: names.length ? names.join(' / ') : undefined, direct };
  });
}
function metadataIssues(meta, q, direction, tripType) {
  const issues = [];
  if (!meta || meta.verified !== true) return ['查询条件尚未核验'];
  const leg = legQuery(q, direction);
  if (!routeMatches(meta.from, leg.from) || !routeMatches(meta.to, leg.to)) issues.push('官网航线与查询不一致');
  if ((meta.date || meta.out) !== leg.date) issues.push('官网日期与查询不一致');
  if (Number(meta.adults) !== q.adults) issues.push('官网人数尚未匹配');
  if (meta.cabin !== q.cabin) issues.push('官网舱位尚未匹配');
  if (meta.tripType !== tripType) issues.push('单程与往返类型不一致');
  if (tripType === 'roundtrip' && meta.back !== q.back) issues.push('官网回程日期与查询不一致');
  return issues;
}
function productCabinIssues(capture, meta, q, rawText) {
  const scope = meta?.cabinScope;
  const needsProduct = meta?.cabinEvidence === 'per-card-required' || (Array.isArray(scope) && scope.length > 1);
  if (!needsProduct) {
    // Google may show another cabin product within a selected cabin search.
    if (capture.source === 'google') {
      const labels = rawText.split(/\r?\n|[+＋]/).map(line => line.trim()).filter(line => /^(?:超级经济舱|高级经济舱|豪华经济舱|优选经济舱|超经舱|经济客舱|经济舱|商务舱|公务舱|头等舱|premium economy|first class|business(?: class)?|economy)$/i.test(line));
      if (labels.some(label => cabinFromLabel(label.replace(/business class/i, 'business')) !== q.cabin)) return ['当前航班可见舱位与查询舱位不符'];
    }
    return [];
  }
  const issues = [];
  if (!Array.isArray(scope) || !scope.length || !scope.includes(q.cabin)) issues.push('查询结果的舱位范围尚未匹配');
  if (capture.observedCabin !== q.cabin || !Array.isArray(scope) || !scope.includes(capture.observedCabin)) issues.push('当前产品的实际舱位尚未匹配查询');
  const evidence = typeof capture.cabinEvidence === 'string' ? capture.cabinEvidence.trim() : '';
  const seen = [...new Set((rawText.match(cabinLabels) || []).map(cabinFromLabel))];
  const matchingEvidence = evidence && cabinFromLabel(evidence) === capture.observedCabin && rawText.toLowerCase().includes(evidence.toLowerCase());
  // Longest label matching prevents the 经济舱 suffix inside 超级经济舱 from
  // being accepted as ordinary economy. A card mixing labels is still pending.
  if (!matchingEvidence || seen.length !== 1 || seen[0] !== capture.observedCabin) issues.push('缺少该产品可唯一核验的可见舱位标签');
  return issues;
}
function productRestrictionIssues(source, rawText, legs) {
  if (!['ctrip', 'ly'].includes(source)) return [];
  const issues = [];
  const qualifications = rawText.replace(/(?:无|没有|不设|不受)(?:人数|年龄)限制|不限人数|人数不限|不限年龄|年龄不限|(?:无需|不需|不用)领券/g, '');
  if (/人数限制|年龄限制|会员(?:专享|专属|价)|仅限会员|新客(?:专享|专属|价)|仅限新客|限新用户|首单(?:专享|立减)|需领券|领券后|券后价|用券价|至少\s*\d+\s*人|\d+\s*人(?:起订|起售|成团)|多人同行/.test(qualifications)) issues.push('产品含人数、年龄、会员或优惠资格限制，尚未核验适用条件');
  if (!Array.isArray(legs) || !legs.length) return issues;
  const allowedDates = new Set();
  for (const leg of legs) {
    allowedDates.add(leg.date);
    const day = Date.parse(`${leg.date}T12:00:00Z`);
    if (Number.isFinite(day)) allowedDates.add(new Date(day + (leg.arrivalDayOffset || 0) * 86400000).toISOString().slice(0, 10));
  }
  const allowedMonthDays = new Set([...allowedDates].map(date => `${Number(date.slice(5, 7))}-${Number(date.slice(8, 10))}`));
  const monthDays = Array.from(rawText.matchAll(/(\d{1,2})月(\d{1,2})日/g), m => `${Number(m[1])}-${Number(m[2])}`);
  const fullDates = rawText.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  const explicitOffsets = Array.from(rawText.matchAll(/\b(?:[01]?\d|2[0-3]):[0-5]\d\s*\+([1-3])\b|(?:^|\n)\s*\+([1-3])(?:天|日)?\s*(?=\n|$)/g), m => Number(m[1] || m[2]));
  const nextDay = /次日|翌日|隔日|第二天/.test(rawText);
  if (monthDays.some(date => !allowedMonthDays.has(date)) || fullDates.some(date => !allowedDates.has(date)) || explicitOffsets.some(offset => !legs.some(leg => leg.arrivalDayOffset === offset)) || (nextDay && !legs.some(leg => leg.arrivalDayOffset > 0))) issues.push('原文跨日日期与解析航段尚未匹配，请重新读取或核验到达日期');
  return issues;
}

/** Normalize only a captured visible offer. Failed records retain their raw evidence. */
export function normalizeQuote(capture) {
  const c = capture && typeof capture === 'object' ? capture : {};
  const text = typeof c.text === 'string' ? c.text.trim().slice(0, 12000) : '';
  const rawText = typeof c.rawText === 'string' ? c.rawText.trim().slice(0, 12000) : text;
  const reasons = Array.isArray(c.captureIssues) ? c.captureIssues.filter(x => typeof x === 'string' && x.trim()).slice(0, 12).map(x => x.trim().slice(0, 400)) : [];
  const result = { eligible: false, reason: '', reasons, price: null, totalPrice: null, perPersonPrice: null, currency: null, legs: [],
    tripType: c.tripType || 'unknown', direction: c.direction || 'outbound', queryId: c.queryId || null,
    taxIncluded: null, priceBasis: 'unknown', priceKind: 'exact', passengers: null,
    source: c.source || 'unknown', capturedAt: c.capturedAt || null, url: c.url || '', rawText };
  let q;
  try { q = normalizeQuery(c.query); result.queryId = q.id; result.passengers = q.adults; }
  catch (e) { reasons.push(e.message); }
  if (!text) reasons.push('没有可见报价原文');
  const tripType = ['oneway', 'roundtrip'].includes(c.tripType) ? c.tripType : undefined;
  if (!tripType) reasons.push('尚未核验单程或往返类型');
  const direction = c.direction || 'outbound';
  if (!['outbound', 'return'].includes(direction)) reasons.push('报价方向无效');
  if (q && direction === 'return' && !q.back) reasons.push('查询未设置回程日期');
  if (q && tripType === 'roundtrip' && !q.back) reasons.push('往返报价缺少回程日期');
  const meta = c.pageMeta || c.metadata;
  if (q && tripType && ['outbound', 'return'].includes(direction) && (direction !== 'return' || q.back) && (tripType !== 'roundtrip' || q.back)) {
    reasons.push(...metadataIssues(meta, q, direction, tripType));
    reasons.push(...productCabinIssues(c, meta, q, rawText));
    result.legs = parseLegs(text, q, tripType, direction, c.source);
    reasons.push(...productRestrictionIssues(c.source, rawText, result.legs));
    const expected = tripType === 'roundtrip' ? [legQuery(q, 'outbound'), legQuery(q, 'return')] : [legQuery(q, direction)];
    if (result.legs.length !== expected.length) reasons.push(tripType === 'roundtrip' ? '未能唯一识别完整往返航段' : '未能唯一识别机场与起降时间');
    else for (let i = 0; i < expected.length; i++) {
      if (!routeMatches(result.legs[i].from, expected[i].from) || !routeMatches(result.legs[i].to, expected[i].to)) reasons.push('报价航段方向与查询不一致');
    }
  }
  const money = pricesIn(text), amounts = money.values;
  if (amounts.length !== 1) reasons.push(amounts.length ? '可见价格不唯一' : '未找到带币种的可见价格');
  else if (amounts[0] <= 0 || amounts[0] > 1000000) reasons.push('报价金额超出有效范围');
  else result.price = amounts[0];
  const seenCurrencies = textCurrency(text);
  const givenCurrency = cleanCurrency(meta?.verified === true ? meta.currency : c.currency);
  if (givenCurrency) seenCurrencies.add(givenCurrency);
  const captureCurrency = cleanCurrency(c.currency);
  if (captureCurrency) seenCurrencies.add(captureCurrency);
  // Owner policy: bare yen/yuan symbols mean CNY; explicit foreign evidence wins.
  for (const currency of textCurrency(rawText)) seenCurrencies.add(currency);
  if (/\$/.test(rawText) && !givenCurrency && !captureCurrency) reasons.push('原文美元符号币种尚未核验');
  if (/円/.test(rawText)) seenCurrencies.add('JPY');
  try { const url = new URL(c.url); for (const key of ['curr', 'currency']) { const currency = cleanCurrency(url.searchParams.get(key)); if (currency) seenCurrencies.add(currency); } } catch {}
  if (/[¥￥]/.test(text) && seenCurrencies.size === 0) { seenCurrencies.add('CNY'); result.currencyEvidence = 'owner-default'; }
  if (seenCurrencies.size === 1 && seenCurrencies.has('CNY')) {
    const obsolete = new Set(['携程页面未能明确核验币种，暂不参与比价', '同程页面未能明确核验币种，暂不参与比价']);
    for (let i = reasons.length - 1; i >= 0; i--) if (obsolete.has(reasons[i])) reasons.splice(i, 1);
  }
  if (/\$/.test(text) && !givenCurrency && seenCurrencies.size === 0) reasons.push('美元符号币种尚未核验');
  if (/\$/.test(text) && givenCurrency && !['USD', 'HKD', 'TWD', 'CAD', 'AUD', 'SGD'].includes(givenCurrency)) reasons.push('货币符号与页面币种不一致');
  if (/[¥￥]/.test(text) && givenCurrency && !['CNY', 'JPY'].includes(givenCurrency)) reasons.push('货币符号与页面币种不一致');
  if (/\d\s*元/.test(text) && !seenCurrencies.size) seenCurrencies.add('CNY');
  if (seenCurrencies.size > 1) reasons.push('同一报价包含不同币种');
  else if (seenCurrencies.size === 1) result.currency = [...seenCurrencies][0];
  if (result.currency !== 'CNY') reasons.push('尚未获得人民币报价');
  if (tripType === 'oneway' && /往返(?:票价|总价|价格|含税)|round[ -]?trip|return fare/i.test(text)) reasons.push('往返价格不能作为单程价格');
  if (tripType === 'roundtrip' && /单程(?:票价|总价|价格)|one[ -]?way fare/i.test(text)) reasons.push('单程价格不能作为往返价格');
  const lyBoundTotal = c.source === 'ly' && c.cardEvidence === 'ly-roundtrip:selected-outbound+return-product-total:v1' && result.legs.length === 2 && money.count === 1 && /选择返程/.test(rawText) && /去程已选/.test(rawText) && /重选去程/.test(rawText) && /含税总价/.test(rawText);
  if (tripType === 'roundtrip' && lyBoundTotal) result.priceScopeEvidence = 'selected-outbound-return-product';
  if (tripType === 'roundtrip' && !lyBoundTotal && !/往返(?:含税)?(?:总价|票价|价格|合计)|往返含税|round[ -]?trip (?:fare|price|total)|return fare/i.test(text)) reasons.push('报价文字未明确金额覆盖完整往返');
  if (tripType === 'roundtrip' && money.count > 1 && !/往返(?:含税)?(?:总价|合计)|round[ -]?trip total|total round[ -]?trip/i.test(text)) reasons.push('往返各段分别显示价格，尚未核验往返总价');
  if (/\bfrom\s*(?:[¥￥$]|CNY|RMB)|起价|[\d,]\s*(?:元)?起(?!飞)/i.test(text)) result.priceKind = 'from';
  const taxExcluded = /(?:不含|未含|不包含|未包含|不包括|未包括).{0,6}税|税费另计|税费另付|excluding taxes|taxes excluded|excludes? taxes|tax(?:es)? (?:are )?not included/i;
  // The dedicated Ctrip adapter retains exactly one flight plus its selected
  // product. Older captures omitted the flight's tax heading from canonical text.
  const ctripProductRaw = c.source === 'ctrip' && typeof c.cardEvidence === 'string' && c.cardEvidence.startsWith('ctrip-visible-dom:flight-item>flight-box+flight-seats');
  if (taxExcluded.test(text) || (ctripProductRaw && taxExcluded.test(rawText))) result.taxIncluded = false;
  else if (/含税|包含(?:所需)?税费|includes? (?:all )?tax(?:es)?/i.test(text)) result.taxIncluded = true;
  else if (ctripProductRaw && /(?:^|\r?\n)[ \t]*含税价[ \t]*(?=\r?\n|$)/.test(rawText)) result.taxIncluded = true;
  else if (meta?.verified === true && typeof meta.taxIncluded === 'boolean') result.taxIncluded = meta.taxIncluded;
  if (/每人|每(?:位)?成人|人均|per person|per adult|\/人/i.test(text)) result.priceBasis = 'per-person';
  else if (/全部乘客|所有乘客|合计\s*\d+\s*人|total for|all passengers/i.test(text)) result.priceBasis = 'party-total';
  else if (meta?.verified === true && ['per-person', 'party-total'].includes(meta.priceBasis)) result.priceBasis = meta.priceBasis;
  else if (q?.adults === 1) result.priceBasis = 'party-total';
  const statedPartyCounts = [
    ...Array.from(text.matchAll(/(?:合计|共|总计)\s*(\d{1,2})\s*(?:位|名)?\s*(?:成人|乘客|人)/g), m => Number(m[1])),
    ...Array.from(text.matchAll(/total for\s+(\d{1,2})\s+(?:adults?|passengers?|people)/gi), m => Number(m[1]))
  ];
  if (q && statedPartyCounts.some(count => count !== q.adults)) reasons.push('报价文字中的乘客人数与查询不一致');
  if (q?.adults > 1 && result.priceBasis === 'unknown') reasons.push('多人报价的人均或总价口径尚未核验');
  if (result.price !== null && q && result.priceBasis !== 'unknown') {
    result.totalPrice = Math.round((result.priceBasis === 'per-person' ? result.price * q.adults : result.price) * 100) / 100;
    result.perPersonPrice = Math.round(result.totalPrice / q.adults * 100) / 100;
  }
  result.reasons = [...new Set(reasons)];
  result.eligible = result.reasons.length === 0;
  result.reason = result.reasons.join('；');
  return result;
}
