# Country reference data

Daily Globe's places (D26, `plans/wp-42-globe-countries.md`). One **superset** of
places is data, generated from Natural Earth; two **subsets** are editorial config.

## Superset (generated)

Every feature of Natural Earth 1:50m `ne_50m_admin_0_countries` (public domain,
<https://www.naturalearthdata.com/>; the GeoJSON copy used was
`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson`)
except Antarctica and Siachen Glacier: 240 places. The GeoJSON is not committed.
Both generators take it with `--input` or `NE_GEOJSON`, and the config with `--list`
(default: `globe-countries.json`). Reruns are byte-identical.

- `core.json` — one record per place, in id order:
  `{id, name, aliases, kind, owner, lat, lng, continent}`:
  `pnpm --filter daily-on-dot-prototype generate:countries`.
- `shapes.json` — `{id, rings}` per place: polygon rings, flat `[lng, lat, …]`,
  simplified (Douglas–Peucker, half a grid step) and quantised to 0.1°, holes kept for
  an even-odd fill: `pnpm --filter daily-on-dot-prototype generate:country-shapes`.

Rules (in `app/scripts/generate-countries.ts`):

- **`id`** is `ISO_A3_EH`, or the Natural Earth `NAME` where that is `-99` (Kosovo,
  Somaliland, N. Cyprus) or where several features share the code and `ADM0_A3` says
  this one is not its holder (Natural Earth gives two Australian territories `AUS`).
  It depends on the data alone, never on the config, and must never change once live.
- **`kind`**: a `NAME` in the config's `countries` list is `sovereign` whatever its
  `TYPE` (Cuba is "Sovereignty", Israel and Kosovo "Disputed", Palestine
  "Indeterminate"). Any other place is `disputed` when Natural Earth types it
  Disputed/Indeterminate or D26 reassigns it, else a `territory`.
- **`owner`** (null for a sovereign): the sovereign place of its `SOVEREIGNT`, except
  Somaliland → Somalia, N. Cyprus → Cyprus, W. Sahara → Morocco.
- **`name`**: `NAME`, but `NAME_LONG` where `NAME` abbreviates ("Bosnia and Herz." →
  "Bosnia and Herzegovina"), and a small override table ("Eswatini").
  **`aliases`**: the Natural Earth `NAME` where it differs plus the D26 alternate names
  (Burma, Ivory Coast, Holy See, UK, USA, Czech Republic, …). Matching folds accents,
  case, apostrophes and hyphens; no folded label may name two places.
- **`continent`**: `CONTINENT`, except the three "Seven seas" island states (Maldives →
  Asia, Mauritius and Seychelles → Africa).
- **Small shapes**: a ring that quantises to under four points is dropped, but a place
  never loses its last ring: its largest ring is kept on the first finer grid (0.01°,
  0.001°, 0.0001°) that keeps it a polygon (Vatican, Monaco, San Marino…). The globe
  also dots a marked guessable place too small to see at the current zoom.

## Subsets (editorial: `globe-countries.json`)

- `countries` — the sovereign places as Natural Earth `NAME`s: the 193 UN members plus
  Vatican, Kosovo, Palestine and Taiwan (the same choice as Globle and Sporcle; the
  list is ours, nothing is copied from Globle's CC BY-NC-SA data or code).
- `guessable` — the place ids the picker accepts (today the 197).
- `answers` — the v1 answer pool, `{id, since, until?}` in days (today the 197, all
  `since: 0`).

Drawing: a guessable place is drawn by its own mark (guess colour or answer). A place
that is not guessable is drawn in a neutral fill when its owner is guessed or revealed
(Greenland with Denmark), never in a guess colour, never in a distance. Making a
territory guessable (say Hong Kong) is a config-only change.

## The v1 answer rule

Days run in cycles. Cycle `k` begins on its start day (cycle 0 on day 0), takes the
pool as it stands that day (entries with `since <= start < until`), sorts it by `id`,
shuffles it with the v1 PRNG seeded by `k`, and lasts one day per answer; the next cycle
begins the day after. So:

- adding a place to the superset or to `guessable` changes no answer;
- an entry added with a future `since`, or ended with a future `until`, only changes
  cycles that begin on or after that day — never a past answer, nor one in the cycle
  already running;
- editing an entry into the past (a `since` or `until` on or before a cycle already
  begun), or changing the PRNG, rewrites history and needs a new generator version (D11).

Cycle starts are walked from day 0 once per session and cached, so a lookup costs the
number of cycles, not days × pool.
