# WP-P4 — Explicit between-tier transition in the Wordle ladder

Read `AGENTS.md` first.

## The problem

`applyGuess` in `app/src/games/wordle/session.ts` advances the tier in the same call that
records the guess:

```ts
const advance = solved || guesses[tier].length === 6;
const activeTier = advance ? tier + 1 : tier;
```

So the instant a player solves a tier, the board re-renders as the *next* word. They never
see their winning row revealed, never get told they were right, and are given no moment to
register the win before a new empty grid appears. The failure path has the same flaw — the
"The word was X" line is rendered on the following tier's screen, pointing backwards, which
is why it reads as a non-sequitur.

## What to build

Introduce an explicit **tier-resolved** state between scoring the last guess of a tier and
moving to the next. The player stays on the board they just played until they choose to
continue.

Add a resolved marker to `WordleProgress` (for example `pendingAdvance: boolean`, or a
`tierState: "playing" | "solved" | "failed"`). `applyGuess` must **stop advancing
`activeTier` itself**; a separate explicit `advanceTier(progress)` does that, called only
from the continue action.

The resolved state shows, on the board just played:

- **Solved** — the winning row revealed as correct, a clear success line naming the word
  and the guess count (e.g. "CAT in 2 guesses"), and a primary button
  **"Next: 4 letters"**.
- **Failed** — the board as played, "The word was MORNING", same primary button.
- **Final tier (6 of 6)** — no next button. Show the ladder summary instead: tiers solved
  out of 6, and the existing completion/share affordance.

Move the existing "The word was X. Next rung." line out of the following tier's screen; it
belongs in the resolved state of the tier it refers to.

Physical `Enter` should activate the continue button when the tier is resolved, so keyboard
play does not require reaching for the mouse.

## Constraints — do not break these

- **D14 still holds.** Exactly one `record` call, at ladder end. `submitLadderOnce` and its
  concurrency guard must keep working; the existing test in `session.test.ts` asserting a
  single write must still pass.
- **D15 still holds.** The resolved state must survive a reload — persist it with the rest
  of the in-progress state and restore the player to the resolved board, not the next tier.
- `session.test.ts` currently asserts `activeTier` becomes 1 after six unsuccessful
  guesses. That assertion now describes the *old* behaviour. **Update it to assert the
  tier resolves as failed and only advances after `advanceTier`** — do not delete it.
- A completed day still opens read-only.
- Every tier must still fit 360×780 with no scrolling, including the resolved state with
  its button. Do not let the success line and button push the keyboard off-screen.

## Acceptance

1. `pnpm build && pnpm test` green.
2. Test: solving a tier leaves `activeTier` unchanged and marks it solved; `advanceTier`
   is what moves to the next tier.
3. Test: failing six guesses leaves `activeTier` unchanged and marks it failed; likewise
   only `advanceTier` moves on.
4. Test: solving the sixth tier marks the ladder complete and does **not** produce a
   seventh tier.
5. Test: a resolved tier round-trips through save/restore and comes back resolved.
6. The single-write test still passes unchanged in meaning.
7. Manual-equivalent DOM test: after a solving guess, the winning row is present and
   scored `correct`, and a continue control is rendered.

## Report back

What you changed, and anything you could not complete. Do not claim success for skipped work.
