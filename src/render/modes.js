import {KOPPEN} from '../data/climates.js';
import {BIOMES} from '../data/biomes.js';
import {clamp,lerp} from '../core/geo.js';
import {civilizationColor} from './civilization-renderer.js';
export const MAP_MODES = new Map();
export function registerMapMode(id,definition){if(MAP_MODES.has(id))throw new Error(`Map mode ${id} exists`);MAP_MODES.set(id,definition);}
const rgb=hex=>{if(Array.isArray(hex))return hex;const s=hex.replace('#','');return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)];};
const palette=registry=>Object.fromEntries(registry.map(x=>[x.id,rgb(x.color)]));
const climateColors=palette(KOPPEN),biomeColors=palette(BIOMES);
export function gradient(stops,value){if(value<=stops[0][0])return stops[0][1];for(let j=1;j<stops.length;j++){if(value<=stops[j][0]){const a=stops[j-1],b=stops[j],t=(value-a[0])/(b[0]-a[0]);return a[1].map((v,k)=>lerp(v,b[1][k],t));}}return stops.at(-1)[1];}
export const SEA=[[ -10000,[3,15,28]],[-4500,[7,28,43]],[-1800,[11,61,72]],[-300,[22,101,110]],[0,[67,135,133]]];
const LAND=[[0,[171,172,120]],[250,[126,146,94]],[700,[118,133,85]],[1500,[134,136,99]],[2500,[155,144,118]],[3800,[172,165,151]],[5200,[214,211,200]],[7000,[243,242,233]]];
const TEMP=[[-40,[105,112,174]],[-15,[129,172,203]],[0,[201,218,217]],[12,[232,222,158]],[24,[216,153,83]],[38,[164,67,49]],[55,[103,35,44]]];
const RAIN=[[0,[192,160,108]],[200,[221,204,148]],[500,[192,207,158]],[1000,[125,172,148]],[2000,[64,128,132]],[3500,[44,84,116]],[6000,[55,54,104]]];
const VEGETATION=[[0,[199,177,128]],[.12,[180,170,117]],[.3,[144,154,103]],[.55,[91,132,83]],[.8,[52,108,73]],[1,[35,85,67]]];
const ocean=(l,i)=>gradient(SEA,l.elevation[i]);
export const elevationColor=e=>gradient(e>0?LAND:SEA,e);
export const biomeColor=(e,id)=>e<=0?gradient(SEA,e):id===0?[167,161,120]:biomeColors[id]||[140,140,140];
export function physicalColor(elevation,moisture,temperature,biome,warmest) {
  if(elevation<=0)return gradient(SEA,elevation);
  if(Number.isFinite(warmest)&&warmest<=-3)return [228,235,235];
  const a=gradient(LAND,elevation),code=BIOMES[biome]?.code,b=code==='ocean'||code==='ice'?a:biomeColors[biome]||a;
  if(code==='ice'&&!Number.isFinite(warmest))return [228,235,235];
  // Physical colors follow continuous moisture, with a small class contribution.
  // The categorical biome mode remains available for inspecting exact boundaries.
  const v=gradient(VEGETATION,moisture),cold=clamp((7-temperature)/20,0,.65);
  const blend=elevation>3500?.18:code==='alpine'?.38:.72;
  const snow=Number.isFinite(warmest)?clamp((2-warmest)/5,0,1):0;
  if(Number.isFinite(warmest)) {
    const rock=clamp((elevation-1100)/4800,0,.7),tundra=[145,155,132];
    return a.map((value,j)=>lerp(lerp(lerp(v[j],tundra[j],cold),value,.24+rock),[228,235,235][j],snow));
  }
  return a.map((value,j)=>lerp(lerp(value,lerp(v[j],b[j],.25+cold),blend),[228,235,235][j],snow));
}
registerMapMode('physical',{name:'Physical',description:'Terrain, vegetation, shelves & sea ice',monthly:true,color:(l,i)=>physicalColor(l.elevation[i],(l.surfaceMoisture||l.soilMoisture)[i],l.annualTemperature[i],l.biome[i],l.warmestTemperature?.[i])});
registerMapMode('biome',{name:'Biome',description:'Vegetation & surface environments',registry:BIOMES,color:(l,i)=>l.elevation[i]<=0?ocean(l,i):(biomeColors[l.biome[i]]||[140,140,140])});
registerMapMode('koppen',{name:'Köppen',description:'Köppen–Geiger climate classification',registry:KOPPEN,color:(l,i)=>climateColors[l.koppen[i]]||[25,53,70]});
registerMapMode('elevation',{name:'Elevation',description:'Meters above and below sea level',stops:[...SEA,...LAND],color:(l,i)=>gradient(l.elevation[i]>0?LAND:SEA,l.elevation[i])});
registerMapMode('temperature',{name:'Temperature',description:'Surface air temperature · °C',monthly:true,stops:TEMP,color:(l,i,m,n)=>gradient(TEMP,m<0?l.annualTemperature[i]:l.temperature[m*n+i])});
registerMapMode('precipitation',{name:'Precipitation',description:'Rain and snow · annual-equivalent mm',monthly:true,stops:RAIN,color:(l,i,m,n)=>gradient(RAIN,m<0?l.annualPrecipitation[i]:l.precipitation[m*n+i]*12)});
registerMapMode('hydrology',{name:'Hydrology',description:'Drainage basins, lakes & river networks',color(l,i){if(l.elevation[i]<=0)return [22,46,62];const b=Math.max(0,l.basin[i]),t=((Math.imul(b+1,2654435761)>>>8)%360)*Math.PI/180;return [136+20*Math.cos(t),151+20*Math.cos(t+2),133+20*Math.cos(t+4)];}});
for(const [id,name,description]of [
  ['political','Political','Countries, borders and capitals'],
  ['flags','National flags','National flags'],
  ['cultural','Cultural','Cultural homelands'],
  ['cultural-family','Cultural families','Language families'],
  ['linguistic','Linguistic','Majority language'],
  ['religion','Religion','Majority religion'],
  ['technology','Technology','Technology level'],
  ['economy-nations','National economies','National output (log scale)'],
  ['ideology','Government','Government ideology']
])registerMapMode(id,{name,description,civilization:true,color:(l,i,m,n,world)=>civilizationColor(id,l,i,world)});
const POPULATION=[[0,[223,224,197]],[1,[183,204,171]],[10,[118,173,157]],[50,[68,131,143]],[200,[67,92,133]],[700,[133,76,114]],[2000,[213,123,94]],[6000,[255,220,145]]];
registerMapMode('population',{name:'Population',description:'People per km²',civilization:true,stops:POPULATION,color:(l,i,m,n,world)=>{if(l.elevation[i]<=0)return [20,45,59];if(!l.population||!world)return [154,157,135];const y=Math.floor(i/world.width),area=2*Math.PI*6371**2/world.width*(Math.sin(Math.PI/2-y*Math.PI/world.height)-Math.sin(Math.PI/2-(y+1)*Math.PI/world.height));return gradient(POPULATION,l.population[i]/Math.max(.001,area));}});
const SUITABILITY=[[0,[176,162,133]],[.2,[203,191,143]],[.4,[183,192,137]],[.6,[132,174,127]],[.8,[76,141,125]],[1,[42,105,112]]];
registerMapMode('habitability',{name:'Settlement potential',description:'Settlement suitability',civilization:true,stops:SUITABILITY,color:(l,i)=>l.elevation[i]<=0?[20,45,59]:gradient(SUITABILITY,l.habitability?.[i]||0)});
const ECONOMY=[[0,[191,181,146]],[2000,[174,189,151]],[10000,[118,169,154]],[30000,[68,135,147]],[70000,[76,105,142]],[150000,[139,99,137]]];
registerMapMode('economy',{name:'Economy',description:'Output per person',civilization:true,stops:ECONOMY,color:(l,i)=>l.elevation[i]<=0?[20,45,59]:gradient(ECONOMY,l.productivity?.[i]||(l.economicOutput?.[i]||0)/Math.max(1,l.population?.[i]||1))});
registerMapMode('trade',{name:'Trade networks',description:'Trade routes by sea, river and land',civilization:true,color:(l,i)=>l.elevation[i]<=0?[20,45,59]:gradient(ECONOMY,(l.productivity?.[i]||0)*.7)});
