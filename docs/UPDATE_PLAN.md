# Atlas Foundry v10 — Update Plan

Status: **implemented in 10.0** with the adjustments requested in review: currencies keep three-letter codes, no technology-gated resources, most new maps live in the Atlas rather than the map-mode list, live foreign figures are a display setting, diplomacy stays limited to agreements, sanctions, blocs and a trade relation.

---

## 0. What the review found

Things I saw in the current code (v9) that the plan responds to:

| Area | Finding | Where |
|---|---|---|
| Names | Province, city, language, religion and culture names come from per-entity generators. Nothing checks for uniqueness, so duplicates (and near-duplicates like *Varsa* / *Varsá*) can appear. | `civilization/names.js`, `generator.js`, `provinces.js` |
| Colours | Nation colours are `palette[(id*7 + seedHash) % n]`. Two nations that share a border can get the same or nearly the same swatch. | `generator.js:36` (`paletteColor`) |
| No Religion | Secular share comes from a national propensity field plus development. Government type is ignored, so a highly developed theocracy can end up mostly "No Religion". | `religions.js:56` |
| Trade map | Hub count is capped (`gateways ≈ 18%` of hubs, max 40), so routes only form between hubs. The ministry lists just the top 24 routes, and the map draws whatever the hub graph has, which clusters in a few dense regions. | `civilization/economy.js:56-70`, `ui/ministry-economy.js:86` |
| Economy | One abstract output number per industry, with no goods. Partners are only *embargo / preferential / normal*. Growth is organic plus law deltas, so nothing creates scarcity, and so there's no reason to trade. | `game/economy/*`, `data/*` |
| AI nations | Only the player's economy moves. Every other nation stays exactly as generated. | `game/economy/sim.js` |
| Demographics | `civilization/demographics.js` holds a static census only. Population, culture, language and religion never change during play. | — |
| UI | Ministry tabs are dense text tables. Reforms, Construction and Industry rely on prose and numbers rather than visuals. | `ui/ministry-*.js`, `styles/economy.css` |
| Hosting | All paths are already relative, and workers use `new URL(..., import.meta.url)`. GitHub Pages needs only small additions (see §3). | `index.html`, `app.js` |
| Borders | Borders are corner-cut chains with LOD simplification, which only removes detail. Zooming in never adds detail, so borders look smooth or straight up close. | `render/territory-geometry.js` |

I'll run the existing test suite before starting and record the baseline. Any bugs I hit along the way get fixed and listed in the changelog.

---

## 1. Polish

### 1.1 Global name registry (no duplicates)
- New `civilization/name-registry.js`: one registry per world, keyed by **kind** (`province`, `city`, `nation`, `culture`, `language`, `religion`, `family`, `currency`, `river/region` if named).
- Names are compared after **normalisation**: casefold, strip diacritics, collapse doubled letters, drop generic suffixes ("-ia", "Province of"). This catches *Varsa / Várssa*.
- Some kinds can't collide with each other: a city and a province can share a name only when the city is that province's seat, as with real "X City, X Province". Religions can't share names with languages or cultures, except for deliberate adjective forms such as "Tamic language" and "Tamic culture", which are allowed.
- On a collision the generator retries with the next seeded variant (new syllable, different affix, compound form). After *k* failures it falls back to a qualifier ("New ___", "Upper ___", "___ Reformed" for religious schisms).
- Applied at generation time and when manually renaming in the generator. A manual rename that collides shows an inline warning rather than being blocked.
- Old saves: a one-time pass on import renames duplicates deterministically and logs a note.

### 1.2 Religion and government coherence
- Theocracies (and governments flagged `religious` by the renderer classifier) get a **state-faith floor**: the No Religion share is multiplied by roughly 0.15–0.3, scaled by how theocratic the government is.
- The removed share goes to the state religion first, then to the local majority faith.
- Also applied, more weakly, to monarchies with a state church. Secular republics and socialist states are unchanged or slightly increased.
- Becomes **dynamic** in play (§6): a theocracy's religion policy pushes conversion. Switching government away from theocracy relaxes the floor over decades, not instantly.
- Test: across 50 seeds, no theocracy has No Religion as its national plurality.

### 1.3 Neighbour colour separation
- After generation, build the nation adjacency graph (land borders plus short sea straits).
- Measure distance in **OKLab ΔE**. If two neighbours fall below a threshold (≈ 0.12), run a greedy graph re-colour: keep the larger nation's colour and move the smaller one to the furthest available palette hue among its neighbours' colours. If the palette is exhausted, shift lightness/saturation within the palette's range.
- Same pass for cultures, languages and religions maps (they share the palette helper), and again whenever borders change (conquest/independence later, or editor painting).
- User-chosen colours (`colorLocked`) are never changed; their neighbours move instead.

### 1.4 Other polish
- Remove duplicate city/province labels at the same screen spot (label collision pass).
- Consistent number formatting (1.2 M, 34.5 k), currency symbols per nation everywhere.
- Tooltips on every icon-only button (the shortcut dialog lists them too).

---

## 2. UI and UX overhaul (in-game, economy-side)

### 2.1 Design language
- **Icon set:** an SVG sprite extending the existing `#i-*` symbols, with one icon per resource, industry, building, law axis, tax, initiative and demographic group. Every icon is hoverable with a rich tooltip (name, current value, trend, one line of explanation, and the most relevant breakdown).
- **Chart kit** (`ui/charts.js`, dependency-free SVG):
  - sparkline
  - stacked area (history)
  - bar/diverging bar
  - donut
  - treemap
  - population pyramid
  - Sankey-lite flow, for the budget and trade
  - small multiples

  All charts are keyboard-focusable, show hover read-outs and follow the theme tokens.
- **Trend chips:** `▲ 3.2 %` / `▼` coloured chips next to every headline number, with the comparison period on hover.
- **Progressive disclosure:** each panel opens on a dashboard of big tiles. Clicking a tile drills into the detail view, and breadcrumbs lead back. Prose descriptions move into tooltips and an optional "Explain" drawer.
- **Command palette** (`Ctrl/Cmd+K`): jump to any panel, province, city, building or law.
- **Pin to HUD:** any stat can be pinned to the top strip.

### 2.2 Top strip (always visible in game)
Treasury (with monthly delta), Stability, GDP growth, Population (with census age), Trade balance, Alerts bell. Each item is a tile that opens its panel. Alerts list actionable events, for example "Steel shortage in Narrav", "Construction finished", "Census results ready" or "Sanction imposed on you".

### 2.3 Economy panel (Ministry → Overview)
- **Dashboard:** GDP tile (sparkline), Revenue vs Spending (diverging bar), Debt/GDP gauge, Unemployment, Inflation (new, §4.6), Trade balance.
- **Budget Sankey:** each revenue source flows to the treasury, which flows to each spending line. Drag a tax-rate slider and the flows animate with a "what-if" preview, using the existing `evaluate(over)` path.
- **Sector treemap:** output by industry, coloured by growth. Clicking an industry opens it in the Industry tab.
- **History:** stacked area of output by sector, plus revenue and expenses, with a 1y/5y/all toggle.
- **Province ranking:** sortable mini-table with an inline bar per row. Hovering a row highlights the province on the map.

### 2.4 Industry panel
- Grid of industry cards: icon, output, jobs, a growth sparkline, and a resource-input "health" ring (inputs satisfied %).
- Card detail:
  - inputs → outputs diagram (which resources it consumes and produces)
  - top producing places, shown on a mini-map
  - bottlenecks (labour, inputs, energy, transport)
  - suggested projects, each with a one-click "build here" button
- **Supply chain view:** a node graph of resource → industry → goods. Edge thickness is volume. Red edges are shortages. Hovering a node highlights it on the map.

### 2.5 Construction panel
- **Map-first:** choose a building from an icon palette, and valid sites light up on the map with a suitability heat (site fit, resources, labour, cost). Click a site to see a preview card: cost, time, yearly return, payback years and the effect on stability/jobs.
- Queue as a **timeline (Gantt-lite)**. Drag to reorder priority. Progress bars, plus a capacity bar for the construction sector.
- Filters by tier/industry/province. A "best return" sort lists the top 10 opportunities.
- Auto-build fund lives here (§8).

### 2.6 Reforms panel
- Each law axis is a **horizontal track** of position nodes. The current position is solid, the target is a ring, and the transition shows as a progress bar with months remaining.
- Hovering a node shows an effect delta card with icons (+growth, −stability, admin load bar). Positions locked by a requirement are greyed, with the requirement shown.
- **Public mood overlay:** a small marker on each track shows where the public wants it, and the gap is colour-coded. The total stability impact of planned reforms is previewed before committing.
- **Ideology radar chart**, showing the nation's position across axes compared with neighbours and partners.

### 2.7 Trade panel (new, §4.4)
World partner list with flag, relation bar, volume sparkline and terms chip. A resource import/export balance bar chart. Agreements and sanctions are managed from partner cards.

### 2.8 Accessibility and responsiveness
Every chart has a table fallback ("view as table"). Colour-blind-safe sequential/diverging palettes. Panels can be resized and docked left or right. All actions are reachable by keyboard.

---

## 3. GitHub Pages
- Add `.nojekyll`, so Jekyll doesn't strip `_`-prefixed files and serves `.mjs` as-is.
- Add a `404.html` that redirects to `index.html`.
- `.github/workflows/pages.yml`: on push to `main`, run `npm test` (node only, no deps), then upload the repo root as the Pages artifact and deploy via `actions/deploy-pages`. A short README section covers enabling Pages (Settings → Pages → Source: GitHub Actions).
- Audit for anything assuming a root path or localhost:
  - absolute `/` URLs
  - `server.mjs`-only behaviour
  - `Cache-Control` assumptions. Add a `?v=<version>` cache-buster on `app.js` so a redeploy isn't stuck behind stale module caches.
- Module workers are supported on Pages (same origin). Feature-detect and show a friendly message on very old browsers.
- Saves already use localStorage/IndexedDB per origin. Note in the UI that saves live per site (github.io vs localhost).
- `server.mjs` stays for local development.

---

## 4. Economy mechanics

### 4.1 Balance pass (first, before adding systems)
- Write a headless **balance harness** (`tests/balance.mjs`): generate N seeds, auto-play 50 years with a scripted "neutral" player and with AI policy, and record:
  - GDP growth
  - debt
  - stability
  - unemployment
  - revenue/GDP
  - building payback distribution
  - dominant-strategy indicators, for example "Is one building always best?"
- Targets:
  - baseline real growth of 1–4 %/yr depending on tech/ideology
  - revenue/GDP of 10–45 % depending on tax system
  - no building with payback under 3 years at scale
  - civic buildings worth building for stability
  - debt spirals possible but recoverable
  - laissez-faire vs planned both viable
- Known suspects to verify:
  - flat additive law deltas that stack too strongly
  - growth compounding with no diminishing returns
  - construction capacity rising faster than demand
  - tourism and finance yielding too much in small states
  - prestige stability capped too low to matter

  Results get tabulated in the PR.

### 4.2 Resources (new)
About 16 resources in 4 groups. Each has an icon, a colour and a map mode.

| Group | Resources | Generation drivers (from existing layers) |
|---|---|---|
| Agricultural | Grain, Livestock, Fruit & Spices, Fibres (cotton/wool), Fish, Timber | Köppen, soilMoisture, alluvium/floodplain, temperature/growing-season months, biome forest cover, coast/river distance, elevation slope |
| Mineral | Iron, Copper & tin, Coal, Precious metals, Stone & clay, Salt | Tectonic fields: `crustAge`, `mountainUplift`, `volcanicUplift`, `tectonicRift`, old cratons for iron, orogens for copper/gold, sedimentary basins for coal/salt, arid basins for salt |
| Energy | Oil & gas, Hydropower potential, Wind/solar potential (late tech) | Sedimentary basins + continental shelves (oil). Flow × relief (hydro). Aridity/latitude (solar), coast/plains (wind) |
| Luxury / special | Gems, Rare earths (tech-gated), Wine & tea | Volcanic/kimberlite noise on old crust. Mediterranean/Cfb climate for wine. Humid highlands for tea |

- Generation: a per-cell **deposit/potential raster** (Uint8, one band per resource, sparse for minerals). It's seeded and deterministic, with clustered noise so deposits form realistic belts rather than spots. It's computed in the civilization worker and saved as a registered layer (schema bump with an import fallback that regenerates).
- Some deposits are **hidden** until surveyed. The existing Geological survey initiative now reveals them, and higher technology reveals more.
- Province resource summary: dominant resources show as icons on province labels in resource map modes.

### 4.3 Production and goods
- Industries gain **inputs/outputs**:
  - farming → grain
  - mining → ore/coal
  - heavy → steel/machinery (needs iron + coal/energy)
  - light → consumer goods (fibres, timber)
  - food → processed food (grain, livestock, fish)
  - energy → power (coal/oil/hydro)
  - construction → materials (stone, timber, steel)
- **National market per good:** supply (production + imports) vs demand (industry inputs + population consumption by income level + construction + state). A price index is set by the shortage or surplus and moves smoothly (monthly, damped).
- Shortages reduce dependent industry efficiency (soft cap, not a hard stop). A surplus is exported if routes and partners allow, otherwise prices fall.
- To keep it light, the market solves monthly on aggregates per nation (≈ 16 goods × nations), not per place.
- The partition invariant is preserved: on day 0 resource-based efficiencies are normalised, so output = generated output.

### 4.4 Expanded trade system
- **Trade network rebuild:**
  - Every nation's capital and every city over ~a size threshold becomes a hub, plus coastal ports and river ports.
  - Routes come from a sparse spanning graph (Delaunay-like over cost distance, then pruned) instead of only top-tier hubs. That gives a connected, world-spanning network: a backbone of major sea lanes and land corridors plus regional feeders.
  - The cost-distance search reuses cached fields. A budgeted incremental build keeps generation time bounded, with a hard cap on route count scaled to world size.
- **Flows:**
  - Bilateral trade is gravity-based (existing `tradeGravity`) but now split by good, driven by each nation's surpluses and deficits.
  - Flows are routed along the network, so each segment carries an aggregate volume, which the map draws.
  - Choke points (straits, canals) are identified, and their owners earn transit fees.
- **Agreements** (per partner):
  - Normal
  - Trade agreement (tariff reduction)
  - Free trade area (multi-party bloc, with a bloc-membership UI)
  - Exclusive resource contract (a guaranteed supply of one good for N years at a fixed price)
  - Transit rights
- **Tariffs:** a general rate plus per-good overrides (protect an industry vs raise revenue vs cheap inputs). The existing `tariffCap` law limits it.
- **Sanctions:**
  - Levels: targeted (specific goods), broad (all but food/medicine), full embargo.
  - Costs: lost trade for both sides, and relation drops.
  - Effects on the target: shortages and price spikes, plus stability pressure.
  - AI nations join or refuse sanctions based on relations, bloc, ideology and their own dependence. A "sanction coalition" display shows who's in.
  - Sanction evasion: trade reroutes through third countries at higher cost, shown on the map as dotted grey-market flows.
- **Relations** (a lightweight scalar −100..100 per nation pair): driven by trade volume, shared bloc/religion/ideology, sanctions and borders. They gate agreements. This also serves as groundwork for later diplomacy.

### 4.5 Trade map mode improvements
- Segment widths are proportional to aggregate flow (log scale), coloured by the dominant good or by type (sea, river, land). A toggle shows **all routes** or **top N per region**, so busy areas don't hide quiet ones.
- Animated flow dashes show direction, can be turned off, and switch off automatically at low zoom.
- Hovering a segment shows its volume, top goods and the nations served. Clicking a nation filters to its trade.
- Sanctioned flows are drawn in red-hatched style, and rerouted grey-market flows dotted.
- Choke-point markers show their transit volume.

### 4.6 Supporting economic systems
- **Inflation and money supply:** deficit financing (printing vs borrowing toggle) drives inflation. Inflation erodes stability and real wages, and the central bank rate (a slider) trades growth for price stability. It stays simple, as one national index.
- **Business cycle:** a gentle seeded cycle (period 6–10 yrs) plus shocks: harvest failure from a climate anomaly in a farming-heavy region, a commodity price boom/bust, or a trade partner recession. Shocks propagate along trade links, which makes diversification matter.
- **Labour and wages by sector:** unemployment per province, and migration of workers toward jobs (ties into §6).
- **Infrastructure tiers** per province (roads, rail, power grid, ports) as a visible stat. Infrastructure multiplies resource extraction and lowers internal transport cost.
- **Diminishing returns:** industry capacity in a place has a soft saturation tied to its labour pool and resource potential. This fixes runaway stacking of a single building.
- **State enterprises vs private investment:** private investment auto-builds a small share of capacity where returns are high, scaled by ideology. Laissez-faire means more private investment, and a planned economy means more state control through the auto-build fund.

---

## 5. Keybinds
- **P:** toggle province borders and labels on or off. It's a global key in `workspace.js` and is ignored while typing in inputs. It's added to the shortcuts dialog and works in both the generator and the game.
- Also proposed:
  - `D` opens Demographics
  - `E` opens Economy
  - `T` opens Trade
  - `M` cycles map-mode groups
  - `Esc` closes the top panel
  - `Ctrl+K` opens the command palette

  These new keys can be rebound in the shortcuts dialog (stored in localStorage).

---

## 6. Demographics system

### 6.1 Data model
- Per **place** (city + each province's countryside, matching the economy runtime), a compact cohort table:
  - Population by **age band** (0–14, 15–29, 30–44, 45–64, 65+). Five bands keep it cheap.
  - Shares by **culture, language and religion**, as sparse maps (top 6 groups + "other").
  - Urban/rural flag, literacy %, life expectancy, fertility rate, mortality rate, net migration.
- Saved in `meta.game.demography` (plain JSON, versioned, validated). Generator layers stay untouched, and the map reads live demography during play.
- Initialised from the generated census (existing majority/minority layers, cohorts and `noReligionShare`). Age structure comes from tech level/development (young pyramids in low-tech, aging in high-tech).

### 6.2 Dynamics (monthly accumulation, applied at census)
- **Natural growth:** fertility and mortality depend on development, food prices (§4.3), healthcare spending, urbanization, war/famine shocks and religion (pronatalist faiths). It follows a demographic transition curve: high/high → high/low → low/low.
- **Aging:** cohorts roll forward each year.
- **Urbanization:** rural→urban migration is driven by the urban wage premium, jobs, housing (housing buildings) and land pressure (`landPressure`). Cities grow and new towns can appear above a threshold (rendered by the procedural city system).
- **Internal migration:** toward jobs and stability, and away from famine or unrest.
- **International migration:** gravity between nations weighted by wage gap, stability gap, shared language/religion, borders and policy (§6.4). Emigration for the sender, immigration for the receiver.
- **Assimilation:** culture/language drift toward the local majority and the national language. The rate depends on urbanization, education, shared religion and policy. Minorities concentrated in their homeland resist, and dispersed ones assimilate faster.
- **Language shift** follows culture but also schooling language (standardization) and trade/prestige languages.
- **Religious change:** conversion pressure from the state religion (theocracy policy), missionaries (initiatives), proximity, secularisation from development/education (No Religion grows in secular states and shrinks in theocracies, §1.2), and revival events.
- **Hidden truth vs census:** the simulation tracks the "true" state continuously, but the **player only sees census figures**. The demographic UI and map modes show the last census plus "estimated" projections, with an uncertainty band that widens since the last census.

### 6.3 Census
- **Census policy:** every 1, 2, 5 or 10 years, or None. Cost per census scales with population and inversely with the interval (an annual census is pricey). Administration quality affects accuracy: low admin gives noisy census results, shown as error bars.
- **Emergency census:** one-off, costs more, and takes 3 months to complete (progress shown in the alert bar).
- Census day applies accumulated changes to the visible data, posts a **Census report** (a modal summary of biggest changes, with a "What changed" diff map), and refreshes projections.
- AI nations hold censuses on their own intervals. The player sees AI demographic data as of the AI's last census, or as "estimate" if they have none.

### 6.4 Policies and initiatives
- **Immigration policy:** Closed / Selective (skilled, which gives a literacy boost and smaller numbers) / Regulated / Open / Recruitment drive (pays to attract). Also a **refugee policy**. Affects labour supply, wages, stability (by public mood and ideology) and cultural composition.
- **Citizenship and minority policy:** Assimilationist / Integrationist / Multicultural / Autonomy for minorities. Sets assimilation rates and minority stability.
- **Official language(s):** one, or multiple bilingual regions.
- **State religion:** None (secular), established church, or theocratic enforcement. Tolerance level is a slider.
- **Initiatives** (cost, duration, cooldown, scoped like economy initiatives):
  - Natalist programme (child benefits): +fertility, costs welfare budget.
  - Public health campaign: −mortality, +life expectancy.
  - Mass literacy / school expansion: +literacy, faster language standardization.
  - Language standardization (national, province): shifts the language share toward the official language. The minority stability penalty depends on policy.
  - Assimilation drive (province): faster cultural assimilation, with an unrest risk.
  - Religious mission / promotion: conversion pressure in a province.
  - Cultural autonomy charter (province): stops assimilation, +minority stability.
  - Resettlement / colonisation (from crowded to sparse provinces): moves population, raises land use.
  - Urban renewal: housing and sanitation in a city, more urban growth capacity.
  - Census modernisation: improves census accuracy and lowers cost.
- Cultural/religious groups have a **satisfaction** value feeding national stability, depending on policies, representation and assimilation pressure. Unhappy concentrated minorities show as hotspots.

### 6.5 Demographics panel (`D`, button in top strip)
- **Overview tab:**
  - Total population with census date and next census countdown.
  - Growth rate chip (natural vs migration split, as a stacked bar).
  - Urbanization gauge.
  - Population pyramid (with the previous census overlaid as an outline).
  - Life expectancy, literacy, fertility tiles with sparklines.
- **Groups tab:**
  - Three donuts (Culture, Language, Religion). Clicking a group slice highlights where it lives on the map.
  - A group card for each group: population, growth since last census, age profile mini-pyramid, satisfaction, top provinces.
- **Places tab:** sortable table of provinces with expandable city rows. Columns: population, Δ%, urban %, majority culture/language/religion chips with %, diversity index, literacy, net migration. Rows carry inline bars and sparklines. Selecting a row zooms the map.
- **Migration tab:** inflow/outflow Sankey by source/destination nation, internal migration arrows on the map, immigration policy controls and their projected effects.
- **Projections tab:** population projection 5/10/20/30 years. Scenarios (current policy, or with a natalist programme / open immigration) with an uncertainty fan chart. Group-share projections show as stacked area to 20–30 years. The projection uses the same model run forward on aggregates (fast).
- **Policies tab:** census interval, immigration, minority, language, religion settings, initiatives list (cards with cost/effects icons, active timers).

### 6.6 Demographic map modes and focus mode
- When the panel is open, the map enters **focus mode**. Foreign nations are painted a uniform muted grey with borders only (toggle "show neighbours"). Your nation shows the active demographic layer, and switching between panel tabs/sub-layers switches the map.
- Layers:
  - population density
  - growth rate (diverging)
  - urbanization
  - culture, language, religion (majority)
  - diversity index
  - literacy
  - life expectancy
  - median age
  - net migration
  - group satisfaction
  - single-group share (choose a group; sequential)
- **Mixed regions:** where the top two (or three) groups are within a margin (default: top share < 55 % and second ≥ 35 %, configurable), the region is filled with **diagonal dashed stripes** alternating the groups' colours (stripe width proportional to share). Implemented as a cached canvas pattern per colour pair/triple, clipped to the province/cell region, LOD-aware so stripes stay a constant screen width.
- Legend updates with group swatches. Hovering a province gives a popup with a full breakdown.

---

## 7. AI nations: living world
- **Annual strategic tick plus monthly lightweight drift:**
  - Per AI nation per year: run the same aggregate economy model (evaluate on aggregates, no per-day construction) and demography model (aggregates at national/province level).
  - Monthly: interpolate.
  - Cost is O(nations), budgeted, so 200 nations stay a few ms per month.
- **Ideology-driven policy profiles:** each government/ideology maps to an AI personality: preferred tax system, spending mix, welfare level, tariff stance, immigration/minority policy, investment priorities. Personalities have seeded variation and drift with stability: unstable regimes may reform, and very unstable ones can flip ideology through a reform event, logged in a world news feed.
- **AI investment:** each year allocate the build budget to the best-return projects by personality (planned economies favour heavy industry and energy, liberal ones services and trade, theocracies temples, and so on). Province output rises accordingly, which visibly changes map modes over decades.
- **AI trade behaviour:** seek agreements with complementary-resource partners, join blocs with similar ideologies/religions, impose or join sanctions according to relations, respond to player sanctions (retaliation, alternative partners).
- **AI demography:** natural growth, urbanization, assimilation and migration using the same functions with the AI's policies.
- **Outcomes visible to the player:**
  - A **World panel/news feed**: "Kesh enters recession", "Morvaren adopts free trade", "Population of Ulan passes 20 M", "Famine in the Dalt provinces".
  - Nation cards show GDP and population trends.
  - A world ranking table (GDP, population, growth, trade).
- **Determinism:** seeded per nation-year, so a reloaded save evolves identically.

---

## 8. Auto-build fund
- In Construction: assign a **% of revenue** (or a fixed monthly amount) to the fund. The balance accumulates in a separate treasury line.
- **Directives** (ordered list, each with an enable toggle and a share of the fund):
  - Building type: a specific building, or a category such as "best productive", "housing where shortage", "ports", "civic for stability".
  - Location filter: a specific place, province, set of provinces, "anywhere", "where resource X", "lowest-income provinces" (regional development), or "where unemployment > Y".
  - Rules: max concurrent projects, min expected return/payback, size preference, stop when N built or when the target metric is met.
- When the fund can cover a project's cost, it queues the best site per directive using the same site-scoring as the map-first construction picker. Each project carries an "auto" badge. The player can cancel or adopt it.
- A fund report shows spending, projects built and the realised return. Presets include "Balanced growth", "Industrialise", "Regional development", "Housing first" and "Prestige".
- Shared with the AI investment logic (§7), so both use one code path.

---

## 9. Map modes (new)
Grouped in the layer bar under **Economy / Resources / Trade / Demography**. Each one has a legend and a hover read-out.

- **Economy:**
  - GDP per capita
  - GDP growth
  - dominant industry
  - unemployment
  - wages/income
  - tax revenue per province
  - infrastructure level
  - construction activity (active projects)
  - auto-build fund targets
  - development index
- **Resources:**
  - each resource (deposit/potential heat, revealed only)
  - a "dominant resource" mode with icons
  - resource shortages (goods with deficit by province demand)
  - extraction intensity
- **Trade:**
  - improved routes (§4.5)
  - trade partners (your partners coloured by volume/terms)
  - trade blocs
  - sanctions (sanctioning/sanctioned nations)
  - relations with you
  - import dependence
  - market access (cost distance to nearest major hub)
- **Prices:** a regional price-level mode, showing where goods are expensive or cheap.
- **Demography:** see §6.6. Also available outside the panel, without focus mode.

---

## 10. More detailed borders (LOD *adds* detail)
- Currently LOD only simplifies. The new approach: at zoom levels finer than the grid cell, borders are **refined procedurally** so new shapes emerge as you zoom.
- Method:
  1. Each shared border chain is subdivided recursively by midpoint displacement. Displacement is seeded by the chain's endpoints (stable and deterministic for both neighbours), so adjacent fills still meet exactly.
  2. Amplitude decays per octave (fractal dimension ~1.2–1.3).
  3. **Terrain-guided:** displacement is biased toward nearby rivers (snap to river vectors when a border follows a river barrier), ridge crests (from `naturalBarrier`) and coastlines, so close-up borders follow plausible features instead of random squiggles.
  4. Constraints: displacement stays within the two cells adjacent to the edge (≤ ~0.45 cell), which can never cross another chain or junction. Junction vertices are pinned.
- **LOD bands:** zoomed out, existing simplification. At 1–2× cell resolution, the current corner-cut. Past that, each additional zoom octave adds one subdivision octave (up to 6–8), so the line gets visibly more intricate. Refined chains are generated lazily for visible chains only and cached in an LRU keyed by chain id + octave, sharing the tile-cache budget.
- Applies to national borders, province borders, and demographic/cultural region outlines. Fill polygons use the same refined chains, which keeps the shared-chain invariant documented in v8.
- Optional setting: "Border detail" (Off / Natural / Rugged) for amplitude.
- Rivers used as borders render the border alongside the river line rather than across it.

---

## 11. Other fixes and improvements
- Fix anything the baseline test run or the balance harness surfaces, and list every fix in the CHANGELOG.
- **Performance:** move the monthly AI/demography/market ticks into a worker if a profile shows main-thread jank. Throttle panel re-renders to once per in-game day at high speeds.
- **Save compatibility:** `GAME_VERSION` 3 with an upgrade path from v2 campaigns (economy kept; demography and resources initialised from generated data). The world schema bump for resource layers can be regenerated on import.
- **Event log / history** (shared by economy, demography, AI news), stored compactly per month.
- **Tutorial hints:** first time each panel is opened, a short dismissible tour of 3–4 callouts.
- Tests: unit tests for the name registry, colour separation, resource generation realism (e.g. no fish inland, coal in basins), market clearing, sanctions, census timing, demographic conservation (population is only created by births and migration), AI determinism. Browser tests cover the new panels and the P key.
- Update `ARCHITECTURE.md` with "Version 10 contracts", plus the CHANGELOG.

---

## 12. Proposed delivery order
1. Baseline tests, polish (§1), GitHub Pages (§3), P key (§5)
2. Balance harness and balance fixes (§4.1), resources (§4.2), goods market (§4.3)
3. Trade network, agreements, sanctions, trade map (§4.4–4.5), supporting systems (§4.6)
4. UI chart kit and the economy/industry/construction/reforms/trade panel redesign (§2), auto-build fund (§8)
5. Demographics model, census, policies, panel, focus/mixed-region maps (§6)
6. AI living world (§7), new map modes (§9)
7. Border LOD detail (§10), cleanup, docs (§11)

Each stage is a separate commit series with tests passing, so it can be reviewed or paused at any boundary.

## Questions for you
1. **Scope:** do you want the full goods market (§4.3), or a lighter "resources give bonuses + trade surplus/deficit" model? The full market feels better but costs more to build and to balance.
2. **Census fog:** is it OK that you see only census figures rather than the live truth? (Proposed: yes, with estimates.)
3. **Relations/diplomacy:** keep it limited to trade and sanctions, or lay groundwork for wider diplomacy?
4. **Border detail default:** "Natural" amplitude on by default?
