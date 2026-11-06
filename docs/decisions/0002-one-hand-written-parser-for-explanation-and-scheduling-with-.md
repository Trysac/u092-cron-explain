# One hand-written parser for explanation and scheduling, with Vixie day semantics and an explicit DST policy

Status: accepted (generated, pending human review)

## Context

Teams verify cron schedules on websites because cronstrue only explains and cron-parser only computes run times, and the day-of-month versus day-of-week rule and DST behaviour are commonly misunderstood. The library must stay dependency-free, safe on untrusted input and deterministic.

## Decision

Use a single hand-written scanner producing an immutable CronExpression with expanded, sorted fields plus DOM_STAR/DOW_STAR flags, shared by explain, nextRuns and matches. Implement the Vixie day rule (AND if either day field starts with *, else OR). Compute wall-clock fields with Intl.DateTimeFormat formatToParts, scan calendar days of the zone up to 1827 days, and convert each wall time to an instant by testing the offsets around it. A nonexistent wall time is skipped and an ambiguous one runs once, at its first occurrence. Enforce a 256-character input limit and validate CronExpression objects passed in by callers.

## Consequences

No runtime dependencies and one grammar for both features. DST behaviour is predictable and documented, but differs from Vixie cron, which runs skipped fixed-time jobs after the jump and wildcard jobs in both repeated hours. The explainer works from expanded values, so equivalent spellings such as 0,30 and */30 read the same. Unusual zone histories with two transitions inside three days are not specially handled, and instants beyond the JavaScript Date range raise a range error.
