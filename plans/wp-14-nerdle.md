# WP14 — Nerdle: procedural equation game (batch 2, game 4)

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Nerdle is `gameId` **3**. Like Sudoku it is **fully procedural** (D10) — no content contract —
and its generator must be **frozen and versioned** (D11).

## The game

One 8-character arithmetic equation per day, six guesses, Wordle-style per-character feedback.

- Characters are `0`–`9`, `+`, `-`, `*`, `/`, `=`.
- Exactly one `=`. The left side must evaluate to the right side.
- The right side is a plain non-negative integer (no operators after `=`).
- No leading zeros in a multi-digit number. Division must be exact (no fractions).
- Feedback per position: **correct** (right char, right place), **present** (char occurs
  elsewhere), **absent**. Duplicate handling must match Wordle's precedence — reuse
  `games/wordle/engine.ts`'s scoring rather than writing a second implementation, since that
  logic is already tested for duplicates.

`score` = **guesses used** (1–6); lower is better (D13).

## Generator — `app/src/games/nerdle/generate.ts`

```
generateNerdle(day: number, version: "v1"): { equation: string }
```

- Deterministic from `(day, version)` alone. **No `Math.random`, no `Date`, no clock.** Seed an
  inline PRNG so behaviour is pinned by our code, not a dependency's.
- Must emit a valid 8-character equation satisfying every rule above — validate at generation
  time and reject candidates rather than emitting anything invalid.
- Aim for a reasonable difficulty spread; state how you chose operators and operand sizes.

D11 matters: replaying a past day regenerates its equation, so any later edit silently rewrites
puzzles players completed. Commit **fixtures** for days 0, 1, 100, 208, 364 and assert
byte-identical output.

## Screen — `app/src/games/nerdle/view.ts`

- 6×8 grid of character tiles, reusing the shared tile component.
- On-screen keypad: digits, operators, `=`, Enter, backspace. Physical keyboard too.
- Reject a submission that is not a valid equation, with feedback, **without consuming a
  guess** — an invalid entry is a typo, not an attempt.
- On completion (solved or six guesses used): result state, and **exactly one**
  `record(3, day, guessesUsed, solved)` (D14). In-progress state persists in `localStorage`
  (D15) and survives reload.
- A recorded day opens read-only.
- **D18**: fits 360×780 **and** 1440×900 with no scrolling. Reuse the height-based scaling
  Wordle and Sudoku share; do not add a fourth mechanism.

Add Nerdle to the client roster so its card, history tab, and archive routing work. Home now
has four cards — home may scroll (D18), that is expected.

## Acceptance

1. `pnpm test && pnpm build` green; report the count.
2. Determinism: committed fixtures for the five listed days; a test fails if the generator
   changes; regeneration is byte-identical.
3. Validity: a test asserting **every** equation for days 0–364 satisfies all the rules
   (single `=`, evaluates correctly, no leading zeros, exact division, exactly 8 chars).
4. The generator takes no input beyond `(day, version)` — prove no clock or RNG leakage.
5. An invalid guess does **not** consume a guess (test).
6. Duplicate-character feedback matches Wordle's precedence, using the shared engine (test).
7. Exactly one `record` per completed day, with a test that fails on a second write.
8. Reload mid-game restores guesses.
9. D18 at both viewports — report measured `scrollHeight/clientHeight`, or say plainly you
   could not run a browser and leave it to the PM.
10. `#/g/wordle`, `#/g/sudoku`, `#/g/chess` still fit both viewports (no regression).

## Out of scope

Globle (blocked on a licence decision), publishing, contract changes. Nerdle needs no contract —
`DailyScores` already accepts `gameId` 3.

## Report back

Difficulty approach, fixture days, viewport numbers or an explicit note you could not measure
them, and anything incomplete. Do not claim success for skipped work.
