export const DAY_MS = 24 * 60 * 60 * 1000

export function startOfUTCDay(date: Date) {
  const d = new Date(date.getTime())
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export function endOfUTCDay(date: Date) {
  const d = new Date(date.getTime())
  d.setUTCHours(23, 59, 59, 999)
  return d
}

export function dayKey(date: Date) {
  return startOfUTCDay(date).getTime()
}

/**
 * @notice  Sampling period of the position PnL series, four times a day
 */
export const BUCKET_MS = 6 * 60 * 60 * 1000

/**
 * @notice  Floors a date to its 6 hour bucket, as the epoch ms of the bucket start.
 * @dev     Plain floor division is enough: the epoch is aligned on UTC midnight and 6h divides
 *          24h, so buckets always land on 00:00, 06:00, 12:00 and 18:00 UTC.
 */
export function bucketKey(date: Date) {
  return Math.floor(date.getTime() / BUCKET_MS) * BUCKET_MS
}
