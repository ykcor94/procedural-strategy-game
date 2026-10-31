import {clamp} from '../../core/geo.js';
import {AGE_BANDS,POLICY_BY_ID,DEMO_INITIATIVE_BY_ID,DEFAULT_DEMO_POLICIES} from '../../data/demography.js';
import {stateFaithFactor} from '../../civilization/faith.js';
/** Demographic units: a population with five age bands, culture/language/religion shares, literacy, life
 * expectancy and fertility. The player's nation has one unit per economic place (each city and each
 * province's countryside); AI nations have one national unit. The same monthly step drives both. */
export const MAX_GROUPS=7;
export const NO_RELIGION=65534;
const WORK=AGE_BANDS.map(b=>b.work);
export const workforceOf=bands=>bands.reduce((s,v,k)=>s+v*WORK[k],0);
export const totalOf=bands=>bands.reduce((s,v)=>s+v,0);

/* ---------- groups: [[id,share],…] sorted, top MAX_GROUPS, remainder under id 0 ---------- */
export function normalizeGroups(entries){
  const map=new Map();for(const [id,v] of entries)if(v>0)map.set(id,(map.get(id)||0)+v);
  let sum=0;for(const v of map.values())sum+=v;if(!sum)return [];
  const list=[...map].map(([id,v])=>[id,v/sum]).sort((a,b)=>b[1]-a[1]);
  if(list.length>MAX_GROUPS){const rest=list.splice(MAX_GROUPS-1).reduce((s,e)=>s+e[1],0),other=list.find(e=>e[0]===0);if(other)other[1]+=rest;else list.push([0,rest]);}
  return list.map(([id,v])=>[id,+v.toFixed(6)]);
}
export function mixGroups(a,wa,b,wb){if(wb<=0)return a;if(wa<=0)return b.map(e=>e.slice());return normalizeGroups([...a.map(([id,s])=>[id,s*wa]),...b.map(([id,s])=>[id,s*wb])]);}
export const shareOf=(groups,id)=>groups.find(e=>e[0]===id)?.[1]||0;
/** Move a fraction of every group except `target` (weighted by `resist`) into `target`. */
export function shiftGroups(groups,target,rate,resist=()=>1){
  if(!target||rate<=0)return groups;let moved=0;const out=groups.map(([id,s])=>{if(id===target)return [id,s];const m=Math.min(s,s*rate*resist(id,s));moved+=m;return [id,s-m];});
  const t=out.find(e=>e[0]===target);if(t)t[1]+=moved;else out.push([target,moved]);return normalizeGroups(out);
}
/** 1 − Σ share², 0 for a homogeneous population. */
export const diversity=groups=>1-groups.reduce((s,[,v])=>s+v*v,0);

/* ---------- development and starting structure ---------- */
export function developmentOf(nation){
  const tech=nation.technology??.5,inst=nation.economicProfile?.institutions??.5,pc=Math.max(0,nation.gdpPerCapita||0);
  return clamp(.55*tech+.25*inst+.2*clamp(Math.log10(1+pc)/5,0,1),0,1);
}
export function startingBands(dev,urban=false){
  const children=clamp(.13+.32*Math.pow(1-dev,1.2)-(urban?.03:0),.11,.47),elderly=clamp(.035+.2*dev*dev,.03,.26),rest=1-children-elderly,young=rest*(.4-.08*dev),adults=rest*(.32),middle=rest-young-adults;
  return [children,young,adults,middle,elderly];
}
export const lifeTarget=(dev,services=1)=>clamp(46+34*dev+4*(services-1),35,86);
export const literacyTarget=(dev,services=1)=>clamp(.2+.78*Math.pow(dev,.8)+.06*(services-1),.05,.995);
export const baseFertility=(dev,urban)=>clamp(1.45+4.5*Math.pow(1-dev,1.7),1.1,7.2)*(urban?.84:1.06);

const fromMix=list=>normalizeGroups((list||[]).map(e=>[e.id,e.share??e.population??0]));
export function createNationDemography(world,nation){
  const dev=developmentOf(nation),urban=nation.urbanization||.4;
  const pop=Math.max(0,nation.population||0);
  return {dev,bands:startingBands(dev).map(v=>Math.round(v*pop)),urban,lit:+literacyTarget(dev).toFixed(4),life:+lifeTarget(dev).toFixed(2),fert:+baseFertility(dev,urban>.5).toFixed(3),
    groups:{c:fromMix(nation.cultures),l:fromMix(nation.languages),r:fromMix(nation.religions)},mig:0,policies:null};
}

/* ---------- the monthly step ---------- */
/** Advance a unit by `years` (normally 1/12). `env` carries development, services, food supply, policy
 * effects and targets; returns {births,deaths}. Bands hold head counts. */
export function stepUnit(u,env,years=1/12){
  const total=totalOf(u.bands);if(total<=0)return {births:0,deaths:0};
  const dev=env.dev,secular=shareOf(u.groups.r,NO_RELIGION),food=clamp(env.food??1,.4,1.1);
  u.fert=clamp(baseFertility(dev,u.urban)*(1-.22*secular)*(.75+.25*food)+(env.fert||0),.9,7.5);
  const lifeT=clamp(lifeTarget(dev,env.services??1)+(env.life||0)-8*(1-food),32,88);u.life+= (lifeT-u.life)*Math.min(1,years*.25);
  const litT=clamp(literacyTarget(dev,env.services??1)+(env.litBoost||0),.03,.997);u.lit+=(litT-u.lit)*Math.min(1,years*(.035+(env.lit||0)));
  const mort=Math.exp((72-u.life)/16),base=[.004,.0012,.002,.007,.055],b=u.bands;
  const births=(b[1]+b[2])*.5*u.fert/30*years;let deaths=0;
  const next=b.slice();
  for(let k=0;k<5;k++){const d=b[k]*Math.min(.5,base[k]*mort*years);deaths+=d;next[k]-=d;}
  for(let k=0;k<4;k++){const move=b[k]*years/AGE_BANDS[k].width;next[k]-=move;next[k+1]+=move;}
  next[0]+=births;for(let k=0;k<5;k++)b[k]=Math.max(0,next[k]);
  // Identity: assimilation to the national culture, shift to the official language, conversion and secularisation.
  const local=u.groups.c[0]?.[0],resist=(id,s)=>id===local&&s>.5?.3:1;
  if(env.culture&&env.assim>0)u.groups.c=shiftGroups(u.groups.c,env.culture,env.assim*years*(u.urban?1.5:1)*(.5+u.lit),resist);
  if(env.language&&env.lang>0)u.groups.l=shiftGroups(u.groups.l,env.language,env.lang*years*(u.urban?1.4:1)*(.4+u.lit));
  if(env.religion&&env.conv>0)u.groups.r=shiftGroups(u.groups.r,env.religion,env.conv*years,id=>id===NO_RELIGION?.6:1);
  if(env.secular>0)u.groups.r=shiftGroups(u.groups.r,NO_RELIGION,env.secular*years*(u.urban?1.4:1));
  else if(env.secular<0&&env.religion)u.groups.r=shiftGroups(u.groups.r,env.religion,-env.secular*years,id=>id===NO_RELIGION?1:0);
  return {births,deaths};
}
/** Add migrants with their own group mix (bands follow a young working-age profile). */
export const MIGRANT_BANDS=[.18,.42,.28,.1,.02];
export function addPeople(u,count,groups,bands=MIGRANT_BANDS,lit=null){
  if(count<=0)return;const total=totalOf(u.bands);
  if(groups){u.groups.c=mixGroups(u.groups.c,total,groups.c,count);u.groups.l=mixGroups(u.groups.l,total,groups.l,count);u.groups.r=mixGroups(u.groups.r,total,groups.r,count);}
  if(lit!=null)u.lit=(u.lit*total+lit*count)/(total+count);
  for(let k=0;k<5;k++)u.bands[k]+=count*bands[k];
}
export function removePeople(u,count,bands=MIGRANT_BANDS){
  const total=totalOf(u.bands);if(count<=0||total<=0)return;count=Math.min(count,total*.2);
  for(let k=0;k<5;k++){const take=Math.min(u.bands[k],count*bands[k]);u.bands[k]-=take;}
}

/* ---------- policy effects ---------- */
export function policyFx(policies,activeInitiatives=[],provinceId=0,placeKey=''){
  const fx={imm:1,skilled:null,stab:0,cost:0,assim:1,lang:1,conv:0,secular:1,minority:0,refugees:.4,fert:0,life:0,lit:0,litBoost:0,resettle:0,urban:0};
  for(const [axis,choice] of Object.entries(policies||DEFAULT_DEMO_POLICIES)){const o=POLICY_BY_ID[axis]?.options.find(x=>x.id===choice);if(!o)continue;for(const [k,v] of Object.entries(o.fx)){if(['imm','assim','lang','secular'].includes(k))fx[k]*=v;else if(k==='skilled'||k==='refugees')fx[k]=v;else fx[k]+=v;}}
  for(const a of activeInitiatives){const def=DEMO_INITIATIVE_BY_ID[a.id];if(!def)continue;const local=def.scope==='nation'||(def.scope==='province'&&a.target===provinceId)||(def.scope==='city'&&`c${a.target}`===placeKey);if(!local)continue;
    for(const [k,v] of Object.entries(def.fx)){if(k==='assim'&&v<0)fx.assim*=.05;else if(k==='assim'||k==='lang'||k==='conv')fx[k]=k==='conv'?fx.conv+v*.6:fx[k]*v;else if(k==='lit'){fx.lit+=v;fx.litBoost+=.1;}else fx[k]=(fx[k]||0)+v;}}
  return fx;
}
/** Annual rates for identity change, from policy multipliers. */
export function identityRates(fx,nation){
  return {assim:.004*fx.assim,lang:.006*fx.lang,conv:.0022*fx.conv,secular:.0035*fx.secular*Math.min(1.3,stateFaithFactor(nation))};
}

/* ---------- projections ---------- */
/** Project a national aggregate forward: returns yearly [{year, pop, bands, groups}]. */
export function project(unit,env,years=30,netMigrationRate=0){
  const u={bands:unit.bands.slice(),groups:{c:unit.groups.c.map(e=>e.slice()),l:unit.groups.l.map(e=>e.slice()),r:unit.groups.r.map(e=>e.slice())},urban:unit.urban,lit:unit.lit,life:unit.life,fert:unit.fert};
  const out=[{year:0,pop:totalOf(u.bands),bands:u.bands.slice(),groups:{c:u.groups.c,l:u.groups.l,r:u.groups.r},life:u.life,fert:u.fert}];
  for(let y=1;y<=years;y++){for(let m=0;m<4;m++)stepUnit(u,env,.25);const total=totalOf(u.bands);if(netMigrationRate)addPeople(u,total*netMigrationRate,env.migrantGroups||null);out.push({year:y,pop:totalOf(u.bands),bands:u.bands.slice(),groups:{c:u.groups.c,l:u.groups.l,r:u.groups.r},life:u.life,fert:u.fert});}
  return out;
}
export function medianAge(bands){const total=totalOf(bands),edges=[0,15,30,45,65,90];let acc=0;for(let k=0;k<5;k++){if(acc+bands[k]>=total/2){const f=(total/2-acc)/Math.max(1e-9,bands[k]);return edges[k]+f*(edges[k+1]-edges[k]);}acc+=bands[k];}return 40;}
