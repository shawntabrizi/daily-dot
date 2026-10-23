# WP36 — Design pass: friendly UI, colour earned by play

Decided 2026-10-22 after a design review. This file is the brief every WP36 agent reads
first. The mockups (private canvas) and a private research note on daily-game UI
patterns are the intent; this file is the
truth where they disagree.

## Decisions

1. **Colour is earned.** The app starts the day neutral and fills with colour as games
   finish. A game's accent appears on its row, tile and result only once it is done
   (in progress and not started stay neutral with an icon).
2. **Six accents, as tokens** (`--accent-<id>`, ink colour `--accent-<id>-ink` for text on
   the accent): word `#55b725` / `#0d1a07`, sudoku `#22b8a0` / `#062420`, chess
   `#e07b39` / `#2a1407`, globe `#4f7df3` / `#0b1a3a`, mini `#d85a9e` / `#2b0a1c`,
   connections `#9b59c9` / `#ffffff`. Tinted surfaces are derived, never hand-picked:
   `color-mix(in oklab, var(--accent-x) 12%, var(--surface))`. Gold `#e8b53a` and blue
   `#6fd3f7` stay reserved for the two streaks. Word's green is no longer the generic
   "success" colour: success ticks take the game's accent; the card strip is grey, gold or
   red only.
3. **Type.** Fredoka 600 for display, headings and big numerals, self-hosted as a latin
   woff2 subset in `app/public/fonts/` (OFL; attribution in README). Body stays the system
   sans (Roboto / SF) at 400, 600, 700. No Google Fonts link: the app ships from Bulletin
   into a web view.
4. **Hub.** Rows, not preview cards. Order: in progress, then not started (roster order),
   then a "Done today" group with score and the percentile sentence
   ("4 guesses · Top 18% of 1,204 today") in the game's accent. A six-segment bar under
   the headline. Headline states the day: "Six to play." / "Three to go." /
   "All six done." Date eyebrow stays; no greeting, no local-time logic (the day rolls at
   00:00 UTC). Favourites and hide are cut (`prefs.ts` and its controls go). Keep: archive
   header icon, the read-error block, the day summary (shown only at 6/6, in the bar's
   place), and an "Add the card to your Pocket" bottom row. Fourth row state:
   finished-but-not-recorded shows "Finished · not recorded" with Retry, never "Play".
   Loading rows show no button.
5. **Result screen order.** Grid or board, headline by rule, the percentile as a
   sentence (never a tile), tiles for score and streak only, the distribution with
   "you are here" (keep `distribution.ts` logic; it can draw up to 31 bars), then
   "Next: <game> · N of 6 done" as the main button (first unplayed after the current in
   roster order; "Today" when none), Share second. Headline: percentile ≤ 10% "Splendid.",
   ≤ 40% "Nice.", else "Done."; first finisher "First today."; a late (archive) play
   "Done." with no streak tile and no celebration.
6. **Share text, colour-free, one `shared/share.ts`.** Line 1 "Daily on Dot #<day> · n/6";
   line 2 six slots ✅/⬜ in roster order; one line per played game ("Word 4 · Top 18%");
   footer "✦ 14 · ◆ 3", plus the day percentile only at 6/6. Never the answer. Fold
   `connections/engine.ts shareSummary` into it.
7. **Streaks are a route** (`#/streaks`) behind the header pill (44 px tap target).
   The drawer and the hamburger go. The page: gold tile "Day streak 14 · best 31"
   (`longestAny`, new), blue tile "All-six streak 3 · best 5" (`all`, `longestAll`), the
   month calendar (gold = played, blue = all six, grey tick = backfilled, today ringed,
   cells link to `#/day?day=N`, week starts as `history.ts` does), month line
   "19 played · 3 perfect days", next milestone derived from the gold streak
   (7/30/100/365) with a progress bar, one sentence for the grace rule. No perfect-week
   bar.
8. **Celebration.** The streak tile ticks up on the result screen; milestone days add one
   line ("30 days. Keep it."); 6/6 gives the gold strip, the hub headline and the day
   summary. No confetti, no library.
9. **Games.** Each page root carries `data-game="<id>"`; the global header stays, with the
   game's name and a small accent dot in it; a lightbulb rule line at the bottom replaces
   rule text in the heading. Connections: mistakes as text ("2 mistakes") plus dots in
   `--wrong`/neutral, never in the accent; word tiles one size rule. Chess, Word, Sudoku,
   Globe, Mini: accent on the done state only.
10. **Launcher** (half sheet): the hub's rows without the header. Icon tile lit in the
    accent when done, name, "Done" / "Resume" (from `hasStarted`) / nothing, count and
    streak line in the head, Play and "Open Daily on Dot" in the foot. KV card state and
    localStorage only; no chain client, no signer.
11. **Pocket card = scoreboard.** Row 1: "n/6" (`HeadlineLarge`) left, flame + gold count
    (`FgWarning`) and gem + blue-ish count (`FgPrimary`) right; rows 2–3: six tiles
    3 × 2 at fixed Width 95 × Height 56, gap 8 (fits the proven 302dp inner width), each a
    PNG icon (accent-coloured when done, grey when not) plus a `Text` label from
    `roster.short`. Left strip = state: grey, gold at 6/6, red only when
    `streakAny > 0` and today is 0/6 and under 4 h remain to 00:00 UTC. No percentile on
    the card. No record ever: "0/6" and a "Tap to play" line. All art is PNG in
    `pocket/public/tiles/`, baked by a tool (Playwright renders SVG to PNG; no PIL here);
    flame and gem are PNGs too. Worker stays ASCII.
12. **Theme.** Tokens are written as two blocks (`:root` dark, `[data-theme="light"]`)
    from the start; the app subscribes to the host theme and sets `data-theme` on
    `<html>` (WP-A6). Until A6 lands the app stays dark.
13. **Accessibility floor.** Text contrast ≥ 4.5:1 (≤ 12 px labels use `#9aa0a3` on the
    dark ground, never `#6c7275`); tap targets ≥ 44 px; colour never the only signal
    (icons on tiles, text next to dots); real buttons and links.

## Work packages

Order: **A0 → (C ∥ A1 ∥ A2 ∥ A5) → A3 → A4 → A6.** `main.ts` has one owner per round.
The app stylesheet is split by A0 so later packages touch separate files.

- **A0 — tokens, fonts, stylesheet split** (first, main checkout). Move `app/src/styles.css`
  into `app/src/styles/{tokens,shell,home,result,streaks,launcher}.css` and
  `styles/games/<id>.css`, imported from `main.ts`; a pure move, no visual change. Add the
  accent tokens, the derived surfaces, the two theme blocks, `@font-face` for Fredoka.
  Tests: every roster id has `--accent-<id>` and `--accent-<id>-ink`; a contrast test over
  the text/surface token pairs fails below 4.5:1 in both blocks.
- **C — Pocket card** (worktree; `pocket/`, `tools/` only). Decision 11. Tests: faces for
  0/6, 3/6, 6/6 × {no streaks, streaks, never recorded} pass `assertFaceValid(androidLimits)`;
  `stripToken()` is a pure function with the three conditions; every image path in a face
  exists under `pocket/public`; the worker bundle is ASCII; the smoke keeps passing.
- **A1 — Hub** (`home.ts`, `shared/ui/card.ts` → row, `streak-badges.ts` → header pill,
  `header.ts`, `main.ts`, delete `prefs.ts`, `styles/home.css`). Tests in `home.test.ts`:
  row order; done row shows score + percentile sentence; loading shows no Play; a done game
  never shows Play after bits load; `hasStarted` → Resume; finished-not-recorded → Retry;
  0/6 and 6/6 headlines; read-error reachable; day summary only at 6/6.
- **A2 — Result + share** (`result-panel.ts`, `distribution.ts` style only, new
  `shared/share.ts`, the `createResultPanel` call sites, `styles/result.css`). Tests: share
  text never contains any game's answer; slot row matches done count; day percentile only
  at 6/6; late result has no streak tile; headline table; next-game rule.
- **A5 — Launcher** (`card-launcher.ts`, `styles/launcher.css`). Tests: rows show
  Done / Resume / nothing; count; Play label; default selection.
- **A3 — Streaks route** (new `app/src/streaks.ts`, `shared/streaks.ts` + `longestAny`,
  `calendar.ts`, `history.ts`, delete `drawer.ts`, `main.ts` route, `styles/streaks.css`).
  Tests: `longestAny`; backfill renders as backfill; cells are links; weekday start equals
  `history.ts`; milestone derivation.
- **A4 — Games** (`games/*/view.ts`, `styles/games/*.css`). Tests: Connections mistakes
  text and Submit disabled until four selected; every game root carries `data-game`.
- **A6 — Theme** (`subscribeTheme` → `data-theme`; contrast test covers both blocks).

Each package: `pnpm --filter daily-on-dot-prototype test`, `tsc --noEmit`, build, and for C
`pnpm pocket:build && pnpm smoke`. Headless viewport check at 360×780 and 390×844 for A1,
A2, A3, A4 (no horizontal scroll, no clipped controls).
