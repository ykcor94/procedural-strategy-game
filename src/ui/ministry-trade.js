import {esc,compact,tile,chip,subtabs,section} from './ministry-kit.js';
import {GOODS,GOOD_BY_ID,GOOD_GROUPS,RESOURCE_IDS} from '../data/resources.js';
import {tradeSummary,SANCTION_LEVELS,SANCTION_BY_ID,AGREEMENTS,termWith,STRATEGIC} from '../game/world/market.js';
import {blocOf} from '../game/world/state.js';
import {relationLabel,relationTerms,agreementQuote,signAgreement,cancelAgreement,imposeSanctions,liftSanctions,blocQuote,joinBloc,leaveBloc} from '../game/world/diplomacy.js';
import {syncPlayerLink} from '../game/world/tick.js';
import {provinceResources,worldTypical} from '../game/resources.js';
import {lineChart,spark,diverging,bars} from './charts.js';
import {icon} from './icons.js';
import {isoDate} from '../game/economy/sim.js';
const SUBS=[['markets','Markets',icon('cart')],['partners','Partners',icon('handshake')],['blocs','Blocs',icon('bloc')],['sanctions','Sanctions',icon('ban')]];
export function render(ctx){
  if(!ctx.ws)return '<p class="help">The world market starts with the campaign.</p>';
  const sub=ctx.ui.sub.trade;return subtabs(SUBS,sub)+(sub==='partners'?partners(ctx):sub==='blocs'?blocs(ctx):sub==='sanctions'?sanctions(ctx):markets(ctx));
}
const termChip=(ctx,id)=>{const ws=ctx.ws,s=ws.sanctions.find(x=>(x.by===ws.player&&x.on===id)||(x.on===ws.player&&x.by===id));if(s)return `<span class="chip down">${icon('ban','icon-inline')}${s.by===ws.player?SANCTION_BY_ID[s.level].name:`Their ${s.level}`}</span>`;const t=termWith(ws,id);if(t)return `<span class="chip up">${icon(t.kind==='contract'?'contract':'handshake','icon-inline')}${AGREEMENTS[t.kind].name}${t.kind==='contract'?`: ${esc(GOOD_BY_ID[t.good]?.name||'')}`:''}</span>`;if(blocOf(ws,ws.player)?.members.includes(id))return `<span class="chip up">${icon('bloc','icon-inline')}Bloc</span>`;return '';};
const relBar=v=>`<span class="rel-bar" data-tip="${esc(relationLabel(v))} (${Math.round(v)})"><b class="${v>=0?'up':'down'}" style="width:${Math.min(50,Math.abs(v)/2)}%;${v>=0?'left:50%':'right:50%'}"></b></span>`;

/* ---------- markets ---------- */
function markets(ctx){
  const {ws,res,econ,money}=ctx,t=res?tradeSummary(ws,res,econ.nation):null,rs=econ.link?.market?.sat||[],hist=ws.goods.hist||[];
  if(ctx.ui.trade.good)return goodDetail(ctx,ctx.ui.trade.good);
  let html='';
  if(t){const top=(arr)=>{let b=-1;for(let g=0;g<arr.length;g++)if(arr[g]*ws.goods.price[g]>(b<0?0:arr[b]*ws.goods.price[b]))b=g;return b>=0?GOODS[b]:null;},ex=top(t.exp),im=top(t.imp);
    html+=`<div class="tiles compact">${tile('Exports',money(t.exports),{icon:icon('up'),sub:ex?`mostly ${ex.name.toLowerCase()}`:'',tone:'good'})}${tile('Imports',money(t.imports),{icon:icon('down'),sub:im?`mostly ${im.name.toLowerCase()}`:''})}${tile('Balance',`${t.balance>=0?'+':'−'}${money(Math.abs(t.balance))}`,{icon:icon('scales'),tone:t.balance>=0?'good':'bad'})}${tile('Cost of living',`${(((econ.link?.market?.cpi??1)-1)*100).toFixed(1)}%`,{icon:icon('cart'),sub:'since the start'})}</div>`;}
  html+=`<p class="help">World prices move with supply and demand. A ${icon('warning','icon-inline')} marks goods you are short of: they slow the industries that use them${''} and, for staples, unsettle the public. Click a good for details.</p>`;
  for(const group of GOOD_GROUPS){
    html+=section(group.name)+'<div class="goods-grid">';
    for(const g of GOODS.filter(x=>x.group===group.id)){
      const k=g.index,p=ws.goods.price[k],mine=res?.goods.get(econ.nation),prod=mine?.prod[k]||0,dem=mine?.dem[k]||1e-9,imp=t?.imp[k]||0,exp=t?.exp[k]||0,ratio=prod/dem,short=(rs[k]??1)<.95;
      const status=exp>imp*1.2&&exp>dem*.03?['Exporter','up']:imp>exp*1.2&&imp>dem*.03?['Importer','flat']:['Self-sufficient',''];
      html+=`<button class="good-card${short?' short':''}" data-act="good" data-good="${g.id}" style="--c:${g.color}" data-tip-html="${esc(`<b>${esc(g.name)}</b><div>${esc(g.blurb)}</div><div>World price ${(p*100).toFixed(0)} (start 100)</div><div>You make ${compact(prod)} · use ${compact(dem)} WU a year</div>${imp?`<div>Imports ${compact(imp)}</div>`:''}${exp?`<div>Exports ${compact(exp)}</div>`:''}`)}">
        <span class="good-icon">${icon(g.icon)}</span><span class="good-name">${esc(g.name)}${short?icon('warning','icon-inline warn'):''}</span>
        <span class="good-price">${(p*100).toFixed(0)}${chip(p-1,{digits:0})}</span>${spark(hist.map(h=>h.p[k]),{width:64,height:18,color:g.color})}
        <span class="supply-bar" aria-label="Self-sufficiency ${Math.round(ratio*100)}%"><b style="width:${Math.min(100,ratio*50).toFixed(0)}%"></b><i></i></span><span class="good-status ${status[1]}">${status[0]}</span></button>`;
    }
    html+='</div>';
  }
  return html;
}
function goodDetail(ctx,id){
  const {ws,res,econ,money}=ctx,g=GOOD_BY_ID[id],k=g.index,hist=ws.goods.hist||[],mine=res?.goods.get(econ.nation),t=res?tradeSummary(ws,res,econ.nation):null;
  let html=`<button class="link-button back" data-act="good" data-good="">${icon('back')}All goods</button><section class="ministry-hero good-hero" style="--c:${g.color}"><span class="good-icon big">${icon(g.icon)}</span><div><span class="kicker">${esc(GOOD_GROUPS.find(x=>x.id===g.group).name)}${g.basic?' · staple':''}${STRATEGIC.includes(g.id)?' · strategic':''}</span><h2>${esc(g.name)}</h2><p class="help">${esc(g.blurb)}</p></div></section>`;
  html+=`<div class="tiles compact">${tile('World price',(ws.goods.price[k]*100).toFixed(0),{icon:icon('chart'),chip:chip(ws.goods.price[k]-1,{digits:0}),sub:'start = 100'})}${tile('You make',money(mine?.prod[k]||0),{icon:icon('factory')})}${tile('You use',money(mine?.dem[k]||0),{icon:icon('cart')})}${tile('Net trade',money((t?.exp[k]||0)-(t?.imp[k]||0)),{icon:icon('globe'),tone:(t?.exp[k]||0)>=(t?.imp[k]||0)?'good':''})}</div>`;
  if(hist.length>1)html+=section('Price history')+`<div class="chart-card">${lineChart([{label:'Price',color:g.color,values:hist.map(h=>h.p[k]*100)}],{labels:hist.map(h=>isoDate(ctx.world,h.d).slice(0,7)),format:v=>v.toFixed(0)})}</div>`;
  const producers=[...(res?.goods||new Map())].map(([nid,r])=>({nid,v:r.prod[k]})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v).slice(0,8);
  html+=section('Largest producers')+bars(producers.map(x=>({label:ctx.nationById(x.nid)?.name||'?',icon:ctx.flag(x.nid,11),value:x.v,valueLabel:money(x.v),color:x.nid===econ.nation?'var(--accent)':g.color,act:'partner',data:{nation:x.nid}})));
  const ri=RESOURCE_IDS.indexOf(id);if(ri>=0){const pr=provinceResources(ctx.world),typ=worldTypical(ctx.world),own=[...pr.values()].filter(r=>r.nation===econ.nation).map(r=>({r,rel:r.score[ri]/(typ[ri]||1e-6)})).filter(x=>x.rel>1.1).sort((a,b)=>b.rel-a.rel).slice(0,6);
    html+=section('Your deposits',`<button class="link-button" data-act="lens" data-lens="res:${id}">${icon('atlas')}Show on map</button>`)+(own.length?bars(own.map(x=>({label:ctx.civ.provinces.find(p=>p.id===x.r.id)?.name||'',value:x.rel,valueLabel:`×${x.rel.toFixed(1)}`,color:g.color,act:'fly',data:{key:`p${x.r.id}`}}))):`<p class="help">No notable deposits known in your provinces${g.hidden?'. A geological survey (Economy › Programmes) may find some':''}.</p>`);}
  const exporters=[...(res?.exp||new Map())].map(([nid,x])=>({nid,v:x[k]})).filter(x=>x.v>0&&x.nid!==econ.nation).sort((a,b)=>b.v-a.v).slice(0,5);
  if(exporters.length)html+=section('Supply contracts')+`<p class="help">Lock in ten years of supply at today’s price from an exporter. Contracts are served before the open market.</p><div class="rows">${exporters.map(x=>`<div class="partner-row">${ctx.flag(x.nid)}<div><strong>${esc(ctx.nationById(x.nid)?.name||'')}</strong><small>exports ${money(x.v)} · ${relationLabel(ws.relations[x.nid]||0)}</small></div><button data-act="agree" data-nation="${x.nid}" data-kind="contract" data-good="${id}">${icon('contract')}Contract</button></div>`).join('')}</div>`;
  return html;
}

/* ---------- partners ---------- */
function partners(ctx){
  const {ws,res,econ,money}=ctx;if(ctx.ui.trade.partner)return partnerDetail(ctx,ctx.ui.trade.partner);
  const t=res?tradeSummary(ws,res,econ.nation):null,value=new Map((t?.partners||[]).map(p=>[p.id,p.value])),q=(ctx.ui.trade.search||'').toLowerCase();
  const list=Object.keys(ws.relations).map(Number).map(id=>({id,n:ctx.nationById(id),v:value.get(id)||0,rel:ws.relations[id]})).filter(x=>x.n&&(!q||x.n.name.toLowerCase().includes(q))).sort((a,b)=>b.v-a.v||b.rel-a.rel);
  let html=`<div class="toolbar"><input type="search" data-input="trade-search" placeholder="Find a nation" aria-label="Find a nation" value="${esc(ctx.ui.trade.search||'')}"><button class="text-button" data-act="lens" data-lens="relations">${icon('atlas')}Relations map</button><button class="text-button" data-act="lens" data-lens="partners">${icon('atlas')}Trade map</button></div>`;
  html+=`<div class="rows partner-list">${list.slice(0,80).map(x=>`<button class="partner-row" data-act="partner" data-nation="${x.id}">${ctx.flag(x.id)}<div><strong>${esc(x.n.name)}</strong><small>${x.v?`${money(x.v)} a year`:'no direct trade'} · ${esc(relationLabel(x.rel))}</small></div>${termChip(ctx,x.id)}${relBar(x.rel)}</button>`).join('')}</div>`;
  return html;
}
function partnerDetail(ctx,id){
  const {ws,res,econ,money}=ctx,n=ctx.nationById(id),state=ws.nations[id];if(!n||!state)return '<p class="help">Unknown nation.</p>';
  const rel=ws.relations[id]||0,terms=relationTerms(ctx.world,ws,id),t=res?tradeSummary(ws,res,id):null,mine=res?tradeSummary(ws,res,econ.nation):null,withMe=mine?.partners.find(p=>p.id===id)?.value||0,agreement=termWith(ws,id),mySanction=ws.sanctions.find(s=>s.by===ws.player&&s.on===id),theirs=ws.sanctions.find(s=>s.by===id&&s.on===ws.player);
  let html=`<button class="link-button back" data-act="partner" data-nation="">${icon('back')}All partners</button><section class="ministry-hero partner-hero">${ctx.flag(id,30)}<div><span class="kicker">${esc(n.government||'')} · ${esc(state.policy.style)} economy</span><h2>${esc(n.name)}</h2><p class="help">${esc(relationLabel(rel))} · relation ${Math.round(rel)}${blocOf(ws,id)?` · ${esc(blocOf(ws,id).name)}`:''}</p></div><button class="text-button" data-act="focus-nation" data-nation="${id}">${icon('atlas')}Map</button></section>`;
  html+=`<div class="tiles compact">${tile('Output',money(state.gdp),{icon:icon('chart'),chip:chip(state.growth,{tip:'Growth this year'}),spark:spark(state.hist.map(h=>h.gdp),{color:'var(--accent)'})})}${tile('Trade with you',money(withMe),{icon:icon('handshake')})}${tile('Their imports',money(t?.imports||0),{icon:icon('down'),sub:`exports ${money(t?.exports||0)}`})}${tile('Stability',String(Math.round(state.stab)),{icon:icon('shield'),tone:state.stab<30?'bad':''})}</div>`;
  html+=section('Why relations are where they are')+(terms.length?diverging(terms.map(x=>({label:x.label,value:x.value,valueLabel:`${x.value>0?'+':''}${x.value.toFixed(0)}`})),{max:40}):'<p class="help">Nothing much: relations sit at neutral.</p>');
  const exports=t?GOODS.map(g=>({g,v:t.exp[g.index]})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v).slice(0,5):[];
  if(exports.length)html+=section('They sell')+`<div class="chip-row">${exports.map(x=>`<button class="good-chip" style="--c:${x.g.color}" data-act="agree" data-nation="${id}" data-kind="contract" data-good="${x.g.id}" data-tip="Propose a ten-year supply contract for ${esc(x.g.name.toLowerCase())}">${icon(x.g.icon)}${esc(x.g.name)}<small>${money(x.v)}</small></button>`).join('')}</div>`;
  html+=section('Agreements');
  if(agreement)html+=`<div class="card"><div class="card-head"><span class="card-icon">${icon('handshake')}</span><strong>${esc(AGREEMENTS[agreement.kind].name)}${agreement.kind==='contract'?`: ${esc(GOOD_BY_ID[agreement.good]?.name||'')}`:''}</strong></div><small>${esc(AGREEMENTS[agreement.kind].blurb)} Since ${isoDate(ctx.world,agreement.since)}${agreement.until?`, until ${isoDate(ctx.world,agreement.until)}`:''}.</small><div class="card-actions"><button data-act="cancel-agreement" data-nation="${id}">Cancel (relations −10)</button></div></div>`;
  else html+=`<div class="cards two">${['trade','free'].map(kind=>{const a=AGREEMENTS[kind],q=agreementQuote(ctx.world,ws,id,kind);return `<div class="card"><div class="card-head"><span class="card-icon">${icon('handshake')}</span><strong>${a.name}</strong></div><small>${esc(a.blurb)}</small>${q.ok?`<small class="${q.accept?'up':'down'}">${q.accept?'They would accept.':`Needs relations of ${q.need} (now ${Math.round(rel)}).`}</small>`:`<small class="down">${esc(q.error)}</small>`}<div class="card-actions"><button class="primary" data-act="agree" data-nation="${id}" data-kind="${kind}" ${q.ok&&q.accept?'':'disabled'}>Propose</button></div></div>`;}).join('')}</div>`;
  html+=section('Sanctions');
  if(theirs)html+=`<p class="help warn">${icon('ban','icon-inline')}${esc(n.name)} has ${esc(SANCTION_BY_ID[theirs.level].name.toLowerCase())} on you${theirs.retaliation?' in retaliation':''}.</p>`;
  html+=`<div class="sanction-levels">${SANCTION_LEVELS.map(s=>`<button class="${mySanction?.level===s.id?'active':''}" data-act="sanction" data-nation="${id}" data-level="${s.id}" data-tip="${esc(s.blurb)} Relations ${s.relation}. Expect retaliation; friendly nations may join.">${icon('ban')}<strong>${s.name}</strong><small>${esc(s.blurb)}</small></button>`).join('')}</div>${mySanction?`<button data-act="lift" data-nation="${id}">Lift sanctions</button>`:''}`;
  return html;
}

/* ---------- blocs ---------- */
function blocs(ctx){
  const {ws,money}=ctx,mine=blocOf(ws,ws.player);
  let html=`<p class="help">Blocs are free-trade clubs of like-minded neighbours. Members trade without tariffs and favour each other’s merchants. ${mine?`You belong to the <strong>${esc(mine.name)}</strong>.`:'You are not in a bloc.'}</p><div class="toolbar"><button class="text-button" data-act="lens" data-lens="blocs">${icon('atlas')}Show blocs on the map</button></div><div class="cards">`;
  for(const b of ws.blocs){const q=blocQuote(ctx.world,ws,b.id),gdp=b.members.reduce((s,id)=>s+(ws.nations[id]?.gdp||0),0);
    html+=`<div class="card bloc" style="--c:${b.color}"><div class="card-head"><span class="bloc-swatch"></span><strong>${esc(b.name)}</strong><span class="chip flat">${b.members.length} members</span></div><div class="flag-row">${b.members.map(id=>`<button class="flag-button" data-act="partner" data-nation="${id}" data-tip="${esc(ctx.nationById(id)?.name||'')}">${ctx.flag(id,16)}</button>`).join('')}</div><small>Combined output ${money(gdp)}${q.ok&&!q.member?` · average relation ${Math.round(q.avg)}`:''}</small>
      <div class="card-actions">${q.ok&&q.member?`<button data-act="leave-bloc">Leave (relations −12 with members)</button>`:q.ok?`<button class="primary" data-act="join-bloc" data-bloc="${b.id}" ${q.accept?'':'disabled'}>Apply to join</button>${q.accept?'':`<small class="down">${q.sanctioned?'Blocked by a sanctions dispute.':`Needs ${esc(q.need)}.`}</small>`}`:`<small class="dim">${esc(q.error)}</small>`}</div></div>`;}
  return html+'</div>';
}

/* ---------- sanctions ---------- */
function sanctions(ctx){
  const {ws}=ctx,name=id=>esc(ctx.nationById(id)?.name||'?'),row=s=>`<div class="partner-row">${ctx.flag(s.by)}<div><strong>${name(s.by)} → ${name(s.on)}</strong><small>${esc(SANCTION_BY_ID[s.level].name)} since ${isoDate(ctx.world,s.since)}${s.retaliation?' · retaliation':''}${s.coalition?' · joined your coalition':''}</small></div>${ctx.flag(s.on)}</div>`;
  const mine=ws.sanctions.filter(s=>s.by===ws.player),against=ws.sanctions.filter(s=>s.on===ws.player),others=ws.sanctions.filter(s=>s.by!==ws.player&&s.on!==ws.player);
  let html=`<p class="help">Targeted sanctions stop strategic goods (${STRATEGIC.map(id=>GOOD_BY_ID[id].name.toLowerCase()).join(', ')}); broad sanctions stop everything but food; an embargo stops all trade. Impose them from a partner’s page.</p><div class="toolbar"><button class="text-button" data-act="lens" data-lens="sanctions">${icon('atlas')}Sanctions map</button></div>`;
  html+=section('Your sanctions')+(mine.length?`<div class="rows">${mine.map(s=>`<div class="partner-row">${ctx.flag(s.on)}<div><strong>${name(s.on)}</strong><small>${esc(SANCTION_BY_ID[s.level].name)} · ${ws.sanctions.filter(x=>x.coalition===ws.player&&x.on===s.on).length} allies joined</small></div><button data-act="lift" data-nation="${s.on}">Lift</button></div>`).join('')}</div>`:'<p class="help">None.</p>');
  html+=section('Against you')+(against.length?`<div class="rows">${against.map(row).join('')}</div>`:'<p class="help">None.</p>');
  html+=section('Elsewhere')+(others.length?`<div class="rows">${others.slice(0,30).map(row).join('')}</div>`:'<p class="help">The world is at peace with itself, commercially.</p>');
  return html;
}

const news=ctx=>(text,tone='info',nation=0)=>{ctx.ws.news.unshift({day:ctx.ws.day,text,tone,nation});};
const after=(ctx,r)=>{if(r?.ok){syncPlayerLink(ctx.world,ctx.ws,ctx.econ);}return ctx.act(r);};
export const handlers={
  good:(ctx,d)=>{ctx.ui.trade.good=d.good||null;ctx.rerender();},
  partner:(ctx,d)=>{ctx.ui.sub.trade='partners';ctx.ui.trade.partner=d.nation?+d.nation:null;if(document.body.dataset.ministryTab!=='trade')ctx.open('trade');else ctx.rerender();},
  'focus-nation':(ctx,d)=>ctx.focus('nation',+d.nation),
  agree:(ctx,d)=>after(ctx,signAgreement(ctx.world,ctx.ws,+d.nation,d.kind,d.good)),
  'cancel-agreement':(ctx,d)=>after(ctx,cancelAgreement(ctx.world,ctx.ws,+d.nation)),
  sanction:(ctx,d)=>after(ctx,imposeSanctions(ctx.world,ctx.ws,+d.nation,d.level,news(ctx))),
  lift:(ctx,d)=>after(ctx,liftSanctions(ctx.world,ctx.ws,+d.nation,news(ctx))),
  'join-bloc':(ctx,d)=>after(ctx,joinBloc(ctx.world,ctx.ws,+d.bloc,news(ctx))),
  'leave-bloc':ctx=>after(ctx,leaveBloc(ctx.world,ctx.ws,news(ctx))),
};
export const inputs={
  'trade-search':(ctx,value)=>{ctx.ui.trade.search=value;const el=document.querySelector('[data-input="trade-search"]'),pos=el.selectionStart;ctx.rerender();const again=document.querySelector('[data-input="trade-search"]');again?.focus();again?.setSelectionRange(pos,pos);},
};
