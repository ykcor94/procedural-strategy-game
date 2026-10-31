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
export function economyBreakdown(world,kind,entity){return provider?.(kind,entity)||staticBreakdown(world,kind,entity);}

export function economyCard(world,kind,entity){
  const b=economyBreakdown(world,kind,entity);if(!b)return '';
  const shares=Array.from(b.outs,v=>v/b.total),identity=economicIdentity(shares),sectors=SECTORS.map(s=>({...s,share:INDUSTRIES.filter(i=>i.sector===s.id).reduce((t,i)=>t+shares[i.index],0)}));
  const strengths=identity.strengths.map(id=>INDUSTRIES.find(i=>i.id===id).name);
  const typical=new Map(identity.ranked.map(r=>[r.id,r.quotient]));
  let html=`<div class="info-section-title">Economy by industry</div><div class="econ-card">`;
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
