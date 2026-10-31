import {clamp} from '../../core/geo.js';
import {INDUSTRIES,INDUSTRY_COUNT} from '../../data/industries.js';
import {LAW_AXES} from '../../data/laws.js';
import {TAX_BY_ID,DEFAULT_RATES,FUND_LEVELS,TUNING,DEFAULT_BOARD,lawMods,effectivePosition,ratingLabel,stabilityBand} from './model.js';
const TRADE=INDUSTRIES.findIndex(i=>i.id==='trade'),CONSTRUCTION=INDUSTRIES.findIndex(i=>i.id==='construction'),HEAVY=INDUSTRIES.findIndex(i=>i.id==='heavy');
const sum=terms=>terms.reduce((s,t)=>s+t.value,0);

/** Share of a route's cost removed by upgrades: roads and canals on land and rivers, harbours at sea. */
export function routeCut(econ,route){
  if(!route.maritime)return TUNING.roadCut[Math.min(3,econ.routeLevels[route.id]||0)];
  let cut=0;for(const key of [route.fromKey,route.toKey])if(key)cut+=TUNING.portCut*(econ.ports[+key.slice(1)]||0);
  return Math.min(cut,TUNING.portCap);
}
/** Active trade terms with a partner: embargo, preferential or normal. */
export function partnerTerm(econ,nationId){const t=econ.partners[nationId];return t&&(t.until==null||t.until>econ.day)?t.term:'normal';}
/** Route effects of each partner term: volume multiplier and the share of the tariff charged. */
export const TERM_FX=Object.freeze({normal:{v:1,t:1},preferential:{v:1.12,t:0},trade:{v:1.08,t:.5},free:{v:1.18,t:0},contract:{v:1.04,t:1},targeted:{v:.8,t:1},broad:{v:.35,t:1},embargo:{v:0,t:1}});

/** Stability terms for the current state. Also used once to calibrate the starting value. */
export function stabilityTerms(econ,rt,figures,mods){
  const terms=[];
  terms.push({id:'tax',label:'Tax burden',value:clamp(-80*(figures.burden-.27),-12,6)});
  terms.push({id:'jobs',label:'Unemployment',value:clamp(-70*(figures.unemployment-.08),-12,4)});
  terms.push({id:'welfare',label:'Welfare against expectations',value:clamp(3*(effectivePosition(econ.laws.welfare)-(.6+2.6*rt.tech)),-8,6)});
  let gap=0;for(const axis of LAW_AXES)gap+=axis.weight*Math.abs(effectivePosition(econ.laws[axis.id])-econ.mood[axis.id]);
  terms.push({id:'mood',label:'Laws against public mood',value:clamp(-2.1*gap,-18,4)});
  terms.push({id:'law',label:'Law side-effects',value:clamp(mods.d.stab||0,-8,8)});
  terms.push({id:'services',label:'Public services',value:clamp(10*(econ.spend.services-1),-6,6)});
  terms.push({id:'admin',label:'Administration',value:clamp(4*(econ.spend.admin-1),-3,3)});
  terms.push({id:'corruption',label:'Corruption',value:-30*figures.corruption});
  terms.push({id:'regulation',label:'Regulation',value:figures.regulation});
  terms.push({id:'prestige',label:'Prestige',value:Math.min(6,1.1*Math.log1p(econ.prestige))});
  terms.push({id:'debt',label:'Debt',value:-clamp(25*(figures.debtRatio-.5),0,10)});
  if(figures.insolvent)terms.push({id:'insolvent',label:'Unpaid bills',value:-8});
  const link=econ.link;
  if(link?.market){terms.push({id:'prices',label:'Cost of living',value:clamp(-16*(link.market.cpi-1),-10,3)});terms.push({id:'shortage',label:'Shortages of staples',value:clamp(-30*link.market.shortage,-10,0)});}
  if(Number.isFinite(link?.demoStab))terms.push({id:'minorities',label:'Minorities',value:link.demoStab-(link.base?.demoStab||0)});
  if(link?.demoStabPolicy||link?.base?.policy)terms.push({id:'demopolicy',label:'Population policy',value:(link.demoStabPolicy||0)-(link.base?.policy||0)});
  if(link?.sanctionStab)terms.push({id:'sanctions',label:'Sanctions on you',value:link.sanctionStab});
  const shock=econ.shocks.reduce((s,k)=>s+k.v*(k.total?k.left/k.total:0),0);if(shock)terms.push({id:'shock',label:'Recent reforms',value:shock});
  return terms;
}

/** Live snapshot of the economy. `over` replaces saved fields, for what-if previews. */
export function evaluate(world,rt,base,over){
  const econ=over?{...base,...over}:base,link=econ.link||null,C=econ.consts,mods=lawMods(econ),rates=econ.rates,inst=rt.inst,tech=rt.tech,corruption=clamp(econ.corruption+(mods.d.corruption||0),0,.7);
  const stabEff=clamp(1+.002*(econ.stability-C.stab0),.9,1.06),instTerm=Math.pow(inst,.6),load=mods.abs.load??0,loadPenalty=1-Math.max(0,load-inst)*.8;
  // Industry efficiency relative to the start: organic growth × policy.
  const mInd=new Float64Array(INDUSTRY_COUNT),fundCost=new Float64Array(INDUSTRY_COUNT),priority=[];
  for(const ind of INDUSTRIES){
    const b=econ.board[ind.id]||DEFAULT_BOARD,fund=FUND_LEVELS[b.fund]||0,reg=[.03,0,-.05][b.regulate]??0;
    const policy=clamp(stabEff*(1+(mods.ind[ind.id]||0))*(1+fund*.12*(1+(mods.d.subsidy||0)))*(1+reg)*(b.invest===0?.98:1),.6,1.7);
    const market=link?.market?(.55+.45*clamp(link.market.avail[ind.index]??1,0,1.1))*clamp(link.market.priceK[ind.index]??1,.5,1.8):1;
    mInd[ind.index]=(econ.organic[ind.id]??1)*policy*market;fundCost[ind.index]=fund*.1;if(b.invest===2)priority.push(ind.id);
  }
  const zones=new Map();for(const a of econ.initiatives.active)if(a.id==='zone')zones.set(a.target,.08);
  const tariffCap=mods.abs.tariffCap??.3,tariff=Math.min(rates.tariff,tariffCap),tariff0=Math.min(DEFAULT_RATES.tariff,tariffCap),openness=Math.max(0,1+(mods.d.openness||0));
  const rateOf=id=>Math.min(rates[id],TAX_BY_ID[id].max),curve=(rate,id)=>rate>0?1-Math.pow(rate/TAX_BY_ID[id].max,1.7)*TUNING.evasion:1,eff=id=>Math.max(.1,1+(mods.d[id]||0));
  const cv={},tm={};for(const id of ['income','corporate','consumption','property','royalty','tariff','fees']){cv[id]=curve(id==='tariff'?tariff:rateOf(id),id);tm[id]=eff(id);}
  // Routes: volume responds to tariffs, partner terms and upgrades.
  const incident=new Map(),routes=[];let volume=0,crossVolume=0;
  for(const r of rt.routes){
    let v=r.volume0*Math.exp(r.cost0*routeCut(econ,r)/TUNING.routeScale),tariffBase=0,feeBase=0;const term=r.cross?partnerTerm(econ,r.partner):'normal';
    if(r.cross){const fx=TERM_FX[term]||TERM_FX.normal,t=tariff*fx.t,flow=clamp(link?.market?.flow?.[r.partner]??1,.15,2.5);v*=openness*fx.v*Math.pow(flow,.6)*Math.pow((1-t)/(1-tariff0),TUNING.elasticity);tariffBase=TUNING.tradeScale*TUNING.tradeShare*v*t;}
    if(r.maritime)feeBase=TUNING.tradeScale*v*((r.fromKey?1:0)+(r.toKey?1:0))/2*(1+.12*((econ.ports[+r.fromKey.slice(1)]||0)+(econ.ports[+r.toKey.slice(1)]||0)));
    volume+=v;if(r.cross)crossVolume+=v;for(const key of [r.fromKey,r.toKey])if(key)incident.set(key,(incident.get(key)||0)+v);
    routes.push({id:r.id,from:r.fromName,to:r.toName,kind:r.kind,partner:r.partner,cross:r.cross,term,volume:v,volume0:r.volume0,tariffBase,feeBase,level:econ.routeLevels[r.id]||0,maritime:r.maritime});
  }
  const enterprise=mods.abs.enterprise??0,moodGap=lean=>{let g=0;for(const axis of LAW_AXES)g+=axis.weight*Math.abs(effectivePosition(econ.laws[axis.id])-(econ.mood[axis.id]+lean*axis.sens*.9));return g;},nationalGap=moodGap(0);
  const places=[],byTax={income:0,corporate:0,consumption:0,property:0,royalty:0,tariff:0,fees:0,enterprise:0},bySource={cities:0,rural:0,trade:0,enterprise:0},industry=Array.from({length:INDUSTRY_COUNT},()=>({out:0,jobs:0}));
  let gdp=0,jobs=0,workforce=0,unemployed=0,nominal=0,stock=0,livePop=0;
  for(const p of rt.places){
    const built=econ.built[p.key],outs=new Float64Array(INDUSTRY_COUNT),builtOut=new Float64Array(INDUSTRY_COUNT),builtJobs=new Float64Array(INDUSTRY_COUNT);let newJobs=0,housing=0;
    if(built)for(const b of built){stock+=b.cost;if(b.i>=0){newJobs+=b.jobs;builtJobs[b.i]+=b.jobs;builtOut[b.i]+=b.jobs*b.suit*p.k*INDUSTRIES[b.i].jobValue;}else if(b.t==='housing')housing+=b.jobs;}
    const lab=link?.labour?.[p.key],workR=clamp(lab?.[1]??1,.2,5),popR=clamp(lab?.[0]??1,.2,5),jobBase=p.jobs0*Math.pow(workR,.85),work0=p.workforce0*workR,laborOut=Math.pow(workR,.75);livePop+=p.pop*popR;
    const jobsNow=jobBase+newJobs,workforceEff=work0+Math.min(housing,Math.max(0,jobsNow-work0)),shortage=Math.max(0,jobsNow-workforceEff),labour=newJobs>0?1-.5*Math.min(1,shortage/newJobs):1;
    const v0=rt.incident0.get(p.key)||0,tf=v0>0?clamp(1+.8*((incident.get(p.key)||0)/v0-1),.6,1.8):1,zone=1+(zones.get(p.province)||0);
    let total=0,wages=0,profit=0,extractive=0;
    for(const ind of INDUSTRIES){const k=ind.index,o=(p.out0[k]*laborOut+builtOut[k]*labour)*mInd[k]*zone*(k===TRADE?tf:1);outs[k]=o;total+=o;wages+=o*ind.wage;profit+=o*(1-ind.wage)*.6;if(ind.extractive)extractive+=o;industry[k].out+=o;industry[k].jobs+=p.out0[k]/(p.k*ind.jobValue)+builtJobs[k];}
    const unemployment=clamp(Math.max(0,workforceEff-jobsNow)/Math.max(1,workforceEff)+(mods.d.unemp||0),0,.6),local=clamp(econ.stability-40*(unemployment-p.u0)+1.8*(nationalGap-moodGap(p.lean)),econ.stability-15,econ.stability+15);
    const compliance=clamp(instTerm*(.7+.3*p.formality)*(1-corruption)*TUNING.compliance*loadPenalty*stabEff*(local<TUNING.instabilityStall?.8:1),.05,1),consumption=.6*total,property=.4*total+housing*p.k*.5;
    const y={income:wages*rateOf('income'),corporate:profit*(1-enterprise)*rateOf('corporate'),consumption:consumption*rateOf('consumption'),property:property*rateOf('property'),royalty:extractive*rateOf('royalty')};
    let tax=0;for(const id in y){y[id]*=cv[id]*tm[id]*compliance;tax+=y[id];byTax[id]+=y[id];}
    const owned=profit*enterprise*.55*(.5+.5*inst)*(1-corruption);byTax.enterprise+=owned;bySource[p.kind==='city'?'cities':'rural']+=tax;bySource.enterprise+=owned;tax+=owned;
    nominal+=wages*rateOf('income')+profit*rateOf('corporate')+consumption*rateOf('consumption')+property*rateOf('property')+extractive*rateOf('royalty');
    gdp+=total;jobs+=jobsNow;workforce+=workforceEff;unemployed+=unemployment*workforceEff;
    places.push({key:p.key,kind:p.kind,id:p.id,name:p.name,province:p.province,pop:p.pop*popR,out:total,outs,jobs:jobsNow,unemployment,tax,stability:local,compliance,slots:p.slots,used:built?built.length:0,labour,tradeFactor:tf,coastal:p.coastal});
  }
  stock+=econ.extraStock||0;
  const collect=clamp(instTerm*(1-corruption)*TUNING.compliance*loadPenalty*stabEff,.05,1);let tariffRev=0,feeRev=0;
  for(const r of routes){r.tariffRev=r.tariffBase*collect*tm.tariff*cv.tariff;r.feeRev=r.feeBase*rateOf('fees')*collect*tm.fees*cv.fees;tariffRev+=r.tariffRev;feeRev+=r.feeRev;}
  byTax.tariff=tariffRev;byTax.fees=feeRev;bySource.trade=tariffRev+feeRev;
  const revenue=Object.values(byTax).reduce((s,v)=>s+v,0),debtRatio=gdp?econ.debt/gdp:0,overdraft=Math.max(0,-econ.treasury);
  const rating=clamp(.15+.55*inst+.2*(econ.stability/100)-Math.max(0,debtRatio-.6)*.8,.05,.98),interestRate=Math.max(.01,.035+.1*(1-rating)+(mods.d.interest||0)),limit=Math.max(0,revenue*(1+4*rating)*(1+(mods.d.credit||0)));
  const scale=C.scale,subsidies=INDUSTRIES.reduce((s,ind)=>s+fundCost[ind.index]*industry[ind.index].out,0);
  const items=[
    {id:'admin',name:'Administration',amount:scale*.25*gdp*econ.spend.admin},
    {id:'services',name:'Education & health',amount:scale*.25*gdp*econ.spend.services},
    {id:'welfare',name:'Welfare',amount:(mods.abs.welfare??0)*scale*gdp},
    {id:'security',name:'Security reserve',amount:scale*(C.security??.16)*gdp},
    {id:'subsidies',name:'Industry subsidies',amount:subsidies},
    {id:'upkeep',name:'Upkeep of public works',amount:TUNING.stockUpkeep*stock},
    {id:'interest',name:'Interest on debt',amount:econ.debt*interestRate+overdraft*(interestRate+.02)},
    {id:'population',name:'Population policy',amount:(link?.demoCost||0)*revenue},
    {id:'fund',name:'Auto-build fund',amount:(econ.fund?.share||0)*revenue},
  ];
  const spending=items.reduce((s,i)=>s+i.amount,0),unemployment=workforce?unemployed/workforce:0,burden=gdp?nominal/gdp:0;
  let regulation=0;if(gdp)for(const ind of INDUSTRIES)regulation+=industry[ind.index].out/gdp*((econ.board[ind.id]||DEFAULT_BOARD).regulate-1)*5;
  const terms=stabilityTerms(econ,rt,{burden,unemployment,corruption,debtRatio,regulation,insolvent:overdraft>limit},mods),target=clamp(C.stabBase+sum(terms),0,100);
  const common=.006+.02*Math.pow(1-tech,1.5)+.008*inst+(mods.d.growth||0)-clamp(.12*(burden-C.burden0),-.006,.02)-.08*(rateOf('corporate')-DEFAULT_RATES.corporate)+.00015*clamp(econ.stability-C.stab0,-30,30)+.006*(econ.spend.services-1)+.01*(mods.d.openness||0)-(econ.stability<30?.008:0);
  const growth=INDUSTRIES.map(ind=>{const b=econ.board[ind.id]||DEFAULT_BOARD;return clamp(common+(b.invest===2?.006:b.invest===0?-.004:0),TUNING.organicCap[0],TUNING.organicCap[1]);});
  const capacity=.9*(industry[CONSTRUCTION].out+.15*industry[HEAVY].out)/365*(.7+.6*tech)*Math.max(.2,1+(mods.d.buildSpeed||0));
  const sectors={agriculture:0,industry:0,services:0};for(const ind of INDUSTRIES)sectors[ind.sector]+=industry[ind.index].out;for(const key in sectors)sectors[key]=gdp?sectors[key]/gdp:0;
  const pop=livePop||rt.pop;
  return {gdp,pop,gdpPerCapita:pop?gdp/pop:0,jobs,workforce,unemployment,burden,sectors,
    revenue:{total:revenue,byTax,bySource,ratio:gdp?revenue/gdp:0},spending:{total:spending,items,net:revenue-spending},
    stability:{target,terms,band:stabilityBand(econ.stability)},
    industry:industry.map((v,k)=>({id:INDUSTRIES[k].id,out:v.out,jobs:v.jobs,share:gdp?v.out/gdp:0,growth:growth[k],multiplier:mInd[k]})),
    places,trade:{routes,tariffRev,feeRev,volume,crossVolume,tariff,tariffCap,openness},
    credit:{limit,available:Math.max(0,limit-econ.debt-overdraft),rating,label:ratingLabel(rating),interestRate,overdraft},
    build:{capacity,slots:2+(inst>.45?1:0)+(inst>.7?1:0),stock,priority,prioritySlots:mods.abs.prioritySlots??2,costMod:mods.d.buildCost||0},mods,corruption,growth:common};
}
