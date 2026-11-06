# cron-explain

[![npm version](https://img.shields.io/npm/v/@trysac/cron-explain.svg)](https://www.npmjs.com/package/@trysac/cron-explain)
[![license: MIT](https://img.shields.io/npm/l/@trysac/cron-explain.svg)](LICENSE)
[![CI](https://github.com/Trysac/u092-cron-explain/actions/workflows/ci.yml/badge.svg)](https://github.com/Trysac/u092-cron-explain/actions/workflows/ci.yml)

Parse Vixie cron expressions, explain them in plain English and compute next run times in IANA time zones with an explicit DST policy.

## Problem

Cron expressions are easy to get wrong and hard to read in code review. Teams paste them into websites to check them, and the day-of-month versus day-of-week rule surprises almost everyone. cronstrue only explains expressions and cron-parser only computes next runs. This package does both with one parser, follows Vixie cron day semantics and handles DST with a documented policy.

## Install

```sh
npm install @trysac/cron-explain
```

Requires Node.js 20 or newer. The package ships ES modules with TypeScript declarations and has no runtime dependencies.

## Usage

```ts
import { explain, matches, nextRuns, parseCron, CronParseError } from "@trysac/cron-explain";

console.log(explain("30 9 * * 1-5")); // At 09:30, Monday through Friday
const runs = nextRuns("30 2 * * *", new Date("2026-03-07T12:00Z"), 2, { timeZone: "America/New_York" });
console.log(runs.map((d) => d.toISOString())); // 2026-03-09T06:30:00.000Z, 2026-03-10T06:30:00.000Z
console.log(matches("30 9 * * *", new Date("2026-11-05T09:30:59.999Z"), "UTC")); // true
try {
  parseCron("61 * * * *");
} catch (error) {
  if (error instanceof CronParseError) console.error(error.code, error.field, error.position); // parse minute 0
}
```

## API

| Export | Signature | Description |
|---|---|---|
| `parseCron` | `(expr: string) => CronExpression` | Parses five fields or an `@` macro (`@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight`, `@hourly`). Throws `CronParseError`. |
| `explain` | `(expr: string \| CronExpression, opts?: { use24Hour?: boolean }) => string` | English description. The 24-hour clock is the default; `use24Hour: false` gives `09:30 AM`. |
| `nextRuns` | `(expr: string \| CronExpression, from: Date, count: number, opts: { timeZone: string }) => Date[]` | Instants strictly after `from`, `count` from 1 to 1000, in ascending order. Searches 1827 calendar days (5 years) and returns fewer than `count` instants, possibly `[]`, when the expression does not fire in that horizon. |
| `matches` | `(expr: string \| CronExpression, date: Date, timeZone: string) => boolean` | Whether the wall-clock minute in the zone matches. Seconds and milliseconds are ignored. Both occurrences of a repeated DST hour match. |
| `CronExpression` | type | `{ source, fields: { minute, hour, dayOfMonth, month, dayOfWeek }, domStar, dowStar }`. Field arrays are sorted and deduplicated and the object is frozen. `dayOfWeek` uses 0 for Sunday through 6 for Saturday. |
| `CronError`, `CronParseError` | classes | Error types, described below. |

Grammar: five fields separated by spaces or tabs. Supported are ranges, lists, steps on ranges and on `*`, month names `JAN`-`DEC` and weekday names `SUN`-`SAT` (case-insensitive), and 7 as Sunday. A range end of 7 or SUN means Sunday, so `5-7` and `SAT-SUN` are valid. A range whose start exceeds its end is a parse error.

Not accepted: `@reboot`, seconds fields, and the Quartz extensions `L`, `W`, `#` and `?`.

### Errors

- `CronError` has `code`: `'parse'`, `'time_zone'` (unknown or malformed IANA zone) or `'range'` (`count` outside 1 to 1000, an invalid Date, or an instant outside the Date range).
- `CronParseError` extends `CronError` with `code` `'parse'`, `field` (`minute`, `hour`, `dayOfMonth`, `month`, `dayOfWeek` or `expression` for whole-expression problems) and `position` (0-based character index in the source).
- Error messages are cut to 200 characters.

### Limits

- Expression length: at most 256 characters; longer input is rejected.
- Digits per number: at most 4.
- `nextRuns` count: 1 to 1000. Search horizon: 1827 calendar days from `from`.
- Time zone names: at most 100 characters.
- Month and weekday names are three-letter abbreviations only.

### Day rule

As in Vixie cron: if either day field begins with `*`, the day matches when both day fields match. Otherwise the day matches when either field matches. So `0 0 13 * 5` runs on the 13th and on every Friday, while `0 0 */2 * 5` runs only on Fridays that fall on odd days of the month.

### DST policy

- A nonexistent wall time (spring forward) is skipped.
- An ambiguous wall time (fall back) runs once, at its first occurrence, including for `0 * * * *`.

Vixie cron behaves differently: it runs skipped fixed-time jobs right after the jump and runs wildcard jobs in both repeated hours.

## Why not cronstrue and cron-parser?

cronstrue explains expressions but does not compute run times, and cron-parser computes run times but does not explain them. This package offers both from one parser, applies Vixie day semantics and documents its DST policy explicitly.

## Security

Threat model, input limits and what is not defended are described in [docs/SECURITY.md](docs/SECURITY.md).

## Development

```sh
npm install
npm test   # vitest run with V8 coverage
```

See [docs/TESTING.md](docs/TESTING.md) for the test suite and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module layout.

## License

[MIT](LICENSE) © 2026 Miguel Gomez
