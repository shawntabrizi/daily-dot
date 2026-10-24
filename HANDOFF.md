# Handoff: get the live site up to date (2026-10-24)

Everything since the initial release (`c47ac10`) is on `claude/wizardly-feynman-bla8pm`,
PR shawntabrizi/daily-dot#1 into `main` (there is no `master`). Locked decisions changed:
D6, D12, D13, D17b, D17c, D20, D21 amended; D22–D25 new (see `AGENTS.md`, briefs
`plans/wp-38`…`wp-41`, `PROGRESS.md`). Delete this file in the last commit.

## What changed on the branch (21 commits on top of `main`)

- Globe country picker, drawer completion colours, hub "Loading…" headline.
- WP38: per-player game picks (`#/customize`, "More games"), one streak (the
  all-games streak and perfect days removed), Pocket card draws the picks.
- WP39: Daily Code (6) and Daily Angle (7); the card shows six tiles with a "+".
- WP40: **`DailyScores` contract changed**: per-game bucket specs
  (`setBucketSpec` / `bucketSpec`, set once) replace `setGameKind` / `gameKind`;
  scores can be lower- or higher-better; the distribution is a smooth curve.
  Daily Color (8).
- WP41: Daily Sound (9).
- Legacy cleanup: `pnpm pocket:publish` removed (bulletin-deploy 0.23.0 is pinned).

## Steps

1. **Merge.** Review PR #1, then merge it into `main`. `git checkout main && git pull`,
   `pnpm install --frozen-lockfile` at the root.

2. **Check locally.**
   ```bash
   cd app && pnpm exec tsc --noEmit && pnpm typecheck:tools && pnpm exec vitest run && pnpm build && cd ..
   pnpm pocket:test && pnpm smoke && pnpm pocket:assets && pnpm pocket:build
   cargo test --manifest-path contracts/logic/Cargo.toml
   ```
   Expected: 685 app tests, 25 pocket, 62 Rust, all green.

3. **Build the new `DailyScores`** (same pinned toolchain as before).
   ```bash
   (cd contracts/scores && cargo pvm-contract build)
   ```
   The other four contracts did not change; do not rebuild or redeploy them.

4. **Redeploy only `DailyScores`** (deployer `//4`).
   ```bash
   cd app
   export DAILY_NETWORK=paseo-next-v2 DAILY_DEPLOY_DERIVATION=//4 DAILY_DEPLOY_MNEMONIC=<mnemonic>
   pnpm deploy:contracts --only scores
   ```
   This writes a new address and ABI into `app/src/deployments/paseo-next-v2.json`
   and a new `paseo-next-v2-scores-*.abi.json`. Commit both. All recorded scores
   and streaks start over (no players yet: expected).

5. **Set the bucket specs** (owner = deployer; each spec can be set only once, so dry-run first).
   ```bash
   pnpm set:bucket-specs -- --dry-run   # expect all 10 games "unset → set"
   pnpm set:bucket-specs
   pnpm set:bucket-specs -- --dry-run   # expect all 10 "already set"
   ```
   The specs come from `app/src/shared/roster.ts`: counts `{1,32,31}`,
   seconds `{0,1815,121}`, points (Color, Sound) `{0,500,100}`.

6. **Verify the chain side.** `pnpm verify:deployment && pnpm verify:live-reads`.
   Optional: `pnpm smoke:record` (root) records one score with a test account.

7. **Publish the site and the card.**
   ```bash
   pnpm --filter daily-on-dot-prototype build:paseo && pnpm pocket:build
   DEPLOY_DOMAIN=dailyondot.paseo MNEMONIC=<mnemonic> BULLETIN_DEPLOY_TELEMETRY=0 \
     pnpm exec bulletin-deploy --config deploy/bulletin-deploy.config.ts app/dist dailyondot.paseo \
     --env paseo-next-v2 --js-merkle --derivation-path //4
   ```
   Record the new CIDs in `PROGRESS.md` as earlier deploys did.

8. **Check on a phone**, in the Polkadot app at https://dailyondot.paseo.li: the hub
   (Word, Mini, Connections, Code picked), Customize, every new game (Code, Angle,
   Color, Sound with sound on and the iOS silent switch tested), a finished game's
   result curve, and the Pocket card (picked tiles, "n/k", the "+" with 7+ unfinished).
   Nothing here has been checked on a device yet.

9. **Commit** the deployment record, `PROGRESS.md` (new address, CIDs, what was
   checked on the device) and the removal of this file; push to `main`.

## Open choices for Shawn (not blocking)

- **Rename** to `dailydot`: a plain 8-letter name needs PoP Full; with PoP Lite use
  `dailydotNN.paseo`. A new name means new player accounts. Update
  `app/src/networks.ts`, `tools/host-smoke.mts`, tests and docs that say
  `dailyondot.paseo`, then publish under the new name (step 7 with the new domain).
- **Daily Sound tolerance**: 0.5 ERB (2.52 for 173.83 vs 190.36 Hz) or Dialed's ≈0.515
  (2.74). One constant in `app/src/games/sound/engine.ts`; change before first play.
- Cosmetic, logged in `PROGRESS.md`: count-game curves sit in the left fifth of the
  chart; Color's board is a tall card at 1440; one unidentified 404 in the console.
