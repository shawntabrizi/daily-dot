# WP5 — Deploy and seed tooling (no content yet)

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Mirror `../quizzler/app/scripts/` and `../quizzler/app/src/networks.ts` closely — they are a
working implementation of exactly this against the same chains.

**Content is deliberately out of scope.** Build the pipes; WP5b fills them.

## Networks

`app/src/networks.ts` — one record per network, holding *everything* that must not drift:
id, label, kind, `chainKey` storage namespace, genesis hash, Asset Hub RPC list, token,
SS58 prefix, DotNS domain, publish CLI.

Two networks, **devnet is the default**:

| id | genesis hash | publish |
|---|---|---|
| `devnet` | `0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2` | `pad` |
| `paseo-next-v2` | `0xbf0488dbe9daa1de1c08c5f743e26fdc2a4ecd74cf87dd1b4b1eeb99ae4ef19f` | `bulletin-deploy` |

Copy the exact values and endpoint lists from quizzler's `networks.ts`. Selected by
`DAILY_NETWORK` env var, defaulting to `devnet`. The module is imported by both the bundle
and Node tooling, so it must not touch `process`, `import.meta.env`, or the DOM — take
quizzler's approach with a `resolveNetwork()` that throws on an unknown id.

DotNS name: `dailyondot.dot` on both networks for now. Add a comment noting it may not be
registrable on both, and that the name derives player accounts, so differing names mean
differing identities.

## Scripts (`app/scripts/`)

- `target.ts` — resolve the active network for tooling; fail loudly on an unknown id.
- `signer.ts` — dev-account signing (`DEPLOY_DEV_ACCOUNT`, default `Alice`) on testnets;
  refuse dev accounts on any `kind: "mainnet"` target and require an explicit mnemonic.
- `deploy.ts` — deploy all three contracts, **waiting for finalized inclusion before
  recording any address**, then write `app/src/deployments/<network>.json` and the generated
  ABIs together, only after every deployment finalizes. Partial success must not leave a
  half-written record.
- `verify-deployment.ts` — check the recorded addresses still answer and their ABIs match
  the built contracts; non-zero exit on mismatch.
- `seed-wordle.ts`, `seed-chess.ts` — **resume-safe** batch seeding from
  `shared/wordlists/*.json` and `shared/chess/*.json`. Use the nonce-based creators from
  WP4, keep a local resume cursor, and be safe to re-run after an interrupted batch without
  duplicating. Accept the content files not existing yet — exit with a clear message.
- `validate-wordlists.ts`, `validate-chess.ts` — fully offline validators. A wordlist entry
  is 6 lowercase-ASCII words of lengths 3–8 in order; a chess entry is a structurally valid
  FEN plus a UCI line. Reuse the same rules the contracts enforce; do not re-derive them
  differently.

Add a `vite.config.ts` build guard: fail the build when the target network has no
`app/src/deployments/<network>.json`, so a bundle can never carry one chain's addresses
while talking to another.

## Acceptance

1. `pnpm typecheck:tools` (add it) passes over every script.
2. `pnpm test && pnpm build` still green (45 tests). `app/src` changes limited to
   `networks.ts`, `deployments/`, and whatever the build guard needs.
3. `pnpm validate:wordlists` and `pnpm validate:chess` run offline and pass on a committed
   **two-entry sample fixture** each (samples only — not real content).
4. Validators reject: wrong word lengths, uppercase, a 5-field FEN, a rank not summing to 8,
   and a 3-character UCI move. One test each.
5. `resolveNetwork` throws on an unknown id; a test proves it.
6. Building with `DAILY_NETWORK` set to a network lacking a deployment record fails with a
   clear error; a test or documented manual check proves it.
7. **Do not deploy anything.** No network calls in tests.

## Report back

What you built, and explicitly: anything that needs credentials, tokens, or a large download
before it can run for real. Do not claim success for skipped work.
