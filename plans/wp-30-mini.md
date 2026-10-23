# WP30 — Daily Mini: a 5×5 crossword (game 11)

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Daily Mini is `gameId` **10**, slug `mini`, name "Daily Mini", `short` "Mini", route `#/g/mini`.
Authored content, so per **D19** it gets a typed registry contract (`contracts/mini`, modelled on
`contracts/wordle`). The chain stores the grid and the clues; numbering and answers are derived.

## Shawn's spec (2026-10-21)

Themeless 5×5 minis like the NYT Mini. No theme. Good fill (common words and names, no two-letter
entries, no obscure abbreviations), short straight clues with one or two playful ones, solvable in
one to two minutes, 10 to 12 entries per grid, no answer repeated within a few months. We own the
content: generate it, do not import puzzles.

## Deliver, each its own commit

1. **Word list.** A free word list with a clear licence usable commercially, filtered to 3–5
   letters, A–Z only, no abbreviations or vulgarities, a quality tier if the list has one. Source
   and licence in `shared/mini/README.md`.
2. **Grid generator** `app/scripts/generate-mini.ts`: pure, seeded, byte-identical on rerun. At
   least 400 distinct grids, 2–5 blacks, no two-letter entries, every white square checked both
   ways, no answer repeated within any 120-day window, limited repeats over the year. Output
   `shared/mini/core.json`; document the shape.
3. **Clues**, written by hand for every entry: mostly straight definitions, a playful one or two
   per grid, never containing the answer, under 50 characters, one meaning per clue; one clue per
   answer, reused where the answer recurs. `app/scripts/validate-mini.ts` checks lengths, clue and
   answer consistency, the repeat window and the answer-in-clue rule. At least 370 grids if 400
   cannot be clued well.
4. **Registry contract** `contracts/mini/`: create set, add puzzles (grid + clues, typed), seal,
   `puzzle_for_day(set_id, day)`. Logic and unit tests in `contracts/logic`. Add `mini` to
   `ContractName`, `deploy.ts`, `verify-deployment.ts`, `seed-mini.ts` (batching and resume as
   `seed-wordle`), the deployment record (`miniSetId`).
5. **The game** `app/src/games/mini/`: numbered grid, tap a cell to select, tap again to flip
   direction, Word's on-screen keyboard, a clue bar with the active clue, across/down lists, a
   timer, completion when every cell is correct; `score` = seconds (D13), `solved` = completed,
   one chain write at completion (D14), local progress across reload (D15), read-only archive,
   three sample puzzles in the stub source. Fits 360×780 and 1440×900 without page scroll (D18).
   Roster entry, home card mark; Pocket card and launcher follow the roster.
6. **Tests encode intent**: generator constraints (fails on a two-letter entry or a 120-day
   repeat), validator, contract logic, game rules (completion detection, one write), view fit.
   Full suite, `tsc --noEmit`, `typecheck:tools`, `pnpm pocket:build`, `pnpm smoke` green.
7. `PROGRESS.md` WP30 entry; this brief; README game list.

## Out of scope

Publishing, deploying or seeding on chain (report the commands), other games.
