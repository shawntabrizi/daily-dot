# WP15 — Nerdle repeats equations inside a year

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

## The defect

PM check over days 0–364:

```
validity+determinism : ✓ all valid
distinct equations   : 351/365
repeats              : 13  e.g. 6*9-3=51 ×2, 73+26=99 ×2, 4+6*9=58 ×2, 6*5-9=21 ×3
```

Every equation is valid — this is purely about repetition. For comparison, Sudoku yields 60/60
distinct grids over 60 days and Wordle 365/365 distinct ladders, so Nerdle is the only game
where a player can be served the same puzzle twice, one of them three times.

## What to change

Make the year's equations **distinct by construction** while keeping the generator
deterministic and frozen (D11).

Suggested shape: derive the whole year deterministically as an ordered sequence, skipping any
candidate already used earlier in the sequence, then index it by day. Memoise so
`generateNerdle(day)` stays cheap when called repeatedly — do not make it O(day) per call.

Constraints:

- Still deterministic from `(day, version)` alone; no clock, no ambient RNG.
- Existing fixtures **will change**, because dedup shifts the sequence. That is expected: this
  is `v1` still under development and nothing is seeded on-chain for Nerdle. Regenerate the
  fixtures and say so explicitly in your report — do not quietly keep stale ones.
- All existing validity rules continue to hold for every day.

## Acceptance

1. A test asserting **365 distinct equations** across days 0–364. It must fail against the
   current implementation.
2. Every equation for days 0–364 still satisfies all rules: 8 characters, valid alphabet, one
   `=`, integer right side, no leading zeros, exact division, correct precedence.
3. Determinism: regenerating is byte-identical; fixtures committed for days 0, 1, 100, 208, 364
   with their **new** values reported verbatim.
4. `generateNerdle` for a late day (e.g. 364) returns promptly — note the approach that keeps
   it from being linear per call.
5. `pnpm test && pnpm build` green; report the count.
6. No regression: the four game screens still fit 360×780 and 1440×900.

## Out of scope

Globle (blocked on a licence decision), publishing, other games, contracts.

## Report back

The new fixture values, how you keep lookup cheap, and anything incomplete. Do not claim
success for skipped work.
