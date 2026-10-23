# WP10 — Sudoku overflows the desktop viewport

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

## The defect

PM measured the built app in a browser at live devnet:

| Viewport | Horizontal | Vertical |
|---|---|---|
| 360×780 | 360/360 ✓ | 780/780 ✓ |
| 1440×900 | 1440/1440 ✓ | **1017/900 ❌** |

At 1440×900 the grid scales from available width and pushes the number pad below the fold —
only the `1`–`5` row is visible; `6`–`9` and `ERASE` require scrolling. Every other route
fits at both sizes, so this is Sudoku-specific.

## What to change

Size the grid from **available height**, not width, and cap it so the header, timer, pencil
toggle, grid, conflict line, and the full number pad all fit within the viewport at both
360×780 and 1440×900. Wordle already scales its tiles this way for the 8-letter tier — reuse
that approach rather than inventing a second one.

Keep the mobile layout exactly as it is; it already fits and is not the problem.

## Acceptance

1. No vertical or horizontal scrolling at **either** 360×780 or 1440×900. Report the measured
   `scrollWidth/clientWidth` and `scrollHeight/clientHeight` at both. If you cannot run a
   browser, say so and leave the measurement to the PM rather than claiming it.
2. The whole number pad (`1`–`9` and `ERASE`) is visible without scrolling at both sizes.
3. `#/`, `#/history`, and `#/g/wordle` still fit at both sizes — no regression.
4. `pnpm test && pnpm build` green; report the count.

## Out of scope

Generator, scoring, persistence, chess. Presentation only.

## Report back

The measured numbers at both viewports or an explicit note that you could not measure them,
and anything incomplete. Do not claim success for skipped work.
