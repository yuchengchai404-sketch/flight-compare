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
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '结果读取失败');
      return data;
    })(), timeout]);
  } finally { clearTimeout(timer); }
}
