// The official CLI stores epoch milliseconds; renewed credentials may use ISO dates.
export function tokenNeedsRefresh(expiresAt, now = Date.now()) {
  const value = typeof expiresAt === 'number'
    ? expiresAt
    : typeof expiresAt === 'string' && /^\d+$/.test(expiresAt.trim())
      ? Number(expiresAt)
      : typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
  return !Number.isFinite(value) || value < now + 120000;
}
