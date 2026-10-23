# WP-P3 — Keyboard hints leak across ladder tiers

Read `AGENTS.md` first. One defect, one fix. Do not touch anything else.

## The bug

`keyboardScores` in `app/src/games/wordle/view.ts` accumulates letter states across
**every** tier:

```ts
for (const tier of progress.guesses) {   // <- all six tiers
  for (const guess of tier) { ... }
}
```

Each tier is a **different word**, so hints from the 3-letter answer are painted onto the
keyboard while the player is solving the 8-letter one. Observed live: on tier 6 with an
empty grid and no guesses yet for that word, eleven keys were already coloured green and
yellow. The keyboard is asserting facts about a word the player has not guessed against.

This is worse than cosmetic — a green key is a positional claim, and here it is false.

## The fix

Scope the accumulation to the active tier only: `progress.guesses[progress.activeTier]`.
Keep the existing `SCORE_RANK` precedence (correct > present > absent) within that tier.

When reviewing a completed day read-only, the keyboard should reflect that same
per-tier scoping for whichever tier is being displayed — do not reintroduce a global merge.

## Acceptance

1. `pnpm build && pnpm test` green.
2. A test that **fails against the current implementation**: build a `WordleProgress`
   with guesses recorded in tier 0, advance to tier 1, and assert `keyboardScores`
   returns no state for letters that appeared only in tier 0.
3. A test asserting that within a single tier, `correct` still beats `present` for the
   same letter across two guesses.
4. No changes outside `src/games/wordle/view.ts` and its test file. If `keyboardScores`
   needs to be exported to be testable, that is acceptable.

## Report back

What you changed and anything you could not complete. Do not claim success for skipped work.
