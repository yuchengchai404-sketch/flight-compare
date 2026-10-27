(() => {
  // Fields below come from observed browser URLs, not a published Google API.
  // Root field 19=2 means one-way; root field 2 remains 2.
  const template = 'CBwQAhooEgoyMDI2LTEyLTMxagwIAxIIL20vMDZ3amZyDAgDEggvbS8wN2Rma0ABSAFwAYIBCwj___________8BmAEC';
  // BJS/SEL verified by selecting 中国北京市 and 韩国首尔 on 2026-10-15.
  const observedLocations = { SHA: '/m/06wjf', TYO: '/m/07dfk', OSA: '/m/0dqyw', BJS: '/m/01914', SEL: '/m/0hsqf', BKK: '/m/0fn2g', LON: '/m/04jpl', PAR: '/m/05qtj', NYC: '/m/02_286' };
  // All four values verified through the Google cabin selector on 2026-10-15.
  const observedCabins = { economy: 1, premium_economy: 2, business: 3, first: 4 };
  const textEncoder = new TextEncoder(), textDecoder = new TextDecoder();
  function core() {
    if (!globalThis.flightQueryCore) throw Error('查询组件尚未加载，请刷新页面');
    return globalThis.flightQueryCore;
  }
  function decode(s) {
    if (typeof s !== 'string' || !s || s.length > 5500 || !/^[A-Za-z0-9_\-=]+$/.test(s)) throw Error('查询链接无效');
    return Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), x => x.charCodeAt(0));
  }
  function fields(bytes) {
    const result = []; let i = 0;
    function num() {
      let n = 0, k = 0;
      for (let j = 0; j < 10; j++) {
        if (i >= bytes.length) throw Error('字段截断');
        const x = bytes[i++]; n += (x & 127) * 2 ** k;
        if (!Number.isSafeInteger(n)) throw Error('字段超出范围');
        if (!(x & 128)) return n; k += 7;
      }
      throw Error('字段无效');
    }
    while (i < bytes.length) {
      if (result.length >= 200) throw Error('字段过多');
      const start = i, key = num(), field = Math.floor(key / 8), wire = key % 8;
      if (!field) throw Error('字段编号无效');
      let value, data;
      if (wire === 0) value = num();
      else if (wire === 2) {
        const len = num(); if (len > 5500 || i + len > bytes.length) throw Error('长度无效');
        data = bytes.slice(i, i + len); i += len;
      } else throw Error('不支持的字段');
      result.push({ field, wire, value, data, raw: bytes.slice(start, i) });
    }
    return result;
  }
  function varint(n) {
    if (!Number.isSafeInteger(n) || n < 0) throw Error('字段值无效');
    const result = []; do { const rest = n % 128; n = Math.floor(n / 128); result.push(rest | (n ? 128 : 0)); } while (n);
    return result;
  }
  function scalar(field, n) { return [...varint(field * 8), ...varint(n)]; }
  function data(field, bytes) { return [...varint(field * 8 + 2), ...varint(bytes.length), ...bytes]; }
  function string(field, text) { return data(field, textEncoder.encode(text)); }
  function encode(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
  function location(code) {
    // Airport type 1 + field 2 IATA verified by the actual PVG combobox URL.
    return observedLocations[code] ? [...scalar(1, 3), ...string(2, observedLocations[code])]
      : [...scalar(1, 1), ...string(2, code)];
  }
  function searchInfo(input, direction = input?.direction || 'outbound') {
    const q = core().normalizeQuery(input), leg = core().legQuery(q, direction);
    const url = new URL('https://www.google.com/travel/flights');
    url.searchParams.set('hl', 'zh-CN'); url.searchParams.set('curr', 'CNY');
    const encodedLocation = code => Boolean(observedLocations[code] || (core().airports[code] && !core().cities[code]));
    if (encodedLocation(leg.from) && encodedLocation(leg.to) && observedCabins[leg.cabin]) {
      url.pathname += '/search';
      const trip = [...string(2, leg.date), ...data(13, location(leg.from)), ...data(14, location(leg.to))];
      const root = fields(decode(template));
      const bytes = root.flatMap(f => f.field === 3 ? data(3, trip) : f.field === 8 ? Array.from({ length: leg.adults }, () => scalar(8, 1)).flat() : f.field === 9 ? scalar(9, observedCabins[leg.cabin]) : Array.from(f.raw));
      url.search = ''; url.searchParams.set('tfs', encode(bytes));
      url.searchParams.set('hl', 'zh-CN'); url.searchParams.set('curr', 'CNY');
      return { url: url.href, method: 'observed-url', verifiedParameters: true, leg };
    }
    const cabin = { economy: 'economy', premium_economy: 'premium economy', business: 'business', first: 'first class' }[leg.cabin];
    url.searchParams.set('q', `One way flights from ${leg.from} to ${leg.to} on ${leg.date} for ${leg.adults} adult${leg.adults === 1 ? '' : 's'}, ${cabin}, CNY`);
    return { url: url.href, method: 'text-search', verifiedParameters: false, leg,
      notice: '请核对官网的出发地、目的地、日期、人数及舱位；文本入口不代表官网已应用全部条件。' };
  }
  function searchUrl(q, direction) { return searchInfo(q, direction).url; }
  function one(items, field, wire) {
    const hits = items.filter(x => x.field === field && (wire === undefined || x.wire === wire));
    return hits.length === 1 ? hits[0] : undefined;
  }
  function parseLocation(bytes) {
    if (!bytes) return;
    const parts = fields(bytes), kind = one(parts, 1, 0)?.value, value = textDecoder.decode(one(parts, 2, 2)?.data || []);
    if (kind === 1 && /^[A-Z]{3}$/.test(value)) return value;
    if (kind !== 3) return;
    return Object.keys(observedLocations).find(k => observedLocations[k] === value);
  }
  function inspect(rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== 'https:' || !['www.google.com', 'google.com'].includes(u.hostname) || !u.pathname.startsWith('/travel/flights')) return;
      const root = fields(decode(u.searchParams.get('tfs'))), trips = root.filter(x => x.field === 3 && x.wire === 2);
      if (one(root, 19, 0)?.value !== 2 || one(root, 2, 0)?.value !== 2 || trips.length !== 1) return;
      const t = fields(trips[0].data);
      const date = textDecoder.decode(one(t, 2, 2)?.data || []);
      const from = parseLocation(one(t, 13, 2)?.data), to = parseLocation(one(t, 14, 2)?.data);
      if (!from || !to || from === to || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const valid = new Date(`${date}T12:00:00Z`);
      if (!Number.isFinite(valid.getTime()) || valid.toISOString().slice(0, 10) !== date) return;
      const passengerFields = root.filter(x => x.field === 8 && x.wire === 0);
      const adults = passengerFields.length >= 1 && passengerFields.length <= 9 && passengerFields.every(x => x.value === 1) ? passengerFields.length : undefined;
      const cabin = Object.keys(observedCabins).find(k => observedCabins[k] === one(root, 9, 0)?.value);
      const direction = from === 'SHA' && to === 'TYO' ? 'outbound' : from === 'TYO' && to === 'SHA' ? 'return' : undefined;
      return { from, to, date, adults, cabin, tripType: 'oneway', currency: u.searchParams.get('curr') === 'CNY' ? 'CNY' : undefined, ...(direction ? { direction } : {}) };
    } catch { return; }
  }
  globalThis.flightGoogleSearchCore = { searchUrl, searchInfo, inspect };
})();
