import {clamp} from '../../core/geo.js';
import {seededRandom} from '../../core/random.js';
import {CENSUS_INTERVALS,CENSUS_COST,EMERGENCY_CENSUS_COST,EMERGENCY_CENSUS_MONTHS,POLICY_BY_ID,DEMO_INITIATIVE_BY_ID,DEFAULT_DEMO_POLICIES} from '../../data/demography.js';
import {normalizeGroups,mixGroups,shareOf,stepUnit,addPeople,removePeople,policyFx,identityRates,developmentOf,startingBands,lifeTarget,literacyTarget,baseFertility,totalOf,workforceOf,diversity,project,MIGRANT_BANDS,NO_RELIGION} from './model.js';
/** The player's population: one demographic unit per economic place. The live state moves every month;
 * what the player sees is the last census (`census.data`), refreshed on the census schedule or by an
 * emergency census. Plain JSON in meta.game.demography. */
export const DEMOGRAPHY_VERSION=1;
const DAY=86400000;

const mixOf=list=>normalizeGroups((list||[]).map(e=>[e.id,e.population??e.share??0]));
function ruralMix(province,cities,kind){
  const map=new Map();for(const e of province?.[kind]||[])map.set(e.id,(map.get(e.id)||0)+(e.population??0));
  for(const c of cities)for(const e of c[kind]||[])map.set(e.id,(map.get(e.id)||0)-(e.population??(e.share||0)*c.population));
  const list=[...map].filter(([,v])=>v>0);return list.length?normalizeGroups(list):mixOf(province?.[kind]);
}

export function createDemography(world,econ,rt){
  const civ=world.meta.civilization,nation=rt.nation,dev=developmentOf(nation),inst=rt.inst,places={},work0={};
  const provinces=new Map(civ.provinces.map(p=>[p.id,p]));
  for(const p of rt.places){
    const urban=p.kind==='city',local=clamp(dev+(urban?.05:-.04),0,1);let groups;
    if(urban){const c=p.cityRef;groups={c:mixOf(c.cultures),l:mixOf(c.languages),r:mixOf(c.religions)};}
    else{const prov=provinces.get(p.province),cities=civ.cities.filter(c=>c.nation===nation.id&&(world.layers.province[c.cell]||c.province)===p.province);groups={c:ruralMix(prov,cities,'cultures'),l:ruralMix(prov,cities,'languages'),r:ruralMix(prov,cities,'religions')};}
    if(!groups.c.length)groups.c=mixOf(nation.cultures);if(!groups.l.length)groups.l=mixOf(nation.languages);if(!groups.r.length)groups.r=mixOf(nation.religions);
    const bands=startingBands(local,urban).map(v=>v*p.pop);
    places[p.key]={key:p.key,kind:p.kind,id:p.id,province:p.province,name:p.name,pop0:p.pop,bands,groups,lit:+literacyTarget(local).toFixed(4),life:+lifeTarget(local).toFixed(2),fert:+baseFertility(local,urban).toFixed(3),urban,yr:{b:0,d:0,mi:0,mo:0,im:0,em:0},last:{b:0,d:0,mi:0,mo:0,im:0,em:0}};
    work0[p.key]=workforceOf(bands);
  }
  const interval=inst>.65?2:inst>.4?5:10;
  const demo={version:DEMOGRAPHY_VERSION,nation:nation.id,day:econ.day,dev0:dev,gdppc0:rt.pop?rt.gdp0/rt.pop:0,places,work0,policies:{...DEFAULT_DEMO_POLICIES,religion:/theocra/i.test(nation.government||'')?'enforced':DEFAULT_DEMO_POLICIES.religion},
    initiatives:{active:[],cooldown:{}},census:{interval,next:econ.day+interval*365,last:econ.day,accuracy:+clamp(.72+.25*inst,.6,.97).toFixed(3),costMod:1,emergency:null,data:null,prev:null,history:[]},
    flows:{imm:0,emi:0,ref:0,internal:0,urban:0},stateReligion:nation.dominantReligion||0,culture:nation.cultures?.[0]?.id||0,language:nation.officialLanguage||0,satisfaction:[]};
  takeCensus(world,demo,{quiet:true,exact:true});
  return demo;
}

/* ---------- aggregates ---------- */
/** National totals of a set of place records (live or census). */
export function aggregate(records){
  const bands=[0,0,0,0,0];let pop=0,urban=0,lit=0,life=0,fert=0,b=0,d=0,mi=0,mo=0,im=0,em=0;const c=[],l=[],r=[];
  for(const u of records){const t=u.pop??totalOf(u.bands);pop+=t;for(let k=0;k<5;k++)bands[k]+=u.bands[k];if(u.urban)urban+=t;lit+=u.lit*t;life+=u.life*t;fert+=u.fert*t;for(const [id,s] of u.groups.c)c.push([id,s*t]);for(const [id,s] of u.groups.l)l.push([id,s*t]);for(const [id,s] of u.groups.r)r.push([id,s*t]);const y=u.last||u.yr;if(y){b+=y.b;d+=y.d;mi+=y.mi;mo+=y.mo;im+=y.im||0;em+=y.em||0;}}
  return {pop,bands,urban:pop?urban/pop:0,lit:pop?lit/pop:0,life:pop?life/pop:0,fert:pop?fert/pop:0,groups:{c:normalizeGroups(c),l:normalizeGroups(l),r:normalizeGroups(r)},births:b,deaths:d,migIn:mi,migOut:mo,immigrants:im,emigrants:em};
}
export const livePlaces=demo=>Object.values(demo.places);

/* ---------- census ---------- */
export function censusCost(demo,revenue,emergency=false){return revenue*(emergency?EMERGENCY_CENSUS_COST:CENSUS_COST)*demo.census.costMod;}
export function takeCensus(world,demo,{quiet=false,exact=false}={}){
  const c=demo.census,r=seededRandom(`${world.seed}:${world.meta.civilization.seed}`,`census:${demo.nation}:${demo.day}`),noise=exact?0:(1-c.accuracy),prev=c.data,years=prev?Math.max(.25,(demo.day-prev.day)/365):1,places={};
  for(const u of livePlaces(demo)){
    const pop=totalOf(u.bands)*(1+(r()-.5)*.08*noise),old=prev?.places[u.key];
    const jitter=g=>normalizeGroups(g.map(([id,s])=>[id,s*(1+(r()-.5)*.25*noise)]));
    places[u.key]={key:u.key,kind:u.kind,id:u.id,province:u.province,name:u.name,urban:u.urban,pop:Math.round(pop),bands:u.bands.map(v=>Math.round(v*pop/Math.max(1,totalOf(u.bands)))),groups:{c:jitter(u.groups.c),l:jitter(u.groups.l),r:jitter(u.groups.r)},
      lit:+u.lit.toFixed(4),life:+u.life.toFixed(2),fert:+u.fert.toFixed(3),growth:old&&old.pop>0?Math.pow(pop/old.pop,1/years)-1:0,last:{...u.last}};
  }
  const national=aggregate(Object.values(places)),oldNational=prev?.national;
  national.growth=oldNational?.pop?Math.pow(national.pop/oldNational.pop,1/years)-1:0;
  national.groupGrowth=prev?growthByGroup(prev.national,national,years):{c:{},l:{},r:{}};
  c.prev=prev?{day:prev.day,national:prev.national}:null;c.data={day:demo.day,places,national,accuracy:exact?1:c.accuracy};c.last=demo.day;
  c.history.push({day:demo.day,pop:Math.round(national.pop),urban:+national.urban.toFixed(4),lit:+national.lit.toFixed(4),life:+national.life.toFixed(2),fert:+national.fert.toFixed(3),bands:national.bands.map(Math.round),c:national.groups.c.slice(0,4),l:national.groups.l.slice(0,4),r:national.groups.r.slice(0,4)});
  if(c.history.length>40)c.history.shift();
  c.next=demo.day+c.interval*365;c.fresh=!quiet;return c.data;
}
function growthByGroup(a,b,years){const out={};for(const kind of ['c','l','r']){out[kind]={};for(const [id,s] of b.groups[kind]){const old=shareOf(a.groups[kind],id)*a.pop,now=s*b.pop;out[kind][id]=old>0?Math.pow(now/old,1/years)-1:null;}}return out;}

/* ---------- monthly step ---------- */
const MONTH=1/12;
/** One month of births, deaths, ageing, identity change and migration. `ctx` supplies economic and world
 * conditions: {snap, econ, ws, worldCtx, nation, revenue, date}. Returns money spent. */
export function demographyMonth(world,demo,ctx){
  const {snap,econ,nation}=ctx,places=livePlaces(demo);if(!places.length)return 0;
  demo.day=econ.day;
  const gdppc=snap.gdpPerCapita||demo.gdppc0,dev=clamp(demo.dev0+.12*Math.log(Math.max(.2,gdppc/Math.max(1,demo.gdppc0))),0,1);
  const sat=econ.link?.market?.sat,food=sat?Math.min(1,(sat[14]??1)*.6+(sat[0]??1)*.4):1;
  const index=snap.index,services=econ.spend?.services??1,stability=econ.stability??50,base=policyFx(demo.policies,demo.initiatives.active);
  // Identity change for each place.
  for(const u of places){
    const fx=policyFx(demo.policies,demo.initiatives.active,u.province,u.key),rates=identityRates(fx,nation);
    const env={dev:clamp(dev+(u.urban?.05:-.04),0,1),services,food,fert:fx.fert,life:fx.life,lit:fx.lit,litBoost:fx.litBoost,culture:demo.culture,language:demo.language,religion:demo.stateReligion,assim:rates.assim,lang:rates.lang,conv:rates.conv,secular:stability<30?-.004:rates.secular};
    const r=stepUnit(u,env,MONTH);u.yr.b+=r.births;u.yr.d+=r.deaths;
  }
  migrateInternal(demo,places,index,base);
  migrateInternational(world,demo,places,ctx,base,gdppc);
  // Programmes end; census office and policy upkeep.
  let spent=0;
  for(const a of [...demo.initiatives.active]){a.left--;if(a.left<=0){const def=DEMO_INITIATIVE_BY_ID[a.id];if(def.done?.accuracy)demo.census.accuracy=clamp(demo.census.accuracy+def.done.accuracy,.5,.99);if(def.done?.censusCost)demo.census.costMod=clamp(demo.census.costMod*(1+def.done.censusCost),.3,2);demo.initiatives.active=demo.initiatives.active.filter(x=>x!==a);ctx.emit?.(`${def.name} has run its course.`);}}
  if(base.cost)spent+=base.cost*ctx.revenue/12;
  if(demo.census.emergency){demo.census.emergency.left--;if(demo.census.emergency.left<=0){demo.census.emergency=null;takeCensus(world,demo);ctx.emit?.('The emergency census is complete. New figures are in the Demographics panel.','good');}}
  else if(demo.day>=demo.census.next){const cost=censusCost(demo,ctx.revenue);spent+=cost;takeCensus(world,demo);ctx.emit?.(`Census of ${new Date(ctx.date).getUTCFullYear()} published.`,'good');}
  if(new Date(ctx.date).getUTCMonth()===0)for(const u of places){u.last=u.yr;u.yr={b:0,d:0,mi:0,mo:0,im:0,em:0};}
  // Feedback to the economy: labour and population ratios for each place, minority mood for stability.
  const labour={};for(const u of places){const w0=demo.work0[u.key]||1;labour[u.key]=[+(totalOf(u.bands)/Math.max(1,u.pop0)).toFixed(5),+(workforceOf(u.bands)/w0).toFixed(5)];}
  demo.satisfaction=groupSatisfaction(demo,nation);
  econ.link={...econ.link,labour,demoStab:+minorityStability(demo).toFixed(3),demoCost:base.cost||0,demoStabPolicy:base.stab||0};
  return spent;
}

function placeIncome(index,key){const p=index?.get(key);return p&&p.pop>0?p.out/p.pop:0;}
function migrateInternal(demo,places,index,fx){
  const byProvince=new Map();for(const u of places){if(!byProvince.has(u.province))byProvince.set(u.province,[]);byProvince.get(u.province).push(u);}
  let urbanMoves=0,interMoves=0;
  // Countryside to towns: the urban wage premium pulls, unemployment pushes back.
  for(const list of byProvince.values()){
    const rural=list.find(u=>!u.urban),cities=list.filter(u=>u.urban);if(!rural||!cities.length)continue;
    const ri=placeIncome(index,rural.key)||1,cityPop=cities.reduce((s,c)=>s+totalOf(c.bands),0);
    for(const c of cities){
      const ci=placeIncome(index,c.key)||ri,unemp=index?.get(c.key)?.unemployment??.08,renewal=fx.urban||0,premium=clamp(ci/ri-1,0,3);
      const rate=clamp(.0025+.007*premium+renewal-.03*Math.max(0,unemp-.08),0,.035)*MONTH,move=totalOf(rural.bands)*rate*totalOf(c.bands)/Math.max(1,cityPop);
      if(move<=0)continue;transfer(rural,c,move);urbanMoves+=move;
    }
  }
  // Between provinces: towards jobs and income.
  const att=places.map(u=>{const p=index?.get(u.key);return {u,a:p?Math.log(Math.max(1e-6,placeIncome(index,u.key))+1e-6)-2.5*(p.unemployment||0)+.006*((p.stability??50)-50):0};}),mean=att.reduce((s,x)=>s+x.a*totalOf(x.u.bands),0)/Math.max(1,places.reduce((s,u)=>s+totalOf(u.bands),0));
  const pull=att.filter(x=>x.a>mean),push=att.filter(x=>x.a<mean),pullW=pull.reduce((s,x)=>s+(x.a-mean)*totalOf(x.u.bands),0);
  if(pullW>0)for(const x of push){const out=totalOf(x.u.bands)*clamp(.004*(mean-x.a),0,.012)*MONTH;if(out<=0)continue;for(const y of pull){const share=(y.a-mean)*totalOf(y.u.bands)/pullW;transfer(x.u,y.u,out*share);}interMoves+=out;}
  // Resettlement programme: crowded provinces send families to the target.
  for(const a of demo.initiatives.active)if(a.id==='resettle'){const target=places.find(u=>u.province===a.target&&!u.urban)||places.find(u=>u.province===a.target);if(!target)continue;const sources=places.filter(u=>!u.urban&&u.province!==a.target).sort((x,y)=>totalOf(y.bands)-totalOf(x.bands)).slice(0,4);for(const s of sources){const move=totalOf(s.bands)*.012*MONTH;transfer(s,target,move);interMoves+=move;}}
  demo.flows.urban=demo.flows.urban*.92+urbanMoves*12*.08;demo.flows.internal=demo.flows.internal*.92+interMoves*12*.08;
}
function transfer(from,to,count){
  if(count<=0)return;const total=totalOf(from.bands);count=Math.min(count,total*.05);if(count<=0)return;
  const groups={c:from.groups.c,l:from.groups.l,r:from.groups.r};removePeople(from,count);addPeople(to,count,groups,MIGRANT_BANDS,from.lit);
  from.yr.mo+=count;to.yr.mi+=count;
}
/** Immigration, emigration and refugees, conserving people with the source nations in the world state. */
function migrateInternational(world,demo,places,ctx,fx,gdppc){
  const ws=ctx.ws,wctx=ctx.worldCtx;if(!ws||!wctx)return;
  let wGdp=0,wPop=0;for(const n of Object.values(ws.nations)){if(n.id===demo.nation)continue;wGdp+=n.gdp;wPop+=n.pop;}
  const worldPc=wPop?wGdp/wPop:gdppc,stab=ctx.econ.stability??50,attract=clamp(.55*Math.log(Math.max(.05,gdppc/Math.max(1e-6,worldPc)))+(stab-50)/90,-1.2,1.6);
  const total=places.reduce((s,u)=>s+totalOf(u.bands),0);if(total<=0)return;
  const sources=(wctx.links.get(demo.nation)||[]).slice(0,14).map(link=>{const n=ws.nations[link.id];if(!n||n.pop<=0)return null;const pc=n.gdp/n.pop,push=clamp(1+.6*Math.log(Math.max(.05,gdppc/Math.max(1e-6,pc)))+(50-n.stab)/60,.05,4);const blocked=ws.sanctions.some(s=>s.by===demo.nation&&s.on===n.id&&s.level==='embargo');return blocked?null:{n,w:link.conn*Math.sqrt(n.pop)*push};}).filter(Boolean),wsum=sources.reduce((s,x)=>s+x.w,0);
  const immigrants=attract>0?total*.0042*attract*fx.imm*MONTH:total*.0004*fx.imm*MONTH,emigrants=total*(.0006+.0035*Math.max(0,-attract))*MONTH;
  const cities=places.filter(u=>u.urban),cityPop=cities.reduce((s,u)=>s+totalOf(u.bands),0);
  const settle=(count,groups,lit,kind)=>{if(count<=0)return;for(const u of places){const t=totalOf(u.bands),share=u.urban&&cityPop>0?.72*t/cityPop:(1-(cityPop>0?.72:0))*t/Math.max(1,total-cityPop);const n=count*share;if(n<=0)continue;addPeople(u,n,groups,MIGRANT_BANDS,lit);u.yr.im+=n;u.yr.mi+=n;}if(kind==='ref')demo.flows.ref=demo.flows.ref*.92+count*12*.08;};
  if(wsum>0&&immigrants>0)for(const s of sources){const n=immigrants*s.w/wsum,d=s.n.demo,lit=fx.skilled??d.lit;settle(n,{c:d.groups.c.slice(0,3),l:d.groups.l.slice(0,3),r:d.groups.r.slice(0,3)},lit);removePeople(d,n);s.n.pop=Math.max(0,s.n.pop-n);}
  // Refugees from neighbours in crisis.
  let refugees=0;if(fx.refugees>0)for(const link of (wctx.links.get(demo.nation)||[]).filter(l=>l.border||l.d<.08)){const n=ws.nations[link.id];if(!n||n.stab>=22)continue;const count=n.pop*.003*(22-n.stab)/22*fx.refugees*MONTH;settle(count,{c:n.demo.groups.c.slice(0,2),l:n.demo.groups.l.slice(0,2),r:n.demo.groups.r.slice(0,2)},n.demo.lit*.8,'ref');removePeople(n.demo,count);n.pop=Math.max(0,n.pop-count);refugees+=count;}
  for(const u of places){const n=emigrants*totalOf(u.bands)/total;removePeople(u,n);u.yr.em+=n;u.yr.mo+=n;}
  demo.flows.imm=demo.flows.imm*.92+(immigrants+refugees)*12*.08;demo.flows.emi=demo.flows.emi*.92+emigrants*12*.08;
}

/* ---------- groups and stability ---------- */
/** Satisfaction (0–100) of each significant minority. National majorities are content by definition. */
export function groupSatisfaction(demo,nation){
  const live=aggregate(livePlaces(demo)),out=[],active=demo.initiatives.active;
  const base=policyFx(demo.policies,[]);
  for(const [kind,key,majority] of [['culture','c',demo.culture],['language','l',demo.language],['religion','r',demo.stateReligion]])
    for(const [id,share] of live.groups[key]){
      if(!id||share<.02)continue;if(id===majority||(kind==='religion'&&id===NO_RELIGION&&demo.policies.religion!=='enforced')){out.push({kind,id,share,sat:72});continue;}
      let sat=58+base.minority*(kind==='culture'?1:.6);
      if(kind==='religion'){sat-=demo.policies.religion==='enforced'?18:demo.policies.religion==='established'?6:0;}
      if(kind==='language'){sat-=demo.policies.language==='single'?10:0;}
      for(const a of active){const def=DEMO_INITIATIVE_BY_ID[a.id];if(!def?.fx.minority)continue;const local=livePlaces(demo).filter(u=>u.province===a.target).reduce((s,u)=>s+shareOf(u.groups[key],id)*totalOf(u.bands),0)/Math.max(1,live.pop*share);sat+=def.fx.minority*clamp(local*3,0,1);}
      out.push({kind,id,share,sat:clamp(sat,0,100)});
    }
  return out.map(g=>({...g,share:+g.share.toFixed(4),sat:+g.sat.toFixed(1)}));
}
export function minorityStability(demo){let v=0;for(const g of demo.satisfaction||[])v+=g.share*(g.sat-55)/7;return clamp(v,-9,3);}

/* ---------- player actions ---------- */
export function setCensusInterval(demo,years){if(!CENSUS_INTERVALS.includes(+years))return {ok:false,error:'Unknown interval.'};demo.census.interval=+years;demo.census.next=demo.census.last+years*365;return {ok:true};}
export function orderEmergencyCensus(demo,econ,revenue){
  if(demo.census.emergency)return {ok:false,error:'A census is already being taken.'};
  const cost=censusCost(demo,revenue,true);if(econ.treasury<cost)return {ok:false,error:'The treasury cannot cover an emergency census.'};
  econ.treasury-=cost;demo.census.emergency={left:EMERGENCY_CENSUS_MONTHS,cost};return {ok:true,cost};
}
export function setDemoPolicy(demo,axis,choice){const def=POLICY_BY_ID[axis];if(!def||!def.options.some(o=>o.id===choice))return {ok:false,error:'Unknown policy.'};demo.policies[axis]=choice;return {ok:true};}
export const demoInitiativeSlots=inst=>2+(inst>.55?1:0);
export function launchDemoInitiative(demo,econ,inst,revenue,id,target=0,provinces=null){
  const def=DEMO_INITIATIVE_BY_ID[id];if(!def)return {ok:false,error:'Unknown programme.'};
  if(demo.initiatives.active.length>=demoInitiativeSlots(inst))return {ok:false,error:'All population programme slots are in use.'};
  if(demo.initiatives.active.some(a=>a.id===id&&(def.scope==='nation'||a.target===+target)))return {ok:false,error:'That programme is already running there.'};
  if((demo.initiatives.cooldown[id]||0)>demo.day)return {ok:false,error:'That programme is on cooldown.'};
  if(def.scope==='province'&&!(provinces?.has(+target)))return {ok:false,error:'Choose one of your provinces.'};
  if(def.scope==='city'&&!demo.places[`c${target}`])return {ok:false,error:'Choose one of your cities.'};
  const cost=def.cost*revenue;if(econ.treasury<cost)return {ok:false,error:'The treasury cannot afford this programme.'};
  econ.treasury-=cost;demo.initiatives.active.push({id,target:+target||0,left:def.months,total:def.months,start:demo.day});demo.initiatives.cooldown[id]=demo.day+def.cooldown*30;return {ok:true,cost};
}

/* ---------- projections ---------- */
/** National projection from the last census, under current policies, with an uncertainty band. */
export function projectNation(demo,nation,{years=30,scenario='current',services=1}={}){
  const data=demo.census.data;if(!data)return [];const n=data.national,policies={...demo.policies},extra=[];
  if(scenario==='natalist')extra.push({id:'natalist',target:0});if(scenario==='open')policies.immigration='open';if(scenario==='closed')policies.immigration='closed';
  const fx=policyFx(policies,[...demo.initiatives.active,...extra]),rates=identityRates(fx,nation),dev=clamp(demo.dev0,0,1);
  const migRate=n.pop>0?((n.immigrants||0)-(n.emigrants||0))/n.pop:0,baseImm=demo.policies.immigration,scale=(POLICY_BY_ID.immigration.options.find(o=>o.id===policies.immigration)?.fx.imm||1)/(POLICY_BY_ID.immigration.options.find(o=>o.id===baseImm)?.fx.imm||1);
  const env={dev,services,food:1,fert:fx.fert,life:fx.life,lit:fx.lit,litBoost:fx.litBoost,culture:demo.culture,language:demo.language,religion:demo.stateReligion,assim:rates.assim,lang:rates.lang,conv:rates.conv,secular:rates.secular};
  const unit={bands:n.bands.slice(),groups:n.groups,urban:n.urban>.5,lit:n.lit,life:n.life,fert:n.fert},since=(demo.day-data.day)/365;
  return project(unit,env,years,migRate>0?migRate*scale:migRate).map(p=>({...p,spread:.006*(since+p.year)+.0004*p.year*p.year}));
}
export {diversity,shareOf,totalOf};
