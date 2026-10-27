(() => {
  const cities = Object.freeze({
    SHA: { name: '上海', airports: ['PVG', 'SHA'], googleMid: '/m/06wjf' },
    TYO: { name: '东京', airports: ['HND', 'NRT'], googleMid: '/m/07dfk' },
    BJS: { name: '北京', airports: ['PEK', 'PKX'] },
    SEL: { name: '首尔', airports: ['ICN', 'GMP'] },
    OSA: { name: '大阪', airports: ['KIX', 'ITM', 'UKB'] },
    LON: { name: '伦敦', airports: ['LHR', 'LGW', 'LCY', 'STN', 'LTN', 'SEN'] },
    NYC: { name: '纽约', airports: ['JFK', 'LGA', 'EWR'] },
    PAR: { name: '巴黎', airports: ['CDG', 'ORY', 'BVA'] },
    BKK: { name: '曼谷', airports: ['BKK', 'DMK'] }
  });
  const airports = Object.freeze({
    PVG: '上海浦东', SHA: '上海虹桥', HND: '东京羽田', NRT: '东京成田',
    PEK: '北京首都', PKX: '北京大兴', CAN: '广州白云', SZX: '深圳宝安',
    CTU: '成都双流', TFU: '成都天府', HGH: '杭州萧山', CKG: '重庆江北',
    XIY: '西安咸阳', WUH: '武汉天河', NKG: '南京禄口', XMN: '厦门高崎',
    CSX: '长沙黄花', TAO: '青岛胶东', KMG: '昆明长水', SYX: '三亚凤凰',
    HAK: '海口美兰', CGO: '郑州新郑', TNA: '济南遥墙', DLC: '大连周水子',
    SHE: '沈阳桃仙', HRB: '哈尔滨太平', TSN: '天津滨海', FOC: '福州长乐',
    HKG: '香港', MFM: '澳门', TPE: '台北桃园', TSA: '台北松山',
    KIX: '大阪关西', ITM: '大阪伊丹', UKB: '神户', NGO: '名古屋中部',
    FUK: '福冈', CTS: '札幌新千岁', OKA: '冲绳那霸', ICN: '首尔仁川',
    GMP: '首尔金浦', PUS: '釜山金海', SIN: '新加坡樟宜', BKK: '曼谷素万那普',
    DMK: '曼谷廊曼', KUL: '吉隆坡', HKT: '普吉', SGN: '胡志明市', HAN: '河内',
    MNL: '马尼拉', DPS: '巴厘岛', DXB: '迪拜', DOH: '多哈', AUH: '阿布扎比',
    LHR: '伦敦希思罗', LGW: '伦敦盖特威克', LCY: '伦敦城市', STN: '伦敦斯坦斯特德',
    LTN: '伦敦卢顿', SEN: '伦敦绍森德', CDG: '巴黎戴高乐', ORY: '巴黎奥利',
    BVA: '巴黎博韦', FRA: '法兰克福', AMS: '阿姆斯特丹', FCO: '罗马菲乌米奇诺',
    JFK: '纽约肯尼迪', LGA: '纽约拉瓜迪亚', EWR: '纽瓦克', LAX: '洛杉矶',
    SFO: '旧金山', SEA: '西雅图', YVR: '温哥华', YYZ: '多伦多',
    SYD: '悉尼', MEL: '墨尔本', AKL: '奥克兰'
  });
  const cabins = Object.freeze(['economy', 'premium_economy', 'business', 'first']);
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const n = Date.parse(`${value}T12:00:00Z`);
    return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value
      && Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100;
  }
  function routeCode(value) {
    if (typeof value !== 'string') throw Error('请输入城市或机场三字码');
    const code = value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) throw Error('出发地和目的地须为三位城市或机场代码');
    return code;
  }
  function routeName(code) { return cities[code]?.name || airports[code] || code; }
  function normalizeQuery(input) {
    if (!input || typeof input !== 'object') throw Error('查询条件无效');
    const from = routeCode(input.from), to = routeCode(input.to);
    if (from === to) throw Error('出发地和目的地不能相同');
    const tripType = input.tripType === undefined ? (input.back ? 'roundtrip' : 'oneway') : input.tripType;
    if (!['roundtrip', 'oneway'].includes(tripType)) throw Error('请选择单程或往返');
    if (!validDate(input.out)) throw Error('出发日期无效');
    const out = input.out;
    let back;
    if (tripType === 'roundtrip') {
      if (!validDate(input.back) || input.back < out) throw Error('回程日期须不早于出发日期');
      back = input.back;
    }
    const adults = input.adults === undefined ? 1 : Number(input.adults);
    if (!Number.isInteger(adults) || adults < 1 || adults > 9) throw Error('成人数量须为 1 至 9 人');
    const cabin = input.cabin === undefined ? 'economy' : input.cabin;
    if (!cabins.includes(cabin)) throw Error('舱位无效');
    const direction = input.direction;
    if (direction !== undefined && !['outbound', 'return'].includes(direction)) throw Error('查询方向无效');
    if (direction === 'return' && !back) throw Error('单程行程没有回程日期');
    const id = `q-${from}-${to}-${out.replaceAll('-', '')}-${back ? back.replaceAll('-', '') : 'single'}-a${adults}-${cabin}`;
    return { id, from, to, fromName: routeName(from), toName: routeName(to), out, ...(back ? { back } : {}), adults, cabin, tripType, ...(direction ? { direction } : {}) };
  }
  function queryKey(input) { return normalizeQuery(input).id; }
  function legQuery(input, direction = input?.direction || 'outbound') {
    const q = normalizeQuery(input);
    if (!['outbound', 'return'].includes(direction)) throw Error('查询方向无效');
    if (direction === 'return' && !q.back) throw Error('请先设置回程日期');
    return { from: direction === 'return' ? q.to : q.from, to: direction === 'return' ? q.from : q.to,
      date: direction === 'return' ? q.back : q.out, adults: q.adults, cabin: q.cabin };
  }
  function routeMatches(actual, expected) {
    if (typeof actual !== 'string' || typeof expected !== 'string') return false;
    actual = actual.toUpperCase(); expected = expected.toUpperCase();
    return actual === expected || Boolean(cities[expected]?.airports.includes(actual));
  }
  globalThis.flightQueryCore = { normalizeQuery, queryKey, legQuery, routeMatches, routeName, validDate, airports, cities, cabins };
})();
