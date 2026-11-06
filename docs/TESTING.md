# Testing

## Tools

- [Vitest](https://vitest.dev/) runs the suite in `test/`.
- Coverage is collected with V8 (`@vitest/coverage-v8`) over `src/`.

## Test files

- `test/index.test.ts` is the only test file. It imports from `../src/index.js`, so every test goes through the public entry point.

It contains four `describe` blocks:

- `explain`: the spec examples, 12-hour clock output, normalization of unsorted and duplicated arrays, rejection of malformed CronExpression objects.
- `parseCron`: error class, code, field and position; rejected inputs; weekday and month names; 0 and 7 as Sunday; lists, ranges and steps; immutability and star flags; whitespace; the 256-character limit; macros; adversarial inputs.
- `matches`: OR and AND day rules, seconds ignored, hour and month checks, zone wall clock, both occurrences of a repeated DST hour, typed errors.
- `nextRuns`: spring-forward gap, fall-back, southern hemisphere, a half-hour offset zone, the 5-year horizon, leap day, exclusion of `from`, the 1000-instant maximum, `time_zone` and `range` errors.

## Commands

```sh
npm test            # vitest run --coverage
npx vitest          # watch mode while developing
```

## Rules

- Coverage thresholds are set in `vitest.config.ts`; the target is at least 80 % for lines, branches, functions and statements. Lowering the thresholds is not allowed.
- Assert observable behavior: return values, thrown error classes, codes, fields, positions and messages.
- Each bug fix adds a test that fails without the fix.
- Tests are deterministic: no network and no shared state between tests.

## Reports

Coverage reports are written to `coverage/`. The folder is ignored by git.
