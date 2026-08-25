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
