# Architecture

## Overview

`@trysac/cron-explain` is a small, dependency-free TypeScript library published to npm as ES modules with type declarations. It parses Vixie cron expressions, explains them in English and computes next run times in IANA time zones with an explicit DST policy. Time zone data comes from `Intl.DateTimeFormat`; no date library is used.

## Modules

| Module | Responsibility |
|---|---|
| `src/index.ts` | Public entry point. Re-exports `parseCron`, `explain`, `nextRuns`, `matches`, `CronError`, `CronParseError` and the related types. |
| `src/parser.ts` | Hand-written tokenizer and field parser. Expands fields into sorted, deduplicated arrays, expands macros, sets the `domStar` and `dowStar` flags, and validates CronExpression objects passed as input (`toExpression`). |
| `src/explain.ts` | Builds the English explanation from the expanded fields. |
| `src/schedule.ts` | `nextRuns` and `matches`. Converts wall-clock fields to instants per time zone and applies the day rule and DST policy. |
| `src/errors.ts` | `CronError` (code `parse`, `time_zone` or `range`) and `CronParseError` (adds `field` and `position`). |

Internal modules are not part of the public API beyond what `src/index.ts` exports.

## Data flow

1. A string (or CronExpression object) enters through `toExpression`, which calls `parseCron` for strings and revalidates objects.
2. `explain` turns the expanded fields into text.
3. `nextRuns` walks calendar days in the zone, filters by the day rule, expands hours and minutes ascending, and resolves each wall time to an instant through the zone offsets around it.
4. `matches` reads the wall-clock fields of one instant and compares them to the expanded fields.

## Boundaries

- No runtime dependencies. Any addition must be justified in [STACK.md](STACK.md).
- No I/O at import time, no network, no file access, no `eval`.
- Results of `parseCron` and `toExpression` are frozen.
- Errors are thrown as `CronError` or `CronParseError`; messages are truncated to 200 characters.

## Build and distribution

`npm run build` compiles `src/` to `dist/`. Only `dist/` is published (`files` in `package.json`).
