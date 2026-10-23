# WP33 — Daily Connections: four groups of four (game 12)

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Daily Connections is `gameId` **11**, slug `connections`, name "Daily Connections", `short`
"Connections", route `#/g/connections`, the last roster entry after Mini. Authored content, so per
**D19** it gets a typed registry contract (`contracts/connections`, modelled on `contracts/wordle`).
The chain stores the four labelled groups with their tiers; the board order is derived.

## Shawn's direction (2026-10-21)

The NYT Connections mechanic: 16 words, four hidden groups of four, a label each, difficulty tiers
from easiest to hardest. Select four and submit; a right set collapses into a labelled bar; three of
four says "one away"; shuffle and deselect. **No loss state** (amended the same day): the player keeps
submitting until all four are found; `score` = mistakes made, `solved` = finished. Content is
community-created and curated, so any account can create a set with a creator field and seal it; the
hub pins set 0 like Wordle. Mechanics are not copyrightable; copy no puzzle, name or colours.

## Deliver, each its own commit

1. **Registry contract** `contracts/connections/`: create set (creator, name, emoji, start day), add
   puzzles (typed: 4 groups × 4 words + label + tier), seal, `puzzle_for_day(set_id, day)`. Rules in
   `contracts/logic` with host tests: four groups of four distinct words, tiers 0–3 once each, labels
   ≤ 40 bytes, words ≤ 24 bytes. Build with the pinned `cargo-pvm-contract` (d886ab2).
2. **Content** `shared/connections/core.json`, at least 370 puzzles written by us:
   `{day_index, groups: [{label, words[4], tier}]}`. 16 distinct words a day, red herrings (a word
   that fits two groups on the surface, one by the intended reading), no living people, common
   knowledge, no full group reused on another day, a mix of categories. `validate-connections.ts`
   enforces the shape rules.
3. **Tooling**: `connections` in `ContractName` (optional, like `mini`), `deploy.ts --only
   connections`, `verify-deployment.ts`, `seed-connections.ts` (batches of 8, resume),
   `connectionsSetId` in the record.
4. **The game** `app/src/games/connections/`: 4×4 tile grid with wrapping text, selected state, tier
   bars, a mistakes counter that counts up, Shuffle / Deselect / Submit, an end state with a text-only
   share summary of coloured squares; one chain write at the finish (D14); local progress across
   reload (D15); read-only archive showing the solved board; fits 360×780 and 1440×900 with no page
   scroll (D18); home card mark; three sample puzzles in the stub source.
5. **Tests encode intent**: validator, content integrity (every day present once), contract logic,
   game rules (one away, mistakes without a cap, finish, one write), view fit. Full suite,
   `tsc --noEmit`, `typecheck:tools`, `pnpm pocket:build`, `pnpm smoke` green.
6. `PROGRESS.md` WP33 entry; this brief; README game list.

## Out of scope

Publishing, deploying or seeding on chain (report the commands), other games.
