import {esc,compact,pct,signed,signedPct,sparkline,segments,meter,stat,tip,trend} from './ministry-kit.js';
import {TAXES,TAX_BY_ID,TUNING,DEFAULT_RATES} from '../game/economy/model.js';
import {borrow,repay,setRate,setSpend,setPartner,launchInitiative,current,initiativeSlots,isoDate} from '../game/economy/sim.js';
import {INITIATIVES} from '../data/initiatives.js';
import {INDUSTRIES} from '../data/industries.js';
import {economicIdentity} from '../game/economy/industry-gen.js';
const SUBS=[['overview','Overview'],['budget','Budget'],['regions','Regions'],['trade','Trade'],['programmes','Programmes']];
const SOURCES=[['cities','Cities','var(--accent)'],['rural','Countryside','var(--positive)'],['trade','Trade routes','var(--link)'],['enterprise','State firms','var(--text-3)']];
const subtabs=(ctx)=>`<div class="subtabs" role="tablist">${SUBS.map(([id,label])=>`<button role="tab" data-act="sub" data-sub="${id}" aria-selected="${ctx.ui.sub.economy===id}">${label}</button>`).join('')}</div>`;
export function render(ctx){
  const sub=ctx.ui.sub.economy,body=sub==='budget'?budget(ctx):sub==='regions'?regions(ctx):sub==='trade'?trade(ctx):sub==='programmes'?programmes(ctx):overview(ctx);
  return subtabs(ctx)+body;
}

/* ---------- overview ---------- */
const committed=(econ)=>econ.queue.reduce((s,p)=>s+(p.work-p.done)*(p.rush?TUNING.rush[1]:1),0);
function overview(ctx){
  const {snap,econ,money}=ctx,net=(snap.revenue.total-snap.spending.total)/12,shares=snap.industry.map(i=>i.share),identity=economicIdentity(shares),cm=committed(econ),hist=econ.hist;
  const growth=(()=>{const old=Object.values(econ.snap).reduce((s,v)=>s+v,0);return old?snap.gdp/old-1:0;})();
  let html=`<section class="ministry-hero"><span class="kicker">${esc(ctx.nation.name)} · ${esc(ctx.nation.government||'')}</span><h2>${esc(identity.title.replace(/^./,c=>c.toUpperCase()))}</h2><p class="help">${isoDate(ctx.world,econ.day)} · stability ${Math.round(econ.stability)} (${snap.stability.band.toLowerCase()})</p></section>`;
  html+=`<div class="kit-grid">${stat('Output a year',money(snap.gdp),`${money(snap.gdpPerCapita)} per person`)}${stat('Growth since January',signedPct(growth),`organic ${signedPct(snap.growth)} a year`)}${stat('Revenue a year',money(snap.revenue.total),`${pct(snap.revenue.ratio)} of output`)}${stat('Spending a year',money(snap.spending.total),`${pct(snap.spending.total/Math.max(1,snap.revenue.total),0)} of revenue`)}${stat('Unemployment',pct(snap.unemployment),`${compact(snap.jobs)} jobs`)}${stat('Tax burden',pct(snap.burden),'nominal share of output')}</div>`;
  html+=`<div class="info-section-title">Funds</div><div class="funds"><div class="funds-row"><span>Treasury</span><strong class="${econ.treasury<0?'down':''}">${money(econ.treasury)}</strong></div><div class="funds-row"><span>Committed to the build queue</span><strong>−${money(cm)}</strong></div><div class="funds-row total"><span>Uncommitted</span><strong class="${econ.treasury-cm<0?'down':'up'}">${money(econ.treasury-cm)}</strong></div><div class="funds-row"><span>Credit available</span><strong>${money(snap.credit.available)}</strong></div><div class="funds-row"><span>Debt · rating ${snap.credit.label}</span><strong>${money(econ.debt)} <small>at ${pct(snap.credit.interestRate)}</small></strong></div><div class="funds-row"><span>Balance each month</span><strong class="${net>=0?'up':'down'}">${net>=0?'+':'−'}${money(Math.abs(net))}</strong></div></div>`;
  html+=`<div class="button-row"><button data-act="borrow">Borrow ${money(snap.revenue.total*.1)}</button><button data-act="repay" ${econ.debt>0&&econ.treasury>0?'':'disabled'}>Repay ${money(Math.min(econ.debt,snap.revenue.total*.1,Math.max(0,econ.treasury)))}</button></div>`;
  if(hist.length>1)html+=`<div class="info-section-title">History</div><div class="spark-row"><div><span>Output</span>${sparkline(hist.map(h=>h.gdp))}</div><div><span>Treasury</span>${sparkline(hist.map(h=>h.treasury))}</div><div><span>Stability</span>${sparkline(hist.map(h=>h.stab))}</div></div>`;
  html+=`<div class="info-section-title">Where revenue comes from</div>${segments(SOURCES.map(([id,label,color])=>({label,color,value:snap.revenue.bySource[id]})))}<div class="legend-list">${SOURCES.map(([id,label,color])=>`<span><i style="background:${color}"></i>${label} <b>${pct(snap.revenue.bySource[id]/Math.max(1,snap.revenue.total),0)}</b></span>`).join('')}</div>`;
  html+=`<div class="rows">${TAXES.map(t=>({t,v:snap.revenue.byTax[t.id]})).concat([{t:{id:'enterprise',name:'State enterprises'},v:snap.revenue.byTax.enterprise}]).filter(r=>r.v>0).sort((a,b)=>b.v-a.v).map(r=>`<div class="bar-row"><span>${r.t.name}</span><div class="econ-bar"><b style="width:${(r.v/snap.revenue.total*100).toFixed(1)}%"></b></div><strong>${money(r.v)}</strong></div>`).join('')}</div>`;
  html+=`<div class="info-section-title">Where it goes</div><div class="rows">${snap.spending.items.filter(i=>i.amount>0).map(i=>`<div class="bar-row"><span>${i.name}</span><div class="econ-bar"><b style="width:${(i.amount/snap.spending.total*100).toFixed(1)}%"></b></div><strong>${money(i.amount)}</strong></div>`).join('')}</div>`;
  html+=`<div class="info-section-title">Recent events</div>${econ.log.length?`<ul class="event-log">${econ.log.slice(0,8).map(l=>`<li class="${l.tone}"><time>${isoDate(ctx.world,l.day)}</time>${esc(l.text)}</li>`).join('')}</ul>`:'<p class="help">Nothing yet. Let time pass.</p>'}`;
  return html;
}

/* ---------- budget ---------- */
const peak=id=>{const t=TAX_BY_ID[id];return t.max*Math.pow(1/(2.7*TUNING.evasion),1/1.7);};
function budgetLive(ctx){
  const snap=current(ctx.world,ctx.econ),{money}=ctx,net=snap.revenue.total-snap.spending.total,band=snap.stability.target-ctx.econ.stability;
  return `<div class="funds"><div class="funds-row"><span>Revenue a year</span><strong>${money(snap.revenue.total)}</strong></div><div class="funds-row"><span>Spending a year</span><strong>${money(snap.spending.total)}</strong></div><div class="funds-row total"><span>Balance</span><strong class="${net>=0?'up':'down'}">${net>=0?'+':'−'}${money(Math.abs(net))} a year</strong></div><div class="funds-row"><span>Tax burden · growth pull</span><strong>${pct(snap.burden)} · ${signedPct(snap.growth)} a year</strong></div><div class="funds-row"><span>Stability heads towards</span><strong class="${band>=0?'up':'down'}">${Math.round(snap.stability.target)} <small>(${signed(band)} from now)</small></strong></div></div>`;
}
function budget(ctx){
  const {econ,snap,money}=ctx,cap=snap.trade.tariffCap;
  let html='<p class="help">Rates apply to what each place produces. Cities are easiest to tax; the countryside is harder to reach. Past the marked peak, higher rates raise less money and stunt growth.</p><div id="budget-live">'+budgetLive(ctx)+'</div><div class="info-section-title">Tax rates</div>';
  for(const t of TAXES){
    const max=t.id==='tariff'?Math.min(t.max,cap):t.max,rate=Math.min(econ.rates[t.id],max),yieldValue=snap.revenue.byTax[t.id];
    html+=`<div class="tax-row"><div class="tax-head"><label for="rate-${t.id}">${tip(t.name,t.blurb)}</label><output id="out-${t.id}">${pct(rate,1)}</output></div><input id="rate-${t.id}" type="range" data-input="rate" data-tax="${t.id}" min="0" max="${max}" step="0.005" value="${rate}" list="peak-${t.id}"><div class="tax-foot"><span data-yield="${t.id}">${money(yieldValue)} a year</span><span class="dim">default ${pct(DEFAULT_RATES[t.id],0)} · peak near ${pct(Math.min(peak(t.id),max),0)}${t.id==='tariff'?` · law caps at ${pct(cap,0)}`:''}</span></div></div>`;
  }
  html+='<div class="info-section-title">Spending</div>';
  for(const [id,label,help] of [['admin','Administration','Clerks, courts and tax collectors. Cuts raise corruption risk and unrest.'],['services','Education & health','Schools and clinics: slow growth and steady stability.']]){
    const base=snap.spending.items.find(i=>i.id===id).amount/econ.spend[id];
    html+=`<div class="tax-row"><div class="tax-head"><label for="spend-${id}">${tip(label,help)}</label><output id="out-spend-${id}">${Math.round(econ.spend[id]*100)}%</output></div><input id="spend-${id}" type="range" data-input="spend" data-spend="${id}" min="0.5" max="1.5" step="0.05" value="${econ.spend[id]}"><div class="tax-foot"><span data-spent="${id}">${money(base*econ.spend[id])} a year</span><span class="dim">100% = ${money(base)}</span></div></div>`;
  }
  html+='<div class="rows fixed">'+snap.spending.items.filter(i=>!['admin','services'].includes(i.id)).map(i=>`<div class="bar-row"><span>${i.name}</span><div class="econ-bar"><b style="width:${(i.amount/snap.spending.total*100).toFixed(1)}%"></b></div><strong>${money(i.amount)}</strong></div>`).join('')+'</div>';
  return html;
}
function refreshBudget(ctx){
  const root=document.getElementById('ministry-body'),snap=current(ctx.world,ctx.econ);if(!root)return;
  const live=root.querySelector('#budget-live');if(live)live.innerHTML=budgetLive(ctx);
  for(const el of root.querySelectorAll('[data-yield]'))el.textContent=`${ctx.money(snap.revenue.byTax[el.dataset.yield])} a year`;
  for(const el of root.querySelectorAll('[data-spent]')){const item=snap.spending.items.find(i=>i.id===el.dataset.spent);el.textContent=`${ctx.money(item.amount)} a year`;}
}

/* ---------- regions ---------- */
const COLUMNS=[['name','Place'],['pop','People'],['out','Output'],['perHead','Per head'],['growth','Growth'],['tax','Tax a year'],['unemployment','Jobless'],['stability','Stability']];
function regionRows(ctx){
  const {snap,econ,civ}=ctx,mode=ctx.ui.regions.mode,previous=econ.snap,industryName=outs=>{let best=0;for(let k=1;k<outs.length;k++)if(outs[k]>outs[best])best=k;return INDUSTRIES[best];};
  if(mode==='settlements')return snap.places.filter(p=>p.kind==='city').map(p=>({key:p.key,name:p.name,pop:p.pop,out:p.out,perHead:p.pop?p.out/p.pop:0,growth:previous[p.key]?p.out/previous[p.key]-1:0,tax:p.tax,unemployment:p.unemployment,stability:p.stability,top:industryName(p.outs),sub:civ.provinces.find(x=>x.id===p.province)?.name||''}));
  const groups=new Map();
  for(const p of snap.places){let g=groups.get(p.province);if(!g){g={key:`p${p.province}`,name:civ.provinces.find(x=>x.id===p.province)?.name||'Unnamed',pop:0,out:0,tax:0,previous:0,jobs:0,unemployed:0,stab:0,outs:new Float64Array(p.outs.length)};groups.set(p.province,g);}g.pop+=p.pop;g.out+=p.out;g.tax+=p.tax;g.previous+=previous[p.key]||0;g.jobs+=p.jobs;g.unemployed+=p.unemployment*p.jobs;g.stab+=p.stability*p.pop;for(let k=0;k<p.outs.length;k++)g.outs[k]+=p.outs[k];}
  return [...groups.values()].map(g=>({key:g.key,name:g.name,pop:g.pop,out:g.out,perHead:g.pop?g.out/g.pop:0,growth:g.previous?g.out/g.previous-1:0,tax:g.tax,unemployment:g.jobs?g.unemployed/g.jobs:0,stability:g.pop?g.stab/g.pop:0,top:industryName(g.outs),sub:''}));
}
function regions(ctx){
  const r=ctx.ui.regions,rows=regionRows(ctx).filter(x=>!r.search||x.name.toLowerCase().includes(r.search.toLowerCase()));
  rows.sort((a,b)=>r.sort==='name'?a.name.localeCompare(b.name)*(r.dir<0?1:-1):(a[r.sort]-b[r.sort])*(r.dir<0?-1:1));
  const header=COLUMNS.map(([key,label])=>`<th><button data-act="regions-sort" data-key="${key}" aria-sort="${r.sort===key?(r.dir<0?'descending':'ascending'):'none'}">${label}${r.sort===key?(r.dir<0?' ▾':' ▴'):''}</button></th>`).join('');
  let html=`<div class="toolbar"><div class="segmented" role="group" aria-label="Region level">${[['provinces','Provinces'],['settlements','Settlements']].map(([id,label])=>`<button data-act="regions-mode" data-mode="${id}" aria-pressed="${r.mode===id}">${label}</button>`).join('')}</div><input type="search" data-input="regions-search" placeholder="Search" aria-label="Search places" value="${esc(r.search)}"></div>`;
  html+=`<div class="table-scroll"><table class="kit-table"><thead><tr>${header}</tr></thead><tbody>${rows.slice(0,120).map(x=>`<tr data-act="fly" data-key="${x.key}" tabindex="0"><td><strong>${esc(x.name)}</strong><small><i style="background:${x.top.color}"></i>${esc(x.top.name)}${x.sub?` · ${esc(x.sub)}`:''}</small></td><td>${compact(x.pop)}</td><td>${compact(x.out)}</td><td>${compact(x.perHead)}</td><td>${trend(x.growth)}</td><td>${compact(x.tax)}</td><td>${pct(x.unemployment,0)}</td><td><span class="stab-dot ${x.stability<25?'crisis':x.stability<45?'unrest':x.stability<70?'steady':'confident'}"></span>${Math.round(x.stability)}</td></tr>`).join('')}</tbody></table></div>`;
  if(rows.length>120)html+=`<p class="help">Showing 120 of ${rows.length}. Search to narrow the list.</p>`;
  return html+'<p class="help">Click a row to open that place on the map. Growth compares with last January.</p>';
}

/* ---------- trade ---------- */
function trade(ctx){
  const {snap,econ,civ,money}=ctx,t=snap.trade,nations=new Map(civ.nations.map(n=>[n.id,n])),partners=new Map();
  for(const r of t.routes){if(!r.cross)continue;let p=partners.get(r.partner);if(!p){p={id:r.partner,volume:0,volume0:0,revenue:0,routes:0};partners.set(r.partner,p);}p.volume+=r.volume;p.volume0+=r.volume0;p.revenue+=r.tariffRev;p.routes++;}
  let html=`<div class="kit-grid">${stat('Tariff rate',pct(t.tariff,1),`law caps at ${pct(t.tariffCap,0)}`)}${stat('Tariff revenue',money(t.tariffRev),'a year')}${stat('Port & transit fees',money(t.feeRev),'a year')}${stat('Foreign trade',money(t.crossVolume),`of ${money(t.volume)} on your routes`)}</div><p class="help">Set the tariff in <button class="link-button" data-act="sub" data-sub="budget">Budget</button>. Treaties and openness come from trade policy under Reforms.</p>`;
  html+='<div class="info-section-title">Partners</div>';
  html+=partners.size?`<div class="rows">${[...partners.values()].sort((a,b)=>b.volume-a.volume).slice(0,12).map(p=>{const n=nations.get(p.id),term=econ.partners[p.id]?.term||'normal';return `<div class="partner-row"><div><strong>${esc(n?.name||'Unknown')}</strong><small>${p.routes} route${p.routes>1?'s':''} · ${money(p.volume)} · ${signedPct(p.volume0?p.volume/p.volume0-1:0,0)} vs start${term==='preferential'?' · agreement':''}</small></div><span class="num">${money(p.revenue)}</span><button data-act="partner" data-nation="${p.id}" data-term="${term==='embargo'?'normal':'embargo'}">${term==='embargo'?'Lift embargo':'Embargo'}</button></div>`;}).join('')}</div>`:'<p class="help">No foreign trade routes touch your cities.</p>';
  html+='<div class="info-section-title">Routes</div><div class="rows">'+t.routes.slice().sort((a,b)=>b.volume-a.volume).slice(0,24).map(r=>`<div class="route-row"><div><strong>${esc(r.from)} ↔ ${esc(r.to)}</strong><small>${r.maritime?'Sea':r.kind==='river'?'River':'Overland'}${r.cross?` · ${esc(nations.get(r.partner)?.name||'')}`:' · domestic'} · ${money(r.volume)}${r.level?` · level ${r.level}`:''}</small></div><span class="num">${money(r.tariffRev+r.feeRev)}</span>${r.maritime?'<span class="dim">harbour</span>':r.level>=3?'<span class="dim">max</span>':`<button data-act="route-upgrade" data-id="${r.id}">Upgrade</button>`}</div>`).join('')+'</div>';
  return html+'<p class="help">Roads, rail and canals lift a route’s volume. Harbours at your ports do the same for sea routes (Construction).</p>';
}

/* ---------- programmes ---------- */
function programmes(ctx){
  const {econ,snap,civ,rt,money}=ctx,slots=initiativeSlots(rt),active=econ.initiatives.active;
  let html=`<p class="help">Programmes run for months and cost a share of annual revenue. You have <strong>${slots}</strong> slots; ${active.length} in use.</p>`;
  if(active.length)html+='<div class="rows">'+active.map(a=>{const def=INITIATIVES.find(i=>i.id===a.id);return `<div class="program active"><strong>${esc(def.name)}</strong><small>${a.left} of ${a.total} months left${a.target?` · ${esc(targetName(ctx,def,a.target))}`:''}</small>${meter((a.total-a.left)/a.total*100,{label:def.name})}</div>`;}).join('')+'</div>';
  html+='<div class="info-section-title">Available</div>';
  for(const def of INITIATIVES.filter(i=>!active.some(a=>a.id===i.id))){
    const cost=def.cost*snap.revenue.total,wait=(econ.initiatives.cooldown[def.id]||0)>econ.day,choice=ctx.ui.trade[def.id];
    let picker='';
    if(def.scope==='province')picker=`<select data-input="init-target" data-id="${def.id}" aria-label="Province">${[...rt.provinces.values()].map(p=>`<option value="${p.id}" ${+choice===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`;
    else if(def.scope==='city')picker=`<select data-input="init-target" data-id="${def.id}" aria-label="Port city">${snap.places.filter(p=>p.kind==='city'&&p.coastal).sort((a,b)=>b.out-a.out).map(p=>`<option value="${p.id}" ${+choice===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`;
    else if(def.scope==='partner')picker=`<select data-input="init-target" data-id="${def.id}" aria-label="Partner">${[...new Set(snap.trade.routes.filter(r=>r.cross).map(r=>r.partner))].map(id=>{const n=civ.nations.find(x=>x.id===id);return `<option value="${id}" ${+choice===id?'selected':''}>${esc(n?.name||'')}</option>`;}).join('')}</select>`;
    html+=`<div class="program"><div><strong>${esc(def.name)}</strong><small>${esc(def.desc)}</small><small class="dim">${money(cost)} · ${def.months} months</small></div>${picker}<button data-act="launch" data-id="${def.id}" ${wait||econ.treasury<cost||active.length>=slots?'disabled':''}>${wait?`From ${isoDate(ctx.world,econ.initiatives.cooldown[def.id])}`:'Launch'}</button></div>`;
  }
  return html;
}
function targetName(ctx,def,target){if(def.scope==='province')return ctx.civ.provinces.find(p=>p.id===target)?.name||'';if(def.scope==='city')return ctx.civ.cities.find(c=>c.id===target)?.name||'';return ctx.civ.nations.find(n=>n.id===target)?.name||'';}

export const handlers={
  sub:(ctx,d)=>{ctx.ui.sub.economy=d.sub;ctx.rerender();},
  borrow:ctx=>ctx.act(borrow(ctx.world,ctx.econ,current(ctx.world,ctx.econ).revenue.total*.1)),
  repay:ctx=>ctx.act(repay(ctx.world,ctx.econ,current(ctx.world,ctx.econ).revenue.total*.1)),
  'regions-mode':(ctx,d)=>{ctx.ui.regions.mode=d.mode;ctx.rerender();},
  'regions-sort':(ctx,d)=>{const r=ctx.ui.regions;if(r.sort===d.key)r.dir*=-1;else{r.sort=d.key;r.dir=d.key==='name'?1:-1;}ctx.rerender();},
  fly:(ctx,d)=>ctx.flyTo(d.key),
  partner:(ctx,d)=>ctx.act(setPartner(ctx.world,ctx.econ,+d.nation,d.term)),
  'route-upgrade':(ctx,d)=>{ctx.ui.build.type='road';ctx.ui.build.place=`r${d.id}`;ctx.open('build');},
  launch:(ctx,d)=>{const def=INITIATIVES.find(i=>i.id===d.id),select=document.querySelector(`[data-input="init-target"][data-id="${d.id}"]`);ctx.act(launchInitiative(ctx.world,ctx.econ,d.id,select?+select.value:0));},
};
export const inputs={
  rate:(ctx,value,el,commit)=>{setRate(ctx.world,ctx.econ,el.dataset.tax,+value);document.getElementById(`out-${el.dataset.tax}`).textContent=pct(+value,1);ctx.live();refreshBudget(ctx);},
  spend:(ctx,value,el)=>{setSpend(ctx.world,ctx.econ,el.dataset.spend,+value);document.getElementById(`out-spend-${el.dataset.spend}`).textContent=`${Math.round(+value*100)}%`;ctx.live();refreshBudget(ctx);},
  'regions-search':(ctx,value)=>{ctx.ui.regions.search=value;const pos=document.querySelector('[data-input="regions-search"]').selectionStart;ctx.rerender();const el=document.querySelector('[data-input="regions-search"]');el?.focus();el?.setSelectionRange(pos,pos);},
  'init-target':(ctx,value,el)=>{ctx.ui.trade[el.dataset.id]=value;},
};
