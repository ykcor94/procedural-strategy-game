import {clamp} from '../core/geo.js';
import {hashSeed} from '../core/random.js';
import {fractalNoise} from '../generation/noise.js';
import {KOPPEN} from '../data/climates.js';
import {BIOMES} from '../data/biomes.js';
import {RESOURCE_IDS,RESOURCE_COUNT,GOOD_BY_ID} from '../data/resources.js';
/** Natural resources of every province, derived from the physical world: soils, climate and biomes for
 * farm goods; plate history (crust age, mountain and volcanic uplift, rifts) and drainage for minerals and
 * fuels. Deterministic and unsaved; mineral fields are clustered into belts and basins by seeded noise. */
const R=Object.fromEntries(RESOURCE_IDS.map((id,k)=>[id,k]));
const biomeCode=BIOMES.map(b=>b.code),koppenCode=KOPPEN.map(k=>k.code);
const FOREST={rainforest:.85,'seasonal-forest':.7,'temperate-forest':1,'temperate-rainforest':1,taiga:.95,montane:.7,riparian:.5};
const GRASS={savanna:.8,steppe:1,grassland:1,mediterranean:.55,'cold-desert':.25,'hot-desert':.12,tundra:.15,alpine:.3};

/** Raw scores (roughly 0–1) for one land cell. `n` holds the seeded belt noise for minerals. */
export function cellResources(l,i,w,h,noise,out){
  const t=l.annualTemperature[i],p=l.annualPrecipitation?.[i]??500,m=l.surfaceMoisture?.[i]??l.soilMoisture?.[i]??.4,a=l.alluvium?.[i]??0,elev=l.elevation[i],b=biomeCode[l.biome?.[i]]||'',k=koppenCode[l.koppen?.[i]]||'';
  const mountain=clamp((l.mountainUplift?.[i]||0)/2500,0,1.4),volcanic=clamp((l.volcanicUplift?.[i]||0)/40,0,1.5),rift=clamp(l.tectonicRift?.[i]||0,0,1.2),age=l.crustAge?.[i]??.5,coast=Math.exp(-(l.coastDistance?.[i]??6)/1.6),river=l.river?.[i]?1:Math.exp(-(l.riverDistance?.[i]??10)/3),dry=clamp(1-p/450,0,1),inland=(l.flowTo?.[i]??0)<0&&elev>0?1:0;
  const tempFit=t<0?0:t<6?.35:t<11?.75:t<27?1:.8,lowland=clamp(1-elev/2200,0,1),ice=b==='ice'?0:1;
  out[R.grain]=ice*clamp((.25+.75*m)*(.6+.9*a),0,1.3)*tempFit*lowland*(b==='hot-desert'||b==='cold-desert'?.15+.85*a:1)*(b==='tundra'?.1:1);
  out[R.livestock]=ice*(GRASS[b]||(.2*m))*(t<-6?.2:1)*(.6+.4*clamp(1-Math.abs(m-.45)*1.6,0,1));
  out[R.fish]=clamp(coast*(.55+.45*clamp((18-t)/22,0,1))*(b==='delta'||b==='wetland'?1.4:1)+.45*river*Math.min(1,Math.log10(1+(l.flow?.[i]||0))/4)+(l.lake?.[i]?.6:0),0,1.4);
  out[R.timber]=ice*(FOREST[b]||0)*(.6+.4*m);
  const cotton=t>18&&m>.25?clamp((t-18)/8,0,1)*clamp(.4+a+m*.5,0,1):0,wool=(GRASS[b]||0)*clamp((14-t)/14,0,1)*(t>-8?1:0);
  out[R.fibres]=ice*clamp(.9*cotton+.7*wool,0,1);
  const tropical=k.startsWith('A')?.85+.15*m:0,med=k.startsWith('Cs')?1:0,humidHighland=k.startsWith('Cw')||k.startsWith('Cf')&&t>14?.45:0;
  out[R.fruit]=ice*clamp(Math.max(tropical,med,humidHighland)*(elev<2600?1:.4),0,1);
  // Minerals: noise picks belts; geology decides which belts can carry which ore.
  const shield=clamp((age-.55)/.3,0,1)*(1-.5*mountain);
  out[R.iron]=clamp(shield*(.35+1.2*noise[0])+.25*mountain*noise[0],0,1.4);
  out[R.copper]=clamp((.7*mountain+.8*volcanic+.3*rift)*(.25+1.3*noise[1]),0,1.4);
  const basin=clamp(lowland*(1-mountain)*(.4+.6*clamp((age-.35)/.4,0,1)),0,1),nearOldRange=clamp((l.highlandUplift?.[i]||0)/600+.3,0,1);
  out[R.coal]=clamp(basin*nearOldRange*(.3+.7*clamp((p-250)/900,0,1)+.3)*(.1+1.5*noise[2]),0,1.4);
  out[R.oil]=clamp((basin*(.5+.6*dry)+.8*rift+.7*coast*lowland*(.5+.5*noise[4]))*(.05+1.6*Math.max(0,noise[3]-.15)),0,1.5);
  out[R.precious]=clamp((.9*mountain+1.1*volcanic+.4*rift+.3*shield)*Math.max(0,noise[5]-.35)*2.2,0,1.3);
  out[R.stone]=clamp(.35+.4*mountain+.25*clamp(elev/1500,0,1)+.15*volcanic,0,1);
  out[R.salt]=clamp(dry*(.25+.75*inland)*(t>5?1:.4)+.5*coast*dry*clamp((t-16)/10,0,1),0,1.2);
  out[R.gems]=clamp((shield*.9+volcanic*.6)*Math.max(0,noise[6]-.55)*3.2,0,1.2);
  return out;
}

const memo=new WeakMap();
/** Province resources for the whole world: `score` is the mean intensity (0–1+), `amount` scales by land
 * area so big provinces hold more. Cached per world and civilization revision. */
export function provinceResources(world){
  const civ=world.meta.civilization;if(!civ)return new Map();
  const key=`${civ.revision}:${civ.provinceRevision||0}`,cached=memo.get(world);if(cached?.key===key&&cached.layers===world.layers.province)return cached.map;
  const l=world.layers,w=world.width,h=world.height,map=new Map(),seed=hashSeed(`${world.seed}:${civ.seed}`,'mineral-belts'),noise=new Float32Array(7),out=new Float32Array(RESOURCE_COUNT);
  for(const p of civ.provinces||[])map.set(p.id,{id:p.id,nation:p.nation,cells:0,score:new Float32Array(RESOURCE_COUNT),amount:new Float32Array(RESOURCE_COUNT),peak:new Float32Array(RESOURCE_COUNT)});
  for(let i=0;i<w*h;i++){
    const rec=map.get(l.province?.[i]);if(!rec||!(l.elevation[i]>0))continue;
    const u=(i%w+.5)/w,v=(Math.floor(i/w)+.5)/h;
    for(let k=0;k<7;k++)noise[k]=clamp(.5+.9*fractalNoise(u,v,[5,6,4,3,9,7,8][k],3,seed+k*7919),0,1);
    cellResources(l,i,w,h,noise,out);rec.cells++;
    for(let k=0;k<RESOURCE_COUNT;k++){rec.score[k]+=out[k];if(out[k]>rec.peak[k])rec.peak[k]=out[k];}
  }
  for(const rec of map.values()){if(!rec.cells)continue;const size=Math.sqrt(rec.cells);for(let k=0;k<RESOURCE_COUNT;k++){rec.score[k]/=rec.cells;rec.amount[k]=rec.score[k]*size;}}
  memo.set(world,{key,layers:l.province,map});return map;
}
/** Sum of a nation's deposits by resource. */
export function nationEndowment(world,nationId){
  const out=new Float32Array(RESOURCE_COUNT);for(const rec of provinceResources(world).values())if(rec.nation===nationId)for(let k=0;k<RESOURCE_COUNT;k++)out[k]+=rec.amount[k];return out;
}
/** Resources in a province ranked by local significance (score against the world's typical province). */
export function notableResources(world,provinceId,{revealed=null,limit=4}={}){
  const map=provinceResources(world),rec=map.get(provinceId);if(!rec)return [];const typical=worldTypical(world);
  return RESOURCE_IDS.map((id,k)=>({id,score:rec.score[k],rel:rec.score[k]/(typical[k]||1e-6),hidden:GOOD_BY_ID[id].hidden&&revealed&&!revealed(provinceId,id)})).filter(r=>r.score>.05&&r.rel>1.25).sort((a,b)=>b.rel-a.rel).slice(0,limit);
}
const typicalMemo=new WeakMap();
export function worldTypical(world){
  const map=provinceResources(world),cached=typicalMemo.get(map);if(cached)return cached;const sum=new Float32Array(RESOURCE_COUNT);let n=0;
  for(const rec of map.values())if(rec.cells){n++;for(let k=0;k<RESOURCE_COUNT;k++)sum[k]+=rec.score[k];}
  for(let k=0;k<RESOURCE_COUNT;k++)sum[k]/=n||1;typicalMemo.set(map,sum);return sum;
}
export {R as RESOURCE_INDEX};
