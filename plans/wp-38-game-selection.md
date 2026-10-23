# WP38 — Game selection, one streak

Decisions: D6, D12, D17b, D17c, D21 (amended 2026-10-23). Nothing on chain changes.

The hub is growing past what anyone plays daily. Each player picks the games they play;
the rest stay one tap away. The all-games streak goes: a streak over a selection the
player can change would need a stored history of that selection.

There are no players yet: no migration, no legacy keys, no compatibility shims.

## A. One streak (remove the all-games streak)

- `shared/streaks.ts`: `HubStreaks` keeps `any`, `longestAny`, `finished`. Drop `all`,
  `longestAll`, `perfectDays`. `perfectWeeks` stays (seven any-game days, Monday–Sunday).
- Remove the gem everywhere: header pill, streak badges, `#/streaks` tile and legend,
  archive hub stats, day-summary tiles, result share footer (`◆`), card launcher, Pocket
  card face, `gem.png`, `streakAll` on the card record.
- `#/streaks`: the flame tile, and a "Games finished" tile in place of "Perfect days".
  Month line: "N played". Legend: Played · Complete · Perfect week.
- Archive "All" stats: streak badge, games finished, best streak.
- Day summary tiles: games finished, best streak.

## B. Selection

- `shared/picks.ts`: the picked gameIds, roster order, at least one. Starter set:
  Word 0, Mini 4, Connections 5. One key, `daily-on-dot:picks:v1`, JSON
  `{"version":1,"games":[0,4,5]}`, in the host KV store (the card worker reads it) and
  mirrored to `localStorage` (the app renders synchronously from it; D7: home stays
  zero-RPC). On boot the app adopts the host's copy if it differs and re-renders.
- `#/customize`, linked from the drawer: one checkbox per roster game; the last picked
  game cannot be unticked. Saves on change.
- Hub (today and a past day): picked games first (in progress, then not started), then
  the Done group (every finished game, picked or not), then "More games": a button that
  shows the unpicked, unfinished games. The button is absent when every game is picked;
  its open state is remembered in `localStorage`.
- Picked games only: headline count, day bar segments, the day-summary panel's "day done"
  trigger, the result's Next and "n of N", share slots and count (a finished unpicked game
  still gets its score line), the drawer's game list, the card launcher's rows, the Pocket
  card's tiles and "n/N".
- "Complete" (D17c): `played ⊇ picks`, on time or later, against the current picks.
  Calendars: blue = complete, gold = any game on time, tick = played later only.
  Drawer activity strip: blue = complete, gold = any game played.

## C. Pocket card

- The worker reads the picks key beside the checklist key; the face draws the picked
  tiles (3 per row, at most 6 until the face grows) and a baked `count-<n>-of-<k>.png`.
- Strip: gold once every pick is done, green once any game is played, red when nothing
  is played, the streak is above 0 and under four hours are left, else grey.
- Re-bake the art (`pnpm pocket:art`) and the preview (`pnpm pocket:assets`).

## Acceptance

1. A fresh device shows Word, Mini, Connections on top, "Three to play.", and the other
   three behind "More games".
2. Picking Globe on `#/customize` moves it to the top, makes the headline count four,
   and turns a day that was blue (three of three) gold in the archive and the drawer.
3. Finishing only an unpicked game keeps the streak and leaves the day gold.
4. The card shows the picked games only and "n/k" for them.
5. No `streakAll`, gem, perfect-day count or all-games run remains in app, worker or tools.
6. Every rule above has a test that fails if the rule changes.

## Not in this WP

- Reordering picks (roster order for now).
- New games (D12 is open; the card face holds six tiles at most and needs a layout for
  more before a seventh game ships).
