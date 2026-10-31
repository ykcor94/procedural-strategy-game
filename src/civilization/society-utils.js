import {clamp,rowArea,wrappedDelta} from '../core/geo.js';
import {hashSeed,seededRandom} from '../core/random.js';
import {generateName,generatePersonName,generateToponym} from './names.js';
export {clamp,wrappedDelta,hashSeed,seededRandom,generateName,generatePersonName,generateToponym};
export const PLANET_AREA=4*Math.PI*6371**2;
export const xy=(cell,width)=>({x:cell%width+.5,y:Math.floor(cell/width)+.5});
export const neighbors=(cell,width,height,fn)=>{const x=cell%width,y=Math.floor(cell/width);fn(y*width+(x+width-1)%width);fn(y*width+(x+1)%width);if(y>0)fn(cell-width);if(y<height-1)fn(cell+width);};
export const areas=world=>Array.from({length:world.height},(_,y)=>rowArea(y,world.height)*PLANET_AREA/(2*world.width));
export function languageAt(world,cell){const civ=world.meta.civilization,id=world.layers.language?.[cell]||world.layers.culture?.[cell];return civ.languages?.find(l=>l.id===id)||civ.cultures.find(c=>c.id===world.layers.culture?.[cell])?.language||civ.cultures[0]?.language;}
/** Residents of a settlement by cell: [cell,count,cell,count…]. Metropolitan
 * populations extend into neighbouring cells; older saves keep one cell. */
export function cityFootprint(city){const f=city.footprint;if(Array.isArray(f)&&f.length>=2&&f.length%2===0){let sum=0;for(let k=1;k<f.length;k+=2)sum+=f[k];if(Math.abs(sum-city.population)<1&&f[0]===city.cell)return f;}return [city.cell,city.population];}
export function pointDistance(a,b,width){const dx=wrappedDelta(a.x,b.x,width),dy=a.y-b.y;return Math.hypot(dx,dy);}
export function mixHex(hex,amount){const n=parseInt(String(hex||'#9d9c88').replace('#',''),16);return '#'+[n>>16&255,n>>8&255,n&255].map(c=>Math.round(clamp(c+(amount>=0?255-c:c)*amount,0,255)).toString(16).padStart(2,'0')).join('');}
export function seededColor(id,seed){const palette=['#967c79','#718e85','#9c926e','#7c8a9c','#9a8192','#8d9977','#aa8d6b','#78999a','#827b96','#a19b85','#6e8491','#ad938f'];return mixHex(palette[(id*7+hashSeed(seed))%palette.length],((id*23%11)-5)*.018);}
export function add(map,id,population){if(id&&population>0)map.set(id,(map.get(id)||0)+population);}
export function composition(map,total){return [...map].filter(([,population])=>population>1e-7).map(([id,population])=>({id,population,share:total?population/total:0})).sort((a,b)=>b.population-a.population);}
export function normalizeMix(map,total){let sum=0;for(const value of map.values())sum+=Math.max(0,value);if(!sum)return [];return [...map].filter(([,value])=>value>0).map(([id,value])=>({id,population:total*value/sum,share:value/sum})).sort((a,b)=>b.population-a.population);}
export function featureWords(world,cell){const l=world.layers,e=l.elevation[cell],out=[];if(l.river?.[cell]||l.riverDistance?.[cell]<2)out.push('river','water','mouth');let coast=false;neighbors(cell,world.width,world.height,j=>{coast||=l.elevation[j]<=0;});if(coast)out.push('sea','harbor');if(e>1600)out.push('mountain','stone');else if(e>500)out.push('hill');if((l.surfaceMoisture?.[cell]||0)>.55)out.push('forest','green');return out.length?out:['plain','field','sun'];}
/** Heap entries carry immutable priorities; stale entries are ignored by callers. */
export class Queue{constructor(){this.items=[];}get size(){return this.items.length;}push(cell,id,cost){const item={cell,id,cost},a=this.items;let k=a.length;a.push(item);while(k){const p=(k-1)>>1;if(a[p].cost<=cost)break;a[k]=a[p];k=p;}a[k]=item;}pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let k=0;while(k*2+1<a.length){let child=k*2+1;if(child+1<a.length&&a[child+1].cost<a[child].cost)child++;if(a[child].cost>=last.cost)break;a[k]=a[child];k=child;}a[k]=last;}return first;}}
