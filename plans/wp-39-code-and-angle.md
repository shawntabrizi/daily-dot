# WP39 — Daily Code and Daily Angle, and a card for more picks than tiles

Decisions: D10, D11, D12, D13, D19, D21 (amended 2026-10-23), D22, D23 (new).

Two procedural games join the roster. Both are generated in the bundle from the day
number (D10/D19): no content contract, no owner step. Their score kind is Count, which is
also what `DailyScores` reads for an unset kind (D20), so their histograms work before
anyone runs `set-game-kinds`.

## Daily Code (gameId 6, `#/g/code`, D22)

- A four-digit code, digits 0–9, repeats allowed, from a frozen seeded `v1` generator.
- A guess is any four digits. Feedback is Mastermind pegs only: **●** a right digit in
  the right place, **○** a right digit in the wrong place (counted with multiplicity).
  Which digits earned them is never shown.
- No guess cap (D13); `score` = guesses. A repeated guess is refused and not counted.
- Starter pick: new players get Word, Mini, Connections and Code.

## Daily Angle (gameId 7, `#/g/angle`, D23)

- An angle of 1°–359° drawn as two rays from a vertex with the marked arc (the long
  way round for a reflex angle), the drawing rotated per day. Frozen seeded `v1`.
- A guess is a whole degree 1–359. Feedback, after Angledle: the hint word for the
  distance, **So close!** within 5°, **Hot** within 15°, **Warm** within 30°, **Cold**
  beyond, and an arrow, ⬆️ when the answer is larger, ⬇️ when smaller.
- **No guess cap** (D13; Angledle caps at six, which would be a loss state). `score` =
  guesses. A repeated guess is refused and not counted.
- The day rolls at 00:00 UTC like every game (D2), not at 6 AM local.

## The card with more picks than tiles (D21)

- Picks are unlimited. The card holds six tiles: unfinished picks first (roster
  order), then finished picks to fill six. With more than six unfinished, five
  unfinished tiles and a **+** tile. The count stays "done of all picks".
- The launcher beneath the card lists every pick.
- Art: `tile-code-*`, `tile-angle-*`, `tile-more.png`, and `count-<n>-of-<k>` for k up
  to the roster size.

## Acceptance

1. Each game generates the same puzzle for a day on every device; tests pin v1 values.
2. Peg scoring and angle hints have tests at every boundary (repeats, 5/15/30°).
3. One chain write at completion; a reload resumes; a recorded day opens read-only.
4. Both game screens fit 360×780 and 1440×900 without scrolling (D18).
5. The card shows the tile rule above with tests for ≤6, >6 unfinished and mixed.

## Not in this WP

- A guess cap for Angle (needs D13 changed).
- Share-text extras (peg or hint rows) beyond the score line.
