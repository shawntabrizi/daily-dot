# WP21 — Word Search: find the hidden words (batch 4, game 9)

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Word Search is `gameId` **8**. Procedural, so per **D19** no content contract — it touches only
`DailyScores`. Frozen and versioned generator per **D11**.

**Do not touch or commit `app/src/deployments/*.json`.** A reseed is in progress and that file is
mid-update; the PM owns it. If `pnpm test` fails only on a deployment-record test, note it and
carry on — do not "fix" it.

Picked for distinctness: selecting a line of letters in a grid is an interaction no other game in
the hub uses.

## The game

A 10×10 letter grid hiding **8 words**. The player finds each by selecting its first and last
letter. Words may run horizontally, vertically, or diagonally, in either direction.

- Words come from the existing curated 5–8 letter answer pools — **reuse them**, do not introduce
  a new source. Those pools are obscenity-, stopword-, and exclusion-filtered, and 8 words per day
  is a large exposure surface. WP19 exists because Waffle got this wrong.
- Unused cells are filled with random letters, deterministically.
- No guess limit; `score` = **seconds elapsed** (D13), like Sudoku.
- A found word stays highlighted. The word list shows which remain.

## Generator — `app/src/games/wordsearch/generate.ts`

```
generateWordSearch(day: number, version: "v1"): { grid: string[]; words: Placement[] }
```

- Deterministic from `(day, version)` alone; inline PRNG; no clock.
- Place all 8 words without contradiction; overlaps allowed only where letters agree.
- **Guard against accidental words.** Filler letters must not spell an obscenity anywhere in the
  grid, in any of the 8 directions. Check the *assembled* grid against the obscenity list for
  every run of 3–8 letters and re-roll fillers if one appears. This is the failure mode that
  matters here — a randomly generated slur in a family puzzle, which no word-list filter catches.
- Commit fixtures for days 0, 1, 100, 208, 364.
- If placement fails for some day, **stop and report** rather than reducing the word count.

## Screen — `app/src/games/wordsearch/view.ts`

- 10×10 grid, tap first letter then last letter to select. Drag may be layered on but **tap is
  required**. An invalid selection (not a listed word) clears without penalty.
- Word list with found words struck through; a timer.
- On finding all 8: result state with elapsed time, and **exactly one**
  `record(8, day, seconds, true)` (D14). In-progress found words and elapsed time persist in
  `localStorage` (D15) and survive reload.
- A recorded day opens read-only.
- **D18**: fits 360×780 **and** 1440×900 with no scrolling. A 10×10 grid plus an 8-word list is
  tall — the list may scroll within its own container; the page may not.

Add Word Search to the roster so its card, history tab, and archive routing work.

## Acceptance

1. `pnpm test && pnpm build` green; report the count and the slowest test duration — **no test
   within 20% of its timeout**.
2. For every day 0–364: 8 words placed, all from the curated pools, every placement consistent
   with the grid (test).
3. **No obscenity appears anywhere in any grid, in any of the 8 directions, for any day 0–364**
   (test). This must scan the finished grid, not just the placed words.
4. Determinism: fixtures for the five listed days; regeneration byte-identical; no clock or RNG
   leakage.
5. An invalid selection does not penalise (test).
6. Exactly one `record` per completed day, with a test that fails on a second write.
7. Reload restores found words and elapsed time.
8. D18 at both viewports — report measured numbers, or say plainly you could not run a browser.
9. No regression: the other eight game screens still fit both viewports.

## Out of scope

Publishing, contracts, other games, and anything under `app/src/deployments/`.

## Report back

Fixtures, how you guard against accidental obscenities, viewport numbers or an explicit note you
could not measure them, and the slowest test duration. Do not claim success for skipped work.
