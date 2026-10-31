# Changelog

## 9.0 · the economy

**Campaign**
- Play now simulates the player's nation. A treasury strip in the game header (treasury and monthly balance, stability, output) and a docked ministry panel with **Economy (E)**, **Reforms (R)**, **Construction (C)** and **Industry (I)** tabs.
- Revenue comes from seven taxes on what each place produces. Cities are taxed most readily, countryside less so, and trade routes through tariffs and port fees. Rates show their projected yield and revenue peak; spending, borrowing and repayment are in the same Budget page.
- Fourteen procedural industries partition each settlement's and province's generated output exactly. Geography, climate, rivers, coasts, holy sites, size and development decide the mix. City, province and nation panels show a drill-down industry card instead of three fixed shares.
- Construction queue: productive buildings, harbours, road and rail upgrades, housing and civic projects. Costs scale with local productivity; build speed scales with your construction and heavy industry. Crews, funds, a cash reserve, rush, pause and cancel.
- Nine reform axes (taxation, ideology, trade, welfare, labour, foreign investment, industrial policy, land, money) with public mood, phase-in, cooldowns, requirements and a visible price tag. A new stability system (national and per province) feeds collection, growth and building.
- Industry board (priority, subsidy and regulation per industry), ten national programmes, tariffs, embargoes, route upgrades and harbours as the basic trade layer.
- Campaign saves are version 2 and carry the economy; version 1 campaigns upgrade on load. Generator data is never modified by play.
- `node tests/economy-metrics.mjs` prints tax-to-output, stability, payback and ten-year drift across nations.

## 8.0

**Interface**
- New interface and design system: one token-based stylesheet set (`styles/`), dark and light themes, readable type, an inline icon set, and consistent wording (World, Peoples, Play).
- Header step navigation (World → Peoples → Play), a settings search (`/`), grouped map-layer popover (`L`), keyboard shortcuts dialog (`?`), panel toggles (`[`, `]`) and arrow-key panning.
- Nation picker rebuilt: cards with population, area, output per person and government; a list view; filters; data-driven quick picks (largest, most people, richest per person, most advanced, smallest, random); arrow-key and Enter navigation.
- Slimmer game HUD and pause menu; a notice when the game pauses in a background tab.

**Maps and rendering**
- Fixed flashing lines while zooming between detail levels: tile edges now snap to device pixels, so the land mask has no partial-alpha seams; level choice has hysteresis; pinned tiles are no longer evicted mid-zoom.
- Fixed small unclaimed-looking holes in religion, culture and language maps. They came from diagonal cell pinches, where every region rounded its corner away from the shared point.
- Borders are smoothed on shared chains between regions, so fills and strokes match exactly at every zoom.
- Borders now follow ridge crests, drainage divides, large rivers and lakes much more closely, with a bounded relaxation pass that slides frontiers onto nearby barriers.
- Cities: density gradient, coast-hugging footprint, curved streets and ring roads, industrial and harbour districts, climate-based roof palettes, outskirts with houses and fields from 25,000 residents, landmarks by city role.

**Simulation**
- Population follows carrying capacity (growing season, water, heat, terrain, soil and rivers). National inequality is bounded, regionally correlated and favours large, fertile countries; tiny or frozen countries can no longer hold huge populations.
- Output per person falls with crowding and rises with resource rents, so population alone no longer determines wealth.
- Metropolitan populations and their output spread into surrounding cells.
- Urbanization varies by national tradition, with a new variation setting.
- Trade uses gateways spread across the planet, every nation's main city and regional centres, with guaranteed long-haul links between landmasses. A trade-hub setting of 0 now disables routes.
- Non-religious populations form smooth regions that blend across borders; the setting is now the typical world share.
- Languages draw on 28 sound archetypes (familiar-feeling and invented) plus blends, with weighted sounds, onset clusters, codas, vowel harmony and multi-step dialect sound changes. Accented letters are rarer, more varied, and can be turned off.

## Earlier versions

- Version 7 adds nation selection and a playable map view with a saved player nation, pause controls, five clock speeds, campaign saving/resume and read-only inspectors. It also fixes LOD lighting flashes, improves polar claim connectivity and economic language contact, and adds configurable No Religion affiliation. Click **Play** after populating a world. Only the date advances during play; world simulation is a future step.
- Version 6.1 improves population-scaled city plans and outskirts, province capitals and population allocation, coastal language regions, retained terrain LOD, date-line province borders and refined-island ownership display. It adds inspector navigation, statistical directory sorting, numeric provincial atlases, middle-click map probes, national economic totals, demonym-based currencies and a collapsible layer bar. Generation remains independent of the physical planet. See the guide below for applying new generation rules to existing saves.
- The society update adds editable provinces, independent languages, religions, economies, technology, currencies and routed trade to the civilization generator. Political and flag maps now share geographic LOD, with a smooth close-up terrain reveal and unique procedural city plans. See [CIVILIZATION.md](CIVILIZATION.md) for generation settings, the provincial atlas, map controls and independent regeneration.
