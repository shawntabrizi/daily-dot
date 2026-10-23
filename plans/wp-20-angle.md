# WP20 — Angle: estimate the angle (batch 4, game 8)

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Angle is `gameId` **7**. Fully procedural, so per **D19** no content contract — it touches only
`DailyScores`. Frozen and versioned generator per **D11** (which now freezes at first public
play, not first commit).

Picked for mechanical distinctness: spatial estimation is unlike anything in the hub, which is
currently word guessing, grid logic, deduction, and geography.

## The game

A single angle is drawn. The player guesses its measure in degrees. **Four guesses.**

- The answer is an integer **1–179** degrees (a visible, unambiguous angle; avoid 0 and 180
  where the drawing degenerates to a line).
- After each guess: say whether the answer is **higher** or **lower**, and how close. Exact
  match wins.
- Colour the feedback with the design-system tokens: `--correct` for exact, `--present` for
  within a near band, `--wrong` otherwise. State the band you chose.
- `score` = **guesses used** (1–4); lower is better (D13).

## Generator — `app/src/games/angle/generate.ts`

```
angleForDay(day: number, version: "v1"): number   // 1..179
```

- Deterministic from `(day, version)` alone. No `Math.random`, no `Date`, no clock. Inline PRNG.
- With 179 possible answers a year must recycle. Use the shuffled-deck cycle used by Globle and
  Padlock so **no angle repeats until all 179 have been used**, reshuffling per cycle. Prove it
  with a test.
- Avoid trivially guessable answers if you think any qualify — say what you excluded and why, or
  say you excluded nothing.
- Commit fixtures for days 0, 1, 100, 208, 364.

## Screen — `app/src/games/angle/view.ts`

- Draw the angle as inline **SVG** — two rays from a shared vertex. No external assets.
- The drawing must not leak the answer: do not render degree gridlines, tick marks, or a
  protractor overlay, and do not put the value in any DOM attribute, `title`, or ARIA label. The
  answer is in memory and in `localStorage` only because the client must score locally (D1), but
  it must not be *displayed*.
- Numeric input plus a keypad; physical number keys too. Reject a guess outside 1–179 **without
  consuming a guess**.
- After each guess, optionally draw the guessed angle alongside for comparison — your call, say
  what you did.
- On completion (correct, or four guesses used): result state revealing the answer, and
  **exactly one** `record(7, day, guessesUsed, solved)` (D14). In-progress guesses persist in
  `localStorage` (D15) and survive reload.
- A recorded day opens read-only.
- **D18**: fits 360×780 **and** 1440×900 with no scrolling.

Add Angle to the roster so its card, history tab, and archive routing work.

## Acceptance

1. `pnpm test && pnpm build` green; report the count and the slowest test duration — **no test
   within 20% of its timeout** (WP19 shipped one that was, and it was flaky).
2. Every answer for days 0–364 is an integer in 1–179 (test).
3. No angle repeats until all 179 are used; reshuffled between cycles (test).
4. Determinism: fixtures for the five listed days; regeneration byte-identical; no clock or
   ambient RNG.
5. An out-of-range guess does not consume a guess (test).
6. **A test asserting the answer does not appear in the rendered DOM before completion** —
   no attribute, text node, `title`, or ARIA label.
7. Exactly one `record` per completed day, with a test that fails on a second write.
8. Reload mid-game restores guesses.
9. D18 at both viewports — report measured numbers, or say plainly you could not run a browser.
10. No regression: the other seven game screens still fit both viewports.

## Out of scope

Publishing, contracts (none needed), other games.

## Report back

The near-band threshold, fixtures, whether you draw the guessed angle, viewport numbers or an
explicit note you could not measure them, and the slowest test duration. Do not claim success
for skipped work.
