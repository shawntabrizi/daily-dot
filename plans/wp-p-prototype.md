# WP-P — Initial prototype (frontend only, no chain)

Build a reviewable, playable prototype of the Daily on Dot hub. **No contracts, no wallet,
no RPC.** All data comes from an in-memory stub behind an interface that the real contract
reads will implement later.

Read `AGENTS.md` first. Its locked decisions apply. `PLAN.md` §8 and §8.1 describe the UX
reference and the exact design system — follow §8.1's tokens and geometry.

## Scope

Create `app/` at the repo root: Vite + TypeScript + Vitest, pnpm, Node ≥ 22. No React —
plain TypeScript modules and DOM. No CSS framework; hand-written CSS with custom properties
for the tokens.

### Structure

```
app/
  index.html  vite.config.ts  tsconfig.json  package.json
  src/
    main.ts               boot + hash router
    styles.css            tokens from PLAN.md §8.1
    shared/
      day.ts              day index from a timestamp (EPOCH = 1767225600, UTC, 86400s)
      data-source.ts      INTERFACE + in-memory stub (the future contract seam)
      roster.ts           client-side game roster
      prefs.ts            favourites + hidden, localStorage
      progress.ts         in-progress ("Started") state, localStorage
      streaks.ts          derive streak / win rate / completionist from bitmaps
      ui/                 header, drawer, card, calendar, keyboard, tile
    games/
      wordle/engine.ts    pure guess scoring
      wordle/view.ts      the ladder screen
      sudoku/view.ts      placeholder screen
      chess/view.ts       placeholder screen
```

### `data-source.ts` — the seam that matters

Define an interface and one in-memory implementation. Everything else in the app talks to
the interface only; no view may reach past it. Shape it so a contract-backed implementation
is a drop-in:

```ts
export interface DataSource {
  currentDay(): Promise<number>;
  wordleLadder(day: number): Promise<string[]>;      // exactly 6 words, lengths 3..8
  dayBits(day: number): Promise<DayBits>;            // { played, solved, ontime } as numbers
  dayBitsRange(from: number, count: number): Promise<DayBits[]>;
  record(gameId: number, day: number, score: number, solved: boolean): Promise<void>;
}
```

The stub seeds ~60 days of deterministic fake ladders and a plausible spread of past
results (some played, some solved, some backfilled, some missed) so history and streaks
have something real to render. Persist stub results in `localStorage` so a completion
survives reload.

### Routes

- `#/` — home
- `#/history` — archive/calendar
- `#/g/wordle?day=N` (`day` optional, defaults to today), `#/g/sudoku`, `#/g/chess`

### Home

Vertical stack of three full-width game cards (Wordle, Sudoku, Chess), reflowing to a
centred grid on desktop. Each card: title + a simple graphical mark suggesting the mechanic
(inline SVG, no external assets) + completion state for today. Favourites sort to the top;
hidden games are excluded from the tracker and listed in a collapsed "Hidden" section. A
live countdown to UTC rollover. **Home must render fully before any `DataSource` call
resolves** — completion state fills in after.

### Wordle (the only playable game)

The full 3→8 ladder per D16: six tiers, six guesses each, tier advances whether or not it
was solved. Visible tier indicator. On-screen keyboard plus physical keyboard. Per-letter
scoring with correct duplicate-letter handling. Ship a small bundled dictionary
(a few hundred common words per length, 3–8) for guess validation — enough to demo; a full
list comes later.

Fetch the whole ladder with **one** `wordleLadder(day)` call at screen open, then validate
entirely locally (D14). Call `record` exactly **once**, at ladder end, with
`score = tiers solved`. In-progress state persists in `localStorage` across reload (D15).
A day already recorded opens read-only.

### Sudoku / Chess

Placeholder screens only: title, "Coming soon", back to home. Do not implement them.

### History

Month calendar, one game selected via a dropdown, previous/next month. Header shows
`PLAYED`, `WIN RATE`, and a streak badge. Each cell is one of four states — **Played**
(on-time + solved), **From Archive** (backfilled), **Started** (local, unfinished), or
empty — with a visible legend. Days before a game's `startDay`, and future days, are
non-interactive. Clicking a past day opens that game at that day.

`streaks.ts` derives everything from the bitmaps: streak = run over `ontime & solved`
walking backwards from today and stopping at the first gap; win rate =
`popcount(solved)/popcount(played)`; completionist = `popcount(played)`.

## Acceptance

1. `pnpm install && pnpm build && pnpm test` all succeed.
2. Usable one-handed at 360px wide with **no horizontal scroll**; the same layout widens
   correctly at 1440px.
3. Home renders before any `DataSource` promise resolves.
4. The Wordle ladder is completable end to end and issues exactly **one** `record` call —
   include a test that fails if a second write is issued.
5. Reloading mid-ladder restores progress; a recorded day opens read-only.
6. Unit tests, each of which would fail if its rule changed:
   - `engine.ts` duplicate-letter green/yellow precedence
   - `day.ts` epoch boundary, pre-epoch rejection
   - `streaks.ts` — **backfill does not repair a streak but does raise the completionist
     count** (this is the one that matters most)
   - `prefs.ts` favourite/hide round-trip
7. No view imports the stub directly; everything goes through the `DataSource` interface.
8. Colours and geometry match `PLAN.md` §8.1.

## Out of scope

Contracts, PolkaVM, wallets, PAPI, product-sdk, network config, deployment, Sudoku and
Chess gameplay, community submissions, sound effects, ads, accounts.

## Report back

A short summary: what you built, anything you could not complete, and every place you
deviated from this brief or from `AGENTS.md`. Do not claim success for skipped work.
