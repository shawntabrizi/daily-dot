# Design diff: approved artboards vs shipped `prototype` (de1cdda)

Read-only audit, 2026-10-22. The contract is the six artboards in
`scratchpad/design-pass/project/`. `plans/wp-36-design-pass.md` is not the contract;
where it changed the approved design, the row says "review decision".

Origin key: **review** = a decision in `plans/wp-36-design-pass.md` that changed the
approved design · **drift** = implementation differs from both the artboard and the plan ·
**renderer** = the Pocket renderer cannot draw it · **not mocked** = the artboard shows no
state for it.

Restore key: **restore** = put back as approved · **keep** = keep, with the reason ·
**owner** = needs the owner's call.

## 0. Global: fonts, colours, chrome (applies to every phone board)

| Element | Approved | Shipped | Match | Origin | Restore? |
|---|---|---|---|---|---|
| Body font | `'Nunito', system-ui, sans-serif`, weights 500/700/800 (Google Fonts link) | `"Avenir Next", "Helvetica Neue", Arial, sans-serif` at 400/600/700 (`tokens.css` `:root`). Plan said "system sans (Roboto / SF)"; Avenir Next is neither. `mini.css:177` uses an undeclared `var(--body)`. | no | review (no Google Fonts: app ships from Bulletin) + drift (Avenir stack) | owner: self-host a Nunito latin woff2 subset next to Fredoka (OFL, same mechanism) to restore the approved look; otherwise fix the stack to what the plan says |
| Display font | Fredoka 500/600/700; 700 used for big numerals (card n/6, result tiles, streak counts) | Fredoka 600 only, self-hosted `app/public/fonts/fredoka-600-latin.woff2`; every numeral is 600 | partial | review (decision 3: "Fredoka 600") | keep (one weight is fine) or add 700 for the numerals: owner |
| Page background | `#121415` flat | `--bg #161819` + `radial-gradient(... rgb(85 183 37 / 8%) ...)` green glow at the top (`shell.css body`) | no | drift (pre-existing, kept through the "pure move" split) | restore: `#121415`, drop the green gradient (Word green is no longer the generic colour, decision 2) |
| Card / row surface | `#1b1e20` | `--surface #303436` (much lighter grey) | no | drift (old token kept) | restore `#1b1e20` |
| Chrome surface (buttons, back circle) | `#1f2224` | `--surface-raised #27282a` | no | drift | restore `#1f2224` |
| Empty / idle tile | `#2a2e31` | `--tile-empty #1e2021` (Connections), `--surface-raised` elsewhere | partial | drift | restore `#2a2e31` |
| Muted text | `#9aa0a3` | `--muted #9aa0a3` | yes | — | — |
| Dim text (section labels, future days) | `#6c7275` / `#3a3f42` | `--neutral #707070` | partial | drift | restore where used (see rows) |
| Text | `#ececec` | `--text #ececec` | yes | — | — |
| Six accents + inks | word `#55b725`/`#0d1a07`, sudoku `#22b8a0`-ish (artboard shows idle only), chess `#e07b39`/`#2a1407`, globe idle only, mini `#d85a9e`/`#2b0a1c`, connections `#9b59c9`/`#ffffff` | identical tokens, sudoku `#22b8a0`/`#062420`, globe `#4f7df3`/`#0b1a3a` | yes | — | — |
| Streak gold / blue | `#e8b53a` / `#6fd3f7` | `--streak-gold #e8b53a`, `--streak-blue #6fd3f7` | yes | — | — |
| Screen header | Per screen: a 44 px circle on the left (hamburger on the hub, back arrow elsewhere, bg `#1f2224`), a centred title or eyebrow, one control on the right. No border, no blur. | One global sticky `.site-header`: title "Daily on Dot" left (Fredoka 20 px), game dot + name next to it, archive calendar icon (44 px) and streak pill right; 1 px hairline border, `backdrop-filter: blur(14px)`, 64 px tall | no | review (decision 7 drops hamburger/drawer; decision 9 adds game dot in the global header) + drift (archive icon, hairline, blur, left title) | owner: the design's per-screen header is a large part of its look. At minimum restore: no hairline/blur, centred title, a back circle on game/result/streak screens |
| Back control on game, result, streak screens | 44 px circle, `#1f2224`, chevron, `aria-label="Back to today"` | missing (only the title link goes home) | no | drift | restore |
| Corner radius language | rows 18, tiles 14–16, buttons 14–17, cards 18–20 | rows 16, tiles 12–14, buttons 12 or 100 px pills, cards 14–18 | partial | drift | restore the approved radii per row below |

## 1. Main.dc.html — Pocket card, "Proposed: scoreboard"

Shipped: `pocket/src/face.ts`, art from `tools/render-card-art.mts`. Phone shot is from before de1cdda (count was plain text, no strip).

| Element | Approved | Shipped | Match | Origin | Restore? |
|---|---|---|---|---|---|
| Card frame | 400 × 234, radius 24, bg `#15181a`, padding 18 20 16 22, `overflow: hidden` | FillWidth × 234, radius 24, `BgSurfaceContainer` (host theme colour, not `#15181a`), padding 16 20 12 20 | partial | renderer (theme tokens only) | keep |
| State strip | 8 px, left edge, full height; grey `#3a3d40` at 0, **green `#55b725` while playing**, gold `#e8b53a` at 6/6, red `#c62121` "after 20:00 if the streak is at risk" | 8 px Box, `FgTertiary` (grey) / `FgWarning` (gold at 6/6) / `FgError` (red when streakAny > 0, 0/6, < 4 h left). **No green "while playing" state.** | partial | review (decision 11: "grey, gold at 6/6, red only") + renderer (token colours) | owner: the artboard caption says green while playing; the plan cut it. Restore green (`FgSuccess`-type token if the renderer has one) or confirm the cut |
| Layout | Two columns: left column (min 120) = big number, "DONE TODAY", streaks at the bottom; right = 3 × 2 tile grid filling the rest | Stacked: row 1 = count badge left + streaks right; rows 2–3 = tiles across the full width | no | review (decision 11 rewrote the layout as rows) | owner: the approved card is a left scoreboard + right tile grid. The stacked layout is a different card |
| Big count | "3" Fredoka 700 64 px, line-height 0.95, `-0.02em`; "/6" 30 px `#8d9396` | Baked PNG `count-<n>.png` 112 × 48: "n" Fredoka 600 36 px white, "/6" 20 px `#8d9396`, on a `#1f2326` rounded tile (gold tile with `#2a1f05` ink at 6/6) | partial | renderer (no Fredoka in the host) + drift (36 px not 64, a tile background the design does not have) | restore size: bake at ~64 px, no tile background |
| "DONE TODAY" label | 12 px 800, `0.12em`, uppercase, `#9aa0a3`, 6 px under the number | missing | no | review (decision 11 lists no label) | restore |
| Streaks | Bottom of the left column; flame 16 × 20 + "14" 18 px 800 gold; gem 16 × 16 + "3" 18 px 800 blue `#6fd3f7`; gap 14 | Right of the count; flame PNG + count `BodyMediumRegular` `FgWarning`; gem PNG + count `FgPrimary` (white, not blue); gap 12; hidden when 0 | partial | renderer (no blue token) + review (position) | keep the renderer limits; bake the blue count as part of the gem PNG only if the owner wants blue; position follows the layout call above |
| Never recorded | not mocked | "0/6" + "Tap to play" `BodySmallRegular` `FgSecondary` | — | review (decision 11) | keep |
| Tile grid | 3 × 2, gap 10 × 8, each tile fills the grid cell, radius 14 | 2 rows of 3 fixed tiles 95 × 62, gap 8, `SpaceBetween`, radius 14 | partial | renderer (fixed widths; FillWidth children collapse on Android) | keep |
| Done tile | **Whole tile solid accent** (`#55b725`), ink glyph 26 px, label 11 px 800 `0.06em` uppercase in ink | Tile bg `BgSurfaceNested` (neutral); only the 30 px icon PNG is accent-filled (56 px art); label `BodySmallRegular` `FgPrimary`, sentence case | no | drift (the art bakes a 56 px icon, not a 95 × 62 tile) | restore: bake the full tile (accent fill, ink glyph, uppercase label) as one PNG per state, or set the tile Box to the accent via a PNG background |
| Idle tile | bg `#202427`, inset ring 1.5 px `#2e3336`, glyph `#8d9396` 26 px, label `#8d9396` 11 px 800 uppercase | bg `BgSurfaceNested`, grey icon PNG (`#2a2e31` fill, `#8d9396` glyph), label `FgSecondary` sentence case | partial | renderer + drift | restore the uppercase small label if the full-tile PNG is baked |
| Tile labels | WORD · SUDOKU · CHESS · GLOBE · MINI · **GROUPS** | Word · Sudoku · Chess · Globe · Mini · **Connections** (`roster.short`) | no | review (decision 11: label from `roster.short`) | owner: "GROUPS" fits the tile; "Connections" is the game's name |
| Glyphs | word 4 squares (two at 0.55 opacity), sudoku 3×3 stroke grid, chess pawn silhouette, globe circle + meridians, mini 2×2 with one black square, connections 4 dots | same six ideas, redrawn (`render-card-art.mts`): word 4 solid squares, chess pawn with base bar, mini 2×2 with black square top-left | partial | drift (minor) | keep |
| Card tap | one tap (canvas note s1) | whole-card tap opens the launcher | yes | — | — |
| Percentile / history | none | none | yes | — | — |

## 2. Home.dc.html — the hub

Shipped: `home.ts`, `game-row.ts`, `header.ts`, `streak-badges.ts`, `home.css`, `shell.css`. Shot: `a1-shots/home-three-done-390x844.png`.

| Element | Approved | Shipped | Match | Origin | Restore? |
|---|---|---|---|---|---|
| Header left | Hamburger button 44 px circle `#1f2224`, `aria-label="Menu"` | missing | no | review (decision 7: hamburger and drawer go) | owner: the design kept a menu. If it stays cut, nothing to restore; the drawer itself was already described as the old app (Current board) |
| Header title | "Daily on Dot" centred, Fredoka 600 18 px `0.02em` | "Daily on Dot" left, Fredoka 600 20 px (24 px ≥ 560), `-0.025em`, is a link | partial | drift | restore centred 18 px |
| Header right: streak pill | 36 px tall, padding 0 12 0 10, radius 18, bg `#2a2416` (gold tint), **inset 2 px blue ring**, flame 14 × 18 gold + "14" 15 px 800 **gold**, then "◆3" 12 px blue | 44 px min, radius 100, bg `--surface #303436`, flame 18 px gold + "10" 14 px 700 **white**, gem + count only when all > 0, no ring | partial | review (44 px target, decision 7/13) + drift (colours) | restore: gold tint bg, gold number, blue ring (keep 44 px height) |
| Archive icon | none | 44 px calendar icon button, left of the pill | no | review (decision 4: "keep archive header icon") | owner |
| Date eyebrow | "Wednesday 22 October" 11 px 800 `0.14em` uppercase `#9aa0a3`, padding-top 10 | "THURSDAY 22 OCTOBER" 12 px 900 `0.16em` `--neutral #707070`, 38 px page padding above | partial | drift (shell `.eyebrow` reused) | restore 11/800/0.14em/#9aa0a3 |
| Headline | Two lines: "Good evening." / "Three to go.", Fredoka 600 30 px, line-height 1.05 | "Three to go." only, Fredoka 600 `clamp(2rem, 9vw, 3.25rem)` = 35 px at 390, `-0.025em`, line-height 0.98 | partial | review (decision 4: no greeting) + drift (size) | owner on the greeting; restore 30 px |
| Countdown | Right of the headline, right-aligned: "NEW SET IN" 11 px 800 `0.1em` uppercase `#9aa0a3`, value "07:12:33" 15 px `#ececec` on its own line | Below the headline, left: "New set in 15:19:47" one line, 13 px `--muted` | no | drift | restore the right-aligned two-line block |
| Six-segment bar | 6 flex segments, height 6, radius 3, gap 5, done = accent, empty `#2a2e31`; padding 10 16 14 | 6 grid segments, height 8, radius 4, gap 5, done = accent, empty `--surface-raised #27282a`; hidden at 6/6 (day summary takes its place) | partial | drift (size) + review (6/6 swap) | restore 6 px / `#2a2e31`; owner on the 6/6 swap |
| Row order | in progress → not started → "Done today" group | same (`ORDER` map) | yes | — | — |
| Row frame | padding 14 16, radius 18, bg `#1b1e20`, gap 14, tile 44 radius 14 | min-height 64, padding 10 12 10 10, radius 16, bg `#303436`, gap 14, tile 44 radius 14 | partial | drift | restore padding/radius/bg |
| In-progress row (Connections) | Left 4 px inset accent bar (`box-shadow: inset 4px 0 0 #9b59c9`); tile bg tinted `#2b2233` with **accent-coloured glyph**; second line "Four groups of four · 2 of 4 found"; **Resume** button filled accent `#9b59c9`, white text | No accent bar; neutral tile; second line is the static hook ("Name the country"); Resume = neutral pill `--surface-raised` | no | review (decision 1: in progress stays neutral) + drift (no progress fraction) | owner: the artboard is explicit that an in-progress game shows its accent and its progress. Restore if the owner holds to the board |
| Not-started row | tile `#202427` grey glyph; line "Fill the grid · about 6 min" / "Name the country"; **Play** pill 34 px, radius 17, bg `#2a2e31`, 13 px 800 | tile `--surface-raised`; hooks "Six letters, fewest guesses" / "Fill the grid" / "Find the move" / "Name the country" / "Five by five" / "Four groups of four" (no time estimate); Play pill min 40 px, radius 100, bg `--surface-raised`, 14 px 700 | partial | drift | restore button size/weight; owner on "about 6 min" (needs a number per game) |
| Row name | Fredoka 600 18 px (17 px on done rows) | Fredoka 600 19 px | partial | drift | restore 18/17 |
| Row second line | 13 px 700 `#9aa0a3` | 13 px 400 `--muted`, ellipsis | partial | drift | restore 700 |
| "Done today" label | 11 px 800 `0.14em` uppercase `#6c7275`, padding 8 4 0 | h2 12 px 700 `0.1em` uppercase `--muted`, margin-top 26 | partial | drift | restore |
| Done row surface | Tinted per game (`#16211a` word, `#221a15` chess, `#23161d` mini) with 1.5 px inset ring (`#2a4a1e`, `#4a2f1e`, `#4a2036`); padding 12 16 | Same `--surface` as open rows; no tint, no ring. The derived `--surface-<id>` tokens exist in `tokens.css` but `home.css` never uses them | no | drift | restore (use `--surface-<id>` + a ring) |
| Done row tile | solid accent, ink glyph | solid accent, ink glyph | yes | — | — |
| Done row text | Name 17 px + " · 4 guesses" **in the accent** 14 px 700 on line 1; "Top 18% of 1,204 today" 13 px 700 muted on line 2 | Name 19 px; line 2 "4 guesses · Top 24% of 37 today" in `--text`, 400 | no | drift: `home.css` comment says accents miss 4.5:1 on the surface (decision 13). The plan itself (decision 4) says the sentence is "in the game's accent" | restore the accent score on line 1. Computed WCAG contrast of each accent on the design's tinted row: word 6.5:1, sudoku 6.7:1, chess 5.8:1, mini 4.9:1, globe 4.4:1, connections 3.7:1. Four of six pass 4.5:1 on the design surface; on the shipped `#303436` surface only word and sudoku pass. Restoring the dark surface fixes most of it; globe and connections need the owner's call (14 px 700 at ≥ 3:1 is WCAG large-text only at 18.7 px) |
| Word done row: six guess squares | Right side: six 10 px squares radius 3, 4 green + 2 `#2a2e31` | missing | no | drift | restore |
| Chess done copy | "Chess · first try" / "Top 41% of 812 today" | "Chess" / "1 attempt · Top 3% of 38 today" | partial | drift | restore "first try" for 1 attempt (`formatScore` special-case) |
| Mini done copy | "Mini · 1:42" / "Top 9% of 640 today · personal best" | "Mini" / "1:42 · Top N% of M today"; no personal best | partial | drift (no personal-best data) | owner |
| Day summary at 6/6 | not mocked | `renderDaySummary` card (eyebrow "DAY DONE", "Top N% today" 28 px, per-game list, streak stats) in the bar's place | — | review (decision 4 keeps it) | owner |
| Read-error block | not mocked | "Completion data could not be loaded." + "Try again" | — | review | keep |
| Bottom link | none | "Add the card to your Pocket →" with a top hairline | no | review (decision 4) | owner |
| Loading / unrecorded rows | not mocked | loading: no button; unrecorded: "Finished · not recorded" + Retry | — | review | keep |
| Two-column rows ≥ 780 px | not mocked | `.game-rows` 2 columns ≥ 780 | — | drift | keep |

## 3. Result.dc.html — after a game (Word)

Shipped: `result-panel.ts`, `distribution.ts`, `share.ts`, `result.css`. Shot: `a2-shots/word-panel-390.png`.

| Element | Approved | Shipped | Match | Origin | Restore? |
|---|---|---|---|---|---|
| Header | Back circle · "DAILY WORD · DAY 294" eyebrow centred 11 px 800 `0.14em` · 44 px spacer | Global header ("Daily on Dot ● Word", archive, pill); the game page keeps its own heading block (eyebrow "DAILY WORD", h1 "One word a day.", DAY chip) above the board | no | drift | restore the per-screen header; on a finished game hide the game h1 |
| Panel container | None: sections sit on the page bg `#121415` | Everything inside `.result-panel`: `--surface-raised` card, radius 14, padding 16 14 14, `text-align: center` | no | drift | restore (no card) |
| Guess grid | 6 × 40 px tiles, gap 5, radius 8; `#2a2e31` / `#dac316` / `#55b725`; 22 px top padding | The game's own board stays above the panel (Word's `tile.ts`); not re-drawn by the panel | partial | not mocked as a separate element | keep |
| Headline | h1 Fredoka 600 34 px "Splendid." margin-top 18 | h2 Fredoka 600 30 px; rule: ≤ 10 % Splendid., ≤ 40 % Nice., else Done.; "First today."; late = "Done." | partial | review (rule) + drift (size) | restore 34 px; keep the rule |
| Subline | "4 guesses · the word was BLONDE" 15 px 700 `#9aa0a3`, one line | Two lines: "1 guess" 15 px 600 `--text` and "Top 3% of 37 today" 13 px `--muted`. The answer is shown by the Word game's status line ("BLONDE in 4 guesses"), not here | no | review (decision 5: percentile as a sentence) | owner: the board has the answer on the subline and the percentile as a tile; the plan swapped them |
| Tiles | **Three**: "4 GUESSES" (accent), "18% TOP TODAY", "🔥14 DAY STREAK" (gold); radius 16, bg `#1b1e20`, padding 12 10, value Fredoka 700 26 px, label 10 px 800 `0.12em` uppercase `#9aa0a3`, 3-col grid gap 8 | **Two**: "1 / guess" (accent) and "🔥 10 / day streak" (gold); radius 12, bg `--surface #303436`, min-height 72, value Fredoka 600 30 px, label 12 px 600 lowercase | no | review (decision 5: never a tile for the percentile) + drift (type) | owner on the third tile; restore tile type (26/700, 10 px uppercase labels, radius 16, `#1b1e20`) |
| Milestone line | not mocked | "30 days. Keep it." gold 14 px 700 under the tiles on milestone days | — | review (decision 8) | keep |
| Distribution card | Card radius 18 bg `#1b1e20` padding 14 16 12; head row "1,204 FINISHED TODAY" 11 px 800 uppercase left + "you are here" 12 px 800 **accent** right | No card; no "N finished today" line (the total is only in `aria-label`); caption under the axis: "GUESSES" 11 px 600 `0.08em` left + swatch "you are here" muted right | no | drift | restore the card, the finished-today head, the accent "you are here" |
| Bars | 8 fixed columns 1…8+, height 56, gap 4, radius 3 3 0 0, bars `#2e3336`, player bar accent, no count label | 6…31 columns (first to last non-empty, min 6), height 60, gap 2, bars `--neutral #707070` (empty 35 %), player bar accent with its count above in white | partial | review (decision 5: "can draw up to 31 bars") + drift (bar colour, count label) | restore bar colour `#2e3336`, gap 4; owner on the count label and the variable axis |
| Axis labels | 10 px 800 `#6c7275`, player label accent | 10 px 400 `--muted`, player label accent 700; crowded axes label every 5th | partial | drift | restore 800 / `#6c7275` |
| Primary button | "Next: Connections" left + "4 OF 6 DONE" right (12 px, `0.08em`, opacity 0.85); height 54, radius 16, **bg = the next game's accent** `#9b59c9`, white text, 16 px 800, `space-between` | "Next: Sudoku · 1 of 6 done" one centred string; min-height 48, radius 12, **bg = the current game's accent** (Word green), 15 px 700 | partial | review (decision 5 wrote the label as one string) + drift (colour source) | restore: next game's accent, two-part label, 54 px, radius 16 |
| Secondary row | 2-col grid "Share" (button) · "Today" (link); 46 px, radius 14, bg `#1f2224`, 14 px 800 | flex "Share" · "Today"; min 44, radius 12, bg `--surface #303436`, 14 px 600 | partial | drift | restore |
| Share preview box | Always visible at the bottom: mono 12 px `#9aa0a3` on `#171a1c` radius 14: "Daily on Dot #294 · 4/6" (white) / "■ Word 4  ■ Chess 1  ■ Mini 1:42" (coloured squares) / "Top 18% · ✦ 14 · ◆ 3" | No preview. `.result-share-box` appears only when `navigator.share` and the clipboard both fail (`pre`, 13 px, `--surface`) | no | review (decision 6: "share text, colour-free") | owner: the board previews the text; the plan removed colour from it. A colour-free preview would still honour both |
| Share text content | 3 lines as above; the game's percentile in the footer at 4/6 | Line 1 "Daily on Dot #<day> · n/6"; line 2 six ✅/⬜ slots; one line per played game "Word 4 guesses · Top 18%" (unit word included); Connections tier rows; footer "✦ 14 · ◆ 3", day percentile only at 6/6 | partial | review (decision 6) | owner |
| Order of sections | grid → headline → subline → tiles → distribution → buttons → share preview | headline → score line → sentence → tiles → (milestone) → distribution → primary → Share/Today | partial | review | — |
| Late (archive) result | not mocked | no streak tile, "Back to archive" primary, "Top N% on the day" | — | review | keep |

## 4. Streak.dc.html — streak drawer / page

Shipped: `streaks.ts`, `calendar.ts`, `streaks.css`. Shot: `a3-shots/streaks-390x844.png`.

| Element | Approved | Shipped | Match | Origin | Restore? |
|---|---|---|---|---|---|
| Header | Back circle · "STREAKS" eyebrow centred 11 px 800 `0.14em` `#9aa0a3` · spacer | Global header; page eyebrow "STREAKS" left-aligned, 12 px 900 `#707070` | partial | drift | restore |
| Route / entry | a page behind the pill (board title "Streak drawer") | `#/streaks` behind the pill | yes | — | — |
| Gold tile frame | radius 20, bg `#221c10` (dark gold tint), inset ring 1.5 px `#4a3a14`, padding 16, gap 6; **always this tint** | radius 16, padding 14 14 12; tint `color-mix(gold 12%, --surface)` at 0; **solid `#e8b53a` with `#161819` ink once streak > 0** (`data-lit`) | no | drift (plan says "gold tile", not solid) | restore the dark tint + ring, number in gold |
| Gold tile order | flame 30 × 38 → "14" Fredoka 700 44 px gold → "DAY STREAK" 12 px 800 `0.1em` uppercase `#c9a24a` → "Any one game, any day. Best 31." 12 px 700 `#9aa0a3` | flame 28 px → "Day streak" 13 px 700 sentence case → "9" Fredoka 600 48 px → "Any one game, any day. Best 50." 12 px | partial | drift | restore order (number before label), uppercase label, 44/700 |
| Blue tile | radius 20, bg `#10202a`, ring `#1f4a5c`; gem 30; "3" 44 px `#6fd3f7`; "PERFECT DAYS" `#5fb3d2`; "All six in a row. Best 5." | tint `color-mix(blue 12%)`, solid blue when > 0; "All-six streak" label; "0"; "All six in a row. Best 0." | no | review (decision 7 label "All-six streak") + drift (solid) | restore tint + ring + 44/700; owner on "Perfect days" vs "All-six streak" (the hub pill and the month line still say "perfect") |
| Month heading | h2 "October" Fredoka 600 20 px left; "19 played · 3 perfect" 12 px 800 right on the same line | "October 2026" centred between ← → 44 px icon buttons; "20 played · 0 perfect days" centred 13 px below | partial | review (decision 7 "19 played · 3 perfect days") + drift (month nav, layout) | owner on month navigation (not in the design); restore the one-line head if nav is cut |
| Weekday row | M T W T F S S (Monday start), 10 px 800 `0.08em` `#6c7275` | S M T W T F S (Sunday, "as `history.ts` does"), 11 px `--muted` | no | review (decision 7) | owner |
| Cell frame | aspect 1, radius 10, gap 6, bg `#1b1e20`, number 12 px 800 | min-height 44, radius 7, gap 4, bg `#27282a`, number 14 px 500 (700 on gold/blue) | partial | review (44 px cells, decision 13) + drift (radius, gap, weight) | restore radius 10, gap 6, 800 |
| Played day | bg `#3a2e12` (dark gold tint), number gold `#e8b53a` | **solid `#e8b53a`**, number `#161819` | no | drift | restore the tint (solid gold is reserved for the perfect week in the design) |
| All-six day | solid `#6fd3f7`, number `#0b2430` | solid `#6fd3f7`, number `#161819` | yes | — | — |
| Past unplayed day | bg `#1b1e20`, number `#6c7275` | bg `#27282a`, number `--text` | partial | drift | restore |
| Future day | bg `#1b1e20`, number `#3a3f42` (dim) | blank transparent cell, no number | no | review (calendar.ts `blank`) | owner |
| Today | gold cell + 2 px `#ececec` ring | 2 px `--text` ring | yes | — | — |
| Perfect week | Full-row gold bar `#e8b53a` radius 12 spanning 13–19, numbers `#2a1f05`, a blue cell inside it | missing | no | review (decision 7: "No perfect-week bar") | owner |
| Backfilled day | not mocked | grey cell with a ✓ tick, "Played later" | — | review | keep |
| Cells link | not mocked | played cells link to `#/day?day=N` | — | review | keep |
| Legend | "Played" (tint swatch with gold inset ring) · "All six" (blue) · "Perfect week" (22 × 10 gold bar); 11 px 800 `#9aa0a3`, square swatches | "Any game" · "All six" · "Played later" · "Today"; round 8 px dots; 12 px 500 muted, centred | partial | review | restore wording "Played"; owner on the rest |
| Next badge | Eyebrow "NEXT BADGE" 11 px 800 `0.14em` `#6c7275`; card radius 16 bg `#1b1e20` padding 12 14 with a 40 px flame tile `#2a2416`; "30-day streak" 14 px 800; 6 px bar `#2a2e31` with gold fill; "14 / 30" 12 px 800 right | h2 "Next milestone" Fredoka 18 px; row "30-day streak" 14 px 600 + "9 / 30" muted; 10 px bar `--surface` with gold fill; no card, no flame tile; hidden past 365 | partial | review (decision 7 "next milestone") + drift (card, flame, sizes) | restore the card + flame tile + 6 px bar; owner on "badge" vs "milestone" |
| Grace sentence | "A day counts until the next set drops. Past days you fill in later count for the calendar, not the streak." 12 px 700 `#6c7275`, pinned to the bottom | "A day counts until the next set drops at 00:00 UTC. Days you fill in later count here, not for streaks." 13 px 400 `--muted`, in flow | partial | drift | restore the approved copy and type |

## 5. Game.dc.html — Connections

Shipped: `games/connections/view.ts`, `games/connections.css`, `shell.css` (`.game-heading`, `.game-rule`). Shot: `final-shots/connections.png`.

| Element | Approved | Shipped | Match | Origin | Restore? |
|---|---|---|---|---|---|
| Header | Back circle · "● Connections" (10 px accent dot + Fredoka 600 18 px) centred · "DAY 294" chip right (30 px, radius 15, `#1f2224`, 11 px 800 `0.1em` `#9aa0a3`) | Global header: "Daily on Dot" + "● Connections" (8 px dot, 13 px 700 muted) left; archive + pill right. The DAY chip sits in the page heading, padding 8 11, `--surface-raised`, 11 px 700 `0.08em` | partial | review (decision 9: global header stays) | owner: the board makes the game name the title |
| Page heading | h1 "Four groups of four." Fredoka 600 24 px with four 10 px mistake dots to its right (used = accent `#9b59c9`, free `#2a2e31`), `aria-label="2 mistakes"`; no eyebrow | eyebrow "DAILY CONNECTIONS" + h1 (24 px under 560 × 850, else `clamp`); mistakes moved into the board card | partial | review (decision 9: text + dots in `--wrong`, never the accent) | owner: the board uses the accent for mistake dots; the plan forbids it |
| Mistakes | dots only, by the h1 | "No mistakes" / "2 mistakes" text + 4 × 8 px dots (`--neutral`, filled `--wrong #c62121`) + "0 of 4 found" right, 12 px 700, inside the card | partial | review | — |
| Board container | None: bars, grid, status, buttons sit on the page bg | `.connections-shell` card: `--surface #303436`, radius 18, padding 12, `flex: 1` so it fills the viewport (large empty grey area under the buttons in the shot) | no | drift (pre-existing shell) | restore (no container, or at least `flex: none`) |
| Found-group bars | radius 14, padding 12 14; label 11 px 800 `0.12em` uppercase; words 14 px 800 joined " · "; yellow `#dac316`/`#2a2504`, green `#55b725`/`#0d1a07` | radius 8, min-height 58, padding 6 10; label 12 px 900 `0.06em`; words 12 px uppercase joined ", "; ink `#161819`; tiers `--present`, `--correct`, `--tier-sky #3b8bd0`, `--tier-plum #9b59c9` | partial | drift | restore radius 14, " · ", 14 px words, per-tier inks |
| Word tiles | 64 px, radius 14, gap 8, bg `#1f2224`, Nunito 800 13 px (12/11 px for long words), text already uppercase | min-height 58, radius 8, gap 6, bg `--tile-empty #1e2021`, Fredoka 600 13 px uppercase, `clamp(11px, 3.2vw, 13px)` past 9 letters | partial | review (decision 9 "one size rule") + drift (radius, font, bg) | restore 64 / radius 14 / gap 8 / `#1f2224`; owner on Fredoka vs body font on tiles |
| Selected tile | **solid accent `#9b59c9`, white text, lifted 2 px** | `--surface-raised` bg + 2 px `--text` ring, no lift | no | review (decision 1/9: accent on the done state only) | owner: the board's selected state is the accent; this is the one place the game's colour shows while playing |
| Status line | "3 of 4 selected." 14 px 700 `#9aa0a3` centred, **below** the grid | "Select four words." / "N of 4 selected." / "Four selected. Submit when ready." in a box (`--surface-raised`, radius 6, 11 px, `#d1d2d2`), **above** the grid | partial | drift | restore position and type |
| Action row | grid `1fr 1fr 1.4fr`, gap 8: "Shuffle" · "**Clear**" · "Submit"; 48 px, radius 14, bg `#1f2224`, 13 px 800; Submit tinted `#3a2f47` text `#b9a1d1` until four are picked | equal flex: "Shuffle" · "**Deselect**" · "Submit"; min 44, radius 100 (pills), bg `--surface-raised`, 13 px 700; Submit disabled at 0.4 opacity, enabled = `--text` fill / `--bg` ink | partial | drift | restore "Clear", 48 px, radius 14, the wider Submit, accent-tinted Submit |
| Rule line | Box radius 14 bg `#171a1c` padding 10 14, gold bulb 18 px, "Tap four words that go together, then submit." 13 px 700 `#9aa0a3`, pinned to the bottom | Footer, no box, bulb 16 px gold, same text, 12 px 600 (11 px on short phones) | partial | review (decision 9 adds the line) + drift (box) | restore the box and 13/700 |
| Done state | not mocked | board gets `--surface-connections` tint + 2 px accent ring; the result panel below | — | review | keep |

## 6. Current.dc.html

Context only: three screenshots of the old app with captions. No elements to compare.

## 7. Shipped but not in the approved design

| Shipped element | Where | Origin | Note |
|---|---|---|---|
| Global sticky header with hairline + blur, title as a link | `shell.css .site-header` | drift | Replaces every per-screen header |
| Archive (calendar) icon button | `header.ts` | review (decision 4) | — |
| Game dot + name in the global header | `header.ts`, decision 9 | review | The board puts the dot in the centred title |
| "Add the card to your Pocket →" hub row | `home.ts` | review (decision 4) | — |
| Day summary card at 6/6, replaces the bar | `home.ts`, `day-summary.ts` | review | Eyebrow "DAY DONE", "Top N% today" 28 px, per-game list, streak stats |
| Read-error block + "Try again" | `home.ts` | review | — |
| Row states: loading (no button), "Finished · not recorded" + Retry | `game-row.ts` | review | — |
| Static hooks "Six letters, fewest guesses", "Find the move", "Five by five" | `game-row.ts HOOKS` | drift | The board shows progress ("2 of 4 found") and time ("about 6 min") |
| Hub rows in two columns ≥ 780 px | `home.css` | drift | — |
| Body green radial gradient | `shell.css body` | drift (pre-existing) | — |
| Light theme block + `data-theme` | `tokens.css`, `host-theme.ts` | review (decision 12) | Not mocked |
| Result: score line + percentile sentence as two lines | `result-panel.ts` | review (decision 5) | — |
| Result: milestone line "30 days. Keep it." | `result-panel.ts` | review (decision 8) | — |
| Result: player-bar count label, variable 6–31 bar axis, "GUESSES" caption | `distribution.ts` | review + drift | — |
| Result: whole panel in a raised card, centred | `result.css` | drift | — |
| Result: "Reading today's distribution…" loading line | `result-panel.ts` | not mocked | fine |
| Result: late/archive variant ("Back to archive") | `result-panel.ts` | review | fine |
| Share: ✅/⬜ slot line, unit words ("4 guesses"), Connections tier rows, "Top N% today" only at 6/6 | `share.ts` | review (decision 6) | — |
| Share fallback `pre` box (clipboard failure only) | `result-panel.ts shareOut` | drift | Not the always-on preview from the board |
| Streaks: month ← → navigation, "October 2026" with year | `streaks.ts` | drift | — |
| Streaks: "Played later" backfill cell with ✓, "Today" legend entry | `calendar.ts` | review (decision 7) | — |
| Streaks: lit solid gold/blue tiles with dark ink | `streaks.css [data-lit]` | drift | — |
| Streaks: cells link to `#/day` | `streaks.ts` | review | — |
| Streaks: "Streaks could not be loaded." error | `streaks.ts` | not mocked | fine |
| Connections: "DAILY CONNECTIONS" eyebrow, "Deselect" label, status box above the grid, mistakes text, `.connections-shell` card, done-board tint + ring, "Recorded" text in archive | `view.ts`, `connections.css` | drift / review | — |
| Card: baked "n/6" badge on its own tile, "Tap to play", gem count in white | `face.ts`, `render-card-art.mts` | renderer + review | — |
| Launcher (half sheet) | `card-launcher.ts`, `launcher.css` | review (decision 10) | Contradicts the hub board in: title "Daily Games" (hub: "Daily on Dot"), a 2-column grid of 6 rows with uppercase state words "DONE"/"RESUME" instead of Play/Resume pills, 36 px icon tiles, a neutral `--text`-filled Play button, "Open Daily on Dot" text button |

Removed from the design and not shipped: hamburger menu and drawer (decision 7), greeting (decision 4), perfect-week bar (decision 7), third result tile (decision 5), share preview (decision 6), Nunito (decision 3), Monday week start (decision 7), favourites/hide and settings/account icons were never in the approved boards (they are old-app features; `icons.ts` still exports `menu`, `settings`, `account`, `close` glyphs that nothing uses).

## 8. Ranked: what will make the owner say "this is not my design"

1. **Surface colours.** Rows and cards are `#303436` on `#161819` with a green glow; the design is `#1b1e20` on flat `#121415`. Every screen reads lighter and greyer than the boards. (drift, global)
2. **Body font.** Avenir Next / Helvetica instead of Nunito 700/800. Labels, buttons and lines lose the rounded, heavy look that pairs with Fredoka. (review cut Google Fonts; the Avenir stack is drift)
3. **Pocket card layout and tiles.** Stacked rows with neutral tiles and small coloured icons, a 36 px count on its own tile, no "DONE TODAY"; the design is a 64 px number + label + streaks on the left and six full-colour tiles on the right. (review + drift)
4. **Streaks tiles turn solid gold/blue** with black text; the design keeps a dark tint with a ring and a gold number. The calendar's played days are solid gold too, where the design uses a tint and reserves solid gold for the perfect week. (drift)
5. **Global header on every screen** (title left, hairline, blur, archive icon) instead of the per-screen header with a 44 px back circle and a centred title. (review + drift)
6. **Done rows on the hub** have no tinted surface, no ring, no accent score on line 1, no six guess squares. Colour "earned by play" is only the 44 px tile. (drift)
7. **In-progress row is fully neutral** (no accent bar, no accent glyph, no accent Resume, no "2 of 4 found"). (review decision 1 vs the board)
8. **Result screen in a grey card, two tiles not three, no distribution card, no "1,204 finished today", no share preview, Next button in the current game's colour** rather than the next game's. (review + drift)
9. **Connections board inside a viewport-filling grey card**, pill buttons, "Deselect", status box above the grid, selected tiles neutral instead of accent, no accent mistake dots by the title. (drift + review)
10. **Hub head**: no greeting, countdown as a left muted line instead of the right-aligned block, 35 px headline, 8 px bar. (review + drift)
11. **Streak page extras** the board does not have: month ← → nav, year in the title, Sunday week start, four-item legend with round dots, "Next milestone" h2 without the card/flame tile, grace sentence reworded. (review + drift)
12. **Type scale drift everywhere**: eyebrows 12/900/#707070 vs 11/800/#9aa0a3; buttons 700 vs 800; tile labels lowercase 12 px vs uppercase 10 px; row names 19 vs 18/17. (drift)
13. Card labels "Connections" vs "GROUPS"; "All-six streak" vs "Perfect days"; "first try" missing. (review / drift, copy)
