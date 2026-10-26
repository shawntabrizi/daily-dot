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
  - **C done:** the worker reads `daily-on-dot:picks:v1` beside the checklist and the
    face draws the picks (rows of three, short row padded with blanks; six at most,
    `face.ts` throws if the roster outgrows that) with `count-<n>-of-<k>.png` (27 new
    PNGs; the old `count-<n>.png` deleted). Strip: gold = every pick, green = any game.
    `pnpm smoke` gained a picks step. Not verified: the face on a device; the existing
    tile PNGs were not re-baked (this sandbox's Chromium renders them byte-different).
  - **Legacy cleanup (no players yet, Shawn 2026-10-23):** removed the
    `daily-on-dot:autosign:v1` removal on load and its test, and
    `tools/publish-pocket-cards.mts` / `pnpm pocket:publish` (only needed with
    bulletin-deploy <= 0.22; the repo pins 0.23.0).
- **WP39 (Daily Code, Daily Angle, card overflow), in progress 2026-10-23:** D12/D21
  amended, D22/D23 added (Shawn); brief `plans/wp-39-code-and-angle.md`. Angle ships
  without Angledle's six-guess cap (D13: no loss state) unless Shawn changes D13.
  - **Games done:** `games/code` (engine with multiplicity-correct pegs, seeded v1
    generator via the new `shared/seeded.ts`, progress, view with a number pad and
    physical keys) and `games/angle` (hints at 5/15/30°, v1 generator with a daily
    rotation, SVG drawing with the reflex arc the long way, `noValidate` form so the
    game's message shows instead of the webview bubble). Roster entries, accents
    (Code coral `#e5534b`, Angle lime `#b5c934`, both theme blocks), glyphs, hub hooks,
    progress lines, routes, result-page rules; starter picks now include Code;
    `COUNT_WORDS` to Twelve. Test helper `pickSixGames` (was `pickAllGames`). Checked
    in Chromium at 360×780 and 1440×900 with 7–8 guesses: no page scroll.
  - **Card done:** `cardTiles` (unfinished picks first, then finished, six at most; five
    and `tile-more.png` past six unfinished), the roster guard removed; art for Code,
    Angle, "+" and `count-<n>-of-<k>` up to 8 (existing PNGs left as committed).
    `pnpm smoke` picks the six originals and adds an all-eight "+" step. Not verified
    on a device.
- **WP40 (bucket specs, score direction, Daily Color), in progress 2026-10-23:** D13 and
  D20 amended, D24 added (Shawn: "we shouldn't force that every game aims to zero");
  brief `plans/wp-40-bucket-specs.md`; parity vectors `shared/bucket-test-vectors.json`.
  Run by subagents: A contract, B app, then C Daily Color. `DailyScores` redeployed and
  `set-bucket-specs` run 2026-10-24 (see Current deployment).
  - **A done (`dc3376f`):** `contracts/logic` `BucketSpec` (private fields, `new` validates
    1–128 buckets and max > min, `DEFAULT` {1, 32, 31}, `bucket`), `GameKind` gone;
    `DailyScores` `setBucketSpec` (owner, set-once) / `bucketSpec` view, 0-based buckets.
    62 host tests incl. the parity file; `cargo pvm-contract build` succeeds with
    nightly-2026-02-01 (28,698 bytes). No runtime test harness for the contract: owner,
    set-once and the 0-based histogram read are checked by review only. Left for later:
    `logic::better_count` / `top_percent` still assume lower-better (unused by the
    contract; the app ranks).
  - **B done:** roster `better` + `buckets`; `percentile.ts` `scoreBucket(spec)` with the
    parity test, direction-aware `betterCount` / `percentileFor` (tests fail if direction
    flips, using a points stand-in game); `distribution.ts` is a smoothed SVG curve with
    spec end labels, the player's tick, the better share shaded, an aria sentence;
    `set-bucket-specs.ts` (`pnpm set:bucket-specs [-- --dry-run]`, checks all games before
    writing; not run). 0-based buckets throughout. All app/pocket checks green.
    Cosmetic, logged not fixed: on count games the hump sits in the left fifth of the
    curve because the axis spans 1–31+.
  - **C done (Daily Color, gameId 8, `#/g/color`):** `games/color` engine (HSB→sRGB,
    sRGB→CIELAB D65, CIEDE2000, `scoreForDelta` 10 × max(0, 1 − ΔE00/40) in tenths),
    seeded v1 generator (own salt; hue 0–359, S 25–100, B 30–100), progress (rounds
    done + guesses; the round in hand is not stored, so a reload restarts its 5 s look),
    view (5 s full-board look with a countdown; three `role="slider"` columns with
    aria-valuetext, drag by pointer capture, arrows/PageUp/PageDown/Home/End; reveal
    beside the guess with x / 10; total / 50 with the five pairs; the one write fires on
    "See your total", or on load if the day is complete and unsaved). Roster `points`,
    `higher`, `{0, 500, 100}`; not a starter pick. Accent sky `#2fb1e4` (both theme
    blocks), glyphs, hook, "n of 5 colours", route, home/launcher/result rules, card
    tiles and `count-<n>-of-9` (existing PNGs restored). Tests: all 34 Sharma pairs,
    Lab/HSB values, score rounding and clamp, frozen v1 days, ranges, progress, view with
    fake timers. Roster-size tests updated (chips, More games, picks, headline Nine,
    day-summary means, card tiles). README game table now lists Code, Angle and Color.
    Checked in Chromium at 360×780 and 1440×900 (look, sliders, reveal: no page scroll;
    final result scrolls as the result page does). Not verified: on a device or in the
    host; the read-only state was checked by unit test only, not in the browser.
- **WP42 done (Daily Globe: the 197 countries, D26; superset/subset model per Shawn),
  2026-10-25:** Places are **one superset plus two editorial subsets**. `core.json` is
  every Natural Earth **1:50m** admin-0 feature but Antarctica and Siachen (240 places,
  `{id, name, aliases, kind, owner, lat, lng, continent}`); `shapes.json` is `{id, rings}`
  for each. `kind` is sovereign for the 197 `countries` NAMEs in `globe-countries.json`
  (never a `TYPE` filter, so Cuba, Kazakhstan, Israel, Kosovo, Palestine, Singapore,
  Malta, Vatican… are in), otherwise disputed (5) or territory (38); `owner` from
  `SOVEREIGNT` with Somaliland → Somalia, N. Cyprus → Cyprus, W. Sahara → Morocco. `id`
  is `ISO_A3_EH` / `NAME` on `-99` / `NAME` where a code is shared and `ADM0_A3` is not
  its holder (two Australian territories are `AUS`), so it never depends on the config.
  `globe-countries.json` gains `guessable` (ids, the 197) and `answers` (`{id, since,
  until?}`, the 197 at `since: 0`). The picker accepts `guessable` only. A guessable
  place is drawn by its own mark; any other place is drawn `--neutral` when its owner is
  guessed or revealed (Greenland with Denmark), so making Hong Kong guessable is
  config-only. **v1 answer rule:** cycle `k` starts on its day (0 for cycle 0), takes the
  pool active that day (`since <= start < until`) sorted by id, shuffles it with the v1
  PRNG seeded `k`, lasts one day per answer; cycle starts are walked once and cached
  (O(cycles)). Adding a place or a guessable id changes nothing; a future `since`/`until`
  changes only cycles starting on/after it (tests (a)–(c) in `generate.test.ts`). Globe
  v1 answers re-pinned (day 0 Central African Republic, 208 Netherlands; rewrite before
  first play, D11). Readable names (`NAME_LONG` where `NAME` abbreviates, "Eswatini"),
  `aliases` (D26 list + the NE name) matched folded (`games/globe/names.ts`); "Seven
  seas" continents mapped to Asia/Africa. Shapes: Douglas–Peucker (half a grid step) +
  0.1° grid; a place's last ring kept on a finer grid (32, incl. Vatican, Monaco, San
  Marino); a marked guessable place under 4 px at the current zoom also gets a
  label-point dot. `shapes.json` 99,781 → 276,439 bytes; `core.json` 20,193 → 46,279;
  main chunk 868.71 → 1,070.68 kB (gzip 282.99 → 339.64 kB). Generators rerun
  byte-identical; `--input`/`NE_GEOJSON` kept, `--countries` replaced by `--list` (the
  config). **Verified:** tsc, `typecheck:tools`, vitest (717), build, `pocket:test`,
  `smoke`; Chromium 360×780 and 1440×900 (`app/test-results/wp42/`, not committed):
  Singapore guessed shows as a dot, Denmark shows Greenland neutral, "Burma" lists as
  Myanmar, no page scroll. **Not verified:** the phone/Polkadot app webview; the dot and
  territory fill under zoom on a real device.
- **WP41 done (Daily Sound, gameId 9, `#/g/sound`, D25), 2026-10-23:** `games/sound`
  engine (ERB-rate `21.4·log10(1 + 0.00437 f)`, per tone `10 × max(0, 1 − ΔERB/0.5)`
  shown to hundredths; recorded score = the five shown hundredths summed, then rounded
  half up to tenths, 0–500), seeded v1 generator (own salt; log-uniform 110–880 Hz to
  the hundredth), progress (tones done as Hz; the round in hand is not stored, so a
  reload restarts that tone's one listen), `audio.ts` (the only Web Audio code: context
  made on the first tap and resumed when suspended; 2 s sine with 40 ms fades; a live
  tone for drag and keys), view (Listen plays the target once; the whole black board is
  a `role="slider"` pitch control, aria-valuetext "220.00 Hz", log-scale vertical, tone
  live while held; arrows ±1 cent, Shift ±50; Submit; dialed.gg-style reveal: "n / 5",
  score to two decimals, verdict, TARGET and YOURS in Hz, arrow to go on; total / 50 with
  the five tones; the one write fires on leaving the fifth reveal, or on load if the day
  is complete and unsaved; a recorded-elsewhere day lists the five targets read-only;
  a message instead of the board when Web Audio is missing or blocked). Roster `points`,
  `higher`, `POINTS_BUCKETS`; not a starter pick. Accent indigo `#7f6df2` (text
  `#988af5` dark / `#5243c4` light), both theme blocks, glyphs, hook "Five tones by ear",
  "n of 5 tones", route, home/launcher/result rules, card tiles and `count-<n>-of-10`
  (existing PNGs restored). Tests: ERB and score at known points (173.83 vs 190.36 Hz →
  2.52), clamp and exact match, rounding, cents/log mapping, frozen v1 days and range
  over 2000 days, progress, view with the audio module mocked. Roster-size tests now
  count ten games. Checked in Chromium (real Web Audio, headless) at 360×780 and
  1440×900: listen, find (drag + keys), reveal: no page scroll; the final result
  scrolls as every result page does. Not verified: actual audible output (headless has
  no speakers), a real device or the host, iOS's silent switch; read-only state by unit
  test only. Logged, not fixed: the 0.5 ERB tolerance is the brief's round choice
  (dialed.gg's looks nearer 0.515) — tune before first play.
- **Rules popup and Color Start (2026-10-24, Shawn):** a (?) in every game's header
  opens "How to play" (`shared/ui/rules.ts`: two or three steps per game, each a small
  picture and one line, then how it scores); Escape, the close button, the backdrop or
  "Got it" close it and focus returns to the (?); keys do not reach the game while it is
  open. Daily Color no longer starts its 5 s look on page load or reload: a "Ready? /
  Start" board first (Sound already waits for its Listen tap). Checked in Chromium at
  360×780 and 1440×900, no page scroll. Not checked on a device. The rename to
  `dailydot` is dropped (Shawn); the name stays `dailyondot.paseo`.
- **Sound loudness (2026-10-24, Shawn: low tones too quiet, high too loud):** the gain now
  follows 75% of the ISO 226 40-phon equal-loudness contour (`levelFor` in
  `games/sound/audio.ts`: 0.45 at 110 Hz down to 0.06 at 880 Hz, was a flat 0.25), and
  the live drag tone follows it as the pitch moves. The tone gains soft 2nd and 3rd
  harmonics so phone speakers, which barely play 110 Hz, still carry the pitch; scoring
  is unchanged. Not yet heard on a device: tune `COMPENSATION` / `PEAK_LEVEL` by ear.
- **Angle on-screen pad (2026-10-24, Shawn: the keyboard covered the hints):** Angle's
  number input opened the phone keyboard over the hint list and refocused after every
  guess. It now has a readout and a two-row pad (`1–5 ⌫ / 6–0 Guess`), physical keys on
  desktop, hints between the drawing and the pad. Checked at 360×780 (three hints show),
  360×640 (newest shows, the rest scroll) and 1440×900, no page scroll. Only Angle and
  Globe ever opened the system keyboard; Globe needs typing to search, but its input is
  rebuilt unfocused after a guess, so the keyboard closes and the list shows. Not
  checked on a device.
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
  - `DailyScores` `0x16fda8975e27d4b32bf6b2884b371a4bd56b794d` (#2205679, redeployed
    2026-10-24 for WP40 bucket specs; the first `DailyScores` `0xd73e…86e3` and its
    scores are abandoned)
  - `WordRegistry` `0xb31cbec3f1fee095d18c82e53143a9ef65155830` (#2127374, redeployed
    2026-10-22 07:20 UTC for the one-word-a-day content; the first `WordRegistry`
    `0x9eed…defa` and its ladder list are abandoned)
  - `ChessRegistry` `0x4775352f3993d66cf7d562c91f730d11973cf0aa` (#2115566)
  - `MiniRegistry` `0x085b864b03ed14bf0b24b60538267d433914c166` (#2115582)
  - `ConnectionsRegistry` `0xcf098c719f63d7bef5c90d1436f41c0d525696af` (#2115597)
  Record: `app/src/deployments/paseo-next-v2.json` plus five `paseo-next-v2-*.abi.json`.
- Bucket specs (`pnpm set:bucket-specs`, from the roster, set once 2026-10-24; the
  second dry-run reads "already" for all ten): Word, Chess, Globe, Code, Angle
  {1, 32, 31}; Sudoku, Mini {0, 1815, 121}; Color, Sound {0, 500, 100}; Connections
  {0, 32, 32}, because it scores mistakes and a perfect board (0) needs its own bar
  (`MISTAKE_BUCKETS`; the handoff's {1, 32, 31} would have merged 0 with 1).
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
- Verified 2026-10-24 03:20 UTC: `pnpm verify:deployment` (five probes, ABIs match the
  pinned v0.3.0 builds), `pnpm verify:live-reads` (`currentDay` 296,
  `wordForDay(2, 296)` = `pepper`, `getDay`, `histogram(0, 296)`). App checks: 84 files /
  686 tests, `tsc --noEmit`.
- Checks on the 2026-10-22 commit: `pnpm --filter daily-on-dot-prototype test` 60 files / 378 tests;
  `tsc --noEmit`; `typecheck:tools`; `build:paseo` (the bundle carries all five addresses);
  `pnpm pocket:build`; `pnpm smoke` (7 ok).

## Published site

- `dailyondot.paseo` on Paseo Next v2 (https://dailyondot.paseo.li), owner `//4`, with
  subnames `app.` and `worker.`; registered 2026-10-21 for 11 PAS. Last publish
  2026-10-24 03:22 UTC from `b333d3a` plus the Connections spec (WP39, WP40): app
  `bafybeibblzodlgzrmd2gkszy5d45sxdwernrax52quyg5jjvoivfhekvzi` (root contenthash tx
  `0x3dfa76…6501ea5d8` #2206057, `app.` tx `0x2020da…a255773a9`), worker
  `bafybeifb3m2ac2ec3b57ndoug5bbqqwdnlhqd43wj4onwms6drufgqcdqu` (`worker.` tx
  `0xc5be1e…e84e76df13a`). The publish before it, 2026-10-22 07:34 UTC from `dae1efb`: app
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
