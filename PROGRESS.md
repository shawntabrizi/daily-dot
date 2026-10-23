# Progress ledger

Durable state for the working loop. **Update this first, every iteration** — it outlives
any single context window. `PLAN.md` is the design; this is where things actually stand.

## Now

- **State:** WP37 (restore the approved boards) merged and published 2026-10-22 from
  `HEAD`. R1 (tokens, self-hosted Fredoka 600/700 + variable Nunito, per-screen header,
  drawer behind the hamburger, hub as the Home board, launcher copy) plus R2-R5 below.
  Integration: one header API (`setHeaderTitle` for an eyebrow, `setHeaderGame` for the
  Game board's dot + name + DAY pill); the `daily-header` event is gone. Word's result
  draws the Result board (played rows as plain 40 px squares, no card, no meta, no rule).
  Exceptions kept: streaks month arrows (not on the board), Nunito is one variable file.
  Next: Shawn's phone check of every screen and the card.
- **WP37 R2 (result + share), `wp37-result`:** the Result board restored literally in
  `result-panel.ts` / `distribution.ts` / `result.css`: no card, h1 34 + "score · answer"
  subline, three tiles, the distribution card, "Next: <game>" in the next game's colour,
  Share · Today, the share preview box (coloured squares; the copied text stays
  colour-free, `share.ts` unchanged). Views pass `detail` and call `syncResultChrome`
  (hides `.game-heading`, dispatches `daily-header` `{title, left}` for R1's header).
  Added `--body` to `tokens.css`; the bar grey `#2e3336` and the preview bg `#171a1c`
  are local properties in `result.css` (not shared tokens). No exception taken. Still
  off the board and outside R2: Word's `.word-shell` card and meta/status/rule lines
  around the result, the global header.
- **WP37 R3 (streaks, branch `wp37-streaks`):** `#/streaks` restored to
  `plans/wp-36-boards/Streak.dc.html` 2026-10-22: tinted tiles (number before label),
  "October" + "19 played · 3 perfect" on one line, Monday-first grid with the perfect-week
  bar (`perfectWeeks` in `shared/streaks.ts`; a week that straddles two months draws as
  plain cells), board legend, "Next badge" card, pinned grace sentence. Not on the board,
  kept: month arrows as 44 px circles on the legend row (the legend sits 15 px lower than
  drawn), backfill tick, cell links. Floor: below 376 px the grid bleeds 4 px into each
  gutter so a cell stays 44 px. The page eyebrow stays until R1's header offers
  `setTitle`/`setLeft`; `history.ts` inherits the Monday start.
- **WP37 R4 (Connections, branch `wp37-connections`):** the Game board restored literally:
  no card, h1 with accent mistake dots, tier bars 14/800 with " · ", 64 px tiles with the
  selected tile in the solid accent, status below the grid, Shuffle · Clear · Submit
  (`1fr 1fr 1.4fr`, Submit tinted until four), the shared `.game-rule` as a box. The DAY
  chip stays in the heading row until the header takes a right slot (R1). Exceptions:
  the plum bar ink is `#06030a` (4.55:1; the board draws no plum bar), tiles drop one
  size under 375 px so eight letters fit, `--body` added to `tokens.css` for R1 to own.
- **Globe country picker (2026-10-23):** the native `<datalist>` drew no suggestions in
  the Polkadot app's webview, so players had no list to pick from. Replaced with an ARIA
  combobox (`createCountryPicker` in `games/globe/view.ts`): tap/focus opens every
  country A–Z, typing filters (`matchCountries`: prefix matches first, then contains),
  guessed countries stay in place greyed with "guessed" and cannot be picked; arrows,
  Enter and Escape work. Picking fills the input; Guess spends the guess. The list opens
  upward over the globe so the phone keyboard never covers it, and scrolls inside itself
  (D18 checked at 360×780 and 1440×900). `applyGlobeGuess` now refuses a repeat country
  without spending a guess.
- **Drawer activity colours (2026-10-23):** the hamburger's activity strip now draws a
  day blue (`--streak-blue`) when every roster game was finished on the day itself, the
  archive's all-games rule (D17c, `hubCellState` "all"); gold stays "a game was played".
  Blue days join with a blue connector. A backfilled all-six day stays gold here, as it
  is not blue on the archive either.
- **Hub headline while loading (2026-10-23):** the hub and archive day pages painted
  "Six to play." before the day's bits arrived, then corrected it ("Four to go."), a
  visible wrong count on every archive step. The headline now reads "Loading…" (muted)
  until the read lands, and "Six games." if it fails (the read-error line explains).
- **WP38 (game selection, one streak), in progress 2026-10-23:** decisions D6, D12,
  D17b, D17c amended and D21 added (Shawn); brief `plans/wp-38-game-selection.md`.
  Order: A remove the all-games streak, B selection + Customize + More games, C card.
  - **A done:** `HubStreaks` is `{any, longestAny, finished}`; the gem, `streakAll`,
    perfect days and the all-games run are gone from the pill, badges, archive, streaks
    page (second tile is now "Games finished"), day summary, share text, launcher, card
    face, smoke tool and art (`gem.png` deleted). The pill's ring is gold now.
  - **B done:** `shared/picks.ts` (key `daily-on-dot:picks:v1`, starter Word/Mini/
    Connections, host KV + `localStorage` mirror, `syncPicksWithHost` on boot; host
    wins), `shared/host-store.ts` (the KV helper the card store now uses too),
    `#/customize` (drawer link; last pick cannot be unticked). Hub: picks, then Done
    (any finished game), then a collapsed "More games" (open state per device); the
    headline, bar and day-done panel count picks. Calendars and the drawer strip: blue =
    every pick played, on time or later (`hubCellState` "complete"), gold = any game on
    the day. Result Next and "n of N", share slots, save overlay tiles, launcher rows
    use picks. Visual check at 360 and 1440: hub, Customize, drawer; no horizontal scroll.
- **Branch:** `prototype`
- **Last verified commit:** this commit

## Definition of done (per game)

A game counts toward the total only when **all** hold:

1. Content source exists with ≥1 year of material (or is provably infinite/procedural)
2. Playable end to end on a real device viewport
3. Exactly **one** chain write per game-day (D14), with a test that fails on a second write
4. Fits 360×780 and 1440×900 with no scrolling; no horizontal scroll at any width
5. Archive replay of a past day works, and a recorded day opens read-only
6. Tests cover its rules, each able to fail if the rule changes

## The six games

| gameId | Game | Score (minimised) | Content | Status |
|---|---|---|---|---|
| 0 | Daily Word | guesses | WordRegistry, 1,022 six-letter answers (list #1) | built, tested |
| 1 | Daily Sudoku | seconds | procedural `v1` | built, tested |
| 2 | Daily Chess | attempts | ChessRegistry, 400 puzzles | built, tested |
| 3 | Daily Globe | guesses | bundled country data | built, tested |
| 4 | Daily Mini | seconds | MiniRegistry, 400 grids | built, tested |
| 5 | Daily Connections | mistakes | ConnectionsRegistry, 370 puzzles | built, tested |

Still open for every game: a play-through on a phone, and the Pocket card drawn by a
real host (truapi-host never asks the worker to draw). The card is the approved board
restored (WP37 R5, `wp37-card`): left column 112 (baked "n/6" 64px Fredoka 700 over
"DONE TODAY", streaks at the bottom), right a 3 x 2 grid of whole-tile PNGs 70x95, strip
grey / green while playing / gold at 6/6 / red at risk. Renderer limits taken: the
streak counts are `BodyLargeRegular` in `FgWarning` and `FgPrimary` (no 18px 800 style,
no gold or blue text token; the board's gold and blue live in the flame and gem PNGs);
tile labels are baked, so there is no accessibility text per tile (the renderer has no
aria alternative for an `Image`); tiles are fixed width, so a 288dp-inner phone clips the
third column (the Pixel's 355 fits 352); the card is `BgSurfaceContainer`, not `#15181a`.
The grid is one `FillWidth` child after the fixed-width column: proven for a lone fill
child in a Column, not yet beside a fixed sibling in a Row on a device. Baked from
Fredoka 700 and Nunito 800 latin woff2 (Google Fonts, OFL) that R1 adds to
`app/public/fonts/` as `fredoka-700-latin.woff2` and `nunito-800-latin.woff2`.

## Pre-launch history (2026-07 to 2026-10-21)

The project started 2026-07-27 with three games (Wordle 0, Sudoku 1, Chess 2) and grew in
batches to ten: Nerdle 3, Globle 4, Padlock 5, Waffle 6, Angle 7, Word Search 8, Dodeku 9.
On 2026-10-21 every game was renamed "Daily X" with a new slug (`word`, `math`, `country`,
`code`, `swap`, `angle`, `search`, `sums`), Wordle became Daily Word (one 6-letter word a
day, the ladder's other lengths as local extra rounds), Daily Country became Daily Globe,
and the roster was cut to six: Math, Code, Swap, Angle, Search and Sums were removed. Daily
Mini (5×5 crossword) and Daily Connections (four groups of four) were added the same day,
with their registries and authored content. Scoring v2 landed next: every score is
minimised, no game has a loss state, `DailyScores` keeps per-day histograms, "Top N%" and
a day summary, and two hub streaks (any-game gold, all-games blue).

The cleanup before the first public build (2026-10-21/22) treated the repo as new:

- gameIds renumbered contiguously in roster order (Globe 4→3, Mini 10→4, Connections
  11→5); every per-game switch derives from `GAME_ROSTER`.
- stored-shape migrations removed (Word progress is version 1; prefs drop unknown slugs
  by the roster); internal `Wordle*`/`Globle*` identifiers renamed `Word*`/`Globe*`.
- contracts renamed to their final keys `scores`, `word`, `chess`, `mini`, `connections`
  (`contracts/word`, `word-registry`, `WordRegistry`, `wordListId`); all five are
  required in a deployment record.
- the devnet network, its records and the devnet-only Playwright live-E2E suite were
  deleted; Paseo Next v2 is the one network.
- every contract redeployed fresh (below). The earlier Paseo Next v2 stack
  (`DailyScores 0x3505…a5d4`, `WordleRegistry 0x7893…7275`, `ChessRegistry 0xcec8…ce70`,
  deployed 2026-10-21 18:16 UTC, 51.81 PAS with its two seeds) is abandoned, not reused.

On 2026-10-22 Daily Word's content was rebuilt as one six-letter word a day: the ladder
of five lengths and its local extra rounds were removed from the contract, the app and
the tools; the answers are curated off chain (wordfreq Zipf ≥ 4.0 ∩ lowercase SCOWL-60 −
LDNOOBW − `shared/wordlists/answer-exclusions.txt`, 1,022 words shuffled with seed
20261022; `answers-review.md` lists them in day order) and the guess list is ENABLE ∪
SCOWL-70 ∪ answers (15,873). List #0 (v1, 1,062 words) shipped "fucked", "batman" and
"google": LDNOOBW and lowercase SCOWL let them through, so the hand-curated exclusions
file was added and v2 sealed as list #1 the same day.
Stored Word progress became version 2; any other shape starts the day fresh.

The WP briefs in `plans/` and the catalog `games.md` are kept as history. The per-WP
verification notes that used to live here are in the git history of this file (up to
commit `df7c439`).

## Toolchain

- Rust `nightly-2026-02-01` (rustc 1.95.0-nightly `905b92696`); `cargo pvm-contract`
  v0.3.0 from `paritytech/cargo-pvm-contract` rev `d886ab2`
  (the rev every contract `Cargo.toml` pins for `pvm_contract`);
  `pallet-revive-uapi` 0.10.1, `polkavm-derive` 0.31.0, `picoalloc` 5.2.1, `alloy-core` 0.8.26.
- The globally installed `cargo-pvm-contract` v0.4.0 (main) cannot build these contracts:
  its build no longer sets `PVM_ENTRY_POINT_CRATE`, so the pinned macro emits no
  `#[global_allocator]` (link error), and its ABI step needs an `abi-gen` feature the crates
  do not declare. Install the pinned CLI with
  `cargo install --git https://github.com/paritytech/cargo-pvm-contract --rev d886ab2aa80ffdd0e66133320bcbb4921ff2fc8c cargo-pvm-contract --root <dir>`
  and run `<dir>/bin/cargo-pvm-contract pvm-contract build` in each contract folder.
- App: Vite 7, TypeScript 5.9, Vitest 3, pnpm 10.33, Node ≥ 22. Host SDK packages pinned in
  `app/package.json`; `bulletin-deploy` 0.23.0; `truapi-host` 0.26.0 for the smoke tests.
- Artifacts (sha256 of `.polkavm`, built 2026-10-22 00:37 UTC): scores `e5df16d0…9d6f6`
  (28,104 bytes), chess `1fb2b5dd…9640c3` (31,100), mini `86ac66e4…347fee` (32,350),
  connections `9be52b92…234a51` (33,817); word `b48f2d96…815791` (29,204, built
  2026-10-22 07:10 UTC, one word a day). `contracts/logic` `cargo test`: 57 green.

## Current deployment — Paseo Next v2 (2026-10-22)

- Network `paseo-next-v2`, `wss://paseo-asset-hub-next-rpc.polkadot.io`, genesis
  `0x4349b00e…bb57a`. Deployer and content owner: shared dev account `//4`,
  `5Fuf9FMKzP7X2pcmzGKogjp5v3UPg9db5crAQfKq194CzT3t`
  (H160 `0xa77dbc1dd83e38009e7d7766f2e4889709c52fe1`).
- Contracts (finalized block):
  - `DailyScores` `0xd73e83ed956dfe25f1cc5a17cba73fc7263486e3` (#2115536)
  - `WordRegistry` `0xb31cbec3f1fee095d18c82e53143a9ef65155830` (#2127374, redeployed
    2026-10-22 07:20 UTC for the one-word-a-day content; the first `WordRegistry`
    `0x9eed…defa` and its ladder list are abandoned)
  - `ChessRegistry` `0x4775352f3993d66cf7d562c91f730d11973cf0aa` (#2115566)
  - `MiniRegistry` `0x085b864b03ed14bf0b24b60538267d433914c166` (#2115582)
  - `ConnectionsRegistry` `0xcf098c719f63d7bef5c90d1436f41c0d525696af` (#2115597)
  Record: `app/src/deployments/paseo-next-v2.json` plus five `paseo-next-v2-*.abi.json`.
- Score kinds (`pnpm set:game-kinds`, from the roster): Sudoku 1 and Mini 4 are Seconds;
  the rest read as Count.
- Content (sealed by `//4`, 2026-10-22 UTC): Word list **#1** "Daily Word answers v2"
  (1,022 six-letter words, `startDay` 294, 16 batches of up to 64; list #0 "v1" is
  abandoned), chess set #0 (400 puzzles, 50 batches, 01:37), Mini set #0 (400 grids, 50
  batches, 02:03), Connections set #0 (370 puzzles, 47 batches, 02:28). Every batch was
  confirmed by the on-chain count before the next; every seed exited 0.
- Cost: `//4` went 164.21 → 158.98 PAS for the five deploys and two kind writes (5.23),
  then 38.88 (Word, ladder list), 9.20 (chess), 11.48 (Mini), 13.10 (Connections) for
  the seeds: **77.89 PAS**; `//4` was topped up by 80 PAS from the `//0` treasury
  (`dev-accounts fund 4 ah 80`, block #2116394) mid-run. The Word redeploy and reseed
  (one word a day) took **23.81 PAS** (166.28 → 142.47).
- Verified 2026-10-22 07:30 UTC: `pnpm verify:deployment` (five probes, ABIs match the
  builds), `pnpm verify:live-reads` (`currentDay` 294, `wordForDay(0, 294)` = `gender`,
  `getDay`, `histogram(0, 294)`). Earlier the same day, `pnpm smoke:record` through a
  real `truapi-host` 0.26.0 with the phone identity as product account
  `dailyondot.paseo/0` (`5DMSJqZK…zRNiz`): `record(2, 294, 1, true)` landed in 4 s,
  `getDay` shows the bit, the histogram total went 0 → 1 in bucket 1; PGAS 48.08 → 46.82,
  PAS 0.
- Checks on this commit: `pnpm --filter daily-on-dot-prototype test` 60 files / 378 tests;
  `tsc --noEmit`; `typecheck:tools`; `build:paseo` (the bundle carries all five addresses);
  `pnpm pocket:build`; `pnpm smoke` (7 ok).

## Published site

- `dailyondot.paseo` on Paseo Next v2 (https://dailyondot.paseo.li), owner `//4`, with
  subnames `app.` and `worker.`; registered 2026-10-21 for 11 PAS. Last publish
  2026-10-22 07:34 UTC from `dae1efb` (one word a day): app
  `bafybeihf5utof2wwbqggdjueznqyoyphnphgf4knlamlbdz45yqexr6vbq` (root contenthash tx
  `0x216188…f60fde` #2127763, `app.` tx `0x0ecb8a…b38dcd`), worker
  `bafybeigxhvsiwee4szjspo7owj2mfrnbaxi2xmnaohhs5ztaju6d2hlule` (`worker.` tx
  `0x655093…3f607a`); `pnpm pocket:publish` read back "Already published".
  To republish:
  `pnpm --filter daily-on-dot-prototype build:paseo && pnpm pocket:build`, then
  `DEPLOY_DOMAIN=dailyondot.paseo MNEMONIC=<env> BULLETIN_DEPLOY_TELEMETRY=0 pnpm exec bulletin-deploy --config deploy/bulletin-deploy.config.ts app/dist dailyondot.paseo --env paseo-next-v2 --js-merkle --derivation-path //4`.
- Bulletin retention is about two weeks: republish before it lapses.

## Deferred (deliberate, not forgotten)

- Community submissions + blocklist — phase 3 (the registries already let any account
  create, fill and seal a set).
- A Playwright E2E suite against Paseo Next v2 with a funded account (the devnet one was
  removed in the cleanup).
- An editorial second read of the Connections and Mini content.

## Standing assumptions

- **Content bar:** content is derived from public-domain or permissively licensed sources,
  validated by script, and spot-checked — never model-fabricated to hit a count. Mini and
  Connections content was written by hand for this project.
- **Network:** Paseo Next v2 only. `DAILY_NETWORK` defaults to it.
- **Chain timing:** 2 s blocks; finality lags the best block by about 14 blocks. The deploy
  and seed scripts wait for finality (about 25–30 s a write); the app reads at the best block.
