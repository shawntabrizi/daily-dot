# WP9 — Sudoku: generator and game screen

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Sudoku is `gameId` 1. It has **no content contract** (D10) — the grid is derived
client-side — and its generator must be **frozen and versioned** (D11).

## 1. Generator — `app/src/games/sudoku/generate.ts`

```
generateSudoku(day: number, version: "v1"): { puzzle: Grid; solution: Grid }
```

- Deterministic from `(day, version)` alone. **No `Math.random`, no `Date`, no wall clock.**
  Seed a small PRNG (xorshift or similar) from the day and version — implement it inline so
  behaviour is pinned by our code, not a dependency's.
- Must produce a **uniquely solvable** puzzle. Write a solver and use it at generation time
  to prove uniqueness by counting solutions and requiring exactly one.
- Aim for a consistent difficulty band; state how you measured it (e.g. clue count plus
  which solving techniques suffice).

D11 matters here: replaying a past day regenerates its grid, so any change to this function
silently rewrites puzzles players already completed. Commit **fixtures** for a spread of days
(e.g. 0, 1, 100, 208, 364) and assert byte-identical output, so a future edit fails loudly.

## 2. Screen — `app/src/games/sudoku/view.ts`

- 9×9 grid, given cells visually distinct from entered ones and not editable.
- Number pad 1–9 plus erase. Physical number keys and arrow-key navigation too.
- **Pencil marks** as a togglable mode.
- A timer; `score` = elapsed **seconds** (D13).
- Conflict highlighting for a digit that duplicates in row, column, or box.
- On completion: solved state, elapsed time, and **exactly one** `record(1, day, seconds, true)`
  (D14). In-progress grid persists in `localStorage` (D15) and survives reload.
- A recorded day opens read-only, like Wordle.
- Must fit **360×780 with no scrolling** — a 9×9 grid plus number pad is the hardest layout
  in the app so far. Scale cells from available height.

Remove the "Coming soon" placeholder and add Sudoku to the roster so its card and history tab
work.

## Acceptance

1. `pnpm test && pnpm build` green; report the count.
2. Determinism: committed fixtures for at least five days; a test fails if the generator
   changes. Regenerating produces byte-identical grids.
3. Uniqueness: a test proves the solver finds exactly one solution for a sample of ≥20
   generated days.
4. The generator takes no input beyond `(day, version)` — a test or inspection note proving
   no clock or RNG leakage.
5. Exactly one `record` call per completed day, with a test that fails on a second write.
6. Reload mid-puzzle restores the grid, pencil marks, and elapsed time.
7. Fits 360×780 with no vertical or horizontal scrolling. **Report the measured
   `scrollWidth/clientWidth` and `scrollHeight/clientHeight`.** If you cannot run a browser,
   say so plainly and leave this for the PM rather than claiming it.
8. Recorded day opens read-only.

## Out of scope

Chess screen (WP10), publishing, E2E. Do not touch the Wordle game or any contract.

## Report back

Difficulty measurement, fixture days, the viewport numbers or an explicit note that you could
not measure them, and anything incomplete. Do not claim success for skipped work.
