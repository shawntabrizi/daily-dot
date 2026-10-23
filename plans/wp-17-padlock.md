# WP17 — Padlock: crack the code (batch 3, game 6)

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Padlock is `gameId` **5**. Fully procedural, so per **D19** it gets **no content contract** —
it touches only `DailyScores`. Frozen and versioned generator per **D11**.

## The game

A hidden 4-digit code. Ten guesses. Feedback is **counts only** — never which positions.

For each guess, report two numbers:

- **exact** — digits that are the right digit in the right place
- **misplaced** — digits present in the code but in the wrong place

Digits **may repeat** in the code. Use standard Mastermind counting: match exacts first, then
count misplaced from the remaining unmatched digits on both sides, so a guess of `1111`
against code `1123` reports exact 2, misplaced 0 — not exact 2, misplaced 2. Get this wrong and
the puzzle becomes unsolvable by deduction, which is the entire point of the game.

`score` = **guesses used** (1–10); lower is better (D13).

## Generator — `app/src/games/padlock/generate.ts`

```
padlockCode(day: number, version: "v1"): string   // four digits, may repeat
```

- Deterministic from `(day, version)` alone. No `Math.random`, no `Date`, no clock. Inline PRNG.
- Distinctness: with 10,000 possible codes there is no need to repeat inside a year. Use the
  same shuffled-deck-cycle approach as Globle so **no code repeats within 365 days**, and prove
  it with a test.
- Commit fixtures for days 0, 1, 100, 208, 364.

## Screen — `app/src/games/padlock/view.ts`

- Ten guess rows, each showing the four digits entered plus its **exact** and **misplaced**
  counts. Present the counts as small pips or numerals — reuse `--correct` for exact and
  `--present` for misplaced; do not invent new colours.
- Digit keypad 0–9, Enter, backspace. Physical number keys too.
- A submission of fewer than four digits is rejected **without consuming a guess**.
- On completion (cracked, or ten guesses used): result state showing the code, and **exactly
  one** `record(5, day, guessesUsed, solved)` (D14). In-progress guesses persist in
  `localStorage` (D15) and survive reload.
- A recorded day opens read-only.
- **D18**: fits 360×780 **and** 1440×900 with no scrolling. Ten rows plus a keypad is tall —
  if the rows need to scroll, they scroll **within their own container** while the page does
  not, as Globle's guess list does.

Add Padlock to the roster so its card, history tab, and archive routing work.

## Acceptance

1. `pnpm test && pnpm build` green; report the count.
2. **Mastermind counting tests**, each a case that a naive implementation gets wrong:
   - code `1123`, guess `1111` → exact 2, misplaced 0
   - code `1234`, guess `4321` → exact 0, misplaced 4
   - code `1122`, guess `2211` → exact 0, misplaced 4
   - code `1111`, guess `1234` → exact 1, misplaced 0
3. Determinism: fixtures for the five listed days; regeneration byte-identical; no clock or
   ambient RNG.
4. No code repeats across days 0–364 (test).
5. A short guess does not consume a guess (test).
6. Exactly one `record` per completed day, with a test that fails on a second write.
7. Reload mid-game restores guesses.
8. D18 at both viewports with all ten rows used — report measured numbers, or say plainly you
   could not run a browser and leave it to the PM.
9. No regression: the other five game screens still fit both viewports.

## Out of scope

Waffle (next package), publishing, contracts (none needed).

## Report back

Fixture codes, the Mastermind test results, viewport numbers or an explicit note you could not
measure them, and anything incomplete. Do not claim success for skipped work.
