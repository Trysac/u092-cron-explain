import { CronError } from "./errors.js";
import type { CronExpression } from "./parser.js";
import { toExpression } from "./parser.js";

/** Options for {@link nextRuns}. */
export interface NextRunsOptions {
  /** IANA time zone name, for example `America/New_York`. */
  readonly timeZone: string;
}

const MAX_COUNT = 1000;
const HORIZON_DAYS = 1827;
const MAX_ZONE_LENGTH = 100;
const MAX_TIME_MS = 8.64e15;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

interface WallTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

interface Zone {
  wall(ms: number): WallTime;
  offset(ms: number): number;
}

function utcMs(year: number, month: number, day: number, hour: number, minute: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, 0, 0);
  return date.getTime();
}

function instantOf(date: unknown): number {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new CronError("range", "date must be a valid Date");
  }
  return date.getTime();
}

function createZone(timeZone: unknown): Zone {
  if (typeof timeZone !== "string" || timeZone === "" || timeZone.length > MAX_ZONE_LENGTH) {
    throw new CronError("time_zone", "time zone must be an IANA zone name");
  }
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    throw new CronError("time_zone", "unknown time zone");
  }
  const wall = (ms: number): WallTime => {
    if (!Number.isFinite(ms) || Math.abs(ms) > MAX_TIME_MS) {
      throw new CronError("range", "instant is outside the supported range");
    }
    const values = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
    for (const part of format.formatToParts(new Date(ms))) {
      if (part.type in values) {
        values[part.type as keyof typeof values] = Number.parseInt(part.value, 10);
      }
    }
    values.hour %= 24;
    return values;
  };
  const offset = (ms: number): number => {
    const whole = Math.floor(ms / 1000) * 1000;
    const w = wall(whole);
    const local = utcMs(w.year, w.month, w.day, w.hour, w.minute);
    return local + w.second * 1000 - whole;
  };
  return { wall, offset };
}

function dayMatches(cron: CronExpression, dayOfMonth: number, dayOfWeek: number): boolean {
  const domOk = cron.fields.dayOfMonth.includes(dayOfMonth);
  const dowOk = cron.fields.dayOfWeek.includes(dayOfWeek);
  return cron.domStar || cron.dowStar ? domOk && dowOk : domOk || dowOk;
}

function dayOffsets(zone: Zone, dayMs: number): readonly number[] {
  const samples = [dayMs - DAY_MS, dayMs + DAY_MS / 2, dayMs + 2 * DAY_MS];
  return [...new Set(samples.map((sample) => zone.offset(sample)))];
}

/** Turns a wall time into its first valid instant, or undefined if skipped. */
function resolveInstant(
  zone: Zone,
  localMs: number,
  offsets: readonly number[],
): number | undefined {
  const candidates: number[] = [];
  for (const offset of offsets) {
    const instant = localMs - offset;
    if (offsets.length === 1 || zone.offset(instant) === offset) {
      candidates.push(instant);
    }
  }
  return candidates.length === 0 ? undefined : Math.min(...candidates);
}

/**
 * Computes the next run instants of a cron expression in a time zone.
 *
 * Returned instants are strictly after `from`; an instant equal to `from` is
 * excluded. The search covers 1827 calendar days (5 years) in the zone and
 * returns fewer than `count` instants (possibly none) when the expression
 * does not fire in that horizon.
 *
 * DST policy: a wall time that does not exist (spring forward) is skipped; a
 * wall time that occurs twice (fall back) runs once, at its first occurrence,
 * also for expressions such as `0 * * * *`. Vixie cron instead runs skipped
 * fixed-time jobs right after the jump and wildcard jobs in both repeated
 * hours.
 *
 * @param expr - Expression string or parsed CronExpression.
 * @param from - Exclusive lower bound.
 * @param count - How many instants to return, 1 to 1000.
 * @param opts - `timeZone`, an IANA zone name.
 * @returns Instants in ascending order.
 * @throws {CronParseError} Invalid expression (code `parse`).
 * @throws {CronError} Code `range` for a bad `count`, an invalid `from` or an
 * instant outside the Date range; code `time_zone` for an unknown zone.
 */
export function nextRuns(
  expr: string | CronExpression,
  from: Date,
  count: number,
  opts: NextRunsOptions,
): Date[] {
  const cron = toExpression(expr);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new CronError("range", `count must be an integer 1-${MAX_COUNT}`);
  }
  const fromMs = instantOf(from);
  const zoneName: unknown = typeof opts === "object" && opts !== null ? opts.timeZone : undefined;
  const zone = createZone(zoneName);
  const start = zone.wall(fromMs);
  const months = new Set(cron.fields.month);
  const results: Date[] = [];
  for (let i = -1; i < HORIZON_DAYS; i += 1) {
    const dayMs = utcMs(start.year, start.month, start.day + i, 0, 0);
    if (Number.isNaN(dayMs)) {
      break;
    }
    const day = new Date(dayMs);
    const dayOk =
      months.has(day.getUTCMonth() + 1) && dayMatches(cron, day.getUTCDate(), day.getUTCDay());
    if (!dayOk) {
      continue;
    }
    const offsets = dayOffsets(zone, dayMs);
    for (const hour of cron.fields.hour) {
      for (const minute of cron.fields.minute) {
        const local = dayMs + hour * HOUR_MS + minute * MINUTE_MS;
        const instant = resolveInstant(zone, local, offsets);
        if (instant !== undefined && instant > fromMs) {
          results.push(new Date(instant));
          if (results.length === count) {
            return results;
          }
        }
      }
    }
  }
  return results;
}

/**
 * Tells whether a cron expression matches the minute containing `date` in a
 * time zone. Seconds and milliseconds are ignored. Only the wall clock is
 * compared, so both occurrences of a repeated DST hour match; the skip rule of
 * {@link nextRuns} is not applied.
 *
 * @param expr - Expression string or parsed CronExpression.
 * @param date - The instant to test.
 * @param timeZone - IANA zone name.
 * @returns True when the wall-clock minute matches.
 * @throws {CronParseError} Invalid expression.
 * @throws {CronError} Code `range` for an invalid Date, `time_zone` for an
 * unknown zone.
 */
export function matches(expr: string | CronExpression, date: Date, timeZone: string): boolean {
  const cron = toExpression(expr);
  const ms = instantOf(date);
  const zone = createZone(timeZone);
  const wall = zone.wall(ms);
  if (
    !cron.fields.minute.includes(wall.minute) ||
    !cron.fields.hour.includes(wall.hour) ||
    !cron.fields.month.includes(wall.month)
  ) {
    return false;
  }
  const dayOfWeek = new Date(utcMs(wall.year, wall.month, wall.day, 0, 0)).getUTCDay();
  return dayMatches(cron, wall.day, dayOfWeek);
}
