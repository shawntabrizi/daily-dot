# WP11 — Wordle overflows the desktop viewport

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

**D18 is new**: game screens must fit 360×780 **and** 1440×900 with no scrolling; document
screens (home, history) may scroll.

## The defect

PM measured the built app:

| Route | 360×780 | 1440×900 |
|---|---|---|
| `#/g/sudoku` | 780/780 ✓ | 900/900 ✓ (just fixed) |
| `#/g/wordle` | 780/780 ✓ | **1044/900 ❌** |

Wordle fits mobile at every tier but overflows desktop by 144px, so you scroll between grid
and keyboard mid-play. The earlier acceptance criterion only said 360×780, which is how this
survived.

## What to change

Size the Wordle grid from available **height** at desktop widths too, as Sudoku now does
(`min(cap, calc(100dvh - reserved))`). Reuse that approach — do not add a third scaling
mechanism.

Check **every tier**, not just tier 1: the 8-letter tier is widest and its resolved state adds
a success line plus a continue button, which is the tallest state in the game.

Mobile is unchanged; it already fits.

## Acceptance

1. No scrolling at 360×780 or 1440×900 on `#/g/wordle` for **all five tiers**, including each
   tier's resolved state and the final ladder summary. Report measured
   `scrollHeight/clientHeight` per tier at both viewports, or say plainly that you could not
   run a browser and leave it to the PM.
2. `#/g/sudoku` still fits both (no regression).
3. Home and history are explicitly **allowed** to scroll — do not "fix" them.
4. `pnpm test && pnpm build` green; report the count.

## Out of scope

Chess, publishing, E2E, game logic. Presentation only.

## Report back

Per-tier measurements at both viewports or an explicit note you could not measure, and
anything incomplete. Do not claim success for skipped work.
