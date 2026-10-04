/**
 * Date helpers.
 *
 * Rules the whole app follows:
 *  - "Calendar dates" (snapshot_date, week_start …) are plain YYYY-MM-DD strings.
 *  - String date maths is done in UTC so it never depends on the server's or
 *    browser's timezone and never shifts a day.
 *  - "What day is it?" on the server is answered in APP_TIMEZONE (default IST),
 *    because Vercel runs in UTC and an Indian business day does not.
 *  - The browser builds ranges from its *local* calendar via toYMD(), never via
 *    toISOString() (which converts to UTC and shifts the date by a day in IST).
 */

export const APP_TIMEZONE =
  process.env.APP_TIMEZONE || process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isYMD(value: string | null | undefined): value is string {
  return !!value && YMD.test(value);
}

/** Format a Date's *local* calendar day as YYYY-MM-DD. */
export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/** Add whole days to a YYYY-MM-DD string (UTC maths, no DST drift). */
export function addDays(ymd: string, days: number): string {
  const d = parseYMD(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive number of days between two YYYY-MM-DD strings. */
export function daysInclusive(start: string, end: string): number {
  return Math.round((parseYMD(end).getTime() - parseYMD(start).getTime()) / 86_400_000) + 1;
}

/** Today's calendar date in the given timezone. */
export function todayInTz(tz: string = APP_TIMEZONE, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Offset (ms) of `tz` from UTC at the instant `atMs`. */
function tzOffsetMs(tz: string, atMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(atMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(atMs / 1000) * 1000;
}

/** The UTC instant at which calendar day `ymd` starts in `tz`. */
export function dayStartUtc(ymd: string, tz: string = APP_TIMEZONE): Date {
  const guess = parseYMD(ymd).getTime();
  return new Date(guess - tzOffsetMs(tz, guess));
}

/** [start, end) UTC instants covering calendar day `ymd` in `tz`. */
export function dayBoundsUtc(ymd: string, tz: string = APP_TIMEZONE): { start: Date; end: Date } {
  return { start: dayStartUtc(ymd, tz), end: dayStartUtc(addDays(ymd, 1), tz) };
}

/** Monday of the most recently *completed* Mon–Sun week, relative to `today`. */
export function lastCompletedWeekStart(today: string): string {
  const dow = parseYMD(today).getUTCDay(); // 0=Sun … 6=Sat
  return addDays(today, -((dow + 6) % 7) - 7);
}

export type DashboardRange = "today" | "yesterday" | "7d" | "14d" | "30d" | "last_month" | "custom";

/**
 * Resolve a dashboard range preset into inclusive YYYY-MM-DD bounds using the
 * caller's local calendar (call this in the browser).
 */
export function resolveDashboardRange(
  range: DashboardRange,
  customStart?: string,
  customEnd?: string,
  now: Date = new Date()
): { startDate: string; endDate: string } {
  const today = toYMD(now);
  switch (range) {
    case "yesterday": {
      const y = addDays(today, -1);
      return { startDate: y, endDate: y };
    }
    case "7d":
      return { startDate: addDays(today, -6), endDate: today };
    case "14d":
      return { startDate: addDays(today, -13), endDate: today };
    case "30d":
      return { startDate: addDays(today, -29), endDate: today };
    case "last_month": {
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        startDate: toYMD(firstOfLastMonth),
        endDate: addDays(toYMD(firstOfThisMonth), -1),
      };
    }
    case "custom":
      if (isYMD(customStart) && isYMD(customEnd)) {
        return customStart <= customEnd
          ? { startDate: customStart, endDate: customEnd }
          : { startDate: customEnd, endDate: customStart };
      }
      return { startDate: today, endDate: today };
    default:
      return { startDate: today, endDate: today };
  }
}
