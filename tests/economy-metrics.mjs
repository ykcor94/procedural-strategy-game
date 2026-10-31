// Headless economy metrics (not part of `npm test`): tax-to-GDP, stability, growth and project payback across nations.
// Usage: node tests/economy-metrics.mjs [--seeds=2] [--size=384x192] [--years=10] [--nations=8]
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {serialize,deserialize} from 'node:v8';
import {runPipeline} from '../src/generation/pipeline.js';
import {validateSettings} from '../src/core/settings.js';
import {generateCivilization} from '../src/civilization/generator.js';
import {createGameState} from '../src/game/state.js';
import {createEconomy,advanceEconomy,current,quoteProject,queueProject,runtime} from '../src/game/economy/sim.js';
import {INDUSTRIES} from '../src/data/industries.js';
import {BUILDINGS} from '../src/data/buildings.js';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('='))),[W,H]=(args.size||'384x192').split('x').map(Number),seeds=['Thalassa-314','Meridian-7','Ochre-22','Boreal-90'].slice(0,+(args.seeds||2)),years=+(args.years||10),count=+(args.nations||8);
mkdirSync('test-output/metric-worlds',{recursive:true});
const fmt=v=>v>=1e12?(v/1e12).toFixed(2)+'T':v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'k':String(Math.round(v)),pct=v=>(v*100).toFixed(1)+'%';
async function physical(seed){const file=`test-output/metric-worlds/${seed}-${W}x${H}.bin`;if(existsSync(file))return deserialize(readFileSync(file));const world=await runPipeline({settings:validateSettings({seed,width:W,height:H})});writeFileSync(file,serialize(world));return world;}
for(const seed of seeds){
  const world=structuredClone(await physical(seed));generateCivilization(world,{seed:'Founding-1',nationCount:24,cultureCount:16,familyCount:5,cityCount:240,totalPopulation:2e9});
  const civ=world.meta.civilization,sorted=civ.nations.filter(n=>n.population>0).sort((a,b)=>b.population-a.population),pick=[...sorted.slice(0,Math.ceil(count/2)),...sorted.slice(-Math.floor(count/2))];
  console.log(`\n== ${seed}: ${sorted.length} nations`);
  for(const nation of pick){
    const t=performance.now();world.meta.game=createGameState(world,nation.id);const econ=createEconomy(world,nation.id),rt=runtime(world,econ),snap=current(world,econ),ms=performance.now()-t;
    const identity=snap.industry.slice().sort((a,b)=>b.share-a.share).slice(0,3).map(i=>`${i.id} ${pct(i.share)}`).join(', ');
    console.log(`${nation.name.padEnd(16)} pop ${fmt(nation.population).padStart(6)} gdp/pc ${fmt(snap.gdpPerCapita).padStart(6)} places ${String(rt.places.length).padStart(4)} · output ${pct(snap.gdp/nation.economicOutput-1)} vs generated · tax ${pct(snap.revenue.ratio)} · cities ${pct(snap.revenue.bySource.cities/snap.revenue.total)} rural ${pct(snap.revenue.bySource.rural/snap.revenue.total)} trade ${pct(snap.revenue.bySource.trade/snap.revenue.total)} · spend ${pct(snap.spending.total/snap.revenue.total)} · stab ${econ.stability.toFixed(0)} unemp ${pct(snap.unemployment)} · build ${pct(snap.build.capacity*365/snap.gdp)}/yr slots ${snap.build.slots} · ${identity} · ${ms.toFixed(0)}ms`);
  }
  // a ten-year default run for the biggest nation, and payback of each productive project in its best city
  const nation=pick[0];world.meta.game=createGameState(world,nation.id);const g=world.meta.game,econ=createEconomy(world,nation.id);g.economy=econ;
  const row=[];for(let y=0;y<=years;y++){const s=current(world,econ);row.push(`y${y}: gdp ${fmt(s.gdp)} rev ${pct(s.revenue.ratio)} net ${fmt(s.revenue.total-s.spending.total)} stab ${econ.stability.toFixed(0)} treas ${fmt(econ.treasury)}`);g.elapsedHours+=365*24;advanceEconomy(world,econ);}
  console.log(`\n${nation.name}, default policy:\n  `+row.join('\n  '));
  const s=current(world,econ),city=s.places.filter(p=>p.kind==='city').sort((a,b)=>b.out-a.out)[0];
  console.log(`\nProject quotes in ${city.name} (output ${fmt(city.out)}):`);
  for(const b of BUILDINGS){const q=quoteProject(world,econ,b.id,city.key,2);console.log(`  ${b.name.padEnd(18)} ${q.ok?`cost ${fmt(q.cost)} (${pct(q.cost/city.out)} of city) days ${q.days} gain ${fmt(q.gain||0)} payback ${Number.isFinite(q.payback)?q.payback.toFixed(1)+'y':'-'} ${q.detail||''}`:q.error}`);}
  const ruralPlace=s.places.find(p=>p.kind==='rural');if(ruralPlace){console.log(`Project quotes in ${ruralPlace.name} (output ${fmt(ruralPlace.out)}):`);for(const b of BUILDINGS.filter(b=>b.where.includes('rural'))){const q=quoteProject(world,econ,b.id,ruralPlace.key,2);console.log(`  ${b.name.padEnd(18)} ${q.ok?`cost ${fmt(q.cost)} gain ${fmt(q.gain||0)} payback ${Number.isFinite(q.payback)?q.payback.toFixed(1)+'y':'-'} ${q.detail||''}`:q.error}`);}}
}
