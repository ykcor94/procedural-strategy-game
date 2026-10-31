import {ensureEconomy,current,touch,runtime,setMonthHook} from './economy/sim.js';
import {autoBuildMonth,ensureFund} from './economy/autobuild.js';
import {createWorldState,validateWorldState,worldContext} from './world/state.js';
import {worldMonth,syncPlayerLink} from './world/tick.js';
import {solveMarket} from './world/market.js';
import {DEFAULT_RATES} from './economy/model.js';
import {INDUSTRY_COUNT} from '../data/industries.js';
import {createDemography,demographyMonth,DEMOGRAPHY_VERSION,minorityStability,groupSatisfaction} from './demography/sim.js';
import {policyFx} from './demography/model.js';
/** A running campaign is three saved blocks under meta.game: `economy` (the player's treasury, laws and
 * projects), `world` (every nation, the goods market and diplomacy) and `demography` (the player's people).
 * This module creates them, keeps them in step each month and drops any block that fails validation. */
export function ensureCampaign(world){
  const g=world.meta.game;if(!g)return null;const econ=ensureEconomy(world);if(!econ)return null;
  ensureFund(econ);
  if(!g.world){g.world=createWorldState(world,econ);g.world.day=econ.day;primeMarket(world,g.world,econ);}
  if(!g.demography){const rt=runtime(world,econ);g.demography=createDemography(world,econ,rt);const demo=g.demography;demo.satisfaction=groupSatisfaction(demo,rt.nation);
    econ.link={...econ.link,base:{demoStab:minorityStability(demo),policy:policyFx(demo.policies,[]).stab||0}};}
  touch(world,econ);return {econ,ws:g.world,demo:g.demography};
}
/** The first market solve sets every baseline, so nothing moves until the world does. */
function primeMarket(world,ws,econ){
  const snap=current(world,econ),out=new Float64Array(INDUSTRY_COUNT);for(let k=0;k<INDUSTRY_COUNT;k++)out[k]=snap.industry[k].out;
  const res=solveMarket(world,ws,{playerOut:out,playerTariff:snap.trade.tariff,playerTariff0:Math.min(DEFAULT_RATES.tariff,snap.trade.tariffCap)});
  syncPlayerLink(world,ws,econ,res);
}
setMonthHook((world,econ,date,emit)=>{
  const g=world.meta.game;if(!g?.world||!g.demography)return;
  const snap=current(world,econ),rt=runtime(world,econ);
  worldMonth(world,g.world,econ,snap,{demo:g.demography,date,emit});
  touch(world,econ);const live=current(world,econ);
  const spent=demographyMonth(world,g.demography,{snap:live,econ,ws:g.world,worldCtx:worldContext(world),nation:rt.nation,revenue:live.revenue.total,date,emit});
  if(spent)econ.treasury-=spent;
  touch(world,econ);autoBuildMonth(world,econ,emit);
});
