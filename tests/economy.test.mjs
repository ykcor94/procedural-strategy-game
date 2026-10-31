import test from 'node:test';
import assert from 'node:assert/strict';
import {runPipeline} from '../src/generation/pipeline.js';
import {generateCivilization} from '../src/civilization/generator.js';
import {createGameState,normalizeGameState,validateGameState} from '../src/game/state.js';
import {worldToBlob,readWorld} from '../src/persistence/binary-world.js';
import {ensureEconomy,advanceEconomy,current,touch,runtime,quoteProject,queueProject,lawQuote,enactLaw,setRate,setBoard,launchInitiative,setPartner,cancelProject,borrow,repay} from '../src/game/economy/sim.js';
import {validateEconomy} from '../src/game/economy/validate.js';
import {INDUSTRIES} from '../src/data/industries.js';
import {LAW_AXES} from '../src/data/laws.js';
import {TAXES} from '../src/game/economy/model.js';

const settings={seed:'Economy-test',nationCount:12,cultureCount:10,familyCount:4,cityCount:140,totalPopulation:400000000,provinceAverage:5,religionCount:6,religionFamilyCount:3,tradeRoutes:40,unclaimedPolar:false,startDate:'1950-01-01'};
let reference;
async function base(){if(!reference){const world=await runPipeline({settings:{width:128,height:64,seed:'economy-planet'}});generateCivilization(world,settings);reference=world;}return reference;}
/** A fresh campaign in the nation with the most settlements. */
async function campaign(pick=nations=>nations.sort((a,b)=>b.cities-a.cities)[0].nation){
  const world=structuredClone(await base()),civ=world.meta.civilization,counts=civ.nations.filter(n=>n.population>0).map(nation=>({nation,cities:civ.cities.filter(c=>c.nation===nation.id).length})),nation=pick(counts);
  world.meta.game=createGameState(world,nation.id);const econ=ensureEconomy(world);return {world,civ,nation,econ,game:world.meta.game};
}
const advance=({world,econ,game},days)=>{game.elapsedHours+=days*24;game.currentDate=new Date(Date.parse(game.startDate+'T00:00:00Z')+Math.floor(game.elapsedHours)*3600000).toISOString().slice(0,10);return advanceEconomy(world,econ);};
const close=(a,b,tol=1e-6)=>Math.abs(a-b)<=Math.max(1,Math.abs(b))*tol;

test('industries partition the generated output exactly, in every nation',async()=>{
  const w=await base(),civ=w.meta.civilization;
  for(const nation of civ.nations.filter(n=>n.population>0&&n.economicOutput>0)){
    const econ={nation:nation.id,surveys:{}},rt=runtime(w,econ);
    assert.ok(close(rt.gdp0,nation.economicOutput),`${nation.name} output ${rt.gdp0} vs ${nation.economicOutput}`);
    for(const p of rt.places){assert.ok(close(p.out0.reduce((s,v)=>s+v,0),p.total0));assert.ok(p.out0.every(v=>v>=0&&Number.isFinite(v)));assert.ok(close(p.share.reduce((s,v)=>s+v,0),1));assert.ok(p.k>0&&p.slots>=2);}
    for(const city of civ.cities.filter(c=>c.nation===nation.id&&c.population>0))assert.ok(close(rt.byKey.get(`c${city.id}`).total0,city.economicOutput),'city output is preserved');
  }
});
test('industry profiles follow geography and size, and cities in one country differ',async()=>{
  const {world,civ,nation,econ}=await campaign(),rt=runtime(world,econ),cities=rt.places.filter(p=>p.kind==='city');
  const dominant=p=>INDUSTRIES[p.share.indexOf(Math.max(...p.share))].id;
  assert.ok(new Set(cities.map(dominant)).size>=2||cities.length<4,'not every settlement has the same leading industry');
  const big=cities.slice().sort((a,b)=>b.pop-a.pop)[0],small=cities.slice().sort((a,b)=>a.pop-b.pop)[0],i=name=>INDUSTRIES.findIndex(x=>x.id===name);
  assert.ok(big.share[i('finance')]+big.share[i('knowledge')]>=small.share[i('finance')]+small.share[i('knowledge')],'large cities lean on services');
  assert.ok(runtime(world,econ)===rt,'the baseline is cached');
  const countryside=rt.places.filter(p=>p.kind==='rural');assert.ok(countryside.every(p=>p.share[i('farming')]+p.share[i('herding')]+p.share[i('forestry')]+p.share[i('fishing')]>.05)||!countryside.length);
});
test('a new campaign starts from the generated economy and is deterministic',async()=>{
  const a=await campaign(),b=await campaign(),snap=current(a.world,a.econ);
  assert.deepEqual(a.econ,b.econ);assert.equal(a.econ.nation,a.nation.id);
  assert.ok(close(snap.gdp,a.nation.economicOutput),'start GDP equals the generated output');
  assert.ok(close(a.econ.stability,snap.stability.target,1e-9),'stability starts at its target');
  assert.ok(snap.revenue.ratio>.04&&snap.revenue.ratio<.4,`revenue ${snap.revenue.ratio}`);
  assert.ok(snap.spending.total/snap.revenue.total>.55&&snap.spending.total/snap.revenue.total<1.25);
  assert.ok(snap.revenue.bySource.cities>snap.revenue.bySource.trade,'cities out-earn trade routes');
  assert.ok(snap.unemployment>.01&&snap.unemployment<.4);
  assert.equal(validateEconomy(a.econ),true);
});
test('the economy never mutates the generated civilization or raster layers',async()=>{
  const c=await campaign(),before=structuredClone(c.civ),layers=Object.fromEntries(['population','economicOutput','ownership','province'].map(k=>[k,c.world.layers[k].slice()]));
  const q=queueProject(c.world,c.econ,'light',[...runtime(c.world,c.econ).places].find(p=>p.kind==='city').key,2);assert.ok(q.ok,q.error);c.econ.treasury=1e18;
  advance(c,365*8);
  assert.deepEqual(c.civ,before);for(const [k,v]of Object.entries(layers))assert.deepEqual(c.world.layers[k],v,k);
  assert.ok(c.econ.hist.length>=90,'a monthly history is kept');
});
test('revenue rises with a tax rate up to a peak, then falls; cities are taxed more readily than countryside',async()=>{
  const c=await campaign(),revenue=rate=>{setRate(c.world,c.econ,'income',rate);return current(c.world,c.econ).revenue.byTax.income;};
  const low=revenue(.05),mid=revenue(.3),top=revenue(.6);assert.ok(mid>low&&mid>top,'income tax has an interior peak');
  setRate(c.world,c.econ,'income',.2);const snap=current(c.world,c.econ),city=snap.places.filter(p=>p.kind==='city'),rural=snap.places.filter(p=>p.kind==='rural');
  const rate=list=>list.reduce((s,p)=>s+p.tax,0)/Math.max(1,list.reduce((s,p)=>s+p.out,0));if(rural.length)assert.ok(rate(city)>rate(rural),'cities yield more per unit of output');
  assert.equal(setRate(c.world,c.econ,'income',5).ok,true);assert.equal(c.econ.rates.income,.6,'rates clamp to their maximum');
  assert.equal(setRate(c.world,c.econ,'nonsense',.1).ok,false);
});
test('tariffs are limited by trade policy and trade partners can be embargoed',async()=>{
  const c=await campaign(),rt=runtime(c.world,c.econ),cross=rt.routes.filter(r=>r.cross);
  setRate(c.world,c.econ,'tariff',.6);let snap=current(c.world,c.econ);assert.ok(snap.trade.tariff<=snap.trade.tariffCap+1e-9);
  if(!cross.length)return;
  const partner=cross[0].partner,before=current(c.world,c.econ).trade.crossVolume;setPartner(c.world,c.econ,partner,'embargo');touch(c.world,c.econ);const after=current(c.world,c.econ).trade.crossVolume;assert.ok(after<before);
  setPartner(c.world,c.econ,partner,'normal');touch(c.world,c.econ);assert.ok(close(current(c.world,c.econ).trade.crossVolume,before));
});
test('construction takes the minimum time, respects slots and capacity, and adds capacity that pays tax',async()=>{
  const c=await campaign(),snap=current(c.world,c.econ),city=snap.places.filter(p=>p.kind==='city').sort((a,b)=>b.out-a.out)[0],quote=quoteProject(c.world,c.econ,'light',city.key,2);
  assert.ok(quote.ok&&quote.cost>0&&quote.days>=150,'a workshop takes months');assert.ok(quote.payback>1&&quote.payback<60);
  c.econ.treasury=quote.cost*50;const before=snap.industry.find(i=>i.id==='light').out;
  const r=queueProject(c.world,c.econ,'light',city.key,2);assert.ok(r.ok);
  advance(c,Math.floor(quote.days*.5));assert.equal(c.econ.queue.length,1,'half the minimum time is not enough');
  advance(c,Math.ceil(quote.days*.5)+400);assert.equal(c.econ.queue.length,0,'completes');
  assert.equal(c.econ.built[city.key].length,1);const after=current(c.world,c.econ);assert.ok(after.industry.find(i=>i.id==='light').out>before*1.005,'light industry grew');
  assert.ok(after.places.find(p=>p.key===city.key).used>=1);
  // slots: a city with 2 slots refuses a third project
  const small=snap.places.filter(p=>p.kind==='city').sort((a,b)=>a.pop-b.pop)[0];let accepted=0;for(let k=0;k<small.slots+2;k++)if(queueProject(c.world,c.econ,'park',small.key,1).ok)accepted++;assert.equal(accepted,small.slots-small.used);
});
test('more construction industry builds faster, and money, priority and the queue behave',async()=>{
  const c=await campaign(),snap=current(c.world,c.econ),city=snap.places.filter(p=>p.kind==='city').sort((a,b)=>b.out-a.out)[0],yard=quoteProject(c.world,c.econ,'construction',city.key,3);
  assert.ok(yard.ok);const capacity=snap.build.capacity;c.econ.treasury=yard.cost*100;assert.ok(queueProject(c.world,c.econ,'construction',city.key,3).ok);advance(c,yard.days+500);
  assert.ok(current(c.world,c.econ).build.capacity>capacity,'builders’ yards raise build capacity');
  const cheap=quoteProject(c.world,c.econ,'light',city.key,2);if(cheap.ok){setBoard(c.world,c.econ,'light','invest',2);touch(c.world,c.econ);assert.ok(quoteProject(c.world,c.econ,'light',city.key,2).cost<cheap.cost,'priority industries build cheaper');}
  const id=queueProject(c.world,c.econ,'park',city.key,1).project?.id;if(id){const paid=c.econ.treasury;assert.ok(cancelProject(c.world,c.econ,id).ok);assert.ok(c.econ.treasury>=paid);}
  c.econ.treasury=0;const poor=queueProject(c.world,c.econ,'park',city.key,1);if(poor.ok){advance(c,1);assert.equal(c.econ.queue[0].status,'funds');assert.equal(c.econ.queue[0].done,0,'nothing is built without money');}
});
test('priority slots are limited by industrial policy',async()=>{
  const c=await campaign(),slots=current(c.world,c.econ).build.prioritySlots;let granted=0;for(const i of INDUSTRIES)if(setBoard(c.world,c.econ,i.id,'invest',2).ok)granted++;assert.equal(granted,slots);
});
test('reforms cost money and stability, phase in over months, and then lock the axis',async()=>{
  const c=await campaign(),axis=LAW_AXES.find(a=>a.id==='trade'),from=c.econ.laws.trade.pos,to=from===axis.positions.length-1?from-1:from+1;
  c.econ.treasury=1e18;const q=lawQuote(c.world,c.econ,'trade',to);assert.ok(q.ok&&q.cost>0&&q.shock>0);
  const revenue=current(c.world,c.econ).revenue.total,stability=c.econ.stability,treasury=c.econ.treasury,r=enactLaw(c.world,c.econ,'trade',to);assert.ok(r.ok);
  assert.ok(close(treasury-c.econ.treasury,q.cost),'the price is paid');assert.equal(c.econ.laws.trade.progress,0);
  assert.equal(lawQuote(c.world,c.econ,'trade',from).cooling,true,'the axis is locked afterwards');
  advance(c,axis.months*31+40);assert.equal(c.econ.laws.trade.progress,1);assert.equal(c.econ.laws.trade.from,to);assert.ok(c.econ.stability!==stability);
  assert.ok(Number.isFinite(revenue));
  const gated=LAW_AXES.flatMap(a=>a.positions.map((p,i)=>({a,p,i}))).find(x=>x.p.req?.inst>c.econ.consts.stab0/100+1);assert.ok(gated===undefined||gated);
  const locked=LAW_AXES.flatMap(a=>a.positions.map((p,i)=>({a,p,i}))).find(x=>x.p.req?.inst>runtime(c.world,c.econ).inst);if(locked)assert.equal(lawQuote(c.world,c.econ,locked.a.id,locked.i).locked,true);
});
test('retreating from a recent reform is cheaper; unaffordable reforms are refused',async()=>{
  const c=await campaign(),from=c.econ.laws.fdi.pos,to=from?from-1:from+1;c.econ.treasury=1e18;const forward=lawQuote(c.world,c.econ,'fdi',to);enactLaw(c.world,c.econ,'fdi',to);c.econ.cooldown.fdi=0;
  const back=lawQuote(c.world,c.econ,'fdi',from);assert.ok(back.ok&&back.retreat);assert.ok(back.cost<forward.cost*.9||forward.cost===0);
  c.econ.treasury=0;c.econ.cooldown.labour=0;const refused=enactLaw(c.world,c.econ,'labour',c.econ.laws.labour.pos?0:1);assert.equal(refused.ok,false);
});
test('stability, treasury and growth stay finite and bounded through twenty years of abuse',async()=>{
  const c=await campaign();for(const t of TAXES)setRate(c.world,c.econ,t.id,t.max);c.econ.spend.admin=.5;c.econ.spend.services=.5;
  for(let year=0;year<20;year++){advance(c,365);const s=current(c.world,c.econ);assert.ok(c.econ.stability>=0&&c.econ.stability<=100);assert.ok(Number.isFinite(c.econ.treasury)&&Number.isFinite(s.gdp)&&s.gdp>0);assert.ok(s.unemployment>=0&&s.unemployment<=.6);}
  assert.ok(Object.values(c.econ.organic).every(v=>v>.2&&v<8));
  assert.equal(validateEconomy(c.econ),true);
});
test('borrowing is limited by credit and repayment is limited by cash',async()=>{
  const c=await campaign(),snap=current(c.world,c.econ),limit=snap.credit.available;const r=borrow(c.world,c.econ,limit*10);assert.ok(r.ok&&close(r.amount,limit));assert.equal(borrow(c.world,c.econ,1).ok,false);
  const debt=c.econ.debt;c.econ.treasury=100;assert.ok(close(repay(c.world,c.econ,1e18).amount,100));assert.ok(close(c.econ.debt,debt-100));
});
test('programmes cost money, occupy slots and end on schedule',async()=>{
  const c=await campaign(),rt=runtime(c.world,c.econ);c.econ.treasury=1e18;
  assert.ok(launchInitiative(c.world,c.econ,'literacy').ok);assert.equal(launchInitiative(c.world,c.econ,'literacy').ok,false,'cannot run twice');
  assert.ok(launchInitiative(c.world,c.econ,'tourism').ok);assert.equal(launchInitiative(c.world,c.econ,'stimulus').ok,rt.inst>.6,'a third slot needs capable institutions');
  assert.equal(launchInitiative(c.world,c.econ,'zone',999999).ok,false);
  advance(c,365*6);assert.ok(!c.econ.initiatives.active.some(a=>a.id==='tourism'));assert.ok(c.econ.initiatives.cooldown.tourism>0);
});
test('campaigns survive binary export, v1 upgrade and economy corruption',async()=>{
  const c=await campaign();advance(c,500);c.econ.treasury=1e18;queueProject(c.world,c.econ,'park',runtime(c.world,c.econ).places.find(p=>p.kind==='city').key,1);
  const restored=await readWorld(worldToBlob(c.world));assert.deepEqual(restored.meta.game.economy,c.econ);assert.equal(validateGameState(restored),true);
  const old=structuredClone(c.world);old.meta.game.version=1;delete old.meta.game.economy;normalizeGameState(old);assert.equal(old.meta.game.version,3);assert.equal(old.meta.game.rules.simulation,'economy');
  const broken=structuredClone(c.world);broken.meta.game.economy.laws.tax.pos=99;normalizeGameState(broken);assert.ok(broken.meta.game,'the campaign survives');assert.equal(broken.meta.game.economy,undefined,'the damaged economy is dropped');
  assert.throws(()=>validateEconomy({...c.econ,treasury:NaN}));assert.throws(()=>validateEconomy({...c.econ,queue:[{type:'nope'}]}));
  assert.equal(ensureEconomy(broken).nation,c.nation.id,'it can be created afresh');
});
test('the player nation can be resumed after the world is edited',async()=>{
  const c=await campaign();advance(c,100);const city=c.civ.cities.find(x=>x.nation===c.nation.id);c.econ.built[`c${city.id}`]=[{t:'park',i:-1,jobs:0,suit:1,cost:5,day:1}];c.civ.cities=c.civ.cities.filter(x=>x.id!==city.id);c.civ.revision=(c.civ.revision||0)+1;
  assert.doesNotThrow(()=>current(c.world,c.econ),'buildings in vanished places are ignored');
});
