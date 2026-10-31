import {clamp} from '../../core/geo.js';
import {INDUSTRIES,INDUSTRY_COUNT} from '../../data/industries.js';
import {GOODS,GOOD_COUNT,G,OUTPUT_MIX,INPUTS,HOUSEHOLD,LUXURY,TRADABILITY,RESOURCE_IDS} from '../../data/resources.js';
import {nationEndowment,worldTypical} from '../resources.js';
import {worldContext,blocOf} from './state.js';
/** The world goods market, solved monthly on national aggregates. Each nation produces goods from its
 * industries (extractive mixes follow its deposits) and demands inputs and household goods. Surpluses flow
 * to deficits along trade links weighted by distance, agreements, blocs and tariffs; sanctions cut links.
 * Unmet demand and unsold supply move world prices. Effects are measured against the first solve, so a
 * campaign starts exactly at the generated economy. */
export const STRATEGIC=Object.freeze(['machinery','oil','precious','gems','copper','iron','coal']);
const FOODS=new Set(['grain','livestock','fish','food','fruit','salt']);
export const SANCTION_LEVELS=Object.freeze([
  {id:'targeted',name:'Targeted sanctions',blurb:'Strategic goods only: machinery, fuel, metals and gems.',block:g=>STRATEGIC.includes(g),route:.8,relation:-22},
  {id:'broad',name:'Broad sanctions',blurb:'Everything except food.',block:g=>!FOODS.has(g),route:.35,relation:-38},
  {id:'embargo',name:'Full embargo',blurb:'No trade at all.',block:()=>true,route:0,relation:-55},
]);
export const SANCTION_BY_ID=Object.freeze(Object.fromEntries(SANCTION_LEVELS.map(s=>[s.id,s])));
export const AGREEMENTS=Object.freeze({
  trade:{id:'trade',name:'Trade agreement',blurb:'Tariffs halved both ways; merchants favour each other.',weight:1.35,route:1.08,tariff:.5,minRelation:5},
  free:{id:'free',name:'Free trade',blurb:'No tariffs at all and much closer trade.',weight:1.7,route:1.18,tariff:0,minRelation:35},
  contract:{id:'contract',name:'Supply contract',blurb:'Ten years of guaranteed supply of one good at a fixed price.',weight:1.15,route:1.04,tariff:1,minRelation:15},
});

/* ---------- national goods mixes ---------- */
const mixMemo=new WeakMap();
const R=Object.fromEntries(RESOURCE_IDS.map((id,k)=>[id,k]));
/** Output mixes per industry for a nation, as Float32Array(GOOD_COUNT) per industry index. */
export function nationMix(world,nationId){
  const civ=world.meta.civilization;let cache=mixMemo.get(world);if(!cache||cache.revision!==civ.revision){cache={revision:civ.revision,map:new Map()};mixMemo.set(world,cache);}
  let mix=cache.map.get(nationId);if(mix)return mix;
  const end=nationEndowment(world,nationId),typ=worldTypical(world),total=end.reduce((s,v)=>s+v,0)||1,rel=id=>end[R[id]]/total/Math.max(1e-6,typ[R[id]]/typ.reduce((s,v)=>s+v,0));
  mix=INDUSTRIES.map(ind=>{
    const m=new Float32Array(GOOD_COUNT),base=OUTPUT_MIX[ind.id];if(!base)return m;
    const weights=Object.entries(base).map(([g,w])=>[g,R[g]!==undefined&&['farming','herding','mining','energy'].includes(ind.id)?w*(.15+rel(g)):w]);
    const sum=weights.reduce((s,[,w])=>s+w,0)||1;
    // Construction only turns part of its output into a good (quarrying); the rest is building work.
    const scale=ind.id==='construction'?.3:1;for(const [g,w] of weights)m[G[g]]+=w/sum*scale;return m;
  });
  cache.map.set(nationId,mix);return mix;
}
const INPUT_ROWS=INDUSTRIES.map(ind=>{const m=new Float32Array(GOOD_COUNT);for(const [g,v] of Object.entries(INPUTS[ind.id]||{}))m[G[g]]=v;return m;});

/** Goods produced and demanded by a nation with industry outputs `out` (annual WU). */
export function nationGoods(world,nationId,out,gdp,pop,calib){
  const mix=nationMix(world,nationId),prod=new Float64Array(GOOD_COUNT),dem=new Float64Array(GOOD_COUNT),pc=pop>0?gdp/pop:0,wealth=clamp(Math.log10(1+pc)/4.5,.2,1.4);
  for(let k=0;k<INDUSTRY_COUNT;k++){const o=out[k]||0;if(!o)continue;const m=mix[k],a=INPUT_ROWS[k];for(let g=0;g<GOOD_COUNT;g++){prod[g]+=o*m[g];dem[g]+=o*a[g];}}
  for(const [id,v] of Object.entries(HOUSEHOLD)){const lux=LUXURY[id]||0;dem[G[id]]+=gdp*v*Math.pow(wealth,lux);}
  if(calib)for(let g=0;g<GOOD_COUNT;g++)dem[g]*=calib[g];
  return {prod,dem};
}

/* ---------- the solve ---------- */
const results=new WeakMap();
export const marketResults=ws=>results.get(ws)||null;
export function sanctionBetween(ws,a,b){let worst=null;for(const s of ws.sanctions)if((s.by===a&&s.on===b)||(s.by===b&&s.on===a)){const lvl=SANCTION_LEVELS.findIndex(x=>x.id===s.level);if(!worst||lvl>worst.rank)worst={...s,rank:lvl};}return worst;}
export function termWith(ws,id){const t=ws.terms[id];return t&&(t.until==null||t.until>ws.day)?t:null;}
/** Outputs by industry for each nation: the player's from the economy snapshot, AI from shares. */
function nationOutputs(ws,playerOut){
  const out=new Map();for(const n of Object.values(ws.nations)){if(n.id===ws.player&&playerOut){out.set(n.id,playerOut);continue;}const o=new Float64Array(INDUSTRY_COUNT);for(let k=0;k<INDUSTRY_COUNT;k++)o[k]=n.gdp*(n.shares[k]||0);out.set(n.id,o);}
  return out;
}
export function solveMarket(world,ws,{playerOut=null,playerTariff=null,playerTariff0=null}={}){
  const ctx=worldContext(world),outs=nationOutputs(ws,playerOut),nations=Object.values(ws.nations).filter(n=>outs.has(n.id)),goods=new Map();
  if(!ws.goods.calib){const P=new Float64Array(GOOD_COUNT),D=new Float64Array(GOOD_COUNT);for(const n of nations){const r=nationGoods(world,n.id,outs.get(n.id),n.gdp,n.pop,null);for(let g=0;g<GOOD_COUNT;g++){P[g]+=r.prod[g];D[g]+=r.dem[g];}}ws.goods.calib=Array.from(P,(p,g)=>+(D[g]>0?p/D[g]*.985:1).toFixed(6));}
  for(const n of nations){const r=nationGoods(world,n.id,outs.get(n.id),n.gdp,n.pop,ws.goods.calib);if(n.shock?.left>0)for(const id of n.shock.goods)r.prod[G[id]]*=n.shock.factor;goods.set(n.id,r);}
  const imp=new Map(nations.map(n=>[n.id,new Float64Array(GOOD_COUNT)])),exp=new Map(nations.map(n=>[n.id,new Float64Array(GOOD_COUNT)])),pairs=new Map(),excess=new Float64Array(GOOD_COUNT),worldDem=new Float64Array(GOOD_COUNT);
  // Pair weights: connectivity × agreements × blocs × relations, minus sanctions (per good).
  const weightCache=new Map(),pairWeight=(a,b,conn)=>{const key=a<b?`${a}:${b}`:`${b}:${a}`;let w=weightCache.get(key);if(w)return w;
    let m=conn;const playerSide=a===ws.player?b:b===ws.player?a:0;
    if(playerSide){const t=termWith(ws,playerSide);if(t)m*=AGREEMENTS[t.kind]?.weight||1;m*=1+clamp(ws.relations[playerSide]||0,-80,80)/220;}
    const ba=blocOf(ws,a);if(ba&&ba.members.includes(b))m*=1.5;
    const s=sanctionBetween(ws,a,b);w={m,s:s?SANCTION_BY_ID[s.level]:null};weightCache.set(key,w);return w;};
  const tariffFactor=(to,from)=>{if(to!==ws.player||playerTariff==null)return 1;const t=termWith(ws,from);if(t&&AGREEMENTS[t.kind]?.tariff===0)return 1.05;const bloc=blocOf(ws,to);if(bloc?.members.includes(from))return 1.05;const eff=t?playerTariff*(AGREEMENTS[t.kind]?.tariff??1):playerTariff;return Math.pow((1-eff)/(1-(playerTariff0??eff)),1.5);};
  for(let g=0;g<GOOD_COUNT;g++){
    const id=GOODS[g].id,trad=TRADABILITY[id]??.8,sur=new Map(),need=new Map();let sSum=0,nSum=0;
    for(const n of nations){const r=goods.get(n.id),d=r.prod[g]-r.dem[g];worldDem[g]+=r.dem[g];if(d>0){sur.set(n.id,d*trad);sSum+=d*trad;}else if(d<0){need.set(n.id,-d*trad);nSum+=-d*trad;}}
    if(!sSum||!nSum){excess[g]=0;continue;}
    // Contracts are served first.
    for(const [pid,t] of Object.entries(ws.terms))if(t.kind==='contract'&&t.good===id&&(t.until==null||t.until>ws.day)){const p=+pid,s=sur.get(p)||0,n=need.get(ws.player)||0,f=Math.min(s,n*.6);if(f>0&&!sanctionBetween(ws,p,ws.player)){sur.set(p,s-f);need.set(ws.player,n-f);record(p,ws.player,g,f);}}
    const received=new Map(),flows=[];
    for(const [e,s] of sur){if(s<=0)continue;const list=ctx.links.get(e)||[];let wsum=0;const parts=[];
      for(const link of list){const n=need.get(link.id);if(!n)continue;const pw=pairWeight(e,link.id,link.conn);if(pw.s?.block(id))continue;const w=n*pw.m*tariffFactor(link.id,e);if(w>0){parts.push([link.id,w]);wsum+=w;}}
      for(const [i,w] of parts){const f=s*w/wsum;flows.push([e,i,f]);received.set(i,(received.get(i)||0)+f);}}
    const scale=new Map();for(const [i,r] of received)scale.set(i,Math.min(1,(need.get(i)||0)/r));
    let moved=0;for(const [e,i,f0] of flows){const f=f0*scale.get(i);if(f>0){record(e,i,g,f);moved+=f;}}
    excess[g]=(nSum-sSum)/Math.max(1e-9,worldDem[g])*.5+((nSum-moved)-(sSum-moved))/Math.max(1e-9,worldDem[g])*.5;
  }
  function record(e,i,g,f){exp.get(e)[g]+=f;imp.get(i)[g]+=f;const key=e<i?`${e}:${i}`:`${i}:${e}`;pairs.set(key,(pairs.get(key)||0)+f*ws.goods.price[g]);}
  // Satisfaction (supply over demand) per nation and good; baseline stored on the first solve.
  const sat=new Map();for(const n of nations){const r=goods.get(n.id),i=imp.get(n.id),x=exp.get(n.id),s=new Float32Array(GOOD_COUNT);for(let g=0;g<GOOD_COUNT;g++)s[g]=r.dem[g]>0?clamp((r.prod[g]-x[g]+i[g])/r.dem[g],0,1.5):1;sat.set(n.id,s);
    if(!n.sat0)n.sat0=Array.from(s,v=>+Math.max(.05,v).toFixed(4));}
  if(!ws.goods.excess0)ws.goods.excess0=Array.from(excess,v=>+v.toFixed(5));
  const out={goods,imp,exp,pairs,sat,excess,worldDem,day:ws.day};results.set(ws,out);return out;
}
/** Monthly price adjustment from market tightness (relative to the start) and running price shocks. */
export function updatePrices(ws,res){
  for(let g=0;g<GOOD_COUNT;g++){
    const push=(res.excess[g]-(ws.goods.excess0?.[g]||0))*.9+ws.shocks.filter(s=>s.good===GOODS[g].id).reduce((s,x)=>s+x.push,0),p=ws.goods.price[g];
    ws.goods.price[g]=+clamp(p*Math.exp(clamp(push,-.25,.25)*.35)*Math.pow(1/p,.015),.3,4).toFixed(5);
  }
  for(const s of ws.shocks)s.left--;ws.shocks=ws.shocks.filter(s=>s.left>0);
}

/* ---------- national effects ---------- */
/** Relative satisfaction of a nation's demand against the start (1 = as supplied as at the start). */
export function relativeSat(ws,res,id){const s=res.sat.get(id),n=ws.nations[id];if(!s||!n?.sat0)return new Float32Array(GOOD_COUNT).fill(1);return Float32Array.from(s,(v,g)=>{const r=v/Math.max(.05,n.sat0[g]);return Math.abs(r-1)<2e-3?1:clamp(r,0,1.25);});}
/** Industry-level effects: input availability and output price, each relative to the start. */
export function industryEffects(world,ws,res,id){
  const rs=relativeSat(ws,res,id),mix=nationMix(world,id),P=ws.goods.price,avail=new Float32Array(INDUSTRY_COUNT),price=new Float32Array(INDUSTRY_COUNT);
  for(let k=0;k<INDUSTRY_COUNT;k++){const a=INPUT_ROWS[k];let w=0,s=0;for(let g=0;g<GOOD_COUNT;g++)if(a[g]){w+=a[g];s+=a[g]*Math.min(1,rs[g]);}avail[k]=w?s/w:1;
    let mw=0,mp=0;for(let g=0;g<GOOD_COUNT;g++)if(mix[k][g]){mw+=mix[k][g];mp+=mix[k][g]*Math.pow(P[g],.35);}price[k]=mw?mp/mw:1;}
  let cw=0,cp=0,short=0,bw=0;for(const [gid,v] of Object.entries(HOUSEHOLD)){const g=G[gid];cw+=v;cp+=v*P[g];}
  for(const good of GOODS)if(good.basic){bw+=1;short+=Math.max(0,1-rs[good.index]);}
  return {rs,avail,price,cpi:cw?cp/cw:1,shortage:bw?short/bw:0};
}
/** Annual value of a nation's imports and exports at current prices, and its top partners. */
export function tradeSummary(ws,res,id){
  const i=res.imp.get(id),x=res.exp.get(id);if(!i)return null;let imports=0,exports=0;const P=ws.goods.price;
  for(let g=0;g<GOOD_COUNT;g++){imports+=i[g]*P[g];exports+=x[g]*P[g];}
  const partners=[];for(const [key,v] of res.pairs){const [a,b]=key.split(':').map(Number);if(a===id||b===id)partners.push({id:a===id?b:a,value:v});}
  partners.sort((a,b)=>b.value-a.value);return {imports,exports,balance:exports-imports,partners,imp:i,exp:x};
}
