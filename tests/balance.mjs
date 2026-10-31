// Balance harness: node tests/balance.mjs [seeds] [years]
// Plays neutral campaigns (no player input) in several worlds and nations and prints the figures the
// economy is tuned against: growth, revenue share, stability, debt, payback of the best projects, AI spread.
import {runPipeline} from '../src/generation/pipeline.js';
import {generateCivilization} from '../src/civilization/generator.js';
import {createGameState} from '../src/game/state.js';
import {ensureCampaign} from '../src/game/campaign.js';
import {advanceEconomy,current,quoteProject} from '../src/game/economy/sim.js';
import {BUILDINGS} from '../src/data/buildings.js';
import {aggregate,livePlaces} from '../src/game/demography/sim.js';

const seeds=+(process.argv[2]||3),years=+(process.argv[3]||25),rows=[];
const pct=v=>`${(v*100).toFixed(1)}%`.padStart(7);
for(let s=0;s<seeds;s++){
  const world=await runPipeline({settings:{seed:`balance-${s}`,width:192,height:96}});
  generateCivilization(world,{seed:`balance-civ-${s}`,nationCount:30,cityCount:300,totalPopulation:2e9,unclaimedPolar:false});
  const nations=world.meta.civilization.nations.filter(n=>n.population>0).sort((a,b)=>b.population-a.population);
  for(const pick of [nations[0],nations[Math.floor(nations.length/2)]]){
    const w=structuredClone(world);w.meta.game=createGameState(w,pick.id);const {econ,ws,demo}=ensureCampaign(w),s0=current(w,econ),pop0=aggregate(livePlaces(demo)).pop;
    const best=BUILDINGS.filter(b=>b.tier==='A').flatMap(b=>s0.places.filter(p=>b.where.includes(p.kind)).map(p=>quoteProject(w,econ,b.id,p.key,2)).filter(q=>q.ok)).map(q=>q.payback).sort((a,b)=>a-b);
    let minStab=100;for(let y=0;y<years;y++){w.meta.game.elapsedHours+=365*24;advanceEconomy(w,econ);minStab=Math.min(minStab,econ.stability);}
    const s1=current(w,econ),ai=Object.values(ws.nations).filter(n=>n.id!==pick.id).map(n=>Math.pow(n.gdp/n.gdp0,1/years)-1).sort((a,b)=>a-b);
    rows.push({seed:s,nation:pick.name.slice(0,14),growth:Math.pow(s1.gdp/s0.gdp,1/years)-1,pop:Math.pow(aggregate(livePlaces(demo)).pop/pop0,1/years)-1,rev:s1.revenue.ratio,stab:econ.stability,minStab,debt:s1.gdp?econ.debt/s1.gdp:0,treasury:econ.treasury/s1.revenue.total,payback:best[0],payback10:best[Math.floor(best.length*.1)],aiLo:ai[Math.floor(ai.length*.1)],aiMid:ai[Math.floor(ai.length/2)],aiHi:ai[Math.floor(ai.length*.9)],cpi:econ.link.market.cpi});
  }
}
console.log('seed nation           growth    pop   rev/gdp stab(min)  debt/gdp treasury/rev best-payback p10   AI p10 / p50 / p90      cpi');
for(const r of rows)console.log(`${String(r.seed).padEnd(4)} ${r.nation.padEnd(15)} ${pct(r.growth)} ${pct(r.pop)} ${pct(r.rev)}  ${r.stab.toFixed(0).padStart(3)} (${r.minStab.toFixed(0).padStart(2)})  ${pct(r.debt)}  ${r.treasury.toFixed(2).padStart(8)}   ${r.payback.toFixed(1).padStart(6)} ${r.payback10.toFixed(1).padStart(6)}  ${pct(r.aiLo)} ${pct(r.aiMid)} ${pct(r.aiHi)}  ${r.cpi.toFixed(2)}`);
