import {clamp} from '../../core/geo.js';
import {seededRandom} from '../../core/random.js';
import {INDUSTRIES} from '../../data/industries.js';
import {LAW_AXES,LAW_BY_ID} from '../../data/laws.js';
import {BUILDING_BY_ID,SIZES} from '../../data/buildings.js';
import {INITIATIVES,INITIATIVE_BY_ID} from '../../data/initiatives.js';
import {dateEpoch,selectionGroup} from '../state.js';
import {runtime,instOf,DEFAULT_RATES,DEFAULT_BOARD,TUNING,TAX_BY_ID,suitability,effectivePosition} from './model.js';
import {evaluate,stabilityTerms,partnerTerm} from './evaluate.js';
import {ECONOMY_VERSION} from './validate.js';
export {ECONOMY_VERSION};

/** Campaign economy: creation, the day and month ticks, and every player action. State is plain JSON
 * (saved in meta.game.economy); the baseline and snapshots are derived and cached per runtime. */
const DAY=86400000;
const listeners=new Set();
let monthHook=null;
/** The campaign registers one hook that runs at the start of every month (world market, demography, fund). */
export const setMonthHook=fn=>{monthHook=fn;};
export const onEconomyEvent=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
function emit(econ,text,tone='info'){econ.log.unshift({day:econ.day,text,tone});if(econ.log.length>80)econ.log.length=80;for(const fn of listeners)fn({text,tone});}
export const dateOf=(world,day)=>new Date(dateEpoch(world.meta.game.startDate)+day*DAY);
export const isoDate=(world,day)=>dateOf(world,day).toISOString().slice(0,10);

/* ---------- creation ---------- */
function startingLaws(nation,inst,tech,r){
  const gov=String(nation.government||'').toLowerCase(),pick=(n,pos)=>clamp(Math.round(pos),0,n-1),jitter=()=>r()<.25?(r()<.5?-1:1):0,at={};
  const planned=/communist/.test(gov),strong=/military|dictat|fascist|absolute|authoritarian/.test(gov),social=/social democracy|constitutional|democra|parliament|feder/.test(gov),merchant=/merchant|technocrat/.test(gov);
  at.ideology=pick(5,planned?4:strong?3:social?2:merchant?1:2+jitter());
  at.tax=pick(5,inst<.35?(r()<.5?0:1):inst<.5?(r()<.5?2:4):inst<.7?(r()<.5?2:3):3+(r()<.4?1:0));
  at.trade=pick(5,merchant?1:planned?3:2+jitter());
  at.welfare=pick(5,-.4+3.6*tech*(.55+.6*inst));
  at.labour=pick(5,planned?3:inst<.4?1:2+jitter());
  at.fdi=pick(4,planned?0:merchant?2:1);
  at.industry=pick(4,planned?3:Math.floor(inst*3.2));
  at.land=pick(4,planned?3:/monarch|crown/.test(gov)?2:tech<.3?0:1);
  at.money=pick(4,inst<.35||strong?2:1);
  return at;
}
export function createEconomy(world,nationId){
  const civ=world.meta.civilization,nation=civ.nations.find(n=>n.id===+nationId);if(!nation)throw new Error('Select an existing nation before starting.');
  const seed=`${world.seed}:${civ.seed}`,r=seededRandom(seed,`economy-campaign:${nation.id}`),inst=instOf(nation),tech=nation.technology??.5,start=startingLaws(nation,inst,tech,r),laws={},mood={},baseLaws={};
  for(const axis of LAW_AXES){const pos=start[axis.id];laws[axis.id]={pos,from:pos,progress:1};baseLaws[axis.id]=pos;mood[axis.id]=clamp(pos+(r()-.5)*2.4,0,axis.positions.length-1);}
  const stab0=clamp(38+36*inst+(r()-.5)*10,22,86);
  const econ={version:ECONOMY_VERSION,nation:nation.id,day:0,treasury:0,debt:0,rates:{...DEFAULT_RATES},spend:{admin:1,services:1},borrowBuild:false,reserve:0,laws,mood,cooldown:{},lastMove:{},stability:stab0,shocks:[],board:{},queue:[],nextId:1,built:{},ports:{},routeLevels:{},partners:{},initiatives:{active:[],cooldown:{}},organic:{},surveys:{},corruption:clamp(.38-.35*inst+(r()-.5)*.1,.03,.5),prestige:0,extraStock:0,
    consts:{baseLaws,stab0,stabBase:0,scale:1,burden0:.27,gdp0:0,rev0:0},hist:[],snap:{},snapDay:0,log:[]};
  const rt=runtime(world,econ),first=evaluate(world,rt,econ);
  Object.assign(econ.consts,{gdp0:first.gdp,rev0:first.revenue.total,burden0:first.burden,scale:first.gdp?first.revenue.total/first.gdp:.15});
  const second=evaluate(world,rt,econ);
  econ.debt=Math.round(Math.min(second.gdp*(.05+.4*r())*(.5+inst),.7*second.credit.limit));econ.treasury=Math.round(second.revenue.total*(1.5+4*r()));
  econ.consts.stabBase=stab0-evaluate(world,rt,econ).stability.terms.reduce((s,t)=>s+t.value,0);
  recordHistory(econ,evaluate(world,rt,econ));takeSnapshot(econ,evaluate(world,rt,econ));
  return econ;
}
/** The economy of the running campaign, created the first time it is needed. */
export function ensureEconomy(world){
  const g=world.meta.game;if(!g)return null;
  if(!g.economy){g.economy=createEconomy(world,g.playerNation);g.economy.day=Math.floor(g.elapsedHours/24);}
  if(g.economy.day>Math.floor(g.elapsedHours/24))g.economy.day=Math.floor(g.elapsedHours/24);
  return g.economy;
}

/* ---------- derived state ---------- */
export function current(world,econ){
  const rt=runtime(world,econ);
  if(!rt.cache||rt.dirty){rt.cache=evaluate(world,rt,econ);rt.cache.index=new Map(rt.cache.places.map(p=>[p.key,p]));rt.dirty=false;}
  return rt.cache;
}
export const touch=(world,econ)=>{runtime(world,econ).dirty=true;};
function recordHistory(econ,snap){econ.hist.push({d:econ.day,gdp:Math.round(snap.gdp),rev:Math.round(snap.revenue.total),spend:Math.round(snap.spending.total),stab:+econ.stability.toFixed(1),treasury:Math.round(econ.treasury),unemp:+snap.unemployment.toFixed(4)});if(econ.hist.length>240)econ.hist.shift();}
function takeSnapshot(econ,snap){econ.snap={};for(const p of snap.places)econ.snap[p.key]=Math.round(p.out);econ.snapDay=econ.day;}

/* ---------- time ---------- */
export function advanceEconomy(world,econ,limit=4000){
  const target=Math.floor(world.meta.game.elapsedHours/24);let steps=0;
  while(econ.day<target&&steps<limit){econ.day++;dayStep(world,econ);steps++;}
  if(econ.day<target)econ.day=target;
  return steps;
}
function dayStep(world,econ){
  const rt=runtime(world,econ);construct(world,econ,rt);
  const date=dateOf(world,econ.day);if(date.getUTCDate()===1)monthStep(world,econ,rt,date);
}
function monthStep(world,econ,rt,date){
  if(monthHook){try{monthHook(world,econ,date,(text,tone)=>emit(econ,text,tone));}catch(e){console.error(e);}rt.dirty=true;}
  const snap=current(world,econ),rev=snap.revenue.total/12,spend=snap.spending.total/12,wasNegative=econ.treasury<0;
  econ.treasury+=rev-spend;
  econ.last={rev,spend,net:rev-spend,byTax:Object.fromEntries(Object.entries(snap.revenue.byTax).map(([k,v])=>[k,v/12])),items:snap.spending.items.map(i=>({id:i.id,name:i.name,amount:i.amount/12}))};
  for(const ind of INDUSTRIES)econ.organic[ind.id]=(econ.organic[ind.id]??1)*Math.exp(snap.industry[ind.index].growth/12);
  for(const axis of LAW_AXES){const s=econ.laws[axis.id];if(s.progress<1){s.progress=Math.min(1,s.progress+1/axis.months);if(s.progress>=1){s.from=s.pos;emit(econ,`${axis.name}: ${axis.positions[s.pos].name} is now fully in force.`,'good');}}}
  for(const k of econ.shocks)k.left--;econ.shocks=econ.shocks.filter(k=>k.left>0);
  for(const a of [...econ.initiatives.active]){a.left--;if(a.left<=0){finishInitiative(world,econ,a);econ.initiatives.active=econ.initiatives.active.filter(x=>x!==a);}}
  for(const [id,t]of Object.entries(econ.partners))if(t.until!=null&&t.until<=econ.day){delete econ.partners[id];emit(econ,'A trade agreement has expired.');}
  const next=current(world,econ);rt.dirty=true;
  econ.stability=clamp(econ.stability+clamp(next.stability.target-econ.stability,-1.8,1.5),0,100);
  if(econ.treasury<0&&!wasNegative)emit(econ,'The treasury is overdrawn. Borrowing costs more than loans.','warn');
  if(econ.stability<25)emit(econ,'Unrest is spreading. Collection and construction suffer.','bad');
  if(date.getUTCMonth()===0)yearStep(world,econ,rt);
  rt.dirty=true;recordHistory(econ,current(world,econ));
}
function yearStep(world,econ){
  const snap=current(world,econ),before=econ.snap,old=Object.values(before).reduce((s,v)=>s+v,0)||snap.gdp;
  emit(econ,`Year ${dateOf(world,econ.day).getUTCFullYear()-1}: output ${snap.gdp>=old?'grew':'fell'} ${Math.abs((snap.gdp/old-1)*100).toFixed(1)}% to ${snap.gdp.toExponential(2)} WU.`,snap.gdp>=old?'good':'warn');
  takeSnapshot(econ,snap);
}
function finishInitiative(world,econ,a){
  const def=INITIATIVE_BY_ID[a.id];
  if(def.done?.corruption)econ.corruption=clamp(econ.corruption+def.done.corruption,0,.7);
  if(a.id==='survey'){const r=seededRandom(`${world.seed}:${world.meta.civilization.seed}`,`survey:${a.target}:${a.start}`);const found=r()<.75;if(found){econ.surveys[a.target]=(econ.surveys[a.target]||0)+.3+.3*r();emit(econ,'The geological survey found new deposits.','good');}else emit(econ,'The geological survey found nothing worth mining.','warn');}
  else emit(econ,`${def.name} has run its course.`);
}

/* ---------- construction ---------- */
const reserveOf=(econ,snap)=>econ.reserve*snap.revenue.total;
function construct(world,econ,rt){
  if(!econ.queue.length)return;
  const snap=current(world,econ);let remaining=snap.build.capacity,active=0;
  for(const p of [...econ.queue]){
    if(p.done>=p.work-1e-6)continue;
    const where=p.place[0]==='r'?{local:snap.stability.target}:snap.index.get(p.place);
    if(p.place[0]!=='r'&&!where){econ.queue=econ.queue.filter(x=>x!==p);continue;}
    if(p.paused){p.status='paused';continue;}
    if(active>=snap.build.slots){p.status='queued';continue;}
    active++;
    if((where.stability??where.local)<TUNING.instabilityStall){p.status='unrest';continue;}
    const absorb=p.work/p.days*(p.rush?TUNING.rush[0]:1);let work=Math.min(absorb,remaining,p.work-p.done);
    if(work<=1e-9){p.status='capacity';continue;}
    const unit=p.rush?TUNING.rush[1]:1,fromFund=p.reserve!=null,funds=fromFund?p.reserve:econ.treasury-reserveOf(econ,snap)+(econ.borrowBuild?snap.credit.available:0);
    if(work*unit>funds){work=Math.max(0,funds)/unit;if(work<=1e-9){p.status='funds';continue;}}
    if(fromFund)p.reserve-=work*unit;else econ.treasury-=work*unit;remaining-=work;p.done+=work;p.paid+=work*unit;p.status='building';
  }
  const finished=econ.queue.filter(p=>p.done>=p.work-1e-6);
  if(finished.length){for(const p of finished)completeProject(world,econ,p);econ.queue=econ.queue.filter(p=>!finished.includes(p));touch(world,econ);}
}
function completeProject(world,econ,p){
  const b=BUILDING_BY_ID[p.type];
  if(b.tier==='B'&&p.type==='road'){const id=+p.place.slice(1);econ.routeLevels[id]=(econ.routeLevels[id]||0)+1;econ.extraStock+=p.work;}
  else{
    const list=econ.built[p.place]||(econ.built[p.place]=[]);list.push({t:p.type,i:p.ind,jobs:p.jobs,suit:p.suit,cost:p.work,day:econ.day});
    if(p.type==='port'){const id=+p.place.slice(1);econ.ports[id]=(econ.ports[id]||0)+1;}
    if(b.tier==='C')econ.prestige+=b.prestige*TUNING.prestigeSize[p.size-1];
  }
  emit(econ,`${b.name} completed in ${p.placeName}.`,'good');
}

/* ---------- quotes and projects ---------- */
/** Treasury revenue per WU of new output in an industry, at current rates and typical collection. */
function marginalYield(econ,snap,ind){
  const r=econ.rates,profit=(1-ind.wage)*.6,enterprise=snap.mods.abs.enterprise??0,nominal=r.income*ind.wage+r.corporate*profit*(1-enterprise)+r.consumption*.6+r.property*.4+(ind.extractive?r.royalty:0);
  const collected=snap.revenue.total-snap.revenue.bySource.trade-snap.revenue.byTax.enterprise;
  return nominal*(snap.burden>0?collected/(snap.burden*snap.gdp):.6)+enterprise*profit*.55;
}
const sizeOf=size=>SIZES.find(s=>s.id===+size)||SIZES[0];
const queuedAt=(econ,place)=>econ.queue.filter(p=>p.place===place).length;
export function slotsFree(econ,snapPlace){return snapPlace.slots-snapPlace.used-queuedAt(econ,snapPlace.key);}
/** Price, time and payoff of a project, without committing to it. */
export function quoteProject(world,econ,type,place,size=2){
  const b=BUILDING_BY_ID[type];if(!b)return {ok:false,error:'Unknown project.'};
  const rt=runtime(world,econ),snap=current(world,econ),sz=sizeOf(size),costMod=1+(snap.build.costMod||0),days=Math.round(b.minDays*(1+.35*(sz.id-1)));let q;
  if(b.where.includes('route')){
    const route=rt.routeById.get(+String(place).slice(1));if(!route)return {ok:false,error:'Choose a trade route.'};if(route.maritime)return {ok:false,error:'Sea routes improve through harbours.'};
    const level=(econ.routeLevels[route.id]||0)+1;if(level>3)return {ok:false,error:'This route is fully developed.'};if(econ.queue.some(p=>p.place===place))return {ok:false,error:'An upgrade is already queued.'};
    const cost=route.volume0*(.3+.35*level)*(.5+route.distanceKm/5000)*costMod,after=evaluate(world,rt,econ,{routeLevels:{...econ.routeLevels,[route.id]:level}}),gain=after.revenue.total-snap.revenue.total;
    return {ok:true,type,place,size:sz.id,placeName:`${route.fromName} – ${route.toName}`,ind:-1,jobs:0,suit:1,cost,days,gain:after.gdp-snap.gdp,taxGain:gain,payback:gain>0?cost/gain:Infinity,detail:`Level ${level} of 3`,tier:'B'};
  }
  const p=rt.byKey.get(place),s=snap.index?.get(place);if(!p||!s)return {ok:false,error:'Choose a place to build in.'};
  if(!b.where.includes(p.kind))return {ok:false,error:`${b.name} cannot be built in ${p.kind==='city'?'a city':'the countryside'}.`};
  if(slotsFree(econ,s)<=0)return {ok:false,error:`${p.name} has no free building slots.`};
  const base={ok:true,type,place,size:sz.id,placeName:p.name,tier:b.tier,days};
  if(b.tier==='A'){
    const ind=INDUSTRIES.find(i=>i.id===b.industry),fit=p.fit[ind.index],suit=suitability(fit),board=econ.board[ind.id]||DEFAULT_BOARD,jobs=Math.max(sz.min,sz.share*p.jobs0),discount=board.invest===2?1-TUNING.priorityDiscount:board.invest===0?1+TUNING.neglectPenalty:1;
    const multiplier=snap.industry[ind.index].multiplier,cost=jobs*p.k*ind.jobValue*ind.costFactor*(1+(1-suit)*.6)*costMod*discount*multiplier,gain=jobs*p.k*ind.jobValue*suit*multiplier,taxGain=gain*marginalYield(econ,snap,ind);
    q={...base,ind:ind.index,jobs,suit,fit,cost,gain,taxGain,payback:taxGain>0?cost/taxGain:Infinity,detail:`${Math.round(jobs).toLocaleString()} jobs · site fit ${Math.round(suit/1.15*100)}%`};
  }else if(type==='housing'){
    const jobs=Math.max(sz.min,sz.share*p.workforce0);q={...base,ind:-1,jobs,suit:1,cost:jobs*p.k*.9*costMod,gain:0,taxGain:0,payback:Infinity,detail:`Homes for ${Math.round(jobs).toLocaleString()} workers`};
  }else if(type==='port'){
    const extra=econ.ports[p.id]||0;if(!p.coastal)return {ok:false,error:`${p.name} has no coast to build harbours on.`};if(extra>=3)return {ok:false,error:'The harbour is fully developed.'};
    const cost=(.05+.04*(extra+1))*s.out*costMod,after=evaluate(world,rt,econ,{ports:{...econ.ports,[p.id]:extra+1}}),gain=after.revenue.total-snap.revenue.total;
    q={...base,ind:-1,jobs:0,suit:1,cost,gain:after.gdp-snap.gdp,taxGain:gain,payback:gain>0?cost/gain:Infinity,detail:`Harbour level ${extra+1} of 3`};
  }else{
    const m=TUNING.sizeC[sz.id-1],cost=b.share*m*s.out*costMod;q={...base,ind:-1,jobs:0,suit:1,cost,gain:0,taxGain:0,payback:Infinity,prestige:b.prestige*TUNING.prestigeSize[sz.id-1],detail:`+${(b.prestige*TUNING.prestigeSize[sz.id-1]).toFixed(1)} prestige`};
  }
  return q;
}
export function queueProject(world,econ,type,place,size=2){
  const q=quoteProject(world,econ,type,place,size);if(!q.ok)return q;if(econ.queue.length>=60)return {ok:false,error:'The queue is full.'};
  const project={id:econ.nextId++,type,place,placeName:q.placeName,size:q.size,ind:q.ind,jobs:q.jobs,suit:q.suit,work:q.cost,done:0,paid:0,days:q.days,paused:false,rush:false,status:'queued',day:econ.day};
  econ.queue.push(project);touch(world,econ);emit(econ,`${BUILDING_BY_ID[type].name} queued in ${q.placeName}.`);return {ok:true,project};
}
export function cancelProject(world,econ,id){const p=econ.queue.find(x=>x.id===id);if(!p)return {ok:false,error:'No such project.'};econ.treasury+=p.paid*.5;if(p.reserve>0&&econ.fund)econ.fund.balance+=p.reserve;econ.queue=econ.queue.filter(x=>x!==p);touch(world,econ);emit(econ,`${BUILDING_BY_ID[p.type].name} in ${p.placeName} cancelled${p.paid?`; half the spending was recovered`:''}.`);return {ok:true,refund:p.paid*.5};}
export function moveProject(world,econ,id,delta){const i=econ.queue.findIndex(x=>x.id===id),j=clamp(i+delta,0,econ.queue.length-1);if(i<0)return {ok:false};const [p]=econ.queue.splice(i,1);econ.queue.splice(j,0,p);return {ok:true};}
export function toggleProject(world,econ,id,key){const p=econ.queue.find(x=>x.id===id);if(!p||!['paused','rush'].includes(key))return {ok:false};p[key]=!p[key];if(key==='rush'&&p[key]&&p.day===econ.day){/* no-op */}return {ok:true,value:p[key]};}

/* ---------- budget ---------- */
export function setRate(world,econ,id,value){const tax=TAX_BY_ID[id];if(!tax||!Number.isFinite(+value))return {ok:false,error:'Unknown tax.'};econ.rates[id]=clamp(+value,0,tax.max);touch(world,econ);return {ok:true};}
export function setSpend(world,econ,id,value){if(!(id in econ.spend)||!Number.isFinite(+value))return {ok:false};econ.spend[id]=clamp(+value,.5,1.5);touch(world,econ);return {ok:true};}
export function borrow(world,econ,amount){const snap=current(world,econ),a=Math.min(+amount,snap.credit.available);if(!(a>0))return {ok:false,error:'No credit available.'};econ.debt+=a;econ.treasury+=a;touch(world,econ);return {ok:true,amount:a};}
export function repay(world,econ,amount){const a=Math.min(+amount,econ.debt,Math.max(0,econ.treasury));if(!(a>0))return {ok:false,error:'Nothing to repay.'};econ.debt-=a;econ.treasury-=a;touch(world,econ);return {ok:true,amount:a};}
export function setBuildPolicy(world,econ,{borrowBuild,reserve}){if(borrowBuild!==undefined)econ.borrowBuild=!!borrowBuild;if(reserve!==undefined)econ.reserve=clamp(+reserve||0,0,1);return {ok:true};}

/* ---------- laws ---------- */
const GOVERNMENT_SHOCK={authoritarian:.6,monarchy:.8,republic:1.2,theocracy:1};
export function lawQuote(world,econ,axisId,pos){
  const axis=LAW_BY_ID[axisId],st=econ.laws[axisId],rt=runtime(world,econ),snap=current(world,econ);
  if(!axis||!Number.isInteger(pos)||pos<0||pos>=axis.positions.length)return {ok:false,error:'Unknown position.'};
  if(pos===st.pos&&st.progress>=1)return {ok:false,error:'Already in force.'};
  const target=axis.positions[pos],req=target.req||{};
  if(req.inst&&rt.inst<req.inst)return {ok:false,error:`Needs institutions of ${Math.round(req.inst*100)} (you have ${Math.round(rt.inst*100)}).`,locked:true};
  if(req.tech&&rt.tech<req.tech)return {ok:false,error:`Needs technology of ${Math.round(req.tech*100)} (you have ${Math.round(rt.tech*100)}).`,locked:true};
  if((econ.cooldown[axisId]||0)>econ.day)return {ok:false,error:`Cannot change again until ${isoDate(world,econ.cooldown[axisId])}.`,cooling:true};
  const ep=effectivePosition(st),steps=Math.abs(pos-ep),mood=econ.mood[axisId],retreat=econ.lastMove[axisId]?.from===pos&&econ.day-econ.lastMove[axisId].day<365,resist=clamp(1+.35*(Math.abs(pos-mood)-Math.abs(ep-mood)),.4,1.8),gov=GOVERNMENT_SHOCK[selectionGroup(rt.nation)]??1;
  const cost=axis.cost*steps*snap.revenue.total*(retreat?.5:1),shock=axis.shock*steps*resist*gov*(retreat?.5:1);
  const after=evaluate(world,rt,econ,{laws:{...econ.laws,[axisId]:{pos,from:pos,progress:1}}});
  return {ok:true,axis:axisId,pos,cost,shock,months:axis.months,retreat,mood,resist,affordable:econ.treasury>=cost,
    delta:{revenue:after.revenue.total-snap.revenue.total,spending:after.spending.total-snap.spending.total,stability:after.stability.target-snap.stability.target-0,gdp:after.gdp-snap.gdp,growth:after.growth-snap.growth,unemployment:after.unemployment-snap.unemployment}};
}
export function enactLaw(world,econ,axisId,pos){
  const q=lawQuote(world,econ,axisId,pos);if(!q.ok)return q;if(!q.affordable)return {ok:false,error:'The treasury cannot cover the cost of this reform.'};
  const axis=LAW_BY_ID[axisId],st=econ.laws[axisId],ep=effectivePosition(st);
  econ.treasury-=q.cost;econ.lastMove[axisId]={from:st.pos,day:econ.day};econ.laws[axisId]={pos,from:ep,progress:0};econ.cooldown[axisId]=econ.day+axis.cooldown;
  econ.shocks.push({v:-q.shock,left:Math.max(6,axis.months+6),total:Math.max(6,axis.months+6),label:axis.name});
  touch(world,econ);emit(econ,`${axis.name}: moving to ${axis.positions[pos].name}.`,'info');return {ok:true,quote:q};
}

/* ---------- industry board ---------- */
export function setBoard(world,econ,industryId,key,value){
  if(!INDUSTRIES.some(i=>i.id===industryId))return {ok:false,error:'Unknown industry.'};
  const board=econ.board[industryId]||(econ.board[industryId]={...DEFAULT_BOARD}),snap=current(world,econ);
  if(key==='invest'&&value===2&&board.invest!==2&&snap.build.priority.length>=snap.build.prioritySlots)return {ok:false,error:`All ${snap.build.prioritySlots} priority slots are in use. Change industrial policy for more.`};
  board[key]=value;touch(world,econ);return {ok:true};
}
export function setPartner(world,econ,nationId,term){
  if(!['normal','embargo'].includes(term))return {ok:false};
  if(term==='normal'){delete econ.partners[nationId];}else{econ.partners[nationId]={term,until:null};econ.shocks.push({v:-1.5,left:6,total:6,label:'Embargo'});}
  touch(world,econ);return {ok:true};
}

/* ---------- initiatives ---------- */
export const initiativeSlots=(rt)=>2+(rt.inst>.6?1:0)+(rt.inst>.8?1:0);
export function launchInitiative(world,econ,id,target=0){
  const def=INITIATIVE_BY_ID[id],rt=runtime(world,econ),snap=current(world,econ);if(!def)return {ok:false,error:'Unknown programme.'};
  if(econ.initiatives.active.length>=initiativeSlots(rt))return {ok:false,error:'All programme slots are in use.'};
  if(econ.initiatives.active.some(a=>a.id===id))return {ok:false,error:'That programme is already running.'};
  if((econ.initiatives.cooldown[id]||0)>econ.day)return {ok:false,error:`Available again ${isoDate(world,econ.initiatives.cooldown[id])}.`};
  const cost=def.cost*snap.revenue.total;if(econ.treasury<cost)return {ok:false,error:'The treasury cannot afford this programme.'};
  if(def.scope==='province'&&!rt.provinces.has(+target))return {ok:false,error:'Choose one of your provinces.'};
  if(def.scope==='partner'&&!world.meta.civilization.nations.some(n=>n.id===+target&&n.id!==econ.nation))return {ok:false,error:'Choose a foreign nation.'};
  if(def.scope==='city'){const s=snap.index.get(`c${target}`);if(!s?.coastal)return {ok:false,error:'Choose one of your port cities.'};if((econ.ports[+target]||0)>=3)return {ok:false,error:'The harbour is fully developed.'};}
  econ.treasury-=cost;econ.initiatives.active.push({id,target:+target||0,left:def.months,total:def.months,start:econ.day});econ.initiatives.cooldown[id]=econ.day+def.cooldown*30;
  if(id==='mission')econ.partners[+target]={term:'preferential',until:econ.day+def.months*30};
  if(id==='harbour')econ.ports[+target]=(econ.ports[+target]||0)+1;
  touch(world,econ);emit(econ,`${def.name} launched.`);return {ok:true,cost};
}
export {evaluate,stabilityTerms,partnerTerm,runtime,INITIATIVES};
