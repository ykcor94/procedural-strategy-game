import {createWorld} from '../core/world.js';
import {validateSettings} from '../core/settings.js';
import {affectedBy} from '../core/invalidation.js';
import {calculateStatistics} from '../core/statistics.js';
import {generateTerrain} from './terrain.js';
import {generateClimate} from './climate.js';
import {classifyClimate} from './koppen.js';
import {deriveBiomes} from './biomes.js';
import {generateHydrology} from './hydrology.js';
import {generateIce} from './ice.js';
import {deriveSurfaceWater} from './surface-water.js';
import {labelLandmasses} from './continents.js';

export async function runPipeline({settings,world,products=['terrain']},report=()=>{}) {
  if(!world)world=createWorld(settings);
  else if(settings){settings=validateSettings(settings);if(settings.width!==world.width||settings.height!==world.height)throw new Error('Resolution changes require full generation.');world.settings={...settings};world.seed=settings.seed;}
  const dirty=affectedBy(products.includes('terrain')?['elevation']:products);
  const ctx={report,skipClassification:true};
  if(products.includes('terrain')){report('terrain',0,'Building continents');await generateTerrain(world,ctx);}
  else if(dirty.has('elevation'))labelLandmasses(world);
  if(dirty.has('climate')){report('climate',0,'Simulating twelve months');await generateClimate(world,ctx);generateIce(world);}
  if(dirty.has('koppen')){report('koppen',0,'Classifying climates');await classifyClimate(world);}
  if(dirty.has('hydrology')){report('hydrology',0,'Tracing drainage basins');await generateHydrology(world,ctx);}
  if(dirty.has('surface')){report('surface',0,'Moistening floodplains and deltas');deriveSurfaceWater(world);}
  if(dirty.has('biomes')){report('biomes',0,'Resolving vegetation');await deriveBiomes(world);}
  report('statistics',0,'Measuring world');
  world.meta.statistics=calculateStatistics(world);
  world.meta.revision=(world.meta.revision||0)+1;
  report('complete',1,'Ready');
  return world;
}
