// A land-cover interpretation of Köppen climate, modified by terrain/water.
const entries = [
  ['ocean','Ocean','#315b70','Open ocean, seas, and continental shelves.'],
  ['rainforest','Tropical rainforest','#286445','Dense evergreen forest in a warm, consistently wet climate.'],
  ['seasonal-forest','Tropical seasonal forest','#63834b','Tropical woodland with a distinct seasonal moisture deficit.'],
  ['savanna','Savanna','#a6aa60','Warm grassland and scattered trees with a long dry season.'],
  ['hot-desert','Hot desert','#c7ac77','Very sparse vegetation in a hot, arid climate.'],
  ['cold-desert','Cold desert','#b6ab91','Sparse vegetation in a cool, arid climate.'],
  ['steppe','Steppe','#a3a377','Semi-arid grassland and low shrubs.'],
  ['grassland','Temperate grassland','#8f9e63','Open grassland where seasonal water supply limits tree cover.'],
  ['temperate-forest','Temperate forest','#527b51','Broadleaf and mixed forest with sufficient growing-season moisture.'],
  ['temperate-rainforest','Temperate rainforest','#326f60','Humid, mild forest with plentiful precipitation.'],
  ['mediterranean','Mediterranean shrubland','#a4a06b','Drought-adapted shrubland and woodland with dry summers.'],
  ['taiga','Taiga','#55786b','Boreal conifer forest with long winters and a short growing season.'],
  ['tundra','Tundra','#9ba68d','Cold, treeless vegetation above the climatic tree line.'],
  ['ice','Ice cap','#e4ebeb','Permanent ice where no monthly mean rises above freezing.'],
  ['alpine','Alpine','#9faaa0','High mountain grass, shrubs, scree, and sparse cold-adapted vegetation.'],
  ['wetland','Wetland','#668d78','Wet lowlands adjoining persistent drainage and lakes.'],
  ['lake','Lake','#4b8b9d','Inland standing water in a drainage basin.'],
  ['river','River','#5a99ab','A connected channel with substantial accumulated runoff.'],
  ['coast','Coast','#c1b68b','Low shoreline margins exposed to marine water.'],
  ['montane','Montane forest','#667d60','Cool, moist upland forest below the alpine tree line.'],
  ['riparian','Riparian woodland','#528351','Woodland sustained by a major river, including within a regionally arid climate.'],
  ['delta','Delta wetland','#5c9070','Moist alluvial lowlands near a large river mouth, sustained by river water and deposition.'],
];
export const BIOMES=Object.freeze(entries.map(([code,name,color,description],id)=>Object.freeze({id,code,name,color,description})));
export const BIOME_BY_CODE=Object.freeze(Object.fromEntries(BIOMES.map(item=>[item.code,item])));
