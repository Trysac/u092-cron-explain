import type { CronExpression } from "./parser.js";
import { toExpression } from "./parser.js";

/** Options for {@link explain}. */
export interface ExplainOptions {
  /** Use a 24-hour clock (default `true`); `false` gives `09:30 AM`. */
  readonly use24Hour?: boolean;
}

const WEEKDAY_STEMS = "Sun Mon Tues Wednes Thurs Fri Satur".split(" ");

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function weekdayName(day: number): string {
  return `${WEEKDAY_STEMS[day] ?? ""}day`;
}

function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}

function ordinal(value: number): string {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${value}th`;
  }
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function joinList(items: readonly string[]): string {
  const last = items[items.length - 1] ?? "";
  if (items.length <= 1) {
    return last;
  }
  const head = items.slice(0, -1).join(", ");
  return items.length === 2 ? `${head} and ${last}` : `${head}, and ${last}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clock(hour: number, minute: number, use24Hour: boolean): string {
  if (use24Hour) {
    return `${pad(hour)}:${pad(minute)}`;
  }
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${pad(hour12)}:${pad(minute)} ${hour < 12 ? "AM" : "PM"}`;
}

function isContiguous(values: readonly number[]): boolean {
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  return values.length >= 2 && last - first === values.length - 1;
}

/** Step of values that are every `step`-th value starting at `min`. */
function progressionStep(values: readonly number[], min: number, max: number): number | undefined {
  if (values.length < 2 || values[0] !== min) {
    return undefined;
  }
  const step = (values[1] ?? 0) - min;
  if (step < 2 || values.length !== Math.floor((max - min) / step) + 1) {
    return undefined;
  }
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] !== min + i * step) {
      return undefined;
    }
  }
  return step;
}

interface MinuteLead {
  readonly text: string;
  readonly needsHourWord: boolean;
}

function minuteLead(minutes: readonly number[]): MinuteLead {
  if (minutes.length === 60) {
    return { text: "Every minute", needsHourWord: false };
  }
  const step = progressionStep(minutes, 0, 59);
  if (step !== undefined) {
    return { text: `Every ${step} minutes`, needsHourWord: false };
  }
  if (minutes.length === 1) {
    return { text: `At minute ${minutes[0] ?? 0}`, needsHourWord: true };
  }
  if (isContiguous(minutes)) {
    const last = minutes[minutes.length - 1] ?? 0;
    return {
      text: `Every minute from ${minutes[0] ?? 0} through ${last}`,
      needsHourWord: true,
    };
  }
  const list = joinList(minutes.map(String));
  return { text: `At minutes ${list}`, needsHourWord: true };
}

function timePhrase(
  minutes: readonly number[],
  hours: readonly number[],
  use24Hour: boolean,
): string {
  const firstMinute = minutes[0] ?? 0;
  const firstHour = hours[0] ?? 0;
  const lastHour = hours[hours.length - 1] ?? 0;
  if (minutes.length === 1 && hours.length === 1) {
    return `At ${clock(firstHour, firstMinute, use24Hour)}`;
  }
  const lead = minuteLead(minutes);
  if (hours.length === 24) {
    return lead.needsHourWord ? `${lead.text} past every hour` : lead.text;
  }
  const step = progressionStep(hours, 0, 23);
  if (step !== undefined) {
    return `${lead.text} past every ${ordinal(step)} hour`;
  }
  if (hours.length === 1) {
    const label = clock(firstHour, 0, use24Hour);
    return `${lead.text} during the ${label} hour`;
  }
  if (isContiguous(hours)) {
    const from = clock(firstHour, 0, use24Hour);
    const to = clock(lastHour, 0, use24Hour);
    return `${lead.text} past every hour from ${from} through ${to}`;
  }
  if (minutes.length === 1) {
    const times = hours.map((hour) => clock(hour, firstMinute, use24Hour));
    return `At ${joinList(times)}`;
  }
  const labels = hours.map((hour) => clock(hour, 0, use24Hour));
  return `${lead.text} during the ${joinList(labels)} hours`;
}

function dayOfMonthPhrase(values: readonly number[], orMode: boolean): string | undefined {
  if (values.length === 31) {
    return orMode ? "on every day of the month" : undefined;
  }
  const step = progressionStep(values, 1, 31);
  if (step !== undefined) {
    return `on every ${ordinal(step)} day of the month`;
  }
  if (values.length === 1) {
    return `on day ${values[0] ?? 0} of the month`;
  }
  if (isContiguous(values)) {
    const last = values[values.length - 1] ?? 0;
    return `on days ${values[0] ?? 0} through ${last} of the month`;
  }
  return `on days ${joinList(values.map(String))} of the month`;
}

function dayOfWeekPhrase(values: readonly number[], orMode: boolean): string | undefined {
  if (values.length === 7) {
    return orMode ? "or on every day of the week" : undefined;
  }
  if (isContiguous(values)) {
    const first = weekdayName(values[0] ?? 0);
    const last = weekdayName(values[values.length - 1] ?? 0);
    const range = `${first} through ${last}`;
    return orMode ? `or on ${range}` : range;
  }
  const list = joinList(values.map(weekdayName));
  return orMode ? `or on ${list}` : `only on ${list}`;
}

function monthPhrase(values: readonly number[]): string | undefined {
  if (values.length === 12) {
    return undefined;
  }
  if (isContiguous(values)) {
    const first = monthName(values[0] ?? 1);
    const last = monthName(values[values.length - 1] ?? 1);
    return `only in ${first} through ${last}`;
  }
  return `only in ${joinList(values.map(monthName))}`;
}

/**
 * Explains a cron expression in English.
 *
 * The phrase starts with a time part (`At 09:30`, `Every 15 minutes`,
 * `At minute 0 past every 2nd hour`), followed by comma-joined day-of-month,
 * day-of-week and month phrases. When both day fields are restricted and
 * neither starts with `*`, the Vixie rule applies (either matches) and the
 * weekday phrase starts with `or on`.
 *
 * @param expr - Expression string or an already parsed CronExpression.
 * @param opts - `use24Hour` (default `true`).
 * @returns The explanation.
 * @throws {CronParseError} When the expression is invalid.
 */
export function explain(expr: string | CronExpression, opts?: ExplainOptions): string {
  const cron = toExpression(expr);
  const use24Hour = opts?.use24Hour !== false;
  const { minute, hour, dayOfMonth, month, dayOfWeek } = cron.fields;
  const orMode = !cron.domStar && !cron.dowStar;
  const phrases = [timePhrase(minute, hour, use24Hour)];
  for (const phrase of [
    dayOfMonthPhrase(dayOfMonth, orMode),
    dayOfWeekPhrase(dayOfWeek, orMode),
    monthPhrase(month),
  ]) {
    if (phrase !== undefined) {
      phrases.push(phrase);
    }
  }
  return phrases.join(", ");
}
