# Project record: cron-explain

## Objective

Parse Vixie cron expressions, explain them in plain English and compute next run times in IANA time zones with an explicit DST policy.

Outcome: one small parser that explains an expression in English and computes the next 1 to 1000 run times in any IANA time zone, with Vixie day-of-month and day-of-week semantics and a documented DST policy. It is for developers who review schedules in code.

## Scope

In scope:

- Parsing five-field POSIX and Vixie cron expressions, including the `@` macros listed in the README.
- English explanation of an expression, with optional 12-hour clock.
- Next run times and match checks in IANA time zones.
- Typed errors with stable codes.

Out of scope:

- Seconds fields.
- Quartz extensions (`L`, `W`, `#`, `?`) and `@reboot`.
- Locales other than English.
- Scheduling or executing jobs.
- A command-line interface.

## Timeline

| Date | Milestone |
|---|---|
| 2026 | Repository created from the factory utility template. |

## Effort metrics

Measured values only.

| Metric | Value | Source |
|---|---|---|
| Tokens (input / output) | 215506 / 98241 | factory ledger |
| Hours (human) | pending measurement | time log |
| Cost (USD) | 0.6511 | factory ledger |

## Factory run u092 (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| generation | claude-sonnet-5-5 | yes | 2862 | 79011 | 0 | 4473 | 0.3984 |
| audit | claude-sonnet-5-5 | no | 12 | 6328 | 39734 | 131742 | 0.1758 |
| fix-1 | claude-sonnet-5-5 | no | 6 | 3522 | 11732 | 43368 | 0.0689 |
| docs | claude-haiku-5-5 | no | 33043 | 9380 | 0 | 0 | 0.0080 |

Total: $0.6511. Prices: Anthropic list prices.
