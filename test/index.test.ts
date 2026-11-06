import { describe, expect, it } from "vitest";
import type { CronExpression } from "../src/index.js";
import { CronError, CronParseError, explain, matches, nextRuns, parseCron } from "../src/index.js";

function thrown(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

function iso(dates: readonly Date[]): string[] {
  return dates.map((date) => date.toISOString());
}

const UTC = { timeZone: "UTC" };
const NEW_YORK = { timeZone: "America/New_York" };

describe("explain", () => {
  const specified: [string, string][] = [
    ["30 9 * * 1-5", "At 09:30, Monday through Friday"],
    ["*/15 * * * *", "Every 15 minutes"],
    ["0 */2 * * *", "At minute 0 past every 2nd hour"],
    ["@daily", "At 00:00"],
    ["0 0 1 JAN *", "At 00:00, on day 1 of the month, only in January"],
    ["0 9 * * 1,3,5", "At 09:00, only on Monday, Wednesday, and Friday"],
    ["0 9 1-15 * *", "At 09:00, on days 1 through 15 of the month"],
  ];

  it.each(specified)("explains %s", (expr, text) => {
    expect(explain(expr)).toBe(text);
  });

  it("uses a 12-hour clock on request", () => {
    expect(explain("30 9 * * 1-5", { use24Hour: false })).toBe(
      "At 09:30 AM, Monday through Friday",
    );
    expect(explain("0 0 * * *", { use24Hour: false })).toBe("At 12:00 AM");
    expect(explain("0 12 * * *", { use24Hour: false })).toBe("At 12:00 PM");
    expect(explain("0 13 * * *", { use24Hour: false })).toBe("At 01:00 PM");
    expect(explain("*/15 9 * * *", { use24Hour: false })).toBe(
      "Every 15 minutes during the 09:00 AM hour",
    );
    expect(explain("0 0 * * *", { use24Hour: true })).toBe("At 00:00");
  });

  const extra: [string, string][] = [
    ["* * * * *", "Every minute"],
    ["0 * * * *", "At minute 0 past every hour"],
    ["0,30 * * * *", "Every 30 minutes"],
    ["5,10 * * * *", "At minutes 5 and 10 past every hour"],
    ["0-5 * * * *", "Every minute from 0 through 5 past every hour"],
    ["30 9-17 * * *", "At minute 30 past every hour from 09:00 through 17:00"],
    ["30 9,15 * * *", "At 09:30 and 15:30"],
    ["*/5 9 * * *", "Every 5 minutes during the 09:00 hour"],
    ["0,10 9,15 * * *", "At minutes 0 and 10 during the 09:00 and 15:00 hours"],
    ["* * */2 * *", "Every minute, on every 2nd day of the month"],
    ["0 0 13 * 5", "At 00:00, on day 13 of the month, or on Friday"],
    ["0 0 1-31 * 5", "At 00:00, on every day of the month, or on Friday"],
    ["0 0 13 * 0-6", "At 00:00, on day 13 of the month, or on every day of the week"],
    ["0 0 * 1-3 *", "At 00:00, only in January through March"],
    ["0 0 * 1,6,12 *", "At 00:00, only in January, June, and December"],
    ["0 0 1,15,20 * *", "At 00:00, on days 1, 15, and 20 of the month"],
    ["0 0 * * SAT-SUN", "At 00:00, only on Sunday and Saturday"],
    ["0 0 * * 7", "At 00:00, only on Sunday"],
    ["0 0 * * 1-3", "At 00:00, Monday through Wednesday"],
    ["0 */3 * * *", "At minute 0 past every 3rd hour"],
    ["0 */4 * * *", "At minute 0 past every 4th hour"],
    ["0 */12 * * *", "At minute 0 past every 12th hour"],
    ["0 0 */11 * *", "At 00:00, on every 11th day of the month"],
    ["0 0 */12 * *", "At 00:00, on every 12th day of the month"],
    ["0 0 */21 * *", "At 00:00, on every 21st day of the month"],
    ["0 0 */22 * *", "At 00:00, on every 22nd day of the month"],
    ["0 0 */23 * *", "At 00:00, on every 23rd day of the month"],
    ["@yearly", "At 00:00, on day 1 of the month, only in January"],
    ["@weekly", "At 00:00, only on Sunday"],
    ["@hourly", "At minute 0 past every hour"],
  ];

  it.each(extra)("explains %s", (expr, text) => {
    expect(explain(expr)).toBe(text);
  });

  it("accepts a parsed expression", () => {
    expect(explain(parseCron("@daily"))).toBe("At 00:00");
  });

  it("normalizes unsorted and duplicated field arrays", () => {
    const base = parseCron("* * * * *");
    const custom: CronExpression = {
      ...base,
      fields: { ...base.fields, minute: [30, 30], hour: [9] },
    };
    expect(explain(custom)).toBe("At 09:30");
  });

  const base = parseCron("* * * * *");
  const broken: unknown[] = [
    null,
    42,
    {},
    { ...base, source: 5 },
    { ...base, source: "x".repeat(257) },
    { ...base, fields: null },
    { ...base, domStar: "yes" },
    { ...base, dowStar: 1 },
    { ...base, fields: { ...base.fields, minute: [] } },
    { ...base, fields: { ...base.fields, minute: "x" } },
    { ...base, fields: { ...base.fields, minute: [60] } },
    { ...base, fields: { ...base.fields, minute: ["1"] } },
    { ...base, fields: { ...base.fields, hour: [1.5] } },
    { ...base, fields: { ...base.fields, dayOfMonth: [0] } },
    { ...base, fields: { ...base.fields, month: [13] } },
    { ...base, fields: { ...base.fields, dayOfWeek: [7] } },
    {
      ...base,
      fields: {
        ...base.fields,
        minute: Array.from({ length: 61 }, (_, i) => i % 60),
      },
    },
  ];

  it.each(broken.map((value, index) => [index, value] as const))(
    "rejects malformed expression object #%i",
    (_index, value) => {
      const error = thrown(() => explain(value as CronExpression));
      expect(error).toBeInstanceOf(CronParseError);
      expect((error as CronParseError).code).toBe("parse");
    },
  );
});

describe("parseCron", () => {
  it("reports field and position for an out-of-range minute", () => {
    const error = thrown(() => parseCron("61 * * * *"));
    expect(error).toBeInstanceOf(CronParseError);
    expect(error).toBeInstanceOf(CronError);
    expect(error).toBeInstanceOf(Error);
    const parseError = error as CronParseError;
    expect(parseError.code).toBe("parse");
    expect(parseError.field).toBe("minute");
    expect(parseError.position).toBe(0);
    expect(parseError.name).toBe("CronParseError");
  });

  const rejected = [
    "* * * *",
    "* * * * 5-1",
    "*/0 * * * *",
    "1, * * * *",
    "@reboot",
    `${"* ".repeat(128)}*`,
  ];

  it.each(rejected)("rejects %s with code parse", (expr) => {
    const error = thrown(() => parseCron(expr));
    expect(error).toBeInstanceOf(CronParseError);
    expect((error as CronParseError).code).toBe("parse");
  });

  it("parses weekday ranges that end on Sunday", () => {
    expect(parseCron("* * * * 5-7").fields.dayOfWeek).toEqual([0, 5, 6]);
    expect(parseCron("* * * * SAT-SUN").fields.dayOfWeek).toEqual([0, 6]);
    expect(parseCron("* * * * 6-SUN").fields.dayOfWeek).toEqual([0, 6]);
    expect(parseCron("* * * * SUN-SUN").fields.dayOfWeek).toEqual([0]);
    expect(parseCron("* * * * 0-7/2").fields.dayOfWeek).toEqual([0, 2, 4, 6]);
    expect(parseCron("* * * * */2").fields.dayOfWeek).toEqual([0, 2, 4, 6]);
  });

  it("treats 0 and 7 as Sunday and names case-insensitively", () => {
    expect(parseCron("0 0 * * 0").fields.dayOfWeek).toEqual([0]);
    expect(parseCron("0 0 * * 7").fields.dayOfWeek).toEqual([0]);
    expect(parseCron("* * * * mon-FRI").fields.dayOfWeek).toEqual(
      parseCron("* * * * 1-5").fields.dayOfWeek,
    );
    expect(parseCron("* * * jan *").fields.month).toEqual(parseCron("* * * 1 *").fields.month);
    expect(parseCron("* * * jan *").fields.month).toEqual([1]);
  });

  it("expands lists, ranges and steps sorted and deduplicated", () => {
    expect(parseCron("1-10/3,20,*/30,0 * * * *").fields.minute).toEqual([0, 1, 4, 7, 10, 20, 30]);
    expect(parseCron("0 */6 * * *").fields.hour).toEqual([0, 6, 12, 18]);
    expect(parseCron("0 0 * MAR-MAY/2 *").fields.month).toEqual([3, 5]);
    expect(parseCron("0 0 1,1,2 * *").fields.dayOfMonth).toEqual([1, 2]);
  });

  it("returns immutable results with star flags", () => {
    const cron = parseCron("0 0 */2 * 5");
    expect(Object.isFrozen(cron)).toBe(true);
    expect(Object.isFrozen(cron.fields.minute)).toBe(true);
    expect(cron.source).toBe("0 0 */2 * 5");
    expect(cron.domStar).toBe(true);
    expect(cron.dowStar).toBe(false);
    expect(parseCron("0 0 1 * 1-5").domStar).toBe(false);
    expect(parseCron("0 0 1 * 1-5").dowStar).toBe(false);
    expect(parseCron("* * * * *").dowStar).toBe(true);
  });

  it("accepts tabs, repeated blanks and surrounding whitespace", () => {
    expect(parseCron("0\t0\t*\t*\t*").fields.hour).toEqual([0]);
    expect(parseCron("  0   0 * * *  ").fields.minute).toEqual([0]);
  });

  it("accepts exactly 256 characters and rejects 257", () => {
    expect(parseCron("* * * * *".padEnd(256, " ")).fields.minute).toHaveLength(60);
    const error = thrown(() => parseCron("* ".repeat(128) + "*"));
    expect((error as CronParseError).field).toBe("expression");
    expect((error as CronParseError).position).toBe(256);
  });

  const macros: [string, string][] = [
    ["@yearly", "0 0 1 1 *"],
    ["@annually", "0 0 1 1 *"],
    ["@monthly", "0 0 1 * *"],
    ["@weekly", "0 0 * * 0"],
    ["@daily", "0 0 * * *"],
    ["@midnight", "0 0 * * *"],
    ["@hourly", "0 * * * *"],
    ["@DAILY", "0 0 * * *"],
  ];

  it.each(macros)("expands %s", (macro, expanded) => {
    const parsed = parseCron(macro);
    const reference = parseCron(expanded);
    expect(parsed.fields).toEqual(reference.fields);
    expect(parsed.domStar).toBe(reference.domStar);
    expect(parsed.dowStar).toBe(reference.dowStar);
    expect(parsed.source).toBe(macro);
  });

  const adversarial = [
    "",
    "   ",
    "@foo",
    "@daily extra",
    "@reboot now",
    "0 0 0 * * *",
    "1-2-3 * * * *",
    "*/5/2 * * * *",
    "5/2 * * * *",
    "*5 * * * *",
    "a * * * *",
    "1,,2 * * * *",
    ",1 * * * *",
    "jan * * * *",
    "* * * foo *",
    "* * * jan5 *",
    "* * * janu *",
    "* 24 * * *",
    "* * 0 * *",
    "* * 32 * *",
    "* * * 0 *",
    "* * * 13 *",
    "* * * * 8",
    "* * * * 7-1",
    "* * * DEC-JAN *",
    "99999999 * * * *",
    "*/ * * * *",
    "*/x * * * *",
    "? * * * *",
    "L * * * *",
    "* * 1W * *",
    "* * * * 5#2",
    "* * 15,L * *",
    "-5 * * * *",
    "5- * * * *",
    "1.5 * * * *",
  ];

  it.each(adversarial)("rejects %j", (expr) => {
    const error = thrown(() => parseCron(expr));
    expect(error).toBeInstanceOf(CronParseError);
    expect((error as CronError).code).toBe("parse");
  });

  it("reports positions and fields", () => {
    const range = thrown(() => parseCron("* * * * 5-1")) as CronParseError;
    expect([range.field, range.position]).toEqual(["dayOfWeek", 8]);
    const few = thrown(() => parseCron("* * * *")) as CronParseError;
    expect([few.field, few.position]).toEqual(["expression", 7]);
    const many = thrown(() => parseCron("0 0 0 * * *")) as CronParseError;
    expect([many.field, many.position]).toEqual(["expression", 10]);
    const gap = thrown(() => parseCron("1,,2 * * * *")) as CronParseError;
    expect([gap.field, gap.position]).toEqual(["minute", 2]);
    const month = thrown(() => parseCron("* * * 13 *")) as CronParseError;
    expect([month.field, month.position]).toEqual(["month", 6]);
    const reboot = thrown(() => parseCron("@reboot")) as CronParseError;
    expect([reboot.field, reboot.position]).toEqual(["expression", 0]);
  });

  it("rejects non-string input", () => {
    const error = thrown(() => parseCron(5 as unknown as string));
    expect(error).toBeInstanceOf(CronParseError);
  });

  it("never echoes more than 200 characters of input", () => {
    const error = thrown(() => parseCron(`@${"x".repeat(100)}`));
    const message = (error as CronParseError).message;
    expect(message.length).toBeLessThanOrEqual(200);
    expect(message).not.toContain("x".repeat(50));
    const long = thrown(() => parseCron("y".repeat(5000))) as CronError;
    expect(long.message.length).toBeLessThanOrEqual(200);
    expect(new CronError("range", "z".repeat(500)).message).toHaveLength(200);
  });
});

describe("matches", () => {
  it("applies the OR rule when neither day field starts with *", () => {
    for (const text of ["2026-11-06T00:00Z", "2026-11-13T00:00Z", "2026-10-13T00:00Z"]) {
      expect(matches("0 0 13 * 5", new Date(text), "UTC")).toBe(true);
    }
    expect(matches("0 0 13 * 5", new Date("2026-11-10T00:00Z"), "UTC")).toBe(false);
  });

  it("applies the AND rule when a day field starts with *", () => {
    expect(matches("0 0 */2 * 5", new Date("2026-11-13T00:00Z"), "UTC")).toBe(true);
    expect(matches("0 0 */2 * 5", new Date("2026-11-06T00:00Z"), "UTC")).toBe(false);
    expect(matches("0 0 * * 0", new Date("2026-11-08T00:00Z"), "UTC")).toBe(true);
    expect(matches("0 0 * * 0", new Date("2026-11-09T00:00Z"), "UTC")).toBe(false);
  });

  it("ignores seconds and milliseconds", () => {
    expect(matches("30 9 * * *", new Date("2026-11-05T09:30:59.999Z"), "UTC")).toBe(true);
    expect(matches("30 9 * * *", new Date("2026-11-05T09:31:00.000Z"), "UTC")).toBe(false);
  });

  it("checks hour and month", () => {
    expect(matches("30 9 * * *", new Date("2026-11-05T10:30Z"), "UTC")).toBe(false);
    expect(matches("30 9 * 6 *", new Date("2026-11-05T09:30Z"), "UTC")).toBe(false);
  });

  it("uses the wall clock of the zone", () => {
    const date = new Date("2026-11-05T14:00Z");
    expect(matches("0 9 * * *", date, "America/New_York")).toBe(true);
    expect(matches("0 9 * * *", date, "UTC")).toBe(false);
  });

  it("matches both occurrences of a repeated hour", () => {
    const first = new Date("2026-11-01T05:30Z");
    const second = new Date("2026-11-01T06:30Z");
    expect(matches("30 1 * * *", first, "America/New_York")).toBe(true);
    expect(matches("30 1 * * *", second, "America/New_York")).toBe(true);
  });

  it("accepts a parsed expression and reports typed errors", () => {
    const cron = parseCron("0 0 * * *");
    expect(matches(cron, new Date("2026-11-05T00:00Z"), "UTC")).toBe(true);
    const badDate = thrown(() => matches(cron, new Date(Number.NaN), "UTC"));
    expect((badDate as CronError).code).toBe("range");
    const badZone = thrown(() => matches(cron, new Date(0), "Mars/Base"));
    expect((badZone as CronError).code).toBe("time_zone");
    expect(thrown(() => matches("bad", new Date(0), "UTC"))).toBeInstanceOf(CronParseError);
  });
});

describe("nextRuns", () => {
  it("skips the nonexistent wall time of the spring-forward day", () => {
    const runs = nextRuns("30 2 * * *", new Date("2026-03-07T12:00Z"), 2, NEW_YORK);
    expect(iso(runs)).toEqual(["2026-03-09T06:30:00.000Z", "2026-03-10T06:30:00.000Z"]);
  });

  it("runs a fixed time after the jump on the spring-forward day", () => {
    const runs = nextRuns("0 3 * * *", new Date("2026-03-08T00:00Z"), 1, NEW_YORK);
    expect(iso(runs)).toEqual(["2026-03-08T07:00:00.000Z"]);
  });

  it("runs an ambiguous fixed time once, at its first occurrence", () => {
    const runs = nextRuns("30 1 * * *", new Date("2026-10-31T12:00Z"), 2, NEW_YORK);
    expect(iso(runs)).toEqual(["2026-11-01T05:30:00.000Z", "2026-11-02T06:30:00.000Z"]);
  });

  it("runs the repeated hour once for an hourly expression", () => {
    const runs = nextRuns("0 * * * *", new Date("2026-11-01T04:30Z"), 3, NEW_YORK);
    expect(iso(runs)).toEqual([
      "2026-11-01T05:00:00.000Z",
      "2026-11-01T07:00:00.000Z",
      "2026-11-01T08:00:00.000Z",
    ]);
  });

  it("handles southern hemisphere fall-back", () => {
    const runs = nextRuns("30 2 * * *", new Date("2026-04-04T00:00Z"), 2, {
      timeZone: "Australia/Sydney",
    });
    expect(iso(runs)).toEqual(["2026-04-04T15:30:00.000Z", "2026-04-05T16:30:00.000Z"]);
  });

  it("skips the nonexistent London hour", () => {
    const runs = nextRuns("30 1 * * *", new Date("2026-03-28T12:00Z"), 1, {
      timeZone: "Europe/London",
    });
    expect(iso(runs)).toEqual(["2026-03-30T00:30:00.000Z"]);
  });

  it("supports whole and half hour offsets", () => {
    const tokyo = nextRuns("0 9 * * *", new Date("2026-11-04T23:59Z"), 1, {
      timeZone: "Asia/Tokyo",
    });
    expect(iso(tokyo)).toEqual(["2026-11-05T00:00:00.000Z"]);
    const kolkata = nextRuns("0 9 * * *", new Date("2026-11-05T00:00Z"), 1, {
      timeZone: "Asia/Kolkata",
    });
    expect(iso(kolkata)).toEqual(["2026-11-05T03:30:00.000Z"]);
  });

  it("returns [] after the five-year horizon", () => {
    const from = new Date("2026-11-05T00:00Z");
    expect(nextRuns("0 0 30 2 *", from, 1, UTC)).toEqual([]);
    const late = new Date("2096-03-01T00:00Z");
    expect(nextRuns("0 0 29 2 *", late, 1, UTC)).toEqual([]);
  });

  it("finds the next leap day", () => {
    const runs = nextRuns("0 0 29 2 *", new Date("2026-11-05T00:00Z"), 1, UTC);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("excludes an instant equal to from", () => {
    const onMinute = new Date("2026-11-05T09:30:00Z");
    expect(iso(nextRuns("30 9 * * *", onMinute, 1, UTC))).toEqual(["2026-11-06T09:30:00.000Z"]);
    const before = new Date("2026-11-05T09:29:59.999Z");
    expect(iso(nextRuns("30 9 * * *", before, 1, UTC))).toEqual(["2026-11-05T09:30:00.000Z"]);
  });

  it("handles lists mixing ranges and steps", () => {
    const from = new Date("2026-11-05T12:00:00Z");
    expect(iso(nextRuns("1-10/3,20 12 * * *", from, 3, UTC))).toEqual([
      "2026-11-05T12:01:00.000Z",
      "2026-11-05T12:04:00.000Z",
      "2026-11-05T12:07:00.000Z",
    ]);
    const start = new Date("2026-11-05T00:00Z");
    expect(iso(nextRuns("0,30 9-10 * * *", start, 4, UTC))).toEqual([
      "2026-11-05T09:00:00.000Z",
      "2026-11-05T09:30:00.000Z",
      "2026-11-05T10:00:00.000Z",
      "2026-11-05T10:30:00.000Z",
    ]);
  });

  it("applies the day rule to run times", () => {
    const from = new Date("2026-11-05T00:00Z");
    expect(iso(nextRuns("0 0 13 * 5", from, 3, UTC))).toEqual([
      "2026-11-06T00:00:00.000Z",
      "2026-11-13T00:00:00.000Z",
      "2026-11-20T00:00:00.000Z",
    ]);
    expect(iso(nextRuns("0 0 31 * *", from, 1, UTC))).toEqual(["2026-12-31T00:00:00.000Z"]);
  });

  it("returns the maximum of 1000 ascending instants", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const runs = nextRuns("* * * * *", from, 1000, UTC);
    expect(runs).toHaveLength(1000);
    expect(runs[0]?.toISOString()).toBe("2026-01-01T00:01:00.000Z");
    expect(runs[999]?.toISOString()).toBe("2026-01-01T16:40:00.000Z");
    const times = runs.map((run) => run.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    const dst = nextRuns("* * * * *", new Date("2026-03-08T04:00Z"), 1000, NEW_YORK);
    expect(dst).toHaveLength(1000);
  });

  it("accepts a parsed expression", () => {
    const runs = nextRuns(parseCron("0 0 * * *"), new Date(0), 1, UTC);
    expect(iso(runs)).toEqual(["1970-01-02T00:00:00.000Z"]);
  });

  it("throws time_zone for an unknown or malformed zone", () => {
    const from = new Date("2026-11-05T00:00Z");
    const unknown = thrown(() => nextRuns("* * * * *", from, 1, { timeZone: "Mars/Base" }));
    expect(unknown).toBeInstanceOf(CronError);
    expect((unknown as CronError).code).toBe("time_zone");
    for (const zone of ["", "A".repeat(101), 123 as unknown as string]) {
      const error = thrown(() => nextRuns("* * * * *", from, 1, { timeZone: zone }));
      expect((error as CronError).code).toBe("time_zone");
    }
    const missing = thrown(() => nextRuns("* * * * *", from, 1, undefined as never));
    expect((missing as CronError).code).toBe("time_zone");
  });

  it("throws range for a bad count or date", () => {
    const from = new Date("2026-11-05T00:00Z");
    for (const count of [0, 1001, 1.5, Number.NaN, -1]) {
      const error = thrown(() => nextRuns("* * * * *", from, count, UTC));
      expect(error).toBeInstanceOf(CronError);
      expect((error as CronError).code).toBe("range");
    }
    const invalid = thrown(() => nextRuns("* * * * *", new Date(Number.NaN), 1, UTC));
    expect((invalid as CronError).code).toBe("range");
    const notDate = thrown(() => nextRuns("* * * * *", "2026-01-01" as unknown as Date, 1, UTC));
    expect((notDate as CronError).code).toBe("range");
  });

  it("throws parse for an invalid expression", () => {
    const error = thrown(() => nextRuns("nope", new Date(0), 1, UTC));
    expect(error).toBeInstanceOf(CronParseError);
  });
});
