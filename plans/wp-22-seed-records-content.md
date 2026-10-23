# WP22 — Seeding must record the content IDs it created

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

## The defect

`pnpm deploy:contracts` followed by `pnpm seed:wordle` and `pnpm seed:chess` leaves
`app/src/deployments/<network>.json` **without its `content` block**. Diff of the current record
against the previous one:

```diff
-  "content": { "wordleListId": 0, "chessSetId": 0 },
```

`deploy.ts` writes the record with contracts and ABIs but no `content`, and neither seeder adds
it after sealing. Only the E2E path (`seedE2EContent`) populates it.

Consequences: `scripts/build-target.test.ts` fails on
`expect(target.deployment.content?.wordleListId).toBe(0)`, and — more seriously — the app reads
its active Wordle list ID and chess set ID from that block, so a freshly deployed and seeded
stack has no content pointer. The failing test is correct; do not weaken or delete it.

## What to change

Make each seeder record what it created, so the record is complete after the normal
deploy-then-seed flow:

- `seed-wordle.ts`, once it has sealed a list, writes `content.wordleListId` into the active
  deployment record.
- `seed-chess.ts` does the same for `content.chessSetId`.
- Writes must be **merge, not replace** — seeding chess must not drop the Wordle ID, and neither
  may disturb `contracts`, `abis`, or `deployedAt`. Two seeders run in sequence against the same
  file.
- Re-running a seeder that finds its content already present and sealed must leave the record
  correct and unchanged (the seeders are resume-safe; keep that true of the record too).
- Use the same atomic write approach `deploy.ts` uses, so an interrupted write cannot truncate
  the record.

**Do not hand-edit `app/src/deployments/devnet.json` to make the test pass.** Fix the pipeline,
then re-run the seeders against the live devnet stack — the contracts at
`0xeb319e1d72b1b0fee4ea12e09e9c1a72fd979089` (scores),
`0xf53f3275c6a48ef878c7dc1ab4170a6f6c157912` (wordle), and
`0xf107837a59a80edb05b1a688602f511433d74d94` (chess) are already deployed with content sealed as
list 0 and set 0, so a resumed run should detect that and record the IDs without re-sending
transactions. Confirm in your report that no new content transactions were needed.

## Acceptance

1. `pnpm test && pnpm build` green — **including** `scripts/build-target.test.ts` — with the
   record fixed by the pipeline rather than by hand. Report the count.
2. A test proving the merge behaviour: writing the chess ID does not remove the Wordle ID, and
   neither disturbs `contracts` or `abis`.
3. A test proving a re-run against already-sealed content leaves the record unchanged.
4. Report the final `content` block from the live devnet record, and state whether any new
   content transactions were sent.
5. No test within 20% of its timeout; report the slowest.
6. No regression: the nine game screens still fit 360×780 and 1440×900.

## Out of scope

Redeploying contracts. Other games. Publishing.

## Report back

What you changed in each seeder, the final record content block, whether transactions were sent,
and the slowest test duration. Do not claim success for skipped work.
