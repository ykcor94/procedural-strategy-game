import {esc,pct,compact,tip,chip,section,tile} from './ministry-kit.js';
import {INDUSTRIES} from '../data/industries.js';
import {GOODS,GOOD_BY_ID,OUTPUT_MIX,INPUTS} from '../data/resources.js';
import {FUND_LEVELS,DEFAULT_BOARD} from '../game/economy/model.js';
import {economicIdentity} from '../game/economy/industry-gen.js';
import {setBoard} from '../game/economy/sim.js';
import {nationMix} from '../game/world/market.js';
import {BUILDING_BY_ID} from '../data/buildings.js';
import {ring,bars,donut} from './charts.js';
import {icon,INDUSTRY_ICON} from './icons.js';
/** Industry board: one card per industry with its share, growth, input supply and output prices, and the
 * state's three levers (invest, fund, regulate). A card opens to show what the industry consumes and makes,
 * where it is strongest, and a shortcut to build more of it. */
const seg=(industry,key,labels,value,helps=[])=>`<div class="segmented small" role="group" aria-label="${key}">${labels.map((label,i)=>`<button data-act="board" data-ind="${industry}" data-key="${key}" data-value="${i}" aria-pressed="${value===i}" title="${esc(helps[i]||'')}">${label}</button>`).join('')}</div>`;
export function render(ctx){
  const {snap,econ,money}=ctx,identity=economicIdentity(snap.industry.map(i=>i.share)),slots=snap.build.prioritySlots,used=snap.build.priority.length,m=econ.link?.market,sectors=['agriculture','industry','services'];
  let html=`<section class="ministry-hero"><span class="kicker">National strengths</span><h2>${esc(identity.title.replace(/^./,c=>c.toUpperCase()))}</h2></section>`;
  html+=`<div class="industry-summary">${donut(sectors.map(s=>({label:s==='agriculture'?'Farms & fishing':s==='industry'?'Industry & resources':'Services',value:snap.sectors[s],color:s==='agriculture'?'#8fae5a':s==='industry'?'#c07a52':'#6a8fd0'})),{size:104,thickness:16,center:pct(snap.sectors.services,0),sub:'services'})}<div class="tiles compact">${tile('Priority slots',`${used} / ${slots}`,{icon:icon('star'),sub:'cheaper building, faster growth',tip:'Industrial policy (Reforms) decides how many industries can be priorities.'})}${tile('Subsidies',money(snap.spending.items.find(i=>i.id==='subsidies')?.amount||0),{icon:icon('coins'),sub:'a year'})}${tile('Input supply',m?pct(INDUSTRIES.reduce((s,ind)=>s+(m.avail[ind.index]??1)*snap.industry[ind.index].share,0),0):'—',{icon:icon('goods'),sub:'of what industry needs, vs the start',tip:'Shortages of inputs (from the world market) slow the industries that use them.'})}</div></div>`;
  html+=`<p class="help">${tip('Invest','Priority: 20% cheaper to build, +0.6% growth a year, uses a priority slot. Neglect: slower growth and dearer building.')} · ${tip('Fund','Subsidy as a share of the industry’s output: more output now, a cost every month.')} · ${tip('Regulate','Strict rules cut output by 5% but steady the nation; light rules add 3% and unsettle it.')}</p>`;
  html+='<div class="industry-grid">'+INDUSTRIES.map(i=>({i,data:snap.industry[i.index]})).sort((a,b)=>b.data.out-a.data.out).map(({i,data})=>card(ctx,i,data,identity)).join('')+'</div>';
  return html;
}
function card(ctx,i,data,identity){
  const {econ,money,ui}=ctx,b=econ.board[i.id]||DEFAULT_BOARD,strong=identity.strengths.includes(i.id),open=ui.industry.open===i.id,m=econ.link?.market,avail=m?.avail[i.index]??1,price=m?.priceK[i.index]??1,hasInputs=!!INPUTS[i.id],hasGoods=!!OUTPUT_MIX[i.id];
  let html=`<article class="industry-card${open?' open':''}" style="--c:${i.color}"><button class="ind-head" data-act="ind-open" data-ind="${i.id}" aria-expanded="${open}"><span class="ind-icon">${icon(INDUSTRY_ICON[i.id])}</span><span class="ind-title"><strong>${esc(i.name)}${strong?' '+icon('star','icon-inline strength'):''}</strong><small>${money(data.out)} · ${compact(data.jobs)} jobs</small></span><span class="ind-figures"><b>${pct(data.share)}</b>${chip(data.growth,{tip:'Organic growth a year'})}</span>${hasInputs?ring(avail,{label:`${Math.round(avail*100)}`,color:avail<.95?'var(--danger)':'var(--positive)',tip:`Inputs supplied: ${Math.round(avail*100)}% of what the industry had at the start`}):''}</button>
    <div class="ind-bar"><b style="width:${Math.min(100,data.share*100*3)}%"></b></div>`;
  if(hasGoods&&Math.abs(price-1)>.01)html+=`<div class="ind-note ${price>1?'up':'down'}">${icon(price>1?'up':'down','icon-inline')}Its goods sell ${Math.abs((price-1)*100).toFixed(0)}% ${price>1?'above':'below'} starting prices</div>`;
  html+=`<div class="ind-controls"><label>Invest${seg(i.id,'invest',['Neglect','Normal','Priority'],b.invest)}</label><label>Fund${seg(i.id,'fund',FUND_LEVELS.map(v=>v?pct(v,0):'None'),b.fund)}</label><label>Regulate${seg(i.id,'regulate',['Light','Standard','Strict'],b.regulate)}</label></div>`;
  if(open){
    const mix=nationMix(ctx.world,econ.nation)[i.index],outs=GOODS.filter(g=>mix[g.index]>.01).map(g=>({g,v:mix[g.index]})).sort((a,c)=>c.v-a.v),ins=Object.entries(INPUTS[i.id]||{}).map(([id,v])=>({g:GOOD_BY_ID[id],v,s:m?.sat[GOOD_BY_ID[id].index]??1}));
    html+=`<p class="help">${esc(i.blurb)}</p>`;
    if(ins.length||outs.length)html+=`<div class="io-flow"><div class="io-col">${ins.map(x=>`<span class="good-chip${x.s<.95?' short':''}" style="--c:${x.g.color}" data-tip="${esc(`${x.g.name}: ${(x.v*100).toFixed(0)}% of output value · supplied ${Math.round(Math.min(1.25,x.s)*100)}%`)}">${icon(x.g.icon)}${esc(x.g.name)}</span>`).join('')||'<span class="dim">No goods</span>'}</div><span class="io-arrow">${icon(INDUSTRY_ICON[i.id])}→</span><div class="io-col">${outs.map(x=>`<span class="good-chip" style="--c:${x.g.color}" data-tip="${esc(`${x.g.name}: ${(x.v*100).toFixed(0)}% of output`)}">${icon(x.g.icon)}${esc(x.g.name)}</span>`).join('')||'<span class="dim">Services</span>'}</div></div>`;
    const places=ctx.snap.places.map(p=>({p,v:p.outs[i.index]})).filter(x=>x.v>0).sort((a,c)=>c.v-a.v).slice(0,6);
    html+=section('Strongest places')+bars(places.map(x=>({label:x.p.name,value:x.v,valueLabel:money(x.v),color:i.color,act:'fly',data:{key:x.p.key,'hover-key':x.p.key}})));
    const building=BUILDING_BY_ID[i.id];if(building)html+=`<div class="card-actions"><button class="primary" data-act="build-industry" data-ind="${i.id}">${icon('hammer')}Build a ${esc(building.name.toLowerCase())}</button></div>`;
  }
  return html+'</article>';
}
export const handlers={
  board:(ctx,d)=>ctx.act(setBoard(ctx.world,ctx.econ,d.ind,d.key,+d.value)),
  'ind-open':(ctx,d)=>{ctx.ui.industry.open=ctx.ui.industry.open===d.ind?null:d.ind;ctx.rerender();},
  'build-industry':(ctx,d)=>{ctx.ui.build.type=d.ind;ctx.ui.build.tier='A';ctx.ui.build.place='';ctx.open('build');},
};
