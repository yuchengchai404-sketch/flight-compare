import { captureQuery, validateBrowserRecord, validQueryId } from './browser-records.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const storageKey = /^capture:[a-z0-9-]{16,80}$/i;
const sources = ['ctrip', 'ly'];
const unknownCurrencyIssues = new Set([
  '携程页面未能明确核验币种，暂不参与比价',
  '同程页面未能明确核验币种，暂不参与比价'
]);
function canonicalTime(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}
function declaredConflict(record) {
  const text = `${record.text || ''}\n${record.rawText || ''}`;
  // A bare ¥/￥ is ambiguous; explicit foreign currency or a dollar/euro/pound
  // symbol is not something a CNY confirmation may replace.
  if (/\b(?:JPY|USD|HKD|TWD|KRW|EUR|GBP|CAD|AUD|SGD|THB|NZD|CHF|INR|IDR|MYR|VND)(?=\b|\d)|日元|日圆|日圓|円|美元|港币|港元|新台币|新臺幣|韩元|韓元|欧元|歐元|英镑|英鎊|[$€£]/i.test(text)) return '原始报价存在明确非人民币币种，不能覆盖';
  for (const value of [record.currency, record.pageMeta?.currency, record.metadata?.currency]) {
    if (value !== undefined && value !== null && value !== '' && !['CNY', 'RMB'].includes(String(value).toUpperCase())) return '采集记录已声明非人民币币种，不能覆盖';
  }
  try {
    const u = new URL(record.url);
    for (const name of ['curr', 'currency']) {
      const value = u.searchParams.get(name);
      if (value && !['CNY', 'RMB'].includes(value.toUpperCase())) return '来源链接已声明非人民币币种，不能覆盖';
    }
  } catch { return '来源链接无效'; }
  return undefined;
}

/** Only call this for a review already retrieved from trusted server storage. */
export function validatedCurrencyReview(record, review) {
  if (!review || review.version !== 1 || review.mode !== 'user-confirmed' || review.currency !== 'CNY' || !sources.includes(record.source)) return undefined;
  if (!uuid.test(review.reviewId || '') || canonicalTime(review.confirmedAt) !== review.confirmedAt) return undefined;
  if (review.queryId !== record.query.id || review.source !== record.source || review.captureId !== record.id || review.capturedAt !== record.capturedAt || review.batch !== (record.batch || null)) return undefined;
  const elapsed = Date.parse(review.confirmedAt) - Date.parse(record.capturedAt);
  if (elapsed < -60000 || elapsed > 86400000 || declaredConflict(record)) return undefined;
  return {
    version: 1, mode: 'user-confirmed', currency: 'CNY', reviewId: review.reviewId.toLowerCase(),
    confirmedAt: review.confirmedAt, queryId: record.query.id, source: record.source,
    captureId: record.id, capturedAt: record.capturedAt, batch: record.batch || null
  };
}

/** Derive normalization input, keeping the stored original capture unchanged. */
export function currencyReviewedInput(record) {
  return { ...record, currency: 'CNY', pageMeta: { ...record.pageMeta, currency: 'CNY' },
    captureIssues: (record.captureIssues || []).filter(issue => !unknownCurrencyIssues.has(issue)) };
}

/**
 * Pure server helper. entries MUST be loaded from the database, never supplied by
 * the browser. context MUST be generated on the server after explicit confirmation.
 * Returns write candidates; callers must use compare-and-swap against the original
 * capture ID/time/status and must not refresh the quote's capturedAt/updated_at.
 */
export function confirmCurrencyReview(entries, selection, context) {
  if (!Array.isArray(entries) || entries.length > 1000) throw Error('待确认记录无效');
  if (!selection || !validQueryId(selection.queryId) || !sources.includes(selection.source) || selection.currency !== 'CNY') throw Error('请选择有效查询及携程或同程的人民币确认');
  const hasBatch = typeof selection.batch === 'string' && selection.batch !== '';
  const hasIds = Array.isArray(selection.storageIds);
  if (hasBatch === hasIds) throw Error('请指定一批记录或明确的记录编号');
  if (hasBatch && !uuid.test(selection.batch)) throw Error('采集批次无效');
  if (hasIds && (!selection.storageIds.length || selection.storageIds.length > 200 || selection.storageIds.some(id => typeof id !== 'string' || !storageKey.test(id)))) throw Error('记录编号无效');
  const confirmedAt = canonicalTime(context?.confirmedAt);
  if (!confirmedAt || !uuid.test(context?.reviewId || '')) throw Error('服务端确认时间或编号无效');
  const queryId = /^\d{8}$/.test(selection.queryId) ? captureQuery({ date: selection.queryId }).id : selection.queryId;
  const wanted = hasIds ? new Set(selection.storageIds) : null;
  const batch = hasBatch ? selection.batch.toLowerCase() : null;
  const updates = [], rejected = [], unchanged = [], found = new Set();
  for (const entry of entries) {
    const id = entry?.storageId, stored = entry?.record;
    if (typeof id !== 'string' || !storageKey.test(id) || !stored || typeof stored !== 'object') continue;
    if (wanted ? !wanted.has(id) : String(stored.batch || '').toLowerCase() !== batch) continue;
    if (found.has(id)) continue;
    found.add(id);
    try {
      if (stored.status !== 'draft') throw Error('只有现有待核验记录可以确认币种');
      const record = validateBrowserRecord(stored, { historical: true, trustedReview: stored.currencyReview });
      if (record.query.id !== queryId || record.source !== selection.source) throw Error('记录不属于所选查询和平台');
      if (hasBatch && record.batch !== batch) throw Error('记录不属于所选采集批次');
      const elapsed = Date.parse(confirmedAt) - Date.parse(record.capturedAt);
      if (elapsed < -60000 || elapsed > 86400000) throw Error('报价采集时间异常或已超过24小时，请重新读取');
      const conflict = declaredConflict(record); if (conflict) throw Error(conflict);
      if (record.currencyReview) { unchanged.push({ storageId: id, reason: '这条记录已确认人民币' }); continue; }
      const currencyReview = {
        version: 1, mode: 'user-confirmed', currency: 'CNY', reviewId: context.reviewId.toLowerCase(), confirmedAt,
        queryId: record.query.id, source: record.source, captureId: record.id,
        capturedAt: record.capturedAt, batch: record.batch || null
      };
      const reviewed = validateBrowserRecord(record, { historical: true, trustedReview: currencyReview });
      if (!reviewed.currencyReview) throw Error('币种确认未通过独立核验');
      updates.push({ storageId: id, record: reviewed });
    } catch (error) { rejected.push({ storageId: id, reason: error instanceof Error ? error.message : '记录无法确认' }); }
  }
  if (wanted) for (const id of wanted) if (!found.has(id)) rejected.push({ storageId: id, reason: '记录不存在或不在当前读取范围' });
  return { updates, rejected, unchanged };
}
