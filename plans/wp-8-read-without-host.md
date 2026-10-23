# WP8 — Reads must not require a host or signer

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

## The defect

Verified in a real browser against live devnet. Opening `#/g/wordle` outside the Polkadot
host shows:

```
Ladder unavailable
Signer connection failed: Host API is not available: not running inside a
Polkadot host container.
```

Reading `ladderForDay`, `currentDay`, `getDay`, and `puzzleForDay` requires **no signature**
— they are `view` calls. Only `record` needs a signer. Today the whole chain client is
constructed through the host signer, so a missing host blocks reads that never needed it.

Consequences: a visitor outside the Polkadot app sees an error instead of a puzzle, and the
app cannot be verified locally in a browser without the full test host.

## What to change

**Separate the read path from the write path.**

1. **Reads** — construct a read-only chain client that does not depend on the host. When the
   host provider is available, keep using it (the Triangle model has the host own
   connectivity, and that stays the preferred path). When it is absent, fall back to a
   direct provider using `networks.ts`'s `assetHubRpc` list, trying endpoints in order.
   Keep the existing bounded retry.

2. **Writes** — unchanged: `record` still requires the host signer. When no signer is
   available, the game is fully playable and the completion is retained locally (D15), with
   a clear message that scores are recorded when opened in the Polkadot app. Do **not**
   invent a non-host signing path.

3. **Genesis assertion still applies on the read path.** A direct-provider read must verify
   the genesis hash before trusting any data — the assertion must not be skippable just
   because the host is absent.

## Acceptance

1. In a plain browser with no host: `#/` shows completion state as "not played" without
   error, `#/g/wordle` **loads today's five-word ladder from chain and is playable**, and
   `#/history` renders the calendar. Report the actual rendered text at each route.
2. Completing a ladder with no signer keeps local progress and shows the
   record-when-in-Polkadot message. It must not lose the result or claim success.
3. With a host present, behaviour is unchanged and `record` still submits.
4. Genesis mismatch still refuses to boot on the read-only path; report what is shown.
5. `pnpm test && pnpm build` green; report the count. Still no network calls in tests.
6. D7 unchanged: home renders before reads resolve.
7. D14 unchanged: one `record` per game-day.

## Out of scope

Sudoku and Chess screens, publishing, E2E. Do not add a dev-account signing path in the
browser bundle.

## Report back

The rendered text at each route in a hostless browser, what the no-signer completion shows,
and anything incomplete. Do not claim success for skipped work.
