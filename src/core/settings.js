import {LANDFORMS} from '../data/landforms.js';
export const DEFAULTS = Object.freeze({
  seed: 'Thalassa-314', width: 640, height: 320, landCoverage: 0.31,
  style: 'earthlike', fragmentation: 0.46, ruggedness: 0.52, mountainIntensity: 0.65,
  minElevation: -8000, maxElevation: 6500, axialTilt: 23.4, temperatureOffset: 0,
  wetness: 1, riverAbundance: 0.5, lakeAbundance: 0.45, months: 12,
  coastDetail:0.72, islandAbundance:0.6, tectonicActivity:0.65, erosion:0.55,
  continentCount:0,landformProfile:'balanced',plainsElevation:180,plateauStrength:.45,rangeWidth:.5,valleyStrength:.45,volcanism:.25,shelfWidth:.5,riverFertility:.65,
  mountainStyle:'mixed',mountainSpread:.5,terrainChaos:.28,highlandExtent:.4,highlandUplift:1800,
});
export const PRESETS = Object.freeze({
  'Earth-like': {},
  'Supercontinent': {style:'supercontinent', landCoverage:0.35, fragmentation:0.22},
  'Archipelago': {style:'archipelago', landCoverage:0.25, fragmentation:0.78},
  'Fragmented': {style:'fragmented', landCoverage:0.36, fragmentation:0.7},
  'Ice Age': {temperatureOffset:-8, wetness:0.8, landCoverage:0.36, axialTilt:22},
  'Desert World': {temperatureOffset:6, wetness:0.32, landCoverage:0.42},
  'Water World': {landCoverage:0.12, style:'archipelago', wetness:1.3},
  'Highlands': {landformProfile:'highlands',plateauStrength:.7,landCoverage:.4},
  'Volcanic World': {landformProfile:'volcanic',volcanism:.8,style:'archipelago'},
  'High Plateaus': {mountainStyle:'folded',highlandExtent:.75,highlandUplift:4300,plateauStrength:.8,rangeWidth:.75,mountainSpread:.65,mountainIntensity:.55},
  'Cordilleras': {mountainStyle:'cordillera',mountainSpread:.55,rangeWidth:.25,mountainIntensity:.85,highlandExtent:.3,highlandUplift:2400},
  'Chaotic Uplands': {mountainStyle:'broken',terrainChaos:.9,mountainSpread:.85,highlandExtent:.6,highlandUplift:2700,ruggedness:.8},
});
export const LIMITS = Object.freeze({ width:[128,2048], height:[64,1024], landCoverage:[0.05,0.85], fragmentation:[0,1], ruggedness:[0,1], mountainIntensity:[0,1], minElevation:[-12000,-100], maxElevation:[100,12000], axialTilt:[0,60], temperatureOffset:[-25,25], wetness:[0.1,3], riverAbundance:[0,1], lakeAbundance:[0,1],coastDetail:[0,1],islandAbundance:[0,1],tectonicActivity:[0,1],erosion:[0,1],continentCount:[0,10],plainsElevation:[0,1500],plateauStrength:[0,1],rangeWidth:[0,1],valleyStrength:[0,1],volcanism:[0,1],shelfWidth:[0,1],riverFertility:[0,1],mountainSpread:[0,1],terrainChaos:[0,1],highlandExtent:[0,1],highlandUplift:[0,6000] });
export function validateSettings(input = {}) {
  const out = {...DEFAULTS, ...input};
  out.seed = String(out.seed).trim().slice(0,128);
  if (!out.seed) throw new Error('Enter a seed.');
  for (const [key,[min,max]] of Object.entries(LIMITS)) {
    const v = Number(out[key]);
    if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${key} must be between ${min} and ${max}.`);
    out[key] = v;
  }
  out.width = Math.round(out.width); out.height = Math.round(out.height);
  if(!Number.isInteger(out.continentCount))throw new Error('Target continents must be a whole number from 0 to 10.');
  if(!['mixed','cordillera','folded','massif','broken'].includes(out.mountainStyle))throw new Error('Unknown mountain morphology.');
  if(!Object.hasOwn(LANDFORMS,out.landformProfile))throw new Error('Unknown landform profile.');
  if (out.width * out.height > 2097152) throw new Error('The global grid supports up to 2.1 million cells; LOD supplies regional detail separately.');
  if (!['earthlike','supercontinent','archipelago','fragmented'].includes(out.style)) throw new Error('Unknown continental style.');
  out.months = 12;
  return out;
}
