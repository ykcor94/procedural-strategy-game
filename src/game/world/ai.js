import {clamp} from '../../core/geo.js';
import {seededRandom} from '../../core/random.js';
import {INDUSTRIES,INDUSTRY_COUNT} from '../../data/industries.js';
import {stepUnit,identityRates,policyFx,totalOf,addPeople,removePeople} from '../demography/model.js';
import {snapshotNation} from './state.js';
/** AI nations live on aggregates: a monthly drift towards a yearly plan. Each nation's government sets a
 * personality (taxes, welfare, openness, what it invests in, how it treats migrants and minorities); growth
 * follows catch-up, institutions, stability, world prices, shortages, a business cycle and seeded shocks.
 * Population follows the same demographic model as the player's, at national scale. */
export function ideologyGroup(nation){const s=`${nation?.ideology||''} ${nation?.government||''}`.toLowerCase();return /commun|social/.test(s)?'socialist':/theocra|relig/.test(s)?'religious':/dictat|military|fasc|authorit|regime/.test(s)?'authoritarian':/monarch|kingdom|empire|duchy/.test(s)?'monarchist':/feder/.test(s)?'federal':'democratic';}
const I=Object.fromEntries(INDUSTRIES.map(i=>[i.id,i.index]));
/** Investment focus by ideology: relative weights over industries. */
const FOCUS={
  socialist:{heavy:1.5,energy:1.3,mining:1.2,construction:1.2,knowledge:1.1,finance:.6,tourism:.7},
  religious:{farming:1.2,tourism:1.3,food:1.1,finance:.8,knowledge:.85},
  authoritarian:{heavy:1.35,energy:1.25,mining:1.2,construction:1.15,knowledge:.9},
  monarchist:{farming:1.1,trade:1.15,tourism:1.15,finance:1.05},
  federal:{trade:1.1,light:1.1,knowledge:1.1,finance:1.1},
  democratic:{knowledge:1.25,finance:1.2,trade:1.15,light:1.05,tourism:1.05},
};
const MIGRATION={socialist:'regulated',religious:'selective',authoritarian:'closed',monarchist:'regulated',federal:'open',democratic:'regulated'};
const MINORITY={socialist:'integrate',religious:'assimilate',authoritarian:'assimilate',monarchist:'integrate',federal:'autonomy',democratic:'multicultural'};
const RELIGION={socialist:'secular',religious:'enforced',authoritarian:'established',monarchist:'established',federal:'tolerant',democratic:'secular'};
const LANGUAGE={socialist:'single',religious:'single',authoritarian:'single',monarchist:'regional',federal:'multilingual',democratic:'regional'};
export const ECONOMIC_STYLE={socialist:'Planned',religious:'Traditional',authoritarian:'State-directed',monarchist:'Mercantile',federal:'Mixed',democratic:'Market'};

export function personality(nation,r){
  const group=ideologyGroup(nation),inst=nation.economicProfile?.institutions??.5,j=()=>(r()-.5)*.3;
  const open={socialist:.35,religious:.45,authoritarian:.3,monarchist:.6,federal:.75,democratic:.8}[group]+j();
  return {group,style:ECONOMIC_STYLE[group],tax:+clamp(.16+.18*inst+(group==='socialist'?.08:0)+j()*.2,.08,.45).toFixed(3),welfare:+clamp((group==='socialist'?.7:group==='democratic'?.55:.3)+j(),0,1).toFixed(3),
    openness:+clamp(open,.1,1).toFixed(3),tariff:+clamp(.14-.12*open+j()*.1,.01,.3).toFixed(3),focus:FOCUS[group],
    demo:{immigration:MIGRATION[group],refugees:group==='federal'||group==='democratic'?'welcome':group==='authoritarian'?'refuse':'limited',minorities:MINORITY[group],language:LANGUAGE[group],religion:/theocra/i.test(nation.government||'')?'enforced':RELIGION[group]},
    census:inst>.7?5:inst>.45?10:15,hawk:+clamp(.3+(group==='authoritarian'?.4:0)+j(),0,1).toFixed(3)};
}

/* ---------- monthly ---------- */
const MONTH=1/12;
/** Smooth monthly change: GDP grows at the planned rate, people are born, age, move and change identity. */
export function aiMonth(world,ws,n,nation,effects){
  if(!nation||n.id===ws.player)return;
  const g=n.growth||0;n.gdp=Math.max(0,n.gdp*Math.exp(g/12));
  const d=n.demo,fx=policyFx(n.policy.demo,[]),rates=identityRates(fx,nation),pc=n.pop>0?n.gdp/n.pop:0,pc0=n.pop0>0?n.gdp0/n.pop0:pc;
  const dev=clamp(d.dev+.12*Math.log(Math.max(.2,pc/Math.max(1e-9,pc0))),0,1),food=effects?Math.min(1,effects.rs[14]*.6+effects.rs[0]*.4):1;
  const env={dev,services:.9+.3*n.policy.welfare,food,fert:0,life:0,lit:0,culture:d.groups.c[0]?.[0],language:nation.officialLanguage||d.groups.l[0]?.[0],religion:nation.dominantReligion||d.groups.r[0]?.[0],assim:rates.assim,lang:rates.lang,conv:rates.conv,secular:n.stab<30?-.004:rates.secular};
  d.urban=clamp(d.urban+(.0035*(1-d.urban)*(.5+dev))*MONTH,0,.97);
  const before=n.pop;stepUnit(d,{...env,dev},MONTH);n.pop=totalOf(d.bands);
  n.popGrowth=before>0?(n.pop/before)**12-1:0;
}

/* ---------- yearly plan ---------- */
/** Plan the coming year: growth rate, stability, industry shifts, policy reforms and news. */
export function aiYear(world,ws,n,nation,effects,year,news){
  if(!nation||n.id===ws.player)return;
  const r=seededRandom(`${world.seed}:${world.meta.civilization.seed}`,`ai-year:${n.id}:${year}`),p=n.policy,tech=nation.technology??.5,inst=nation.economicProfile?.institutions??.5;
  const pc=n.pop>0?n.gdp/n.pop:0,pc0=n.pop0>0?n.gdp0/n.pop0:pc,catchUp=.03*Math.pow(1-tech,1.5)*clamp(1.4-.4*Math.log10(Math.max(1,pc/Math.max(1,pc0))+1),.4,1.4);
  const style={Market:.006,Mixed:.003,Mercantile:.002,'State-directed':.001,Planned:-.002,Traditional:-.001}[p.style]||0;
  const cycle=.012*Math.sin(ws.cycle+n.cycle+year*2*Math.PI/8.5),shock=(r()+r()+r()-1.5)*.016;
  const terms=effects?.price?avgOver(effects.price,n.shares)-1:0,shortage=effects?1-avgOver(effects.avail,n.shares):0,sanctioned=ws.sanctions.filter(s=>s.on===n.id).reduce((s,x)=>s+(x.level==='embargo'?.012:x.level==='broad'?.007:.003),0);
  const labour=n.popGrowth*.55,welfareDrag=.006*Math.max(0,p.welfare-.5),taxDrag=.03*Math.max(0,p.tax-.3),stabEffect=.0004*(n.stab-55);
  let growth=-.002+catchUp*.8+.008*inst+style+cycle+shock+.35*terms-.08*shortage-sanctioned+labour-welfareDrag-taxDrag+stabEffect;
  if(n.shock?.left>0)growth-=.025;
  growth=clamp(growth,-.09,.095);const old=n.growth;n.growth=+growth.toFixed(5);
  // Stability follows growth, prices, welfare and sanctions.
  const target=clamp(46+30*inst+320*(growth-.02)-18*Math.max(0,(effects?.cpi??1)-1.12)+8*(p.welfare-.4)-260*sanctioned+(r()-.5)*10,3,96);
  n.stab=+clamp(n.stab+.45*(target-n.stab),0,100).toFixed(2);
  // Structural drift: the state's focus, world prices and rising incomes shift industry.
  const shares=n.shares.slice();for(const ind of INDUSTRIES){const k=ind.index,f=p.focus[ind.id]||1,price=effects?.price?.[k]??1,service=ind.sector==='services'?.004*tech:ind.sector==='agriculture'?-.004*tech:0;shares[k]*=Math.exp(.02*(f-1)+.05*(price-1)+service+(r()-.5)*.01);}
  const sum=shares.reduce((s,v)=>s+v,0);n.shares=shares.map(v=>+(v/sum).toFixed(5));
  // Reforms under pressure; news for the world feed.
  const name=nation.name;
  if(growth<-.015&&old>=-.015)news(`${name} slides into recession.`,'warn',n.id);
  else if(growth>.06&&old<=.06)news(`${name} is booming: output up ${(growth*100).toFixed(1)}% this year.`,'good',n.id);
  if(n.stab<20&&r()<.35){const reform=r()<.5?'raises welfare spending to calm the streets':'cuts taxes after mass protests';if(reform.includes('welfare'))p.welfare=+clamp(p.welfare+.15,0,1).toFixed(3);else p.tax=+clamp(p.tax-.04,.06,.45).toFixed(3);news(`Unrest in ${name}: the government ${reform}.`,'bad',n.id);n.stab=+(n.stab+6).toFixed(2);}
  if(n.stab<15&&r()<.2){p.openness=+clamp(p.openness-.2,.05,1).toFixed(3);p.tariff=+clamp(p.tariff+.06,.01,.35).toFixed(3);news(`${name} turns inward: tariffs rise and borders tighten.`,'warn',n.id);}
  if(n.stab>75&&p.openness<.6&&r()<.15){p.openness=+clamp(p.openness+.15,0,1).toFixed(3);p.tariff=+clamp(p.tariff-.04,.01,.35).toFixed(3);news(`${name} liberalises trade.`,'info',n.id);}
  if(n.popPrev!=null)for(const m of [1e7,2e7,5e7,1e8,2e8,5e8,1e9])if(n.pop>=m&&n.popPrev<m)news(`${name}'s population passes ${m>=1e9?m/1e9+' billion':m/1e6+' million'}.`,'info',n.id);
  n.popPrev=n.pop;if(n.shock)n.shock.left=Math.max(0,n.shock.left-12);
  // Harvest failures strike farm economies with bad luck.
  const farm=n.shares[I.farming]+n.shares[I.herding];if(r()<.012+.05*farm){n.shock={goods:['grain','livestock','fruit','fibres'],factor:.72,left:12,kind:'harvest'};news(`Harvest failure in ${name}: grain prices climb across the region.`,'bad',n.id);}
  // Census on the nation's own schedule.
  if(ws.day>=n.census.next){n.census.view=snapshotNation(n,ws.day);n.census.last=ws.day;n.census.next=ws.day+n.census.interval*365;}
  n.hist.push({d:ws.day,gdp:Math.round(n.gdp),pop:Math.round(n.pop)});if(n.hist.length>60)n.hist.shift();
}
const avgOver=(values,weights)=>{let s=0,w=0;for(let k=0;k<INDUSTRY_COUNT;k++){s+=values[k]*weights[k];w+=weights[k];}return w?s/w:1;};
/** AI-to-AI migration: people leave poor or unstable nations for nearby richer ones. */
export function aiMigration(world,ws,ctx){
  for(const n of Object.values(ws.nations)){if(n.id===ws.player||n.pop<=0)continue;const pc=n.gdp/n.pop;
    for(const link of (ctx.links.get(n.id)||[]).slice(0,4)){const m=ws.nations[link.id];if(!m||m.id===ws.player||m.pop<=0)continue;const pm=m.gdp/m.pop;if(pm<=pc*1.25&&m.stab<=n.stab+25)continue;
      const blocked=m.policy.demo.immigration==='closed'?.1:m.policy.demo.immigration==='selective'?.35:1,rate=clamp(.0012*Math.log(pm/Math.max(1e-9,pc))+(m.stab-n.stab)/30000,0,.004)*blocked*link.conn*MONTH,count=n.pop*rate;
      if(count<=0)continue;removePeople(n.demo,count);addPeople(m.demo,count,{c:n.demo.groups.c.slice(0,2),l:n.demo.groups.l.slice(0,2),r:n.demo.groups.r.slice(0,2)});n.pop=totalOf(n.demo.bands);m.pop=totalOf(m.demo.bands);n.demo.mig=(n.demo.mig||0)*.9-count*12*.1;m.demo.mig=(m.demo.mig||0)*.9+count*12*.1;}}
}
