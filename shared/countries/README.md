# Country reference data

Daily Globe's countries (D26, `plans/wp-42-globe-countries.md`).

- `globe-countries.json` — the editorial list: 197 Natural Earth `NAME`s, the 193 UN
  members plus Vatican, Kosovo, Palestine and Taiwan (the same choice as Globle and
  Sporcle; the list is ours, nothing is copied from Globle's CC BY-NC-SA data or code).
  Change it only with a new Globe generator version once the game is live (D11).

Both generated files derive from Natural Earth 1:50m `ne_50m_admin_0_countries`
(public domain, <https://www.naturalearthdata.com/>; the GeoJSON copy used was
`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson`).
The GeoJSON is not committed. Both generators take it with `--input` or `NE_GEOJSON`,
and the list with `--list` (default: `globe-countries.json`).

- `core.json` — the 197 guessable countries `{name, lat, lng, continent, iso, aliases}`:
  `pnpm --filter daily-on-dot-prototype generate:countries`.
- `shapes.json` — one outline per country, plus one per territory carrying the
  `owner` iso that reveals it: polygon rings, flat `[lng, lat, …]`, simplified
  (Douglas–Peucker, half a grid step) and quantised to 0.1°, holes kept for an
  even-odd fill: `pnpm --filter daily-on-dot-prototype generate:country-shapes`.

Rules (in `app/scripts/generate-countries.ts`):

- **Selection** is by `NAME` from the list, never by `TYPE` (which typed Cuba and
  Kazakhstan "Sovereignty", Israel and Kosovo "Disputed", Palestine "Indeterminate").
  A listed name missing from the input fails the run.
- **Territories**: every other feature belongs to its `SOVEREIGNT`, except
  Somaliland → Somalia, N. Cyprus → Cyprus, W. Sahara → Morocco. Antarctica and
  Siachen Glacier are dropped. A territory is drawn neutral when its owner is guessed
  or revealed; it is never guessable and never in a distance.
- **Identity**: `iso` is `ISO_A3_EH`, or the Natural Earth `NAME` where that is `-99`
  (Kosovo). A territory whose identity is already taken (Natural Earth gives two
  Australian territories `AUS`) is known by its `NAME`. Every identity is unique.
- **Names**: `name` is the readable name: `NAME`, but `NAME_LONG` where `NAME`
  abbreviates ("Bosnia and Herz." → "Bosnia and Herzegovina"), and "Eswatini" for
  "eSwatini". `aliases` holds the Natural Earth `NAME` where it differs plus the D26
  alternate names (Burma, Ivory Coast, Holy See, UK, USA, Czech Republic, …). The
  picker matches name and aliases accent-, case- and apostrophe-insensitively; no
  folded label may name two countries.
- **Continent**: `CONTINENT`, except the three "Seven seas" island states (Maldives →
  Asia, Mauritius and Seychelles → Africa).
- **Small shapes**: a ring that quantises to under four points is dropped, but a
  feature never loses its last ring: its largest ring is kept on the first finer grid
  (0.01°, 0.001°, 0.0001°) that keeps it a polygon (Vatican, Monaco, San Marino…).
  The globe also dots a marked country too small to see at the current zoom.

Reruns are byte-identical. Globe v1 answers depend on `core.json`, so do not
regenerate it from a newer Natural Earth release without a new game version.
