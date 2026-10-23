# WP13 — End-to-end suite

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

All three batch-1 games are complete and playable against live devnet. This suite proves the
**write** path, which unit tests cannot reach: playing a game must produce a real
`DailyScores.record` transaction whose effect is visible on home and in history.

Mirror `../quizzler/app/e2e/` and its `playwright.config.ts`.

## Critical: isolation and opt-in

E2E **writes to a public testnet** and cannot be undone. Follow quizzler exactly:

1. A separate `pnpm deploy:e2e-contracts` deploying an isolated three-contract stack and
   writing **only** an ignored profile file (quizzler uses
   `app/.quizzler-e2e-contract-address.<network>.json`). It must never modify
   `app/src/deployments/*.json` — a test run must not be able to repoint the player-facing app.
2. The suite requires an explicit opt-in env flag (quizzler uses `LIVE_E2E=1`) and **exits
   immediately without it**.
3. Its own Vite port, distinct from `pnpm dev`. Fail rather than falling back to an active
   player-facing server or profile.
4. Seed the isolated stack with a **small** slice of content — a handful of ladders and
   puzzles, not 365/400. Say how many.

## The suite — `app/e2e/`

Use `@parity/host-api-test-sdk` to supply a test host so the app can sign. One spec per game
plus a hub spec:

- **wordle.spec.ts** — read today's ladder from the isolated registry, solve all five tiers
  through the UI, assert the summary shows `5 OF 5 SOLVED`, and assert exactly **one**
  `record` transaction was submitted.
- **sudoku.spec.ts** — fill the grid from the generator's own solution, assert completion and
  one `record`.
- **chess.spec.ts** — play the stored solution line, assert solved and one `record`.
- **hub.spec.ts** — after the three above, assert home shows all three games complete for
  today, history shows the day as played, and `getDay` returns a bitmap with **exactly bits
  0, 1, 2 set** (`played === 7n`).

Drive the UI, not internals — clicking a real keyboard and board is the point. Reading the
expected answer from the contract to know what to type is fine and expected.

## Acceptance

1. Without the opt-in flag, `pnpm test:e2e` exits immediately and explains why. Show the output.
2. With `pnpm deploy:e2e-contracts` then the flag set, all four specs pass. Report the run output.
3. `git status` clean after a run — no deployment record touched, no content committed.
4. `pnpm test && pnpm build` still green (121 tests) and still no network calls in the unit suite.
5. Each game spec asserts **exactly one** `record` per day, and `hub.spec.ts` asserts
   `played === 7n`.
6. If you cannot run Playwright, say so plainly, commit the suite, and leave execution to the
   PM. Do not claim a passing run you did not observe.

## Out of scope

Publishing (needs DotNS registration — human-gated), batch 2 games. Do not touch contracts,
game logic, or the player-facing deployment record.

## Report back

How isolation works, seeded content size, the real run output or an explicit note you could
not execute it, and anything incomplete. Do not claim success for skipped work.
