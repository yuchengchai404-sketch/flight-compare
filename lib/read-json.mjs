// Bound both the request and its response body. Keep the caller's existing data
// intact when the network stalls; the caller can offer an explicit retry.
export async function readJson(url, {timeoutMs = 20000, fetcher = fetch, request = {}} = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Error('读取报价超时，已有结果已保留；请稍后刷新列表。'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetcher(url, {...request, signal: controller.signal});
      let data;
      try { data = await response.json(); }
      catch {
        if (response.status === 401 || response.status === 403 || response.redirected) throw Error('登录状态已失效，请刷新页面并重新登录；已有结果已保留。');
        throw Error('报价服务响应中断或格式异常，已有结果已保留；请稍后重试。');
      }
      if (!response.ok) throw Error(data.error || '结果读取失败');
      return data;
    })(), timeout]);
  } finally { clearTimeout(timer); }
}
