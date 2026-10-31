// Headless civilization metrics across seeds and settings (not part of `npm test`).
// Usage: node tests/civ-metrics.mjs [--seeds=4] [--size=640x320] [--only=borders,population,trade,language]
//        [--variants="populationInequality:.75;totalPopulation:5e9,default"]
// ROOT=<dir> runs another source tree (e.g. an extracted backup) against the same metrics.
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {serialize,deserialize} from 'node:v8';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const root=resolve(process.env.ROOT||'.'),load=p=>import(pathToFileURL(resolve(root,p)).href);
const {runPipeline}=await load('src/generation/pipeline.js'),{validateSettings}=await load('src/core/settings.js'),{generateCivilization}=await load('src/civilization/generator.js');
const metrics=await import(pathToFileURL(resolve('src/civilization/generator.js')).href);
const [W,H]=(args.size||'640x320').split('x').map(Number),seeds=['Thalassa-314','Meridian-7','Ochre-22','Boreal-90','Pelagos-5','Atlas-12'].slice(0,+(args.seeds||4)),only=new Set((args.only||'borders,population,trade,language').split(','));
mkdirSync('test-output/metric-worlds',{recursive:true});

async function physical(seed){
  const file=`test-output/metric-worlds/${seed}-${W}x${H}.bin`;
  if(existsSync(file))return deserialize(readFileSync(file));
  const world=await runPipeline({settings:validateSettings({seed,width:W,height:H})});writeFileSync(file,serialize(world));return world;
}
const pct=v=>(v*100).toFixed(1)+'%',fmt=v=>v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'k':String(Math.round(v));
const corr=(a,b)=>{const n=a.length,ma=a.reduce((s,x)=>s+x,0)/n,mb=b.reduce((s,x)=>s+x,0)/n;let c=0,va=0,vb=0;for(let k=0;k<n;k++){c+=(a[k]-ma)*(b[k]-mb);va+=(a[k]-ma)**2;vb+=(b[k]-mb)**2;}return c/Math.sqrt(va*vb||1);};

function borderShare(world,layer){
  const geo=metrics.naturalBarrierField(world),l=world.layers,w=world.width,h=world.height,grid=l[layer];let edges=0,onBarrier=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!grid[i]||l.elevation[i]<=0)continue;for(const [dx,dy]of [[1,0],[0,1]]){if(y+dy>=h)continue;const j=(y+dy)*w+(x+dx)%w;if(!grid[j]||grid[j]===grid[i]||l.elevation[j]<=0)continue;edges++;if(metrics.naturalBarrier(world,geo,i,j,dx,dy)>=.35)onBarrier++;}}
  let all=0,any=0;for(let i=0;i<w*(h-1);i+=7){if(l.elevation[i]<=0||l.elevation[i+w]<=0)continue;all++;if(metrics.naturalBarrier(world,geo,i,i+w,0,1)>=.35)any++;}
  return {edges,share:onBarrier/Math.max(1,edges),baseline:any/Math.max(1,all)};
}
function fragments(world){
  const l=world.layers,w=world.width,h=world.height,seen=new Uint8Array(w*h),parts=new Map();
  for(let i=0;i<w*h;i++){const id=l.ownership[i];if(!id||seen[i])continue;parts.set(id,(parts.get(id)||0)+1);const q=[i];seen[i]=1;while(q.length){const c=q.pop(),x=c%w,y=Math.floor(c/w);for(const j of [y*w+(x+1)%w,y*w+(x+w-1)%w,y>0?c-w:-1,y<h-1?c+w:-1])if(j>=0&&!seen[j]&&l.ownership[j]===id){seen[j]=1;q.push(j);}}}
  return parts;
}
function population(world){
  const civ=world.meta.civilization,l=world.layers,stats=[],cold=new Map(),cells=new Map();
  for(let i=0;i<l.ownership.length;i++){const id=l.ownership[i];if(!id)continue;cells.set(id,(cells.get(id)||0)+1);if([11,12,13].includes(l.biome[i]))cold.set(id,(cold.get(id)||0)+1);}
  for(const n of civ.nations)if(n.population)stats.push({n,area:n.area,pop:n.population,cold:(cold.get(n.id)||0)/Math.max(1,cells.get(n.id)||0),gdp:n.gdp||n.economicOutput||0});
  const areas=stats.map(s=>s.area).sort((a,b)=>a-b),p10=areas[Math.floor(areas.length*.1)],medPop=stats.map(s=>s.pop).sort((a,b)=>a-b)[Math.floor(stats.length/2)];
  const tinyHuge=stats.filter(s=>s.area<=p10&&s.pop>3*medPop),top=[...stats].sort((a,b)=>b.pop-a.pop),coldTop=top.slice(0,10).filter(s=>s.cold>.5);
  const lp=stats.map(s=>Math.log(s.pop)),la=stats.map(s=>Math.log(s.area)),lg=stats.map(s=>Math.log(Math.max(1,s.gdp/s.pop)));
  return {nations:stats.length,corrPopArea:+corr(lp,la).toFixed(2),corrPopGdpPerCap:+corr(lp,lg).toFixed(2),tinyHuge:tinyHuge.map(s=>`${s.n.name}(${fmt(s.pop)},${fmt(s.area)}km²)`).join(' ')||'-',coldTop:coldTop.map(s=>`${s.n.name}(${fmt(s.pop)},${pct(s.cold)} cold)`).join(' ')||'-',topShare:pct(top[0].pop/civ.population),top3:top.slice(0,3).map(s=>`${fmt(s.pop)}/${fmt(s.area)}km²`).join(', '),maxDensity:fmt(Math.max(...stats.map(s=>s.pop/s.area)))+'/km²',urbanRange:(()=>{const u=civ.nations.filter(n=>n.population).map(n=>n.urbanization).sort((a,b)=>a-b);return `${pct(u[Math.floor(u.length*.1)])}–${pct(u[Math.floor(u.length*.9)])}`;})()};
}
function trade(world){
  const civ=world.meta.civilization,routes=civ.tradeRoutes||[],cities=new Map(civ.cities.map(c=>[c.id,c])),l=world.layers;let crossLand=0,long=0;const nations=new Set(),masses=new Set(),perNation=new Map();
  for(const r of routes){const a=cities.get(r.from),b=cities.get(r.to);if(!a||!b)continue;nations.add(a.nation);nations.add(b.nation);perNation.set(a.nation,(perNation.get(a.nation)||0)+1);perNation.set(b.nation,(perNation.get(b.nation)||0)+1);const ma=l.landmass[a.cell],mb=l.landmass[b.cell];masses.add(ma);masses.add(mb);if(ma!==mb)crossLand++;const dx=Math.min(Math.abs(a.x-b.x),world.width-Math.abs(a.x-b.x));if(Math.hypot(dx,a.y-b.y)>world.width*.18)long++;}
  const counts=civ.nations.map(n=>perNation.get(n.id)||0).sort((a,b)=>a-b),total=counts.reduce((s,x)=>s+x,0);let g=0;counts.forEach((c,k)=>g+=(2*(k+1)-counts.length-1)*c);
  return {routes:routes.length,crossLandmass:pct(crossLand/Math.max(1,routes.length)),long:pct(long/Math.max(1,routes.length)),nationsConnected:`${nations.size}/${civ.nations.length}`,landmasses:masses.size,gini:+(g/(counts.length*Math.max(1,total))).toFixed(2)};
}
function language(world){
  const civ=world.meta.civilization,accented=civ.cities.filter(c=>/[^\x00-\x7f]/.test(c.name)).length;
  return {archetypes:[...new Set(civ.families.map(f=>f.language.phonology?.archetype).filter(Boolean))].join(' '),accented:pct(accented/civ.cities.length),families:civ.families.slice(0,10).map(f=>`${f.name}: ${civ.cities.filter(c=>civ.cultures.find(k=>k.id===c.culture)?.family===f.id).slice(0,4).map(c=>c.name).join(', ')}`).join('\n          ')};
}
const variants=(args.variants||'default').split(',').map(v=>v==='default'?{}:Object.fromEntries(v.split(';').map(kv=>{const [k,val]=kv.split(':');return [k,isNaN(+val)?val==='true'?true:val==='false'?false:val:+val];})));
for(const seed of seeds){
  const base=await physical(seed);
  for(const variant of variants){
    const world=structuredClone(base),t=performance.now();generateCivilization(world,{seed:'Founding-1',...variant});const ms=performance.now()-t;
    console.log(`\n== ${seed} ${JSON.stringify(variant)} (${(ms/1000).toFixed(1)}s, pop ${fmt(world.meta.civilization.population)})`);
    if(only.has('borders')){const p=borderShare(world,'ownership'),c=borderShare(world,'culture'),f=fragments(world);console.log(`borders  political ${pct(p.share)} on barriers (${p.edges} edges; land baseline ${pct(p.baseline)}) · culture ${pct(c.share)} · fragmented nations ${[...f.values()].filter(v=>v>1).length}/${f.size}`);}
    if(only.has('population'))console.log('people  ',population(world));
    if(only.has('trade'))console.log('trade   ',trade(world));
    if(only.has('language'))console.log('language',language(world));
  }
}
