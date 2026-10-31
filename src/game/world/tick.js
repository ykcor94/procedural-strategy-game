import {clamp} from '../../core/geo.js';
import {seededRandom} from '../../core/random.js';
import {INDUSTRY_COUNT} from '../../data/industries.js';
import {GOODS,GOOD_BY_ID} from '../../data/resources.js';
import {DEFAULT_RATES} from '../economy/model.js';
import {worldContext,blocOf} from './state.js';
import {solveMarket,updatePrices,industryEffects,termWith,sanctionBetween,marketResults,SANCTION_BY_ID} from './market.js';
import {aiMonth,aiYear,aiMigration} from './ai.js';
import {relationsMonth,aiDiplomacyYear} from './diplomacy.js';
import {totalOf} from '../demography/model.js';
/** One month of the living world: the market clears, prices move, AI nations drift, relations settle.
 * In January AI nations plan their year and AI diplomacy happens. Writes the player's economy link. */
const effectsCache=new WeakMap();
export const nationEffects=(ws,id)=>effectsCache.get(ws)?.get(id)||null;

export function worldMonth(world,ws,econ,snap,{demo=null,date,emit=()=>{}}={}){
  const ctx=worldContext(world);ws.day=econ.day;
  const news=(text,tone='info',nation=0)=>{ws.news.unshift({day:ws.day,text,tone,nation});if(ws.news.length>120)ws.news.length=120;if(tone!=='info'&&involvesPlayer(ws,nation))emit(text,tone);};
  // The player's own record follows the live economy and population.
  const me=ws.nations[ws.player];if(me){me.gdp=snap.gdp;me.pop=demo?Object.values(demo.places).reduce((s,u)=>s+totalOf(u.bands),0):me.pop;me.shares=snap.industry.map(i=>+(i.share||0).toFixed(5));me.stab=econ.stability;}
  const playerOut=new Float64Array(INDUSTRY_COUNT);for(let k=0;k<INDUSTRY_COUNT;k++)playerOut[k]=snap.industry[k].out;
  const res=solveMarket(world,ws,{playerOut,playerTariff:snap.trade.tariff,playerTariff0:Math.min(DEFAULT_RATES.tariff,snap.trade.tariffCap)});
  updatePrices(ws,res);
  (ws.goods.hist||=[]).push({d:ws.day,p:ws.goods.price.map(v=>+v.toFixed(3))});if(ws.goods.hist.length>120)ws.goods.hist.shift();
  const cache=new Map();for(const n of Object.values(ws.nations))cache.set(n.id,industryEffects(world,ws,res,n.id));effectsCache.set(ws,cache);
  // AI nations.
  for(const n of Object.values(ws.nations))aiMonth(world,ws,n,ctx.byId.get(n.id),cache.get(n.id));
  aiMigration(world,ws,ctx);relationsMonth(world,ws);
  const month=new Date(date).getUTCMonth(),year=new Date(date).getUTCFullYear();
  if(month===0&&ws.day>0){
    for(const n of Object.values(ws.nations))aiYear(world,ws,n,ctx.byId.get(n.id),cache.get(n.id),year,news);
    aiDiplomacyYear(world,ws,year,news);worldShocks(world,ws,year,news);
  }
  syncPlayerLink(world,ws,econ,res,cache.get(ws.player));
  return res;
}
function involvesPlayer(ws,nation){if(!nation)return true;if(nation===ws.player)return true;return ws.sanctions.some(s=>(s.by===nation&&s.on===ws.player)||(s.on===nation&&s.by===ws.player))||!!ws.terms[nation]||!!blocOf(ws,ws.player)?.members.includes(nation);}
/** Commodity booms and busts that move world prices for a year. */
function worldShocks(world,ws,year,news){
  const r=seededRandom(`${world.seed}:${world.meta.civilization.seed}`,`world-shock:${year}`);if(r()>.3)return;
  const raw=GOODS.filter(g=>g.raw&&g.id!=='stone'),good=raw[Math.floor(r()*raw.length)],up=r()<.55,push=(up?1:-1)*(.08+.1*r());
  ws.shocks.push({good:good.id,push,left:12});news(up?`${good.name} prices surge on world markets.`:`${good.name} prices slump as new supply floods in.`,up?'warn':'info');
}
/** Trade terms the player's economy reads for each partner: the strongest sanction either way, else an
 * agreement, else bloc free trade, else a trade mission. */
export function partnerTerms(ws,econ=null){
  const out={};for(const id of Object.keys(ws.nations).map(Number)){if(id===ws.player)continue;
    const s=sanctionBetween(ws,ws.player,id);if(s){out[id]={term:s.level,until:null};continue;}
    const t=termWith(ws,id);if(t){out[id]={term:t.kind,until:t.until??null};continue;}
    if(blocOf(ws,ws.player)?.members.includes(id)){out[id]={term:'free',until:null};continue;}
    const old=econ?.partners?.[id];if(old?.term==='preferential'&&old.until>ws.day)out[id]={term:'preferential',until:old.until};else if((ws.nations[id]?.mission||0)>ws.day)out[id]={term:'preferential',until:ws.nations[id].mission};}
  return out;
}
export function syncPlayerLink(world,ws,econ,res=marketResults(ws),eff=null){
  econ.partners=partnerTerms(ws,econ);
  if(!res)return;eff=eff||industryEffects(world,ws,res,ws.player);
  // Contracts lock the price of their good for the player.
  const price=ws.goods.price.slice();for(const t of Object.values(ws.terms))if(t.kind==='contract'&&t.good&&(t.until==null||t.until>ws.day)){const g=GOOD_BY_ID[t.good].index;price[g]=.5*price[g]+.5*(t.price||1);}
  const flow={},base=econ.link?.flow0||null,flow0=base||{};
  for(const [key,v] of res.pairs){const [a,b]=key.split(':').map(Number);if(a!==ws.player&&b!==ws.player)continue;const other=a===ws.player?b:a;if(!base)flow0[other]=+v.toPrecision(6);const v0=flow0[other];flow[other]=v0>0?+clamp(v/v0,.15,2.5).toFixed(4):1;}
  for(const id of Object.keys(flow0))if(!(id in flow))flow[id]=.15;
  let sanctionStab=0;for(const s of ws.sanctions)if(s.on===ws.player)sanctionStab-=s.level==='embargo'?2.5:s.level==='broad'?1.6:.7;
  econ.link={...econ.link,flow0,market:{sat:Array.from(eff.rs,v=>+v.toFixed(4)),price:price.map(v=>+v.toFixed(4)),avail:Array.from(eff.avail,v=>+v.toFixed(4)),priceK:Array.from(eff.price,v=>+v.toFixed(4)),cpi:+eff.cpi.toFixed(4),shortage:+eff.shortage.toFixed(4),flow},sanctionStab:+clamp(sanctionStab,-8,0).toFixed(2)};
}
export {SANCTION_BY_ID};
