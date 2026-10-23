# WP16 — Globle: guess the country by proximity (batch 2, game 5)

Read `AGENTS.md`, `PROGRESS.md`, and `shared/sources/README.md` first. Update `PROGRESS.md`
and commit when done.

Globle is `gameId` **4**. Like Wordle it has **curated content** — a country list — but it is
small enough that it needs **no new contract**: reuse `WordleRegistry`? **No.** See below.

## Contract decision — read carefully

D3 says one typed registry per game. But Globle's content is a *fixed reference dataset*, not
authored puzzles: 166 countries with centroids, identical for everyone, changing only when
borders change. Under D9's logic (dictionaries ship in the bundle; only answers live on-chain),
the **country table belongs in the bundle** and only the **daily answer sequence** would need
to be on-chain.

And under D10, if the daily answer is derived deterministically from the day, nothing needs to
be on-chain at all — the country list is public reference data, not a secret.

**So: Globle gets no content contract.** Ship the country table in the bundle and pick the
day's answer with a frozen, versioned, deterministic sequence (D10 + D11), exactly as Sudoku
and Nerdle do. It touches only `DailyScores`.

If you believe this reasoning is wrong, **stop and say so** rather than building either way.

## 1. Country data — `app/scripts/generate-countries.ts` → `shared/countries/core.json`

Input: Natural Earth `ne_110m_admin_0_countries.geojson`, public domain. A local copy is at
`/private/tmp/claude-501/-Users-shawntabrizi-Documents-GitHub-daily-on-dot/a18b2011-1bfd-4892-8230-c617f69b0ae3/scratchpad/ne_admin0.geojson`.
Path via `--input` or `NE_GEOJSON`. **Do not commit the GeoJSON** — add to `.gitignore` if needed.

- Keep sovereign countries (`TYPE` is `Sovereign country` or `Country`).
- Emit `{ name, lat, lng, continent, iso }` using `LABEL_X`/`LABEL_Y` as `lng`/`lat`.
- **`ISO_A3` is `-99` for several countries including France** — use `ISO_A3_EH`, and fall back
  to `NAME` as identity. A test must assert no `-99` and no duplicate names.
- Deterministic: rerun byte-identical. Report the count.

## 2. Answer sequence — `app/src/games/globle/generate.ts`

```
globleAnswer(day: number, version: "v1"): Country
```

Deterministic from `(day, version)` alone; inline PRNG; no clock. With ~166 countries a year
must recycle — **that is accepted and documented** — but no country may repeat until every
country has been used once (a shuffled-deck cycle, reshuffled per cycle with a
cycle-derived seed). Commit fixtures for days 0, 1, 100, 208, 364.

## 3. Screen — `app/src/games/globle/view.ts`

- Text input with **autocomplete over the bundled country list**; only a listed country is a
  valid guess, and an invalid entry does not consume a guess.
- Each guess appends a row: country name, great-circle **distance** to the answer, a direction
  indicator, and a proximity colour ramp (use `--correct` / `--present` / `--wrong` from the
  design system; do not invent new colours).
- Implement haversine distance yourself and unit-test it against known pairs.
- Unlimited guesses, as the original has. `score` = **guesses used** (D13).
- On solving: result state and **exactly one** `record(4, day, guessesUsed, true)` (D14).
  In-progress guesses persist in `localStorage` (D15) and survive reload.
- A recorded day opens read-only.
- **D18**: fits 360×780 **and** 1440×900 with no scrolling. The guess list grows, so it must
  scroll *within its own container* while the page does not.

Add Globle to the roster so its card, history tab, and archive routing work.

## Acceptance

1. `pnpm test && pnpm build` green; report the count.
2. `shared/countries/core.json` has ≥160 entries, no `-99` ISO, no duplicate names; generator
   deterministic (rerun byte-identical).
3. Haversine tested against known distances (e.g. London–Paris ≈ 344 km, London–Sydney
   ≈ 16,990 km) within 1%.
4. Answer sequence: fixtures for the five listed days; a test proving **no country repeats
   until all have been used**.
5. Invalid or unlisted guess does not consume a guess (test).
6. Exactly one `record` per completed day, with a test that fails on a second write.
7. Reload mid-game restores the guess list.
8. D18 at both viewports with a long guess list (≥15 guesses) — the page must not scroll while
   the list does. Report measured numbers, or say plainly you could not run a browser.
9. No regression: the other four game screens still fit both viewports.

## Out of scope

Publishing, contracts (none needed), other games.

## Report back

Country count, the contract-decision confirmation or your objection to it, fixture values,
viewport numbers or an explicit note you could not measure them, and anything incomplete.
Do not claim success for skipped work.
