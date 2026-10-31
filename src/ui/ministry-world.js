import {esc,compact,tile,subtabs} from './ministry-kit.js';
import {isoDate} from '../game/economy/sim.js';
import {blocOf} from '../game/world/state.js';
import {relationLabel} from '../game/world/diplomacy.js';
import {spark} from './charts.js';
import {icon} from './icons.js';
/** The world beyond your borders: a news feed of AI nations' fortunes and a sortable league table. AI
 * populations show their own last census unless "live figures for other nations" is on. */
const SUBS=[['news','News',icon('news')],['rankings','Rankings',icon('chart')]];
const live=()=>{try{return localStorage.getItem('atlas-live-foreign')==='true';}catch{return false;}};
export function render(ctx){
  if(!ctx.ws)return '<p class="help">The wider world starts with the campaign.</p>';
  const sub=ctx.ui.sub.world;return subtabs(SUBS,sub)+(sub==='rankings'?rankings(ctx):news(ctx));
}
function news(ctx){
  const {ws}=ctx,filter=ctx.ui.world.filter||'all',items=ws.news.filter(n=>filter==='all'||(filter==='mine'?(!n.nation||n.nation===ws.player||ws.relations[n.nation]>30||ws.sanctions.some(s=>(s.by===n.nation&&s.on===ws.player)||(s.on===n.nation&&s.by===ws.player))):n.tone!=='info'));
  const prices=ws.goods.price,up=prices.filter(p=>p>1.1).length,down=prices.filter(p=>p<.9).length,growth=Object.values(ws.nations).filter(n=>n.id!==ws.player),avg=growth.reduce((s,n)=>s+n.growth*n.gdp,0)/Math.max(1,growth.reduce((s,n)=>s+n.gdp,0));
  let html=`<div class="tiles compact">${tile('World growth',`${(avg*100).toFixed(1)}%`,{icon:icon('globe'),sub:'output-weighted, this year',tone:avg<0?'bad':'good'})}${tile('In recession',String(growth.filter(n=>n.growth<0).length),{icon:icon('down'),sub:`of ${growth.length} nations`})}${tile('Prices',`${up} up · ${down} down`,{icon:icon('cart'),sub:'goods 10% off their start',act:'open-tab',data:{tab:'trade'}})}${tile('Sanctions',String(ws.sanctions.length),{icon:icon('ban'),sub:'in force worldwide'})}</div>`;
  html+=`<div class="toolbar"><div class="segmented" role="group">${[['all','Everything'],['mine','Your partners'],['major','Major events']].map(([id,l])=>`<button data-act="world-filter" data-filter="${id}" aria-pressed="${filter===id}">${l}</button>`).join('')}</div><button class="text-button" data-act="lens" data-lens="world-growth">${icon('atlas')}Growth map</button></div>`;
  html+=items.length?`<ul class="news-feed">${items.slice(0,60).map(n=>`<li class="${n.tone}">${n.nation?`<button class="flag-button" data-act="partner" data-nation="${n.nation}">${ctx.flag(n.nation,14)}</button>`:`<span class="news-icon">${icon('globe')}</span>`}<div><time>${isoDate(ctx.world,n.day)}</time><span>${esc(n.text)}</span></div></li>`).join('')}</ul>`:'<p class="help">No news yet. Nations plan their years each January.</p>';
  return html;
}
function rankings(ctx){
  const {ws,money}=ctx,s=ctx.ui.world,showLive=live();
  const rows=Object.values(ws.nations).map(n=>{const view=n.census.view,pop=showLive||n.id===ws.player?n.pop:view?.pop??n.pop;return {n,name:ctx.nationById(n.id)?.name||'?',gdp:n.gdp,growth:n.growth,pop,pc:pop?n.gdp/pop:0,stab:n.stab,rel:n.id===ws.player?101:ws.relations[n.id]??0,popGrowth:showLive?n.popGrowth:view?.growth??0};});
  const key=s.sort;rows.sort((a,b)=>key==='name'?a.name.localeCompare(b.name)*-s.dir:((a[key]??0)-(b[key]??0))*s.dir);
  const head=[['name','Nation'],['gdp','Output'],['growth','Growth'],['pc','Per head'],['pop','People'],['stab','Stability'],['rel','Relation']].map(([k,l])=>`<th><button data-act="world-sort" data-key="${k}">${l}${s.sort===k?(s.dir<0?' ▾':' ▴'):''}</button></th>`).join('');
  let html=`<p class="help">${showLive?'Live figures for every nation (sandbox setting on).':'Populations as of each nation’s own last census. Turn on live figures in Display settings for sandbox play.'}</p><div class="table-scroll"><table class="kit-table world-table"><thead><tr>${head}</tr></thead><tbody>`;
  for(const r of rows.slice(0,200)){const me=r.n.id===ws.player,bloc=blocOf(ws,r.n.id);html+=`<tr class="${me?'me':''}" data-act="${me?'open-tab':'partner'}" data-tab="economy" data-nation="${r.n.id}" tabindex="0"><td>${ctx.flag(r.n.id,12)}<strong>${esc(r.name)}</strong><small>${esc(r.n.policy.style)}${bloc?` · <span style="color:${bloc.color}">${esc(bloc.name)}</span>`:''}</small></td><td>${money(r.gdp)}${spark(r.n.hist.map(h=>h.gdp),{width:46,height:14,color:'var(--accent)'})}</td><td class="${r.growth<0?'down':'up'}">${(r.growth*100).toFixed(1)}%</td><td>${compact(r.pc)}</td><td>${compact(r.pop)}</td><td>${Math.round(r.stab)}</td><td>${me?'—':`<span data-tip="${esc(relationLabel(r.rel))}">${Math.round(r.rel)}</span>`}</td></tr>`;}
  return html+'</tbody></table></div>';
}
export const handlers={
  'world-filter':(ctx,d)=>{ctx.ui.world.filter=d.filter;ctx.rerender();},
  'world-sort':(ctx,d)=>{const s=ctx.ui.world;if(s.sort===d.key)s.dir*=-1;else{s.sort=d.key;s.dir=d.key==='name'?1:-1;}ctx.rerender();},
};
