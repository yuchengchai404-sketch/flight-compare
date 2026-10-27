(() => {
  const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  function cards() {
    if (!location.pathname.startsWith('/travel/flights')) return [];
    return Array.from(document.querySelectorAll('li,[role="listitem"]')).filter(visible).map(element => {
      const text = (element.innerText || '').trim();
      const label = (element.getAttribute('aria-label') || '').trim();
      return { innerText: text || label };
    }).filter(e => e.innerText.length >= 25 && e.innerText.length <= 2500 && /(?:[01]?\d|2[0-3]):[0-5]\d/.test(e.innerText) && /(?:CNY|RMB|人民币|¥|￥)\s*[0-9]/i.test(e.innerText));
  }
  const searchUrl = (q, direction) => globalThis.flightGoogleSearchCore.searchUrl(q, direction);
  function priceNotice(adults) {
    const candidates = Array.from(document.querySelectorAll('p,span,div')).filter(visible);
    for (const element of candidates) {
      const text = (element.innerText || '').trim();
      if (!text || text.length > 350) continue;
      const count = text.match(/价格包含(?:所需)?税费(?:和|以及)\s*(\d+)\s*名成人的费用/)?.[1]
        || text.match(/Prices? include (?:required )?taxes\s*(?:\+|and)\s*fees for\s+(\d+)\s+adults?/i)?.[1];
      if (Number(count) === adults) return { taxIncluded: true, priceBasis: 'party-total', taxEvidence: text.slice(0, 250) };
    }
    return {};
  }
  function inspect(query) {
    const result = globalThis.flightGoogleSearchCore.inspect(location.href);
    if (!result) throw Error('请先完成 Google 单程搜索；当前链接暂未能确认行程条件');
    const core = globalThis.flightQueryCore;
    const possible = query.back ? ['outbound', 'return'] : ['outbound'];
    const direction = possible.find(value => { const expected = core.legQuery(query, value); return core.routeMatches(result.from, expected.from) && core.routeMatches(result.to, expected.to) && result.date === expected.date; });
    if (!direction) throw Error('Google 结果的地点或日期与本次查询不一致');
    return { ...result, direction, tripType: 'oneway', evidence: 'google-search-url', ...priceNotice(query.adults) };
  }
  async function openSearch(q) {
    const info = globalThis.flightGoogleSearchCore.searchInfo(q, q.direction || 'outbound');
    if (!info.verifiedParameters) throw Error('当前城市或舱位尚未支持自动填写，请在 Google 完成单程搜索后再读取；助手不会重复打开空白入口。');
    const url = info.url + '#fcq=' + encodeURIComponent(JSON.stringify(q));
    if (location.href !== url) location.assign(url);
    return { message: '已打开 Google 单程搜索。结果显示后点击②读取并回传' };
  }
  globalThis.flightGoogleAdapter = { fillSearch: openSearch, cards, searchUrl, inspect };
})();
