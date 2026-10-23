# Country reference data

Both files derive from Natural Earth 1:110m `ne_110m_admin_0_countries`
(public domain, <https://www.naturalearthdata.com/>; the GeoJSON copy used was
`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson`).
The GeoJSON is not committed. Both generators take it with `--input` or `NE_GEOJSON`.

- `core.json` — 166 countries `{name, lat, lng, continent, iso}`:
  `pnpm --filter daily-on-dot-prototype generate:countries`.
- `shapes.json` — the same 166 countries as polygon rings for the Globle globe,
  flat `[lng, lat, …]` quantised to 0.1°, holes kept for an even-odd fill:
  `pnpm --filter daily-on-dot-prototype generate:country-shapes`.

`iso` is `ISO_A3_EH`, or the Natural Earth `NAME` where that is `-99`. Both
generators share that rule, so every `core.json` identity matches a shape.
Reruns are byte-identical. Globle v1 answers depend on `core.json`, so do not
regenerate it from a newer Natural Earth release without a new game version.
