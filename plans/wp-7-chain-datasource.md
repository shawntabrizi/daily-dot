# WP7 — Wire the app to the live contracts

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

The app currently runs entirely on the in-memory stub. Replace it with a chain-backed
`DataSource` behind the **same interface** — that seam is the reason the prototype was built
this way, so do not change its shape unless something genuinely does not fit, in which case
stop and report rather than reshaping it silently.

Contracts are live on devnet and seeded. Addresses come from `app/src/deployments/devnet.json`
— never hardcode them.

## Reference implementation

`../quizzler/app/src/main.ts` is a working Triangle product app against the same chains.
Mirror its boot sequence (see its imports and the genesis check around line 2306):

```
HostProvider → SignerManager → createChainClient({ chains: { assetHub } })
→ @parity/product-sdk-contracts for calls
→ requestResourceAllocation, SessionKeyManager, createLocalKvStore as needed
```

Also mirror `../quizzler/app/src/chain-read-retry.ts` — community endpoints fail
intermittently and a daily game must not show an error screen for one dropped read.

## Deliver

1. **`app/src/shared/chain-data-source.ts`** implementing `DataSource`:
   - `currentDay()` → `scores.currentDay()`
   - `wordleLadder(day)` → `wordle.ladderForDay(listId, day)`, returning five words
   - `dayBits(day)` / `dayBitsRange(from, count)` → `scores.getDay` / `getDays`, returning
     `bigint` bitmaps
   - `record(gameId, day, score, solved)` → a signed `scores.record` transaction
   The active list id lives in the deployment record or a constant — state which and why.

2. **Boot** in `main.ts`: host provider, signer, chain client, and a **genesis-hash
   assertion** — the app must refuse to start when connected to a chain whose genesis differs
   from the build target. Copy quizzler's message shape; a silent mismatch is the worst
   failure mode here.

3. **Source selection**: `stub` or `chain`, resolved once at boot. Default to `chain` in the
   built app; tests and `pnpm dev` must be able to force `stub`. Say how it is selected.

4. **Read resilience**: bounded retry with backoff on transient read failure. A failed read
   shows a retry affordance, never a blank screen.

5. **Write path**: `record` submits, waits for inclusion, and reports success or failure to
   the UI. On failure, local progress must survive (D15) and the player must be able to
   retry — losing a completed ladder because one transaction failed is unacceptable.

## Constraints — do not break these

- **D7**: home renders fully before any chain read resolves. The existing test asserting this
  must keep passing.
- **D14**: exactly one `record` per game-day. The existing single-write test must pass
  unchanged in meaning.
- **No network in tests.** Every existing test keeps using the stub; add no live calls to the
  suite.
- Bitmaps stay `bigint` end to end (D5) — the ABI returns `uint64`, so convert deliberately
  and test bits 53–63 survive the boundary.

## Acceptance

1. `pnpm test && pnpm build` green; report the test count. No test performs a network call.
2. `pnpm dev` with the stub still works exactly as now.
3. A short **manual verification script** under `app/scripts/` that reads
   `currentDay`, `ladderForDay`, and `getDay` from the live devnet deployment and prints
   them. Report its real output. This is how we prove reads work rather than asserting it.
4. Genesis mismatch refuses to boot — test with a deliberately wrong expected hash and
   report what the user sees.
5. Home renders before chain reads resolve (existing test).
6. Bits 53–63 survive the `uint64` → `bigint` boundary (test).
7. Report exactly what remains unwired, if anything.

## Out of scope

Sudoku and Chess game screens (WP10/WP11), publishing (WP12), E2E (WP13). Chess reads may be
stubbed if `chessPuzzle` is not yet on the interface — say so if you leave it out.

## Report back

What you wired, the manual script's real output, how source selection works, what the genesis
mismatch shows, and anything incomplete. Do not claim success for skipped work.
