import test from 'node:test';
import assert from 'node:assert/strict';
import {runPipeline} from '../src/generation/pipeline.js';
import {generateCivilization} from '../src/civilization/generator.js';
import {createGameState,normalizeGameState} from '../src/game/state.js';
import {ensureCampaign} from '../src/game/campaign.js';
import {advanceEconomy,current,runtime} from '../src/game/economy/sim.js';
import {applyPreset,setFundShare} from '../src/game/economy/autobuild.js';
import {imposeSanctions,liftSanctions,signAgreement} from '../src/game/world/diplomacy.js';
import {syncPlayerLink} from '../src/game/world/tick.js';
import {marketResults} from '../src/game/world/market.js';
import {aggregate,livePlaces,setCensusInterval,orderEmergencyCensus,projectNation} from '../src/game/demography/sim.js';
import {totalOf} from '../src/game/demography/model.js';
import {provinceResources,worldTypical,RESOURCE_INDEX} from '../src/game/resources.js';
import {worldToBlob,readWorld} from '../src/persistence/binary-world.js';
import {GOOD_COUNT} from '../src/data/resources.js';

const settings={seed:'World-test',nationCount:16,cultureCount:12,familyCount:4,cityCount:160,totalPopulation:600000000,provinceAverage:5,religionCount:6,religionFamilyCount:3,tradeRoutes:50,unclaimedPolar:false,startDate:'1990-01-01'};
let reference;
async function base(){if(!reference){const world=await runPipeline({settings:{width:128,height:64,seed:'world-planet'}});generateCivilization(world,settings);reference=world;}return reference;}
async function campaign(){
  const world=structuredClone(await base()),civ=world.meta.civilization,nation=civ.nations.filter(n=>n.population>0).sort((a,b)=>civ.cities.filter(c=>c.nation===b.id).length-civ.cities.filter(c=>c.nation===a.id).length)[0];
  world.meta.game=createGameState(world,nation.id);const camp=ensureCampaign(world);return {world,nation,...camp};
}
const advance=(c,days)=>{const g=c.world.meta.game;g.elapsedHours+=days*24;g.currentDate=new Date(Date.parse(g.startDate+'T00:00:00Z')+Math.floor(g.elapsedHours)*3600000).toISOString().slice(0,10);return advanceEconomy(c.world,c.econ);};
const close=(a,b,tol=1e-6)=>Math.abs(a-b)<=Math.max(1,Math.abs(b))*tol;

test('a new campaign starts exactly at the generated economy with neutral market effects',async()=>{
  const c=await campaign(),snap=current(c.world,c.econ);
  assert.ok(close(snap.gdp,c.nation.economicOutput,1e-6),'output unchanged by the market link');
  assert.ok(c.ws.goods.price.every(p=>p===1));assert.equal(c.ws.goods.price.length,GOOD_COUNT);
  assert.ok(c.econ.link.market.avail.every(v=>Math.abs(v-1)<1e-3));assert.ok(c.econ.link.market.priceK.every(v=>Math.abs(v-1)<1e-3));
  assert.ok(Math.abs(c.econ.link.market.cpi-1)<1e-6);
  const pop=aggregate(livePlaces(c.demo)).pop;assert.ok(close(pop,runtime(c.world,c.econ).pop,1e-6),'demography holds the generated population');
});

test('the world moves: prices, AI economies and populations change over a decade and stay valid',async()=>{
  const c=await campaign(),ai0=Object.values(c.ws.nations).filter(n=>n.id!==c.nation.id).map(n=>({id:n.id,gdp:n.gdp,pop:n.pop}));
  advance(c,3653);
  const moved=ai0.filter(a=>Math.abs(c.ws.nations[a.id].gdp/a.gdp-1)>.02).length;assert.ok(moved>ai0.length*.6,'most AI economies change');
  assert.ok(ai0.some(a=>Math.abs(c.ws.nations[a.id].pop/a.pop-1)>.01),'AI populations change');
  assert.ok(c.ws.goods.price.some(p=>Math.abs(p-1)>.01),'world prices move');
  assert.ok(c.ws.news.length>0);assert.ok(c.demo.census.history.length>=2,'censuses were held');
  for(const n of Object.values(c.ws.nations)){assert.ok(Number.isFinite(n.gdp)&&n.gdp>0);assert.ok(Number.isFinite(n.pop)&&n.pop>0);assert.ok(n.stab>=0&&n.stab<=100);}
  const copy=structuredClone(c.world);normalizeGameState(copy);assert.ok(copy.meta.game.world&&copy.meta.game.demography&&copy.meta.game.economy,'blocks validate after a decade');
  const snap=current(c.world,c.econ);assert.ok(Number.isFinite(snap.gdp)&&snap.gdp>0&&Number.isFinite(snap.stability.target));
});

test('the living world is deterministic',async()=>{
  const a=await campaign(),b=await campaign();advance(a,800);advance(b,800);
  assert.deepEqual(a.ws.goods.price,b.ws.goods.price);assert.deepEqual(Object.values(a.ws.nations).map(n=>n.gdp),Object.values(b.ws.nations).map(n=>n.gdp));
  assert.deepEqual(a.demo.census.history,b.demo.census.history);
});

test('sanctions cut trade, provoke retaliation and are visible to the economy',async()=>{
  const c=await campaign(),res=marketResults(c.ws),me=c.nation.id;let partner=0,best=0;
  for(const [key,v] of res.pairs){const [x,y]=key.split(':').map(Number);if((x===me||y===me)&&v>best){best=v;partner=x===me?y:x;}}
  assert.ok(partner,'the player has a trade partner');
  const r=imposeSanctions(c.world,c.ws,partner,'embargo');assert.ok(r.ok);syncPlayerLink(c.world,c.ws,c.econ);
  assert.equal(c.econ.partners[partner].term,'embargo');assert.ok(c.ws.sanctions.some(s=>s.by===partner&&s.on===me),'the target retaliates');
  advance(c,40);const after=marketResults(c.ws),key=me<partner?`${me}:${partner}`:`${partner}:${me}`;assert.equal(after.pairs.get(key)||0,0,'no goods cross an embargo');
  assert.ok(current(c.world,c.econ).stability.terms.some(t=>t.id==='sanctions'));
  assert.ok(liftSanctions(c.world,c.ws,partner).ok);assert.ok(!c.ws.sanctions.some(s=>s.by===me&&s.on===partner));
});

test('agreements need good relations',async()=>{
  const c=await campaign(),id=+Object.keys(c.ws.relations)[0];c.ws.relations[id]=-50;
  assert.equal(signAgreement(c.world,c.ws,id,'trade').ok,false);c.ws.relations[id]=60;assert.ok(signAgreement(c.world,c.ws,id,'trade').ok);assert.equal(c.ws.terms[id].kind,'trade');
});

test('censuses follow the chosen interval, emergency censuses take three months and cost money',async()=>{
  const c=await campaign();setCensusInterval(c.demo,1);const before=c.demo.census.history.length;advance(c,1100);assert.ok(c.demo.census.history.length>=before+2);
  c.econ.treasury=1e18;const t=c.econ.treasury,r=orderEmergencyCensus(c.demo,c.econ,current(c.world,c.econ).revenue.total);assert.ok(r.ok);assert.ok(c.econ.treasury<t);
  const n=c.demo.census.history.length;advance(c,100);assert.ok(c.demo.census.history.length>n);assert.equal(c.demo.census.emergency,null);
  const proj=projectNation(c.demo,c.nation,{years:20});assert.equal(proj.length,21);assert.ok(proj.every(p=>p.pop>0&&Number.isFinite(p.pop)));
});

test('demographic change balances births, deaths and migration',async()=>{
  const c=await campaign(),p0=aggregate(livePlaces(c.demo)).pop;advance(c,370);
  const places=livePlaces(c.demo),p1=places.reduce((s,u)=>s+totalOf(u.bands),0),y=places.reduce((s,u)=>({b:s.b+u.last.b,d:s.d+u.last.d,im:s.im+u.last.im,em:s.em+u.last.em}),{b:0,d:0,im:0,em:0});
  assert.ok(y.b>0&&y.d>0,'people are born and die');
  assert.ok(Math.abs((p1-p0)-(y.b-y.d+y.im-y.em))<p0*.004,`${p1-p0} vs ${y.b-y.d+y.im-y.em}`);
});

test('the auto-build fund queues projects paid from the fund, not the treasury',async()=>{
  const c=await campaign();applyPreset(c.econ,'balanced');setFundShare(c.econ,.18);c.econ.fund.balance=current(c.world,c.econ).revenue.total*2;
  advance(c,62);const auto=c.econ.queue.filter(p=>p.auto);assert.ok(auto.length>0||c.econ.fund.built>0,'directives started projects');
  for(const p of auto)assert.ok(p.reserve>=0);
});

test('campaign blocks survive the binary format and damaged blocks are dropped',async()=>{
  const c=await campaign();advance(c,200);
  const restored=await readWorld(worldToBlob(c.world));assert.deepEqual(restored.meta.game.world,c.world.meta.game.world);assert.deepEqual(restored.meta.game.demography,c.world.meta.game.demography);
  const broken=structuredClone(c.world);broken.meta.game.world.goods.price=[1];broken.meta.game.demography.version=99;normalizeGameState(broken);
  assert.ok(broken.meta.game.economy);assert.equal(broken.meta.game.world,undefined);assert.equal(broken.meta.game.demography,undefined);
});

test('resources follow geography: fish by water, timber by forests, minerals in belts',async()=>{
  const world=await base(),res=provinceResources(world),typ=worldTypical(world),l=world.layers;
  const coastal=[],inland=[];for(const rec of res.values()){if(!rec.cells)continue;let coast=0,n=0;for(let i=0;i<l.province.length;i++)if(l.province[i]===rec.id){n++;if((l.coastDistance?.[i]??9)<1.5||l.river[i])coast++;}(coast/n>.3?coastal:inland).push(rec.score[RESOURCE_INDEX.fish]);}
  const mean=a=>a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);if(coastal.length&&inland.length)assert.ok(mean(coastal)>mean(inland)*1.3,'fish favours coasts and rivers');
  const k=RESOURCE_INDEX.iron,scores=[...res.values()].map(r=>r.score[k]).sort((a,b)=>a-b);assert.ok(scores.at(-1)>scores[Math.floor(scores.length/2)]*2,'ores cluster');
  assert.ok(typ.every(v=>Number.isFinite(v)&&v>=0));
});
