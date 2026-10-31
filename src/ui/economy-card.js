import {esc,compact,pct,trend} from './ministry-kit.js';
import {INDUSTRIES,SECTORS,INDUSTRY_COUNT} from '../data/industries.js';
import {buildRuntime} from '../game/economy/model.js';
import {economicIdentity} from '../game/economy/industry-gen.js';
/** The expanded economic breakdown at the foot of city, province and nation panels: sectors drill down to
 * industries. For the player's nation during a campaign it shows live figures; elsewhere, the starting profile. */
let provider=null;
export const setEconomyProvider=fn=>{provider=fn;};
const cache=new WeakMap();
function staticPlaces(world,nationId){
  const civ=world.meta.civilization;let byWorld=cache.get(world);if(!byWorld||byWorld.revision!==civ.revision){byWorld={revision:civ.revision,nations:new Map()};cache.set(world,byWorld);}
  let rt=byWorld.nations.get(nationId);if(!rt){try{rt=buildRuntime(world,{nation:nationId,surveys:{}});}catch{rt=null;}byWorld.nations.set(nationId,rt);}
  return rt;
}
function staticBreakdown(world,kind,entity){
  const nationId=kind==='nation'?entity.id:entity.nation,rt=staticPlaces(world,nationId);if(!rt)return null;
  const places=kind==='city'?[rt.byKey.get(`c${entity.id}`)]:kind==='province'?rt.places.filter(p=>p.province===entity.id):rt.places;
  const outs=new Float64Array(INDUSTRY_COUNT);let total=0;for(const p of places.filter(Boolean)){for(let k=0;k<INDUSTRY_COUNT;k++)outs[k]+=p.out0[k];total+=p.total0;}
  return total>0?{outs,total,live:null}:null;
}
export function economyBreakdown(world,kind,entity){const live=provider?.(kind,entity);if(live?.foreign)return staticBreakdown(world,kind,entity);return live||staticBreakdown(world,kind,entity);}
/** Live summary of a foreign nation during a campaign: output trend, growth, population (as of its census
 * unless live figures are enabled), relation and trade. */
function foreignSection(f){
  const pts=f.hist.map(h=>h.gdp),lo=Math.min(...pts),hi=Math.max(...pts),line=pts.length>1?`<svg class="spark" viewBox="0 0 120 26" preserveAspectRatio="none"><polyline points="${pts.map((v,i)=>`${(i/(pts.length-1)*120).toFixed(1)},${(24-(v-lo)/((hi-lo)||1)*22).toFixed(1)}`).join(' ')}"/></svg>`:'';
  return `<div class="info-section-title">Now</div><div class="econ-card foreign-live"><div class="econ-head"><span>${esc(f.style)} economy</span><strong>${trend(f.growth)} a year</strong></div>${line}<p class="econ-foot"><span>Output <strong>${f.money(f.gdp)}</strong></span><span>Since the start <strong>${trend(f.gdp0?f.gdp/f.gdp0-1:0)}</strong></span><span>Stability <strong>${Math.round(f.stab)}</strong></span><span>People <strong>${compact(f.pop)}</strong>${f.censusYear?` <small class="dim">census ${f.censusYear}</small>`:''}</span><span>Population growth <strong>${trend(f.popGrowth||0)}</strong></span><span>Relation with you <strong>${Math.round(f.relation)}</strong></span>${f.trade?`<span>Trade <strong>${f.money(f.trade.exports)} out · ${f.money(f.trade.imports)} in</strong></span>`:''}</p><div class="econ-actions"><button data-ministry-partner="${f.id}">Trade & diplomacy ▸</button></div></div>`;
}

export function economyCard(world,kind,entity){
  const live=kind==='nation'?provider?.(kind,entity):null,prefix=live?.foreign?foreignSection({...live.foreign,id:entity.id}):'';
  const b=economyBreakdown(world,kind,entity);if(!b)return prefix;
  const shares=Array.from(b.outs,v=>v/b.total),identity=economicIdentity(shares),sectors=SECTORS.map(s=>({...s,share:INDUSTRIES.filter(i=>i.sector===s.id).reduce((t,i)=>t+shares[i.index],0)}));
  const strengths=identity.strengths.map(id=>INDUSTRIES.find(i=>i.id===id).name);
  const typical=new Map(identity.ranked.map(r=>[r.id,r.quotient]));
  let html=prefix+`<div class="info-section-title">Economy by industry</div><div class="econ-card">`;
  html+=`<div class="econ-head"><span>${b.live?'Live economy':'Starting economy'}</span><strong>${strengths.length?esc(strengths.slice(0,2).join(' · ')):'Diversified'}</strong></div>`;
  html+=`<div class="stack sector-stack" role="img" aria-label="${esc(sectors.map(s=>`${s.name} ${pct(s.share,0)}`).join(', '))}">${sectors.map(s=>`<span style="flex:${Math.max(.001,s.share)};background:${s.color}" title="${esc(s.name)} · ${pct(s.share)}">${s.share>.12?`${esc(s.name.split(' ')[0])} ${pct(s.share,0)}`:''}</span>`).join('')}</div>`;
  for(const s of sectors){
    const list=INDUSTRIES.filter(i=>i.sector===s.id).sort((a,c)=>shares[c.index]-shares[a.index]),top=Math.max(...list.map(i=>shares[i.index]),.001);
    html+=`<details class="econ-sector"${s.share>=.3?' open':''}><summary><i style="background:${s.color}"></i><span>${esc(s.name)}</span><b>${pct(s.share)}</b></summary>${list.map(i=>{
      const share=shares[i.index],growth=b.live?.growth?.[i.index],q=typical.get(i.id)||1;
      return `<div class="econ-row"><i style="background:${i.color}"></i><span title="${esc(i.blurb)}">${esc(i.name)}${q>=1.25&&share>.025?' <em class="strength" title="Unusually strong here">★</em>':''}</span><div class="econ-bar"><b style="width:${(share/top*100).toFixed(1)}%;background:${i.color}"></b></div><span class="num">${pct(share)}</span><span class="num dim">${compact(b.outs[i.index])}</span>${growth===undefined?'':`<span class="num">${trend(growth)}</span>`}</div>`;}).join('')}</details>`;
  }
  html+=`<p class="econ-foot"><span>Output <strong>${compact(b.total)} WU/yr</strong></span>${b.live?`<span>Jobs <strong>${compact(b.live.jobs)}</strong></span><span>Unemployment <strong>${pct(b.live.unemployment)}</strong></span><span>Tax yield <strong>${compact(b.live.tax)} WU/yr</strong></span>`:''}</p>`;
  if(b.live?.build)html+=`<div class="econ-actions"><span class="help">Building slots ${b.live.build.used}/${b.live.build.slots}</span><button data-ministry-build="${esc(b.live.build.key)}">Build here ▸</button></div>`;
  return html+'</div>';
}
