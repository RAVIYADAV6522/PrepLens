/**
 * Interview dates: a year, and usually a month.
 *
 * "Now" is India time, not the server's UTC. Otherwise, for the first five and
 * a half hours of a month, a student reporting this morning's interview would
 * be told it is in the future.
 */
const TIMEZONE = 'Asia/Kolkata';

export function currentYearMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: 'numeric' }).formatToParts(now);
  const value = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: value('year'), month: value('month') };
}

/** With no month, only the year can be judged. */
export function isFutureInterview(year, month, now = new Date()) {
  const current = currentYearMonth(now);
  if (year !== current.year) return year > current.year;
  return Boolean(month) && month > current.month;
}

/** "2025-08" to { year: 2025, month: 8 }, for the from/to feed filters. */
export function parseYearMonth(value) {
  const [year, month] = value.split('-').map(Number);
  return { year, month };
}
