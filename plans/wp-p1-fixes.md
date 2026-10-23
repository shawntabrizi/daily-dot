# WP-P1 — Two correctness fixes in `app/src/shared/streaks.ts`

Review of WP-P found two defects. Fix **only** these two. Do not touch the streak
walk itself, the views, or anything else — a separate brief covers those.

Read `AGENTS.md` first.

## Fix 1 — bitmaps must be 64-bit

`hasGameBit` returns `false` for any `gameId > 52` because JavaScript `number` only
holds 53-bit integers safely. `AGENTS.md` D5 and `PLAN.md` WP2 specify a **`u64`**
bitmap with `game_id < 64`. Today's three games hide the bug; game 54 would silently
read as "not played" forever, with no error.

Convert the bitmap representation to `bigint` end to end:

- `DayBits` fields (`played`, `solved`, `ontime`) become `bigint`.
- `hasGameBit(bits: bigint, gameId: number): boolean` — valid range `0 <= gameId < 64`.
  Out of range must **throw**, not return `false`. Silently returning a wrong answer is
  the defect being fixed; do not reintroduce it in another form.
- `popcount(bits: bigint): number` — reject negatives by throwing.
- Update `data-source.ts` (interface + stub), `streaks.ts`, and every call site so
  `pnpm build` type-checks with no `any` and no non-null assertions.

## Fix 2 — `completionist` is counting other games

In `deriveGameStats(days, gameId)` the line `completionist += popcount(day.played)`
counts **every** game's plays, so the Wordle view's completionist total includes Sudoku
and Chess. It must count only `gameId`.

Decide deliberately and state which you chose in your report: either make
`completionist` per-game (count days where `gameId`'s `played` bit is set — note this
then duplicates `played`, so prefer removing one), or keep a hub-wide total but rename it
to something unambiguous like `hubPlayed` and expose it separately from the per-game
stats. Do not leave a per-game function silently returning a hub-wide number.

## Acceptance

1. `pnpm build && pnpm test` green.
2. A test asserting `hasGameBit` works correctly for `gameId` 53–63 — it must fail
   against the current `number` implementation.
3. A test asserting an out-of-range `gameId` throws.
4. A test asserting the per-game completionist/played figure is unaffected by another
   game's bits being set on the same day.
5. The existing backfill-vs-streak test in `streaks.test.ts` still passes unchanged in
   meaning (it may be edited only to satisfy the `bigint` type change).
6. No changes outside `src/shared/streaks.ts`, `src/shared/data-source.ts`, their tests,
   and the minimum call-site updates needed to compile.

## Report back

What you changed, which `completionist` option you chose and why, and anything you could
not complete. Do not claim success for skipped work.
