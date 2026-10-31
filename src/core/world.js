import {validateSettings} from './settings.js';
export const WORLD_VERSION = 3;
export const LAYER_REGISTRY = new Map();
export function registerLayer(name, definition) {
  if(LAYER_REGISTRY.has(name)) throw new Error(`Layer ${name} already registered.`);
  LAYER_REGISTRY.set(name, Object.freeze({...definition}));
}
for(const [name,type,units] of [['elevation','Float32Array','m'],['baseElevation','Float32Array','m'],['temperature','Float32Array','°C'],['precipitation','Float32Array','mm/month'],['annualTemperature','Float32Array','°C'],['annualPrecipitation','Float32Array','mm/year'],['koppen','Uint8Array','class'],['biome','Uint8Array','class'],['flow','Float32Array','m³/s'],['flowTo','Int32Array','index'],['basin','Int32Array','id'],['lake','Uint8Array','mask'],['river','Uint8Array','mask']]) registerLayer(name,{type,units,domain:'geography'});
export function createWorld(settings) {
  settings=validateSettings(settings);
  return {version:WORLD_VERSION, width:settings.width, height:settings.height, seed:settings.seed, settings, name:'Untitled world', layers:{}, meta:{generationVersion:5,projection:'equirectangular',wrapX:true,months:12,regionSize:16,extensions:{},detail:{version:1,algorithm:'anchored-fbm-v1',edits:[]}}};
}
export function transferables(world) {
  // A binary import may share one large buffer. After partial recomputation,
  // compact retained small views instead of retaining an obsolete full atlas.
  const used=new Map();for(const a of Object.values(world.layers))if(ArrayBuffer.isView(a))used.set(a.buffer,(used.get(a.buffer)||0)+a.byteLength);
  for(const [name,a]of Object.entries(world.layers))if(used.get(a.buffer)<a.buffer.byteLength*.65)world.layers[name]=a.slice();
  return [...new Set(Object.values(world.layers).filter(ArrayBuffer.isView).map(a=>a.buffer))];
}
export function regionAt(world,index) {const s=world.meta.regionSize;return Math.floor(index%world.width/s)+Math.floor(Math.floor(index/world.width)/s)*Math.ceil(world.width/s);}
export function cloneWorld(world) {return {...world,settings:{...world.settings},meta:structuredClone(world.meta),layers:Object.fromEntries(Object.entries(world.layers).map(([k,v])=>[k,v.slice()]))};}
// Optional products and stable geographic references. Simulation modules register their own
// raster layers with domain:'simulation'; none are allocated by the geography generator.
for(const [name,type,units] of [['plate','Uint16Array','id'],['tectonicUplift','Float32Array','factor'],['soilMoisture','Float32Array','fraction'],['continentality','Float32Array','fraction'],['coastDistance','Float32Array','cells'],['filledElevation','Float32Array','m'],['runoff','Float32Array','mm/year'],['lakeId','Int32Array','id'],['lakeSurface','Float32Array','m'],['lakeDepth','Float32Array','m']]) registerLayer(name,{type,units,domain:'geography'});
for(const [name,type,units]of [['tectonicRift','Float32Array','factor'],['crustAge','Float32Array','fraction'],['seaIce','Uint8Array','monthly coverage / 255'],['annualIce','Uint8Array','coverage / 255'],['permanentIce','Uint8Array','coverage / 255'],['riverDistance','Float32Array','cells']])registerLayer(name,{type,units,domain:'geography'});
registerLayer('warmestTemperature',{type:'Float32Array',units:'°C',domain:'geography'});
for(const name of ['naturalMoisture','riparianMoisture','alluvium','floodplainFraction','surfaceMoisture'])registerLayer(name,{type:'Float32Array',units:'fraction',domain:'geography'});
registerLayer('volcanicUplift',{type:'Float32Array',units:'m',domain:'geography'});
registerLayer('landmass',{type:'Int32Array',units:'id',domain:'geography'});
for(const name of ['mountainUplift','highlandUplift'])registerLayer(name,{type:'Float32Array',units:'m',domain:'geography'});
// Persistent simulation products use the authoritative global grid, never visual LOD tiles.
for(const [name,type,units] of [['ownership','Uint16Array','nation id'],['culture','Uint16Array','culture id'],['cultureMinority','Uint16Array','culture id'],['minorityShare','Float32Array','fraction'],['population','Float64Array','inhabitants'],['habitability','Float32Array','fraction'],['settlementPotential','Float32Array','fraction']])registerLayer(name,{type,units,domain:'civilization'});
for(const [name,type,units] of [['language','Uint16Array','language id'],['languageMinority','Uint16Array','language id'],['languageMinorityShare','Float32Array','fraction'],['province','Uint16Array','province id'],['religion','Uint16Array','religion id'],['religionMinority','Uint16Array','religion id'],['religionMinorityShare','Float32Array','fraction'],['economicOutput','Float64Array','WU/year'],['productivity','Float32Array','WU/person/year'],['tradeAccess','Float32Array','fraction']])registerLayer(name,{type,units,domain:'civilization'});
export const CIVILIZATION_LAYER_NAMES=Object.freeze([...LAYER_REGISTRY].filter(([,definition])=>definition.domain==='civilization').map(([name])=>name));
