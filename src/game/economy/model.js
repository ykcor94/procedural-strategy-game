import {clamp} from '../../core/geo.js';
import {seededRandom} from '../../core/random.js';
import {INDUSTRIES,INDUSTRY_COUNT} from '../../data/industries.js';
import {LAW_AXES,ABSOLUTE_KEYS} from '../../data/laws.js';
import {INITIATIVE_BY_ID} from '../../data/initiatives.js';
import {sampleEnvironment,deposits,industryProfile,cityAttributes,ruralAttributes} from './industry-gen.js';
/** The economy of the player's nation. `buildRuntime` derives the (unsaved) baseline from the generated
 * world; `evaluate` turns the saved campaign state into live output, revenue, spending and stability.
 * Everything is annualised WU unless stated; with no changes, evaluate reproduces the generated output. */
export const TAXES=Object.freeze([
  {id:'income',name:'Income tax',max:.6,def:.2,blurb:'On wages: the broadest base and the heaviest burden.'},
  {id:'corporate',name:'Corporate tax',max:.6,def:.16,blurb:'On profits. High rates slow investment.'},
  {id:'consumption',name:'Consumption tax',max:.35,def:.11,blurb:'On sales. Hard to avoid; falls on the poor.'},
  {id:'property',name:'Land & property tax',max:.2,def:.04,blurb:'On land and buildings. Steady, slow to change.'},
  {id:'royalty',name:'Resource royalties',max:.5,def:.15,blurb:'On mining, energy, timber and fish. Taxing extraction can discourage it.'},
  {id:'tariff',name:'Tariffs',max:.6,def:.06,blurb:'On imports. Raises revenue until trade falls away.'},
  {id:'fees',name:'Port & transit fees',max:.1,def:.03,blurb:'On sea trade through your ports.'},
]);
export const TAX_BY_ID=Object.freeze(Object.fromEntries(TAXES.map(t=>[t.id,t])));
export const DEFAULT_RATES=Object.freeze(Object.fromEntries(TAXES.map(t=>[t.id,t.def])));
export const FUND_LEVELS=Object.freeze([0,.1,.25,.5]);
export const TUNING=Object.freeze({evasion:.65,compliance:1.15,participation:[.38,.2],elasticity:2,routeScale:42000,roadCut:[0,.08,.15,.24],portCut:.06,portCap:.3,stockUpkeep:.014,organicCap:[-.03,.06],priorityDiscount:.2,neglectPenalty:.15,rush:[1.5,1.3],sizeC:[1,2.2,4.5],prestigeSize:[1,1.8,2.8],tradeScale:2.4,tradeShare:.5,instabilityStall:25});
const TRADE=INDUSTRIES.findIndex(i=>i.id==='trade'),CONSTRUCTION=INDUSTRIES.findIndex(i=>i.id==='construction'),HEAVY=INDUSTRIES.findIndex(i=>i.id==='heavy');
const ABS=new Set(ABSOLUTE_KEYS),INDEX=Object.fromEntries(INDUSTRIES.map(i=>[i.id,i.index]));
export const DEFAULT_BOARD=Object.freeze({invest:1,fund:0,regulate:1});
export const ratingLabel=r=>r>=.85?'AAA':r>=.75?'AA':r>=.65?'A':r>=.55?'BBB':r>=.45?'BB':r>=.35?'B':r>=.25?'CCC':'D';
export const stabilityBand=s=>s<25?'Crisis':s<45?'Unrest':s<70?'Steady':s<85?'Confident':'Golden age';
export const suitability=fit=>clamp(.3+.7*Math.min(1,fit)+.2*Math.max(0,fit-1),.3,1.15);
export const instOf=nation=>nation.economicProfile?.institutions??.5;

/* ---------- laws ---------- */
const fxCache=new Map();
/** Effects of an axis at a (possibly fractional) position: linear between neighbouring positions. */
export function fxAt(axis,position){
  const key=`${axis.id}:${position}`;let fx=fxCache.get(key);if(fx)return fx;
  const lo=Math.floor(position),hi=Math.ceil(position),t=position-lo,a=axis.positions[lo].fx,b=axis.positions[hi].fx;fx={ind:{}};
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])){if(k==='ind'){for(const id of new Set([...Object.keys(a.ind||{}),...Object.keys(b.ind||{})]))fx.ind[id]=(a.ind?.[id]||0)*(1-t)+(b.ind?.[id]||0)*t;}else fx[k]=(a[k]||0)*(1-t)+(b[k]||0)*t;}
  fxCache.set(key,fx);return fx;
}
export const effectivePosition=state=>state.from+(state.pos-state.from)*state.progress;
/** Aggregate law and initiative effects: `d` deltas, `ind` per-industry deltas, `abs` absolute readings. */
export function lawMods(econ){
  const d={},ind={},abs={},base=econ.consts.baseLaws;
  for(const axis of LAW_AXES){
    const now=fxAt(axis,effectivePosition(econ.laws[axis.id])),ref=fxAt(axis,base[axis.id]);
    for(const k of new Set([...Object.keys(now),...Object.keys(ref)])){if(k==='ind')continue;if(ABS.has(k))abs[k]=(abs[k]||0)+(now[k]||0);else d[k]=(d[k]||0)+(now[k]||0)-(ref[k]||0);}
    for(const id of new Set([...Object.keys(now.ind),...Object.keys(ref.ind)]))ind[id]=(ind[id]||0)+(now.ind[id]||0)-(ref.ind[id]||0);
  }
  for(const active of econ.initiatives.active){const fx=INITIATIVE_BY_ID[active.id]?.fx;if(!fx)continue;for(const k of Object.keys(fx)){if(k==='ind')for(const id of Object.keys(fx.ind))ind[id]=(ind[id]||0)+fx.ind[id];else d[k]=(d[k]||0)+fx[k];}}
  return {d,ind,abs};
}

/* ---------- baseline runtime ---------- */
const memo=new WeakMap();
export function runtime(world,econ){
  const civ=world.meta.civilization,cached=memo.get(econ);
  if(cached&&cached.world===world&&cached.revision===civ.revision&&cached.tradeRevision===civ.tradeRevision&&cached.surveyKey===JSON.stringify(econ.surveys))return cached;
  const rt=buildRuntime(world,econ);memo.set(econ,rt);return rt;
}
export function buildRuntime(world,econ){
  const civ=world.meta.civilization,l=world.layers,nation=civ.nations.find(n=>n.id===econ.nation);if(!nation)throw new Error('The player nation no longer exists.');
  const inst=instOf(nation),tech=nation.technology??.5,seed=`${world.seed}:${civ.seed}`,depositCache=new Map(),context={deposits:id=>{let d=depositCache.get(id);if(!d){d=deposits(world,id);depositCache.set(id,d);}return d;},survey:econ.surveys},
    provinces=new Map(civ.provinces.filter(p=>p.nation===nation.id).map(p=>[p.id,p])),cityByProvince=new Map(),cells=new Map();
  for(let i=0;i<l.ownership.length;i++)if(l.ownership[i]===nation.id){const p=l.province[i];if(!p)continue;let list=cells.get(p);if(!list)cells.set(p,list=[]);list.push(i);}
  const cities=civ.cities.filter(c=>c.nation===nation.id&&c.population>0);
  for(const c of cities){const p=l.province[c.cell]||c.province||0;if(!cityByProvince.has(p))cityByProvince.set(p,[]);cityByProvince.get(p).push(c);}
  const nationUrban=nation.urbanization||0,nationAccess=nation.tradeAccess||0,rand=seededRandom(seed,`economy-start:${nation.id}`),participation=TUNING.participation[0]+TUNING.participation[1]*tech;
  const places=[],byKey=new Map(),leanOf=p=>clamp(-1.6*((p?.urbanization||0)-nationUrban)-1.2*((p?.tradeAccess||0)-nationAccess),-1,1);
  const addPlace=(kind,id,name,province,pop,output,attrs,extra)=>{
    const key=(kind==='city'?'c':'p')+id,r=seededRandom(seed,`economy-place:${key}`),{share,fit}=industryProfile(world,attrs,key),out0=new Float64Array(INDUSTRY_COUNT);
    for(let k=0;k<INDUSTRY_COUNT;k++)out0[k]=output*share[k];
    const workforce0=pop*participation,u0=clamp(.03+.15*(1-inst)+.05*r()+(kind==='rural'?.015:0),.015,.4),jobs0=Math.max(1,workforce0*(1-u0));let valueUnits=0;
    for(const industry of INDUSTRIES)valueUnits+=out0[industry.index]/industry.jobValue;
    const urbanness=kind==='city'?attrs.u:0,formality=clamp(.3+.4*urbanness+.15*attrs.access+.1*tech+(kind==='city'?.1:0),.3,1),
      slots=kind==='city'?clamp(2+Math.floor(1.35*Math.log2(pop/3000+1)),2,26):clamp(3+Math.floor(1.5*Math.log2(workforce0/20000+1)),3,22);
    const place={key,kind,id,name,province,pop,workforce0,u0,jobs0,k:valueUnits/jobs0,out0,total0:output,fit,access:attrs.access,formality,slots,lean:leanOf(provinces.get(province)),coastal:(attrs.env.coast>.3||!!attrs.port),capital:!!attrs.capital,port0:attrs.port?1:0,share,...extra};
    places.push(place);byKey.set(key,place);return place;
  };
  let cityTotal=0;const cityOut=new Map();
  for(const c of cities){const o=Math.max(0,c.economicOutput||c.population*(c.productivity||0));cityTotal+=o;cityOut.set(c.id,o);}
  for(const c of cities)addPlace('city',c.id,c.name,l.province[c.cell]||c.province||0,c.population,cityOut.get(c.id),cityAttributes(world,c,nation,context),{cell:c.cell,x:c.x,y:c.y,cityRef:c});
  // Rural land is what the cities leave of each province; scaled so the nation's total is exactly its generated output.
  const rural=[];let ruralRaw=0;
  for(const p of provinces.values()){const cs=cityByProvince.get(p.id)||[],pop=Math.max(0,(p.population||0)-cs.reduce((s,c)=>s+c.population,0)),out=Math.max(0,(p.economicOutput||0)-cs.reduce((s,c)=>s+cityOut.get(c.id),0));if(pop<=0&&out<=0)continue;rural.push({p,pop,out});ruralRaw+=out;}
  const ruralTarget=Math.max(0,(nation.economicOutput||0)-cityTotal),popRaw=rural.reduce((s,r)=>s+r.pop,0);
  for(const r of rural){const out=ruralRaw>0?r.out*ruralTarget/ruralRaw:popRaw>0?ruralTarget*r.pop/popRaw:0,env=sampleEnvironment(world,cells.get(r.p.id)||[]);addPlace('rural',r.p.id,`${r.p.name} countryside`,r.p.id,r.pop,out,ruralAttributes(world,env,r.p,nation,r.p.tradeAccess||nationAccess,context),{});}
  const owned=new Set(cities.map(c=>c.id)),byCity=new Map(cities.map(c=>[c.id,c])),routes=[];
  for(const route of civ.tradeRoutes||[]){const ownFrom=owned.has(route.from),ownTo=owned.has(route.to);if(!ownFrom&&!ownTo)continue;const other=byCity.get(ownFrom?route.to:route.from)||civ.cities.find(c=>c.id===(ownFrom?route.to:route.from)),partner=ownFrom&&ownTo?0:other?.nation||0;
    routes.push({id:route.id,from:route.from,to:route.to,fromKey:ownFrom?`c${route.from}`:'',toKey:ownTo?`c${route.to}`:'',volume0:route.volume,cost0:route.cost,kind:route.kind,seaShare:route.seaShare||0,distanceKm:route.distanceKm||0,partner,cross:partner>0,maritime:(route.seaShare||0)>.15,tier:route.tier||3,fromName:civ.cities.find(c=>c.id===route.from)?.name||'?',toName:civ.cities.find(c=>c.id===route.to)?.name||'?'});}
  const incident0=new Map();for(const r of routes)for(const key of [r.fromKey,r.toKey])if(key)incident0.set(key,(incident0.get(key)||0)+r.volume0);
  const gdp0=places.reduce((s,p)=>s+p.total0,0),pop=places.reduce((s,p)=>s+p.pop,0),shares=new Float64Array(INDUSTRY_COUNT);
  for(const p of places)for(let k=0;k<INDUSTRY_COUNT;k++)shares[k]+=p.out0[k];for(let k=0;k<INDUSTRY_COUNT;k++)shares[k]/=gdp0||1;
  return {world,revision:civ.revision,tradeRevision:civ.tradeRevision,surveyKey:JSON.stringify(econ.surveys),nation,inst,tech,places,byKey,routes,routeById:new Map(routes.map(r=>[r.id,r])),incident0,gdp0,pop,shares,provinces,rand,nationAccess,nationUrban};
}

