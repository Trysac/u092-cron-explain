# Security

This document describes the threat model of the library and the practices of the repository. The disclosure policy is in [../SECURITY.md](../SECURITY.md).

## Threat model

The library takes untrusted strings or objects (cron expressions, CronExpression objects, time zone names, counts, dates) and returns schedules or text. The main risks are malformed input, resource use and misleading output.

### Defended

- Malformed strings: every invalid input throws `CronParseError` (code `parse`) with a field and a position.
- Oversized strings: expressions longer than 256 characters are rejected before tokenizing.
- Long numbers: a number with more than 4 digits is rejected.
- Forged CronExpression objects: `toExpression` checks types, the 256-character source limit, that each field is a non-empty array of distinct-or-duplicate integers within the field range and length limit, and the boolean star flags. Arrays are normalized (sorted and deduplicated) before use.
- Mutation of results: `parseCron` and `toExpression` return frozen objects and frozen field arrays.
- Unbounded output: `nextRuns` returns at most 1000 instants.
- Unbounded search: the search covers at most 1827 calendar days from `from`.
- Error message size: messages are truncated to 200 characters, and parse messages echo at most 40 characters of user input.
- Invalid time zone names: names longer than 100 characters or unknown to `Intl.DateTimeFormat` throw `CronError` (code `time_zone`).
- Invalid dates and out-of-range instants: throw `CronError` (code `range`).
- Code execution: no `eval`, no dynamic `Function`, no shell calls, no network access, no file access.

### Not defended

- Search cost: the search is bounded but not cheap. A rarely matching expression, such as `0 0 30 2 *`, scans the whole horizon before returning `[]`. Callers that accept expressions from untrusted users must bound the request rate themselves.
- Time zone data: correctness depends on the time zone database of the Node.js runtime through `Intl`. The library does not verify or pin it.
- Clock and host time: the library does not read the system clock; callers supply `from` and `date`.
- DST semantics: the library follows its documented policy, which differs from Vixie cron for skipped and repeated hours. Schedules that depend on Vixie behavior will fire at different instants.
- Authentication, authorization and rate limiting: out of scope for a parsing library.
- Denial of service through huge inputs of other kinds is limited only by the 256-character expression limit and the parameter bounds above; callers passing very many calls must bound them.

## Secrets

- No secrets, tokens or credentials in the repository, commit history, logs or prompts.
- Publishing credentials live only in the CI secret store or the maintainer's local npm configuration.

## Dependencies

- The package has no runtime dependencies. Development dependencies are limited to the toolchain listed in [STACK.md](STACK.md).
- Commit the generated `package-lock.json` so installs are reproducible.

## Publishing

- Only `dist/` is included in the published tarball.
