// Keyset pagination preserves every provider; repeated collections cannot push
// an older provider out of a shared LIMIT. Archived records never consume pages.
export const capturePageSize = 200;
export function capturePageQuery(queryId, legacyId, cursor) {
  const where = ["id LIKE 'capture:%'", "json_extract(payload,'$.status')='draft'"];
  const values = [];
  if (queryId) {
    where.push("(json_extract(payload,'$.date')=? OR json_extract(payload,'$.query.id')=? OR json_extract(payload,'$.date')=?)");
    values.push(queryId, queryId, legacyId);
  }
  if (cursor) {
    let point; try { point = JSON.parse(cursor); } catch { throw Error('分页位置无效'); }
    if (!Array.isArray(point) || point.length !== 2 || typeof point[0] !== 'string' || !Number.isFinite(Date.parse(point[0])) || typeof point[1] !== 'string' || !/^capture:[a-z0-9-]{16,80}$/i.test(point[1])) throw Error('分页位置无效');
    where.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
    values.push(point[0], point[0], point[1]);
  }
  return {sql:`SELECT id,payload,updated_at FROM fare_snapshots WHERE ${where.join(' AND ')} ORDER BY updated_at DESC,id DESC LIMIT ${capturePageSize + 1}`,values};
}
export function capturePage(rows) {
  const page = rows.slice(0, capturePageSize), last = page.at(-1);
  return {rows:page,nextCursor:rows.length > capturePageSize ? JSON.stringify([last.updated_at,last.id]) : null};
}
export async function readCapturePages(readPage, isCurrent = () => true) {
  const records = new Map(); let cursor = null;
  const visited = new Set();
  do {
    const page = await readPage(cursor);
    if (!isCurrent()) return null;
    for (const record of page.captures || []) records.set(record.storageId || record.id, record);
    cursor = page.nextCursor || null;
    if (cursor && visited.has(cursor)) throw Error('报价分页未能继续，请刷新重试');
    if (cursor) visited.add(cursor);
  } while (cursor);
  return {captures:[...records.values()]};
}
