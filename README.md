# Daily on Dot

> [!WARNING]
> The following is a proof-of-concept. This open source code is provided for research, experimentation, and developer education only. This code has not been audited, is actively experimental, and may contain bugs, vulnerabilities, or incomplete features. Use at your own risk and obtain legal advice as appropriate - DYOR.

Parity doesn’t deploy the code but may update it based on community feedback.

If you experience problems with any product or service that was built on or deployed from this code, you should contact the third party who deployed the code in its amended form, not Parity.

A hub of daily puzzle games on Polkadot. `AGENTS.md` is the short rule set,
`PLAN.md` the design, `PROGRESS.md` the ledger.

```
app/        Vite + TypeScript. The hub and the six games.
pocket/     The Pocket worker. Streams the daily checklist card face to the host.
contracts/  The PolkaVM contracts: DailyScores and the four content registries.
shared/     Content sources (Word answers, chess puzzles, Mini grids and clues,
            Connections groups, country data), validated offline.
deploy/     bulletin-deploy product config (app + worker + pocket.cards).
tools/      Pocket assets, worker smoke tests, the record smoke, card publisher.
```

The repo is a pnpm workspace (`app`, `pocket`, root tools) so the app, the
worker and the smoke tests resolve one copy of the host SDK.

```bash
pnpm install
pnpm --filter daily-on-dot-prototype test     # app unit tests
pnpm --filter daily-on-dot-prototype build    # app (DAILY_NETWORK defaults to paseo-next-v2)
pnpm pocket:art                               # bake the card art (PNG, via Playwright)
pnpm pocket:build                             # preview face + worker + ASCII check
pnpm pocket:test                              # card face unit tests
pnpm smoke                                    # the worker against a fake host
```

## Games

One route each (`#/g/<slug>`). `gameId` indexes the on-chain bitmaps and is
frozen from first public play (`app/src/shared/roster.ts`); the roster is the
one source of ids, slugs and score kinds.

| gameId | Game | Score | Content |
|---|---|---|---|
| 0 | Daily Word | guesses | WordRegistry (sealed list of 1,022 six-letter answers, `shared/wordlists`) |
| 1 | Daily Sudoku | seconds | procedural, frozen `v1` generator |
| 2 | Daily Chess | attempts | ChessRegistry (400 Lichess-derived puzzles, `shared/chess`) |
| 3 | Daily Globe | guesses | bundled reference data (`shared/countries`) |
| 4 | Daily Mini | seconds | MiniRegistry (400 authored 5×5 crosswords, `shared/mini`) |
| 5 | Daily Connections | mistakes | ConnectionsRegistry (370 authored 4×4 group puzzles, `shared/connections`) |

Third-party content: Daily Word's answers are the six-letter words with a
wordfreq Zipf frequency ≥ 4.0 (wordfreq 3.1.1, data CC BY-SA 4.0 crediting
SUBTLEX and Google Books Ngrams; the export is `shared/sources/wordfreq-en-six.txt`)
that SCOWL size 60 lists lowercase (English Speller Database, Kevin Atkinson,
MIT-like licence kept in `shared/sources/scowl-60-us.txt`), minus LDNOOBW (CC0),
shuffled with seed 20261022 (`pnpm --filter daily-on-dot-prototype generate:wordlists`;
`shared/wordlists/answers-review.md` lists them with flags). Guesses are the
six-letter words of ENABLE (public domain), SCOWL size 70 and the answer list
(`pnpm --filter daily-on-dot-prototype generate:guesses -- <enable1.txt>` regenerates
`app/src/games/word/guesses/6.ts`). Daily Chess draws the Cburnett piece set
(Colin M.L. Burnett, CC BY-SA 3.0, via Wikimedia Commons; `app/src/games/chess/pieces.ts`).
The display face is Fredoka 600 and 700 (Fredoka Project Authors) and the body face is
Nunito 500/700/800 (Nunito Project Authors), both SIL Open Font License 1.1; latin
woff2 subsets self-hosted in `app/public/fonts/`, licences in `OFL-fredoka.txt` and
`OFL-nunito.txt` beside them.
See `shared/sources/README.md` for every source and licence.

Every game writes one `DailyScores.record(gameId, day, score, solved)` at
completion; `score` is minimised and the contract keeps a per-day histogram of
on-time finishers for the "Top N%" view.

## Contracts

Five crates under `contracts/` (`scores`, `word`, `chess`, `mini`,
`connections`), thin PolkaVM shells over the host-testable `contracts/logic`
crate (`cargo test` there). Build each with the pinned `cargo-pvm-contract`
(rev `d886ab2`, toolchain `nightly-2026-02-01`; the current main CLI cannot
build them, see `PROGRESS.md`):

```bash
(cd contracts/word && cargo-pvm-contract pvm-contract build)   # and scores, chess, mini, connections
```

Deploy, set the score kinds, seed and verify on Paseo Next v2 (every write waits
for finality; the seeds resume from the on-chain count):

```bash
cd app
export DAILY_NETWORK=paseo-next-v2 DAILY_DEPLOY_DERIVATION=//4 DAILY_DEPLOY_MNEMONIC=<env>
pnpm deploy:contracts            # all five, one fresh record in src/deployments/
pnpm set:game-kinds              # Seconds for Sudoku and Mini, from the roster
pnpm seed:word && pnpm seed:chess && pnpm seed:mini && pnpm seed:connections
```

`seed:word` seals `shared/wordlists/core.json` as one list. It starts at day 0, so
every past day has a word; the order is anchored at day 294 (`ANCHOR_DAY`), so no
live day changes its word when the list is regenerated. To redeploy only the Word contract: `pnpm deploy:contracts --only word`,
then `seed:word`.

```bash
pnpm verify:deployment && pnpm verify:live-reads
```

The record `app/src/deployments/paseo-next-v2.json` (addresses, ABI files,
content ids) is what the build bundles.

## Pocket card

Streamed-tree Pocket (RFC #609 / host-rust-core #706), the same shape as
paritytech/humanity-spa's Humanity card and Nemanja's pets.

- **The face** is `pocket/src/face.ts`, the approved board
  (`plans/wp-36-boards/Main.dc.html`, "Proposed: scoreboard"; WP37 R5). Two
  columns: left (112dp) the baked `"N/6"` over `DONE TODAY`, and the flame +
  day-streak count and the gem + perfect-day count at the bottom (each only
  when above zero); right a 3 x 2 grid of 70x95 tiles, each one baked PNG
  (the game's accent with ink glyph and uppercase label when done, dark with
  a ring when not; the last reads GROUPS). A strip down the left edge is grey
  at 0/6, green while playing, gold at 6/6, or red when a streak is at risk
  (nothing played today, under 4 h to 00:00 UTC; `stripState()` is pure). No
  percentile. A device that never recorded shows `"0/6"` and "Tap to play".
  Plain `RendererNode` literals; sized for the host's 234dp frame by
  arithmetic (18 + 95 + 10 + 95 + 16 tall; 112 + 14 + 3 x 70 + 2 x 8 = 352 wide
  of a Pixel's 355), not measurement. The renderer has nine theme colours and
  five text styles: the streak counts are `BodyLargeRegular` in `FgWarning`
  and `FgPrimary` (no 18px 800, no blue), and a narrow phone (288dp inner)
  clips the third tile column.
- **The art** is PNG in `pocket/public/tiles/`: `count-0..6.png`,
  `done-today.png`, `flame.png`, `gem.png`, `tile-<id>-{done,idle}.png`.
  `pnpm pocket:art` (`tools/render-card-art.mts`) writes each as the board's
  own HTML/CSS and rasterises it at 3x with the app's Playwright Chromium. It
  needs Fredoka 700 and Nunito 800 latin woff2 in `app/public/fonts/` (or
  `CARD_ART_FONTS=<dir>`). The PNGs are committed; Vite copies `pocket/public`
  into the worker archive.
- **The worker** (`pocket/src/worker.ts`) calls `getPocketManager().drawCard("daily", …)`,
  sends the face while the card is on screen, and repaints only when the
  checklist changes. It computes the day index from the clock on every read,
  so a record from another day draws 0/N.
- **App → worker** goes through the product's host KV store, the only thing
  the two executables share. The app writes `daily-on-dot:card:v1` =
  `{ version: 1, day, played, solved }` (bitmaps as decimal u64 strings) on
  the home's hydrate read and right after every successful `record`
  (`app/src/shared/card-state.ts`, one wrapper around the DataSource). The
  store has no change notification, so a visible card polls every 2 s.
- **Tile buttons** are off. A `Button` per tile with `clickAction: "open:<slug>"`
  exists (`dailyFace(bits, { rowButtons: true })`), validates, and the worker maps
  the action to `navigateTo("polkadotapp://<productId>/#/g/<slug>")`. It ships
  off: a Material button draws its own chrome in place of the icon tile, and the
  whole-card tap already opens the launcher. Untested on a device either way.
- **Tapping the card** opens the app beneath it in a half-height sheet at
  `?card=daily`; there the app renders the launcher (`app/src/card-launcher.ts`):
  the roster's games with today's ticks, no chain client or signer. The games open
  in the full app: a tap writes an open intent (`localStorage` and host KV,
  `daily-on-dot:open-intent:v1`) and asks the host for the product; the full
  app's boot follows a fresh intent before its first route.
- **The offer:** inside a host, the first game recorded on a device shows a
  sheet that opens the host's add-card deeplink
  `polkadotapp://pocket/add?product=<productId>&card=daily` (`app/src/shared/pocket-prompt.ts`).
  Once per device (host KV `daily-on-dot:card:offered`), and never when the
  Pocket already holds the card.
- **The share page:** `#/card` (`app/src/card-page.ts`) shows the add-card deeplink
  as a QR code, as text to copy, and as a button (host) or a plain link (phone
  browser). Share it as https://dailyondot.paseo.li/#/card; Dotli forwards the
  hash into the product frame. Linked from the home page and the offer sheet.
- **Assets:** `pnpm pocket:assets` writes `pocket/public/faces/daily.json`
  (3/6 with streaks 5 and 2, the add-sheet preview) from the face module,
  ASCII-escaped, and validates nine faces (0/6 never recorded, 0/6 recorded,
  3/6, 6/6, with and without streaks, 0/6 red, tile buttons) against the Android
  host's limits (depth 32, 256 KiB) on the text that is written, and checks that
  every image a face names exists under `pocket/public`. `pnpm pocket:build`
  ends with `tools/check-worker-ascii.mts` on the bundle.

## Shipping it

```bash
pnpm --filter daily-on-dot-prototype build:paseo && pnpm pocket:build
DEPLOY_DOMAIN=dailyondot.paseo MNEMONIC=<env> BULLETIN_DEPLOY_TELEMETRY=0 \
  pnpm exec bulletin-deploy --config deploy/bulletin-deploy.config.ts app/dist dailyondot.paseo \
  --env paseo-next-v2 --js-merkle --derivation-path //4
```

bulletin-deploy 0.23.0 (the repo pin) keeps `pocket.cards` on the worker
record; `pnpm pocket:publish` is only needed with an older CLI. The name is
`dailyondot.paseo` (https://dailyondot.paseo.li); the current CIDs and records
are in `PROGRESS.md`. Bulletin retention is about two weeks, so republish
before then.

### What is verified, and what is not

Verified: unit tests for the card state and the offer (`app/src/shared/*.test.ts`)
and for the face (`pocket/test/face.test.ts`: the strip rule and its boundaries,
tile count and labels from the roster, done and idle icons, no percentile);
the worker against the SDK's fake host (`pnpm smoke`: 0/N with "Tap to play",
3/N with three lit tiles after three records, no repaint on no change, streaks
shown and the percentile not, 0/N on a stale day, a red strip for a streak of 3
with nothing played at 23:30 UTC, no faces off screen); every face against
`androidLimits`; the publish on Paseo Next v2
(worker record with `includes.pocket` and `pocket.cards`); the page served
by Dotli (headless Chromium renders the home from the published CID); the
worker against a real headless host (`pnpm smoke:host`: `truapi-host
--execution-kind worker` with `TRUAPI_POCKET_CARDS=daily` lists the card,
takes the renderer registration, and carries the app's KV writes to the
worker, 0/N to 3/N); the app's write path as a product account through a
real headless host (`pnpm smoke:record`: allowance, mapping, `record`, the
histogram total goes up by one).

Not verified: a phone. truapi-host 0.25.0 never asks the worker to draw (it
serves the Pocket list and removals only), so the host-driven draw (the PNG
tiles and the strip included), the tile-button tap, the open-app route form,
the add-card deeplink, and the offer sheet need an Android build with Pocket.

## Security

> [!WARNING]
> The following is a proof-of-concept. This open source code is provided for research, experimentation, and developer education only. This code has not been audited, is actively experimental, and may contain bugs, vulnerabilities, or incomplete features. Use at your own risk and obtain legal advice as appropriate - DYOR.

Parity doesn’t deploy the code but may update it based on community feedback.

If you experience problems with any product or service that was built on or deployed from this code, you should contact the third party who deployed the code in its amended form, not Parity.

Before deploying it for real use cases, you are responsible for:

- Reviewing the code yourself, we publish a reference, not a hardened production build
- Checking that the dependencies are up to date and free of known vulnerabilities
- Securing your own fork or deployment environment (keys, secrets, network configuration)
- Tracking the latest tagged release/commits for security fixes; older releases are not backported (exceptions might apply)

For Parity's security disclosure process, and Bug Bounty program, feel free to visit: https://parity.io/bug-bounty

## License

The code is MIT. See [LICENSE](LICENSE). Content data, fonts and art keep their own
licences (for example the word data is CC BY-SA 4.0); see `shared/sources/README.md` and the
credits above.
