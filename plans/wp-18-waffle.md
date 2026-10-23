# WP18 — Waffle: swap letters into place (batch 3, game 7)

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Waffle is `gameId` **6**. Procedural, so per **D19** it gets **no content contract** — it
touches only `DailyScores`. Frozen and versioned generator per **D11**.

This is the hardest generator so far: it needs six interlocking words, which is a constraint
search rather than a draw.

## The game

A 5×5 grid where only 21 cells are used — rows 0, 2, 4 and columns 0, 2, 4 are words; the four
cells at (1,1), (1,3), (3,1), (3,3) are empty. That gives **six 5-letter words**: three across,
three down, sharing nine intersections.

The solution's letters are placed in the grid but **scrambled**. The player **swaps pairs of
letters** to restore it, with **15 swaps** allowed. Tile colours use the standard scheme:
`--correct` for a letter in its right place, `--present` for a letter that belongs elsewhere in
its row/column word, `--neutral` otherwise.

`score` = **swaps used** (D13). Solving in fewer is better.

## Generator — `app/src/games/waffle/generate.ts`

```
generateWaffle(day: number, version: "v1"): { solution: string[]; scrambled: string[] }
```

- Words come from the existing filtered 5-letter pool used for Wordle answers — reuse it, do
  not introduce a new word source. That pool is already obscenity-, stopword-, and
  exclusion-filtered, which matters as much here as it did there.
- Search for six words satisfying all nine intersection constraints. A backtracking search over
  the pool, indexed by (position, letter), is the expected approach — say what you did.
- Scramble deterministically such that the puzzle is **solvable within 15 swaps**. Verify this at
  generation time: the minimum number of swaps to sort a permutation is
  `n − (number of cycles)`, so compute it and reject scrambles needing more than 15.
- Also reject a scramble that leaves the grid already solved or trivially close (say what
  threshold you chose).
- Deterministic from `(day, version)` alone; inline PRNG; no clock.
- Commit fixtures for days 0, 1, 100, 208, 364.
- If the search cannot fill 365 days from the available pool, **stop and report** with the
  numbers rather than relaxing the word filters.

## Screen — `app/src/games/waffle/view.ts`

- The 21-cell waffle, correctly shaped (the four holes must be visibly absent, not blank tiles).
- **Tap-to-swap**: tap one tile, tap another, they exchange. Tapping the same tile deselects.
  Drag may be layered on top but tap is required.
- Remaining-swaps counter. A swap of a tile with itself, or of two identical letters, must not
  consume a swap.
- On completion (solved, or 15 swaps used): result state and **exactly one**
  `record(6, day, swapsUsed, solved)` (D14). In-progress grid persists in `localStorage` (D15)
  and survives reload.
- A recorded day opens read-only.
- **D18**: fits 360×780 **and** 1440×900 with no scrolling.

Add Waffle to the roster so its card, history tab, and archive routing work.

## Acceptance

1. `pnpm test && pnpm build` green; report the count.
2. Test: for **every** day 0–364, all six words are in the 5-letter pool and every one of the
   nine intersections agrees.
3. Test: for every day 0–364, the scramble is solvable within 15 swaps, computed via the
   cycle formula.
4. Determinism: fixtures for the five listed days; regeneration byte-identical; no clock or
   ambient RNG.
5. Test: a no-op swap (same tile, or two identical letters) does not consume a swap.
6. Exactly one `record` per completed day, with a test that fails on a second write.
7. Reload mid-game restores the grid and swap count.
8. D18 at both viewports — report measured numbers, or say plainly you could not run a browser.
9. No regression: the other six game screens still fit both viewports.

## Out of scope

Publishing, contracts (none needed), other games.

## Report back

The search approach and how many candidate words the pool provided, fixture grids, viewport
numbers or an explicit note you could not measure them, and anything incomplete. Do not claim
success for skipped work.
