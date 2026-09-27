/**
 * Which stretch of time a business report covers.
 *
 * The shop runs on Nairobi time (UTC+3, no daylight saving), so a "day" is
 * midnight to midnight in Kikuyu, not in UTC. Every report covers a period
 * that has already finished: the daily report sent at 07:00 is about
 * yesterday, the weekly one on Monday is about last Monday to Sunday, and the
 * monthly one on the 1st is about last month. Each also carries the period
 * before it, so the email can say whether things went up or down.
 */

export type ReportKind = "daily" | "weekly" | "monthly";

export const REPORT_KINDS: readonly ReportKind[] = ["daily", "weekly", "monthly"];

export type ReportPeriod = {
  kind: ReportKind;
  /** Inclusive start, as a real instant. */
  start: Date;
  /** Exclusive end, as a real instant. */
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  /** Nairobi calendar date of the first day, YYYY-MM-DD. */
  firstDay: string;
  /** Nairobi calendar date of the last day, YYYY-MM-DD. */
  lastDay: string;
  /** Human label, e.g. "2026-09-26", "2026-09-21 ~ 2026-09-27", "2026-09". */
  label: string;
};

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isReportKind(value: unknown): value is ReportKind {
  return typeof value === "string" && (REPORT_KINDS as readonly string[]).includes(value);
}

/**
 * The most recent finished period of this kind as of `now`, or — when `day`
 * (a Nairobi YYYY-MM-DD) is given — the period that contains that day. The
 * second form is for re-sending or checking an older report by hand.
 */
export function reportPeriod(kind: ReportKind, now: Date, day?: string): ReportPeriod {
  // Today has not finished, so the latest finished period is the one holding
  // yesterday, whatever the kind.
  const anchor = day ? parseNairobiDay(day) : new Date(nairobiMidnight(now).getTime() - DAY_MS);
  const [start, end] = containingPeriod(kind, anchor);
  const [previousStart, previousEnd] = containingPeriod(kind, new Date(start.getTime() - DAY_MS));
  const firstDay = nairobiDate(start);
  const lastDay = nairobiDate(new Date(end.getTime() - DAY_MS));
  const label = kind === "daily" ? firstDay : kind === "weekly" ? `${firstDay} ~ ${lastDay}` : firstDay.slice(0, 7);
  return { kind, start, end, previousStart, previousEnd, firstDay, lastDay, label };
}

/** YYYY-MM-DD of an instant, as the calendar reads in Nairobi. */
export function nairobiDate(instant: Date): string {
  return new Date(instant.getTime() + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}

/** [start, end) of the day, Monday-based week or month that holds `midnight`. */
function containingPeriod(kind: ReportKind, midnight: Date): [Date, Date] {
  const local = new Date(midnight.getTime() + NAIROBI_OFFSET_MS);
  if (kind === "daily") {
    return [midnight, new Date(midnight.getTime() + DAY_MS)];
  }
  if (kind === "weekly") {
    const sinceMonday = (local.getUTCDay() + 6) % 7;
    const start = new Date(midnight.getTime() - sinceMonday * DAY_MS);
    return [start, new Date(start.getTime() + 7 * DAY_MS)];
  }
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return [
    new Date(Date.UTC(year, month, 1) - NAIROBI_OFFSET_MS),
    new Date(Date.UTC(year, month + 1, 1) - NAIROBI_OFFSET_MS)
  ];
}

function nairobiMidnight(instant: Date): Date {
  const local = new Date(instant.getTime() + NAIROBI_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - NAIROBI_OFFSET_MS);
}

function parseNairobiDay(day: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new RangeError(`Expected a date like 2026-09-26, got "${day}".`);
  const [, year, month, date] = match.map(Number);
  const utc = Date.UTC(year, month - 1, date);
  if (new Date(utc).toISOString().slice(0, 10) !== day) {
    throw new RangeError(`"${day}" is not a real calendar date.`);
  }
  return new Date(utc - NAIROBI_OFFSET_MS);
}
