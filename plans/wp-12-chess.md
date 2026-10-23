# WP12 — Chess board and game screen

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Chess is `gameId` 2, the last package in batch 1, and was flagged in `PLAN.md` as the long
pole. Content is already live: 400 puzzles sealed in `ChessRegistry` on devnet, read with
`puzzleForDay(setId, day)` through the existing `DataSource`.

## Critical: the FEN convention

From WP5b's provenance, and it will silently break every puzzle if mishandled:

> The stored FEN is the position **before the opponent's move**. `moves[0]` is that
> opponent move. The player solves from `moves[1]` onward.

Load the FEN, **auto-play `moves[0]`** with a brief animation so the player sees what just
happened, then ask for `moves[1]`. Alternate — opponent replies are auto-played from the
stored line.

Today's live puzzle is
`5b1r/1Q3p2/p3pk1p/1p1p2p1/3q4/1P3PPP/P5P1/2RK1B1R w - - 0 22`
with solution `d1e2 d4b2 e2d3 b2c1`. Use it to sanity-check that the move you auto-play
first is `d1e2` and the first move expected from the player is `d4b2`.

Get this wrong and the board looks plausible while no solution ever matches.

## Legal-move generation

**Use a permissively licensed library. Do not hand-roll it.** Castling, en passant, and
promotion are a large correctness surface with no product value in reimplementing, and a
subtly wrong generator rejects legal moves so players conclude the game is broken. State
which library and its licence. If one cannot be added, stop and report rather than writing
your own.

## Screen — `app/src/games/chess/view.ts`

- Board rendered from FEN, correct orientation: the **player to move is at the bottom**.
- **Tap-to-move** — tap origin, legal destinations highlight, tap destination. Drag may be
  layered on top, but tap is required; drag-only boards are the standard way chess UIs fail
  on mobile.
- Promotion picker when a pawn reaches the last rank.
- A wrong move is rejected with feedback and costs an attempt; it does **not** end the
  puzzle. `score` = attempts (D13).
- On solving: solved state, attempt count, and **exactly one**
  `record(2, day, attempts, true)` (D14). In-progress state persists in `localStorage`
  (D15) and survives reload.
- A recorded day opens read-only.
- **D18**: fits 360×780 **and** 1440×900 with no scrolling, including with the promotion
  picker open — that is the tallest state. Reuse the height-based scaling Wordle and Sudoku
  now share; do not add a fourth mechanism.

Remove the "Coming soon" placeholder; the roster entry and history tab already exist.

## Acceptance

1. `pnpm test && pnpm build` green; report the count.
2. Test: for today's live puzzle, the first auto-played move is `d1e2` and the first move
   expected from the player is `d4b2`. This pins the FEN convention against real data.
3. Test: a wrong move increments attempts and does not end the puzzle.
4. Test: solving issues exactly one `record`; a second submission does not fire another.
5. Move legality delegated to a library — no hand-written generator. Name it and its licence.
6. Reload mid-puzzle restores position and attempt count.
7. D18 at both viewports including the promotion picker. Report measured
   `scrollHeight/clientHeight`, or say plainly you could not run a browser and leave it to
   the PM.
8. Recorded day opens read-only.

## Out of scope

Publishing, E2E, batch 2 games. Do not touch contracts, Wordle, or Sudoku.

## Report back

The library and licence, the FEN-convention test result, viewport numbers or an explicit
note you could not measure them, and anything incomplete. Do not claim success for skipped
work.
