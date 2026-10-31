# Atlas Foundry

A procedural world and strategy sandbox that runs entirely in the browser: generate a planet (terrain, climate, rivers, biomes), populate it with nations, peoples, languages and faiths, then play one nation through its economy, trade, demographics and a living world of AI nations.

## Run locally

```bash
npm start
```

Then open http://127.0.0.1:4173. There are no dependencies to install.

## Tests

```bash
npm test
```

`node tests/balance.mjs [seeds] [years]` prints economy balance figures for neutral campaigns.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs the tests and publishes the site on every push to `main`. To turn it on, open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**. Saves are kept in the browser per site, so worlds saved on `localhost` do not appear on the published site; use **Export → World file** to move them.

## Documentation

- `ARCHITECTURE.md`: data contracts for each stage and version.
- `CHANGELOG.md`: what changed in each release.
- `docs/UPDATE_PLAN.md`: the design plan for version 10.
