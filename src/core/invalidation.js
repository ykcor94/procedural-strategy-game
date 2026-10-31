// Named products and their direct consumers. Add stages without teaching the editor internals.
export const DEPENDENCIES = Object.freeze({
  elevation:['climate','hydrology'], climate:['koppen','hydrology'], koppen:['biomes'],
  hydrology:['surface','biomes'],surface:['biomes'], biomes:['statistics'], statistics:['render'],
});
export function affectedBy(products) {
  const affected=new Set(products), queue=[...products];
  while(queue.length){for(const dependent of DEPENDENCIES[queue.shift()]||[])if(!affected.has(dependent)){affected.add(dependent);queue.push(dependent);}}
  return affected;
}
export const SETTING_PRODUCTS = Object.freeze({
  seed:'terrain',width:'terrain',height:'terrain',landCoverage:'terrain',style:'terrain',fragmentation:'terrain',ruggedness:'terrain',mountainIntensity:'terrain',minElevation:'terrain',maxElevation:'terrain',
  coastDetail:'terrain',islandAbundance:'terrain',tectonicActivity:'terrain',erosion:'terrain',
  continentCount:'terrain',landformProfile:'terrain',plainsElevation:'terrain',plateauStrength:'terrain',rangeWidth:'terrain',valleyStrength:'terrain',volcanism:'terrain',shelfWidth:'terrain',riverFertility:'surface',
  mountainStyle:'terrain',mountainSpread:'terrain',terrainChaos:'terrain',highlandExtent:'terrain',highlandUplift:'terrain',
  axialTilt:'climate',temperatureOffset:'climate',wetness:'climate',riverAbundance:'hydrology',lakeAbundance:'hydrology',
});
export function stagesForSettings(before,after){const out=new Set();for(const [k,stage] of Object.entries(SETTING_PRODUCTS))if(before[k]!==after[k])out.add(stage);return out;}
