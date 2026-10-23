# WP24 — Dodeku: match the sums (batch 5, game 10)

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Dodeku is `gameId` **9** and the **tenth and final game**. Procedural, so per **D19** no content
contract — it touches only `DailyScores`. Frozen and versioned generator per **D11**.

Picked over another Wordle variant because it adds an arithmetic-placement mechanic the hub does
not have. Sudoku is a Latin square (each digit once per row/column/box); Dodeku is sum matching,
which is a different kind of reasoning.

## The game

A 4×4 grid with **4 blocked cells**, leaving **12 fillable cells**. Twelve number tiles are
supplied. Each row and column shows a **target sum**. The player drags or taps tiles into cells
so every row and column sums to its target.

- Each tile is used exactly once.
- A row or column whose filled cells reach its target turns `--correct`; a completed row or
  column that overshoots turns `--wrong`; incomplete is neutral.
- Solved when all twelve tiles are placed and every target is met.
- No move limit. `score` = **seconds elapsed** (D13), like Sudoku and Word Search.

## Generator — `app/src/games/dodeku/generate.ts`

```
generateDodeku(day: number, version: "v1"): {
  blocked: number[];        // 4 cell indexes 0..15
  tiles: number[];          // 12 values, the multiset the player is given
  rowTargets: number[];     // 4
  colTargets: number[];     // 4
  solution: number[];       // 16 entries, blocked cells null/0
}
```

- Deterministic from `(day, version)` alone; inline PRNG; no clock.
- Build a solved grid first, then derive targets from it — that guarantees at least one solution
  exists. Do **not** generate targets and hope.
- **Uniqueness matters.** With a multiset of tiles, several arrangements may satisfy the same
  targets. Decide and state your policy: either verify a unique arrangement by search and reject
  otherwise, or explicitly accept multiple valid arrangements as all being "solved". Whichever you
  choose, the win condition must be **"all targets met"**, never "matches my stored solution" —
  otherwise a player with a genuinely valid arrangement is told they are wrong. That is the
  defect to avoid here.
- Tile values should give a reasonable difficulty spread; say how you chose them.
- Commit fixtures for days 0, 1, 100, 208, 364.

## Screen — `app/src/games/dodeku/view.ts`

- 4×4 grid with the blocked cells visibly blocked, not empty. Row targets to the right, column
  targets beneath — or state your layout choice.
- A tray of unplaced tiles. **Tap-to-place**: tap a tile, tap a cell. Tap a placed tile to return
  it to the tray. Drag may be layered on but tap is required.
- Live per-row and per-column feedback as described above.
- On solving: result state with elapsed time, and **exactly one** `record(9, day, seconds, true)`
  (D14). In-progress placements and elapsed time persist in `localStorage` (D15) and survive
  reload.
- A recorded day opens read-only.
- **D18**: fits 360×780 **and** 1440×900 with no scrolling, including the tile tray.

Add Dodeku to the roster so its card, history tab, and archive routing work. Home will have ten
cards and may scroll (D18).

## Acceptance

1. `pnpm test && pnpm build` green; report the count and the slowest test duration — **no test
   within 20% of its timeout**.
2. For every day 0–364: exactly 4 blocked cells, exactly 12 tiles, and the generator's own
   solution satisfies every row and column target (test).
3. A test proving the win condition accepts **any** arrangement meeting all targets, not only the
   stored solution — construct an alternative valid arrangement if your uniqueness policy allows
   one, or assert uniqueness if it does not.
4. Determinism: fixtures for the five listed days; regeneration byte-identical; no clock or RNG
   leakage.
5. Returning a tile to the tray and replacing it does not break state (test).
6. Exactly one `record` per completed day, with a test that fails on a second write.
7. Reload restores placements and elapsed time.
8. D18 at both viewports — report measured numbers, or say plainly you could not run a browser.
9. No regression: the other nine game screens still fit both viewports.

## Out of scope

Publishing, contracts, other games.

## Report back

Your uniqueness policy and why, tile-value approach, fixtures, viewport numbers or an explicit
note you could not measure them, and the slowest test duration. Do not claim success for skipped
work.
