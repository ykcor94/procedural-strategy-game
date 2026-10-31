import {WORLD_VERSION,LAYER_REGISTRY} from '../core/world.js';
import {validateSettings} from '../core/settings.js';
import {calculateStatistics} from '../core/statistics.js';
import {KOPPEN} from '../data/climates.js';
import {BIOMES} from '../data/biomes.js';
import {generateIce} from '../generation/ice.js';
import {validateDetail} from '../lod/detail-edits.js';
import {distanceToMask} from '../core/geo.js';
import {deriveSurfaceWater} from '../generation/surface-water.js';
import {deriveBiomes} from '../generation/biomes.js';
import {labelLandmasses} from '../generation/continents.js';
import {validateDrainage} from './validate-drainage.js';
import {validateCivilization,migrateCivilization} from '../civilization/generator.js';
import {normalizeGameState} from '../game/state.js';
const TYPES={Float32Array,Float64Array,Int32Array,Uint32Array,Int16Array,Uint16Array,Int8Array,Uint8Array};
const FRACTION_LAYERS=['naturalMoisture','riparianMoisture','alluvium','floodplainFraction','surfaceMoisture'];
export const MIGRATIONS = new Map([
  [1,doc=>({...doc,version:2,meta:{...doc.meta,detail:{version:1,algorithm:'anchored-fbm-v1',edits:[]}}})],
  [2,doc=>({...doc,version:3,settings:validateSettings(doc.settings)})],
]);
function encode(array){const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
function decode(encoded,type){const str=atob(encoded),bytes=new Uint8Array(str.length);for(let i=0;i<str.length;i++)bytes[i]=str.charCodeAt(i);if(bytes.length%TYPES[type].BYTES_PER_ELEMENT)throw new Error('Invalid layer byte length.');return new TYPES[type](bytes.buffer);}
export function serializeWorld(world){return JSON.stringify({format:'atlas-foundry',version:WORLD_VERSION,width:world.width,height:world.height,seed:world.seed,name:world.name,settings:world.settings,meta:world.meta,layers:Object.fromEntries(Object.entries(world.layers).map(([name,a])=>[name,{type:a.constructor.name,data:encode(a)}]))});}
export function deserializeWorld(text){
  let doc;try{doc=JSON.parse(text);}catch{throw new Error('The world file is not valid JSON.');}
  if(!doc||doc.format!=='atlas-foundry')throw new Error('This is not an Atlas Foundry world file.');
  const originalVersion=doc.version;
  while(doc.version<WORLD_VERSION&&MIGRATIONS.has(doc.version))doc=MIGRATIONS.get(doc.version)(doc);
  if(doc.version!==WORLD_VERSION)throw new Error(`Unsupported world version ${doc.version}. This app reads version ${WORLD_VERSION}.`);
  const settings=validateSettings(doc.settings);
  if(doc.width!==settings.width||doc.height!==settings.height||doc.seed!==settings.seed)throw new Error('World dimensions or seed disagree with settings.');
  const n=doc.width*doc.height,layers={};
  if(!doc.layers||Object.keys(doc.layers).length>100)throw new Error('Invalid layer collection.');
  for(const [name,entry]of Object.entries(doc.layers)){
    if(!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name)||!Object.hasOwn(TYPES,entry.type)||typeof entry.data!=='string'||entry.data.length>n*12*8)throw new Error(`Invalid layer: ${name}`);
    const a=decode(entry.data,entry.type),expected=['temperature','precipitation','seaIce'].includes(name)?n*12:n;
    if(a.length!==expected)throw new Error(`Wrong size for ${name}.`);
    if(a instanceof Float32Array||a instanceof Float64Array){for(const v of a)if(!Number.isFinite(v))throw new Error(`Non-finite value in ${name}.`);}
    layers[name]=a;
  }
  return restoreWorld(doc,layers,originalVersion);
}
export function restoreWorld(doc,layers,originalVersion=doc.version) {
  if(doc.format!=='atlas-foundry'||doc.version!==WORLD_VERSION)throw new Error('Unsupported world format or version.');
  const settings=validateSettings(doc.settings),n=settings.width*settings.height;
  if(doc.width!==settings.width||doc.height!==settings.height||doc.seed!==settings.seed)throw new Error('World dimensions or seed disagree with settings.');
  for(const [name,a]of Object.entries(layers)) {
    if(!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name)||!Object.hasOwn(TYPES,a.constructor.name)||a.length!==(['temperature','precipitation','seaIce'].includes(name)?n*12:n))throw new Error(`Invalid layer: ${name}`);
    if(a instanceof Float32Array||a instanceof Float64Array)for(const v of a)if(!Number.isFinite(v))throw new Error(`Non-finite value in ${name}.`);
    if(LAYER_REGISTRY.has(name)&&a.constructor.name!==LAYER_REGISTRY.get(name).type)throw new Error(`Wrong array type for ${name}.`);
  }
  const required={elevation:'Float32Array',baseElevation:'Float32Array',temperature:'Float32Array',precipitation:'Float32Array',annualTemperature:'Float32Array',annualPrecipitation:'Float32Array',soilMoisture:'Float32Array',koppen:'Uint8Array',biome:'Uint8Array',flow:'Float32Array',flowTo:'Int32Array',basin:'Int32Array',lake:'Uint8Array',river:'Uint8Array',filledElevation:'Float32Array',runoff:'Float32Array',lakeId:'Int32Array',lakeSurface:'Float32Array',lakeDepth:'Float32Array'};
  for(const [name,type]of Object.entries(required))if(layers[name]?.constructor.name!==type)throw new Error(`Missing or invalid ${name} layer.`);
  for(let i=0;i<n;i++){
    if(layers.flowTo[i]<-1||layers.flowTo[i]>=n)throw new Error('Invalid drainage reference.');
    if(layers.soilMoisture[i]<0||layers.soilMoisture[i]>1||layers.lake[i]>1||layers.river[i]>1||layers.flow[i]<0||layers.lakeDepth[i]<0)throw new Error('Invalid moisture or hydrology values.');
    if(layers.koppen[i]>=KOPPEN.length||layers.biome[i]>=BIOMES.length)throw new Error('Unknown climate or biome class.');
    for(const name of FRACTION_LAYERS)if(layers[name]&&(layers[name][i]<0||layers[name][i]>1))throw new Error(`Invalid ${name} fraction.`);
  }
  const world={version:doc.version,width:doc.width,height:doc.height,seed:doc.seed,name:String(doc.name||'Imported world').slice(0,80),settings,meta:{...doc.meta,projection:'equirectangular',wrapX:true,months:12,regionSize:16},layers};
  validateDrainage(layers,doc.width,doc.height);
  world.meta.detail=validateDetail(world.meta.detail);
  if(originalVersion===1)generateIce(world);
  else for(const name of ['seaIce','annualIce','permanentIce'])if(!(layers[name] instanceof Uint8Array))throw new Error(`Missing or invalid ${name} layer.`);
  if(!layers.warmestTemperature){const out=new Float32Array(n);out.fill(-Infinity);for(let m=0;m<12;m++)for(let i=0;i<n;i++)out[i]=Math.max(out[i],layers.temperature[m*n+i]);layers.warmestTemperature=out;}
  if(!layers.riverDistance){layers.riverDistance=distanceToMask(layers.river,doc.width,doc.height,1);for(let i=0;i<n;i++)if(!Number.isFinite(layers.riverDistance[i]))layers.riverDistance[i]=doc.width+doc.height;}
  if(!layers.surfaceMoisture||originalVersion<3){deriveSurfaceWater(world);deriveBiomes(world);}
  if(!layers.landmass||!world.meta.continents)labelLandmasses(world);
  world.meta.statistics=calculateStatistics(world);
  if(world.meta.civilization){migrateCivilization(world);validateCivilization(world);}
  normalizeGameState(world);
  return world;
}
export function download(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.hidden=true;(document.querySelector('dialog[open]')||document.body).append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
