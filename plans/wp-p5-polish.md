# WP-P5 — Polish pass

Read `AGENTS.md` first. Four defects found in review. Fix all four, nothing else.

## 1. Stray footer hint on the completion screen

The Wordle footer rule "Type a word. Tiles reveal how close you are." still renders on the
ladder-complete summary, where there is nothing left to type. Hide the hint strip whenever
the ladder is complete (and on the read-only view of an already-recorded day). It should
still show while any tier is playable, including the resolved between-tier state.

## 2. Unlabelled overflow buttons (accessibility)

On home, each card's `⋯` control has **no accessible name** — `aria-label` is `null` and it
has no text content. Three such buttons on the page. The favourite control beside it is
correctly labelled ("Add Wordle to favourites"), so match that pattern:

```
aria-label="More options for Wordle"
```

Also give the opened menu `role="menu"` with its items as `role="menuitem"`, make it
dismissible with `Escape`, and return focus to the `⋯` trigger on close.

## 3. Sudoku card artwork is clipped

The Sudoku card's inline SVG has its bottom-right `1` cut off by the grid border — visible
at both 360px and 1440px. Fix the viewBox/padding so no glyph is clipped at any card size.

## 4. Desktop content is not capped

`main` stretches to the full 1440px, so the layout reads as left-aligned across a wide
screen. The reference centres a fixed-width column. Add a max content width (roughly
1040–1120px) and centre it, applied consistently to home, history, and game screens.
Mobile is unchanged — this is desktop only, and D8 still holds: the same layout, widened
and centred, not a different one.

## Acceptance

1. `pnpm build && pnpm test` green.
2. Test: the hint strip is absent when the ladder is complete and present while playing.
3. Test: every button on home has a non-empty accessible name (text or `aria-label`).
   Assert it generically by querying all buttons, so a future unlabelled control fails too.
4. Test or DOM assertion: the overflow menu closes on `Escape` and focus returns to the trigger.
5. At 1440px the centred content column is ≤ 1120px on home, history, and the game screen.
6. No regressions: 360×780 still fits every tier with no scrolling; no horizontal scroll
   at either width; home still renders before any `DataSource` promise resolves.

## Out of scope

Settings and Account are deliberate stubs with explanatory toasts — leave them. Do not
touch game logic, the `DataSource` seam, or the streak rules.

## Report back

What you changed and anything you could not complete. Do not claim success for skipped work.
