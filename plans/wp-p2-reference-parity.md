# WP-P2 — Streak rule and reference parity

Bring the prototype in line with the lessgames.com reference behaviour documented in
`PLAN.md` §8. Read `AGENTS.md` first. Depends on WP-P1 (`bigint` bitmaps) being merged.

## 1. Streak grace rule (the important one)

Current `deriveGameStats` walks backwards from today and breaks immediately if today is
unplayed, so a mid-streak user sees **0** every morning until they play. That is wrong.

Implement exactly the reference algorithm, transliterated from their bundle:

```
streak(days, gameId, todayIndex):
  cursor = todayIndex
  if today is not a qualifying day:
      cursor = todayIndex - 1
      if cursor is not a qualifying day: return 0
  n = 0
  while cursor is a qualifying day: n += 1; cursor -= 1
  return n
```

A day qualifies when its `ontime` **and** `solved` bits are set for `gameId` — keep the
existing D5 definition; only the starting cursor changes. An unplayed today must not zero
a live streak; missing **both** yesterday and today must.

**Tests (each must fail if the rule regresses):**
- today unplayed, yesterday and the day before both qualifying → streak `2`, not `0`
- today qualifying, yesterday qualifying → streak `2`
- today unplayed and yesterday unplayed, with older qualifying days → streak `0`
- the existing backfill test still holds: a backfilled day (`ontime` unset) never
  extends a streak but still raises the completionist count

## 2. Streak badge hidden below 2

The reference renders no badge at all when `streak < 2`. Apply the same rule wherever the
streak is shown. The history page's stat tile keeps showing the number (including 0 and 1);
it is only the compact badge that hides.

## 3. Completion checkmarks

A filled green (`--correct`) circular badge with a white check, in the **top-right corner
of each game card**, whenever that game is complete for the day being viewed. Replace the
current `PLAY TODAY` pill — the card is already tappable and the pill is redundant chrome.

The same checkmark appears next to each completed game's name in the drawer's game list.

## 4. Drawer activity strip

Add to the drawer, below the game list, matching the reference:

- A `<MONTH> ACTIVITY` label with a live countdown to UTC rollover on the same row.
- A horizontal row of day circles ending at today. Played days are filled `--correct`
  with dark text; unplayed are `--surface` with muted text. Today is always last.
- A short green connector bar drawn **between adjacent circles when both days were
  played**, so runs read as a continuous chain.
- Circle count: minimum 10, extending back up to 30 days, stopping early once 3
  consecutive unplayed days have been passed beyond the first 10.
- Static CTA line beneath: "Play a game to keep the streak alive!"
- The strip scrolls horizontally if it overflows; the page must not.

## 5. Card chrome cleanup

The per-card `☆` and `HIDE` buttons are clutter the reference does not have. Move
favourite/hide out of the resting card: put both in a small overflow (`⋯`) control on the
card, or a single "Edit games" mode toggled from the drawer. Pick one, keep it obvious,
and state which you chose. Behaviour (D6, `localStorage`) is unchanged — this is presentation
only.

## 6. Game screen must fit one viewport

At 360×780 the Wordle screen currently requires scrolling between the grid and the
keyboard mid-play. Grid, tier indicator, and keyboard must all fit without scrolling at
360×780, for **every** tier including the 8-letter one. Scale tile size from the tier's
word length and the available height. The reference fits; so must we.

## Acceptance

1. `pnpm build && pnpm test` green.
2. All four streak tests above present and passing.
3. At 360×780, `#/g/wordle` on tier 6 (8 letters) shows grid + keyboard with **no vertical
   or horizontal scrolling**. Verify each tier, not just tier 1.
4. No horizontal scroll at 360px on any route; 1440px still correct.
5. Checkmarks appear on completed cards and in the drawer list; no `PLAY TODAY` pill remains.
6. Activity strip renders with correct fill, connectors, and countdown.
7. Home still renders before any `DataSource` promise resolves.

## Report back

What you changed, which card-chrome option you chose, and anything you could not complete.
Do not claim success for skipped work.
