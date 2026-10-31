import {esc,compact,pct,signedPct,meter,tip,trend,tile,chip,subtabs,section} from './ministry-kit.js';
import {TAXES,TAX_BY_ID,TUNING,DEFAULT_RATES} from '../game/economy/model.js';
import {borrow,repay,setRate,setSpend,launchInitiative,current,initiativeSlots,isoDate} from '../game/economy/sim.js';
import {INITIATIVES} from '../data/initiatives.js';
import {INDUSTRIES} from '../data/industries.js';
import {economicIdentity} from '../game/economy/industry-gen.js';
import {tradeSummary} from '../game/world/market.js';
import {lineChart,flow,treemap,spark,bars} from './charts.js';
import {icon,INDUSTRY_ICON,TAX_ICON,SPEND_ICON} from './icons.js';
import {describeFx} from './ministry-reforms.js';
const SUBS=[['overview','Overview',icon('chart')],['budget','Budget',icon('wallet')],['regions','Regions',icon('atlas')],['programmes','Programmes',icon('star')]];
const TAX_COLORS={income:'#7fb3a3',corporate:'#6a8fd0',consumption:'#c9a35a',property:'#a58a6c',royalty:'#9b7a5e',tariff:'#b27fc0',fees:'#5aa3b9',enterprise:'#8a8f86'};
const SPEND_COLORS={admin:'#8a9fb0',services:'#86c79a',welfare:'#e5826f',security:'#9a8f7a',subsidies:'#d9c48f',upkeep:'#a8968a',interest:'#c06a5a',population:'#b48bd0',fund:'#6fb2c9'};
export function render(ctx){
  const sub=ctx.ui.sub.economy,body=sub==='budget'?budget(ctx):sub==='regions'?regions(ctx):sub==='programmes'?programmes(ctx):overview(ctx);
  return subtabs(SUBS,sub)+body;
}
const years=(ctx,hist)=>hist.map(h=>String(new Date(Date.parse(ctx.world.meta.game.startDate+'T00:00:00Z')+h.d*864e5).getUTCFullYear()));

/* ---------- overview ---------- */
const committed=econ=>econ.queue.reduce((s,p)=>s+(p.reserve!=null?0:(p.work-p.done)*(p.rush?TUNING.rush[1]:1)),0);
function overview(ctx){
  const {snap,econ,money}=ctx,net=(snap.revenue.total-snap.spending.total)/12,identity=economicIdentity(snap.industry.map(i=>i.share)),hist=econ.hist,cm=committed(econ);
  const growth=(()=>{const old=Object.values(econ.snap).reduce((s,v)=>s+v,0);return old?snap.gdp/old-1:0;})();
  const trade=ctx.res?tradeSummary(ctx.ws,ctx.res,econ.nation):null,cpi=econ.link?.market?.cpi??1,debtRatio=snap.gdp?econ.debt/snap.gdp:0;
  let html=`<section class="ministry-hero"><span class="kicker">${esc(ctx.nation.name)} · ${esc(ctx.nation.government||'')}</span><h2>${esc(identity.title.replace(/^./,c=>c.toUpperCase()))}</h2><p class="help">${isoDate(ctx.world,econ.day)} · stability ${Math.round(econ.stability)} (${snap.stability.band.toLowerCase()})</p></section>`;
  html+=`<div class="tiles">
    ${tile('Output',money(snap.gdp),{icon:icon('chart'),sub:`${money(snap.gdpPerCapita)} per person`,chip:chip(growth,{tip:'Change since January'}),spark:spark(hist.map(h=>h.gdp),{color:'var(--accent)'}),tip:'Everything produced in a year, in world units.'})}
    ${tile('Monthly balance',`${net>=0?'+':'−'}${money(Math.abs(net))}`,{icon:icon('wallet'),tone:net>=0?'good':'bad',sub:`revenue ${money(snap.revenue.total/12)} · spending ${money(snap.spending.total/12)}`,spark:spark(hist.map(h=>h.rev-h.spend),{color:net>=0?'var(--positive)':'var(--danger)'}),act:'sub',data:{sub:'budget'}})}
    ${tile('Unemployment',pct(snap.unemployment),{icon:icon('people'),sub:`${compact(snap.jobs)} jobs`,spark:spark(hist.map(h=>h.unemp),{color:'var(--warning)'}),tone:snap.unemployment>.12?'bad':''})}
    ${tile('Cost of living',`${((cpi-1)*100>=0?'+':'')}${((cpi-1)*100).toFixed(1)}%`,{icon:icon('cart'),sub:'household prices since the start',tone:cpi>1.12?'bad':cpi<.97?'good':'',act:'open-tab',data:{tab:'trade'},tip:'World prices of food, goods and power as your households buy them. High prices erode stability.'})}
    ${tile('Trade balance',trade?`${trade.balance>=0?'+':'−'}${money(Math.abs(trade.balance))}`:'—',{icon:icon('globe'),sub:trade?`exports ${money(trade.exports)} · imports ${money(trade.imports)}`:'',tone:trade&&trade.balance<0?'bad':'good',act:'open-tab',data:{tab:'trade'}})}
    ${tile('Debt',money(econ.debt),{icon:icon('percent'),sub:`${pct(debtRatio,0)} of output · ${snap.credit.label} at ${pct(snap.credit.interestRate)}`,tone:debtRatio>.9?'bad':''})}
  </div>`;
  html+=section('Where the money goes',`<span class="dim">a year</span>`);
  const fold=(list,total)=>{const big=list.filter(x=>x.value>=total*.04),rest=list.filter(x=>x.value<total*.04&&x.value>0).reduce((s,x)=>s+x.value,0);return rest>0?[...big,{id:'other',label:'Other',value:rest,color:'#8f968c'}]:big;};
  const sources=fold([...TAXES.map(t=>({id:t.id,label:t.name.replace(' tax','').replace('Land & property','Property').replace('Resource royalties','Royalties').replace('Port & transit fees','Port fees'),value:snap.revenue.byTax[t.id]})),{id:'enterprise',label:'State firms',value:snap.revenue.byTax.enterprise}].sort((a,b)=>b.value-a.value).map(x=>({...x,color:TAX_COLORS[x.id]})),snap.revenue.total);
  const uses=fold(snap.spending.items.slice().sort((a,b)=>b.amount-a.amount).map(i=>({id:i.id,label:i.name.replace('Interest on debt','Interest').replace('Upkeep of public works','Upkeep').replace('Education & health','Education, health'),value:i.amount,color:SPEND_COLORS[i.id]||'#999'})),snap.spending.total);
  html+=`<div class="chart-card">${flow(sources,uses,{format:v=>money(v),center:net>=0?'Surplus':'Deficit'})}</div>`;
  html+=section('What the economy makes',`<button class="link-button" data-act="open-tab" data-tab="industry">Industry ›</button>`);
  html+=treemap(snap.industry.map((d,k)=>{const ind=INDUSTRIES[k];return {label:ind.name.split(' ')[0].replace(/&$/,''),value:d.out,color:ind.color,icon:icon(INDUSTRY_ICON[ind.id]),sub:pct(d.share,0),tip:`${ind.name}: ${money(d.out)} (${pct(d.share)}) · growth ${signedPct(d.growth)} a year`,act:'open-industry',data:{ind:ind.id}};}),{height:150});
  if(hist.length>2)html+=section('History')+`<div class="chart-card">${lineChart([{label:'Output',color:'var(--accent)',values:hist.map(h=>h.gdp)},{label:'Revenue ×5',color:'var(--positive)',values:hist.map(h=>h.rev*5)},{label:'Spending ×5',color:'var(--danger)',values:hist.map(h=>h.spend*5),dashed:true}],{labels:years(ctx,hist),format:v=>compact(v)})}</div>`;
  html+=section('Funds')+`<div class="funds"><div class="funds-row"><span>${icon('wallet')}Treasury</span><strong class="${econ.treasury<0?'down':''}">${money(econ.treasury)}</strong></div><div class="funds-row"><span>${icon('hammer')}Committed to projects</span><strong>−${money(cm)}</strong></div><div class="funds-row total"><span>Uncommitted</span><strong class="${econ.treasury-cm<0?'down':'up'}">${money(econ.treasury-cm)}</strong></div>${econ.fund?.share?`<div class="funds-row"><span>${icon('robot')}Auto-build fund</span><strong>${money(econ.fund.balance)}</strong></div>`:''}<div class="funds-row"><span>${icon('coins')}Credit available</span><strong>${money(snap.credit.available)}</strong></div></div>`;
  html+=`<div class="button-row"><button data-act="borrow">${icon('down')}Borrow ${money(snap.revenue.total*.1)}</button><button data-act="repay" ${econ.debt>0&&econ.treasury>0?'':'disabled'}>${icon('up')}Repay ${money(Math.min(econ.debt,snap.revenue.total*.1,Math.max(0,econ.treasury)))}</button></div>`;
  html+=section('Recent events')+(econ.log.length?`<ul class="event-log">${econ.log.slice(0,8).map(l=>`<li class="${l.tone}"><time>${isoDate(ctx.world,l.day)}</time>${esc(l.text)}</li>`).join('')}</ul>`:'<p class="help">Nothing yet. Let time pass.</p>');
  return html;
}

/* ---------- budget ---------- */
const peak=id=>{const t=TAX_BY_ID[id];return t.max*Math.pow(1/(2.7*TUNING.evasion),1/1.7);};
/** Revenue against rate for one tax: rises, peaks, then falls as evasion and avoidance grow. */
function laffer(id,rate,max){
  const t=TAX_BY_ID[id],W=110,H=30,f=r=>r*(1-Math.pow(r/t.max,1.7)*TUNING.evasion),top=f(Math.min(peak(id),t.max)),pts=[];for(let k=0;k<=24;k++){const r=max*k/24;pts.push(`${(k/24*W).toFixed(1)},${(H-2-f(r)/top*(H-6)).toFixed(1)}`);}
  const x=rate/max*W,px=Math.min(peak(id),max)/max*W;
  return `<svg class="laffer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-tip="Revenue from this tax as the rate rises. The dotted line is the peak: past it, higher rates raise less."><polyline points="${pts.join(' ')}"/><line class="peak" x1="${px.toFixed(1)}" x2="${px.toFixed(1)}" y1="2" y2="${H}"/><circle cx="${x.toFixed(1)}" cy="${(H-2-f(rate)/top*(H-6)).toFixed(1)}" r="3"/></svg>`;
}
function budgetLive(ctx){
  const snap=current(ctx.world,ctx.econ),{money}=ctx,net=snap.revenue.total-snap.spending.total,band=snap.stability.target-ctx.econ.stability;
  return `<div class="tiles compact">${tile('Revenue',money(snap.revenue.total),{icon:icon('coins'),sub:`${pct(snap.revenue.ratio)} of output`})}${tile('Spending',money(snap.spending.total),{icon:icon('wallet')})}${tile('Balance',`${net>=0?'+':'−'}${money(Math.abs(net))}`,{icon:icon('scales'),tone:net>=0?'good':'bad',sub:'a year'})}${tile('Stability heads to',String(Math.round(snap.stability.target)),{icon:icon('shield'),chip:chip(band/100,{digits:1,suffix:'',scale:100}),sub:`growth pull ${signedPct(snap.growth)} a year`})}</div>`;
}
function budget(ctx){
  const {econ,snap,money}=ctx,cap=snap.trade.tariffCap;
  let html='<div id="budget-live">'+budgetLive(ctx)+'</div>'+section('Tax rates','<span class="dim">drag to preview</span>');
  for(const t of TAXES){
    const max=t.id==='tariff'?Math.min(t.max,cap):t.max,rate=Math.min(econ.rates[t.id],max);
    html+=`<div class="tax-row"><div class="tax-head"><span class="tax-icon" style="color:${TAX_COLORS[t.id]}">${icon(TAX_ICON[t.id])}</span><label for="rate-${t.id}">${tip(t.name,t.blurb)}</label>${laffer(t.id,rate,max)}<output id="out-${t.id}">${pct(rate,1)}</output></div><input id="rate-${t.id}" type="range" data-input="rate" data-tax="${t.id}" min="0" max="${max}" step="0.005" value="${rate}"><div class="tax-foot"><span data-yield="${t.id}">${money(snap.revenue.byTax[t.id])} a year</span><span class="dim">default ${pct(DEFAULT_RATES[t.id],0)} · peak near ${pct(Math.min(peak(t.id),max),0)}${t.id==='tariff'?` · law caps at ${pct(cap,0)}`:''}</span></div></div>`;
  }
  html+=section('Spending');
  for(const [id,label,help] of [['admin','Administration','Clerks, courts and tax collectors. Cuts raise corruption risk and unrest.'],['services','Education & health','Schools and clinics: slow growth, longer lives, steady stability.']]){
    const base=snap.spending.items.find(i=>i.id===id).amount/econ.spend[id];
    html+=`<div class="tax-row"><div class="tax-head"><span class="tax-icon" style="color:${SPEND_COLORS[id]}">${icon(SPEND_ICON[id])}</span><label for="spend-${id}">${tip(label,help)}</label><output id="out-spend-${id}">${Math.round(econ.spend[id]*100)}%</output></div><input id="spend-${id}" type="range" data-input="spend" data-spend="${id}" min="0.5" max="1.5" step="0.05" value="${econ.spend[id]}"><div class="tax-foot"><span data-spent="${id}">${money(base*econ.spend[id])} a year</span><span class="dim">100% = ${money(base)}</span></div></div>`;
  }
  html+=bars(snap.spending.items.filter(i=>!['admin','services'].includes(i.id)&&i.amount>0).map(i=>({label:i.name,icon:icon(SPEND_ICON[i.id]||'coins'),value:i.amount,valueLabel:money(i.amount),color:SPEND_COLORS[i.id]})),{max:snap.spending.total});
  return html;
}
function refreshBudget(ctx){
  const root=document.getElementById('ministry-body'),snap=current(ctx.world,ctx.econ);if(!root)return;
  const live=root.querySelector('#budget-live');if(live)live.innerHTML=budgetLive(ctx);
  for(const el of root.querySelectorAll('[data-yield]'))el.textContent=`${ctx.money(snap.revenue.byTax[el.dataset.yield])} a year`;
  for(const el of root.querySelectorAll('[data-spent]')){const item=snap.spending.items.find(i=>i.id===el.dataset.spent);el.textContent=`${ctx.money(item.amount)} a year`;}
  for(const t of TAXES){const input=root.querySelector(`#rate-${t.id}`),svg=input?.closest('.tax-row')?.querySelector('.laffer');if(svg)svg.outerHTML=laffer(t.id,+input.value,+input.max);}
}

/* ---------- regions ---------- */
const COLUMNS=[['name','Place'],['pop','People'],['out','Output'],['perHead','Per head'],['growth','Growth'],['unemployment','Jobless'],['stability','Stability']];
function regionRows(ctx){
  const {snap,econ,civ}=ctx,mode=ctx.ui.regions.mode,previous=econ.snap,industryName=outs=>{let best=0;for(let k=1;k<outs.length;k++)if(outs[k]>outs[best])best=k;return INDUSTRIES[best];};
  if(mode==='settlements')return snap.places.filter(p=>p.kind==='city').map(p=>({key:p.key,name:p.name,pop:p.pop,out:p.out,perHead:p.pop?p.out/p.pop:0,growth:previous[p.key]?p.out/previous[p.key]-1:0,tax:p.tax,unemployment:p.unemployment,stability:p.stability,top:industryName(p.outs),sub:civ.provinces.find(x=>x.id===p.province)?.name||''}));
  const groups=new Map();
  for(const p of snap.places){let g=groups.get(p.province);if(!g){g={key:`p${p.province}`,name:civ.provinces.find(x=>x.id===p.province)?.name||'Unnamed',pop:0,out:0,tax:0,previous:0,jobs:0,unemployed:0,stab:0,outs:new Float64Array(p.outs.length)};groups.set(p.province,g);}g.pop+=p.pop;g.out+=p.out;g.tax+=p.tax;g.previous+=previous[p.key]||0;g.jobs+=p.jobs;g.unemployed+=p.unemployment*p.jobs;g.stab+=p.stability*p.pop;for(let k=0;k<p.outs.length;k++)g.outs[k]+=p.outs[k];}
  return [...groups.values()].map(g=>({key:g.key,name:g.name,pop:g.pop,out:g.out,perHead:g.pop?g.out/g.pop:0,growth:g.previous?g.out/g.previous-1:0,tax:g.tax,unemployment:g.jobs?g.unemployed/g.jobs:0,stability:g.pop?g.stab/g.pop:0,top:industryName(g.outs),sub:''}));
}
function regions(ctx){
  const r=ctx.ui.regions,all=regionRows(ctx),rows=all.filter(x=>!r.search||x.name.toLowerCase().includes(r.search.toLowerCase())),maxOut=Math.max(...all.map(x=>x.out),1);
  rows.sort((a,b)=>r.sort==='name'?a.name.localeCompare(b.name)*(r.dir<0?1:-1):(a[r.sort]-b[r.sort])*(r.dir<0?-1:1));
  const header=COLUMNS.map(([key,label])=>`<th><button data-act="regions-sort" data-key="${key}" aria-sort="${r.sort===key?(r.dir<0?'descending':'ascending'):'none'}">${label}${r.sort===key?(r.dir<0?' ▾':' ▴'):''}</button></th>`).join('');
  let html=`<div class="toolbar"><div class="segmented" role="group" aria-label="Region level">${[['provinces','Provinces'],['settlements','Cities']].map(([id,label])=>`<button data-act="regions-mode" data-mode="${id}" aria-pressed="${r.mode===id}">${label}</button>`).join('')}</div><input type="search" data-input="regions-search" placeholder="Search" aria-label="Search places" value="${esc(r.search)}"><button class="text-button" data-act="lens" data-lens="output" title="Show output per person on the map">${icon('atlas')}Map</button></div>`;
  html+=`<div class="table-scroll"><table class="kit-table"><thead><tr>${header}</tr></thead><tbody>${rows.slice(0,150).map(x=>`<tr data-act="fly" data-key="${x.key}" data-hover-key="${x.key}" tabindex="0"><td><strong>${esc(x.name)}</strong><small><span style="color:${x.top.color}">${icon(INDUSTRY_ICON[x.top.id],'icon-inline')}</span>${esc(x.top.name)}${x.sub?` · ${esc(x.sub)}`:''}</small></td><td>${compact(x.pop)}</td><td><span class="cell-bar"><b style="width:${(x.out/maxOut*100).toFixed(1)}%"></b></span>${compact(x.out)}</td><td>${compact(x.perHead)}</td><td>${trend(x.growth)}</td><td>${pct(x.unemployment,0)}</td><td><span class="stab-dot ${x.stability<25?'crisis':x.stability<45?'unrest':x.stability<70?'steady':'confident'}"></span>${Math.round(x.stability)}</td></tr>`).join('')}</tbody></table></div>`;
  if(rows.length>150)html+=`<p class="help">Showing 150 of ${rows.length}. Search to narrow the list.</p>`;
  return html+'<p class="help">Hover a row to find it on the map; click to open it. Growth compares with last January.</p>';
}

/* ---------- programmes ---------- */
const INIT_ICON={electrification:'bolt',literacy:'book',mission:'handshake',harbour:'anchor',zone:'office',integrity:'shield',survey:'pick',stimulus:'crane',tourism:'palm',restructuring:'percent'};
function programmes(ctx){
  const {econ,snap,civ,rt,money}=ctx,slots=initiativeSlots(rt),active=econ.initiatives.active;
  let html=`<div class="slot-row">${Array.from({length:slots},(_,k)=>`<span class="slot ${k<active.length?'used':''}"></span>`).join('')}<span class="dim">${active.length} of ${slots} programme slots in use</span></div>`;
  if(active.length)html+='<div class="cards">'+active.map(a=>{const def=INITIATIVES.find(i=>i.id===a.id);return `<div class="card program active"><div class="card-head"><span class="card-icon">${icon(INIT_ICON[def.id]||'star')}</span><strong>${esc(def.name)}</strong></div><small>${a.left} of ${a.total} months left${a.target?` · ${esc(targetName(ctx,def,a.target))}`:''}</small>${meter((a.total-a.left)/a.total*100,{label:def.name})}</div>`;}).join('')+'</div>';
  html+=section('Available')+'<div class="cards">';
  for(const def of INITIATIVES.filter(i=>!active.some(a=>a.id===i.id))){
    const cost=def.cost*snap.revenue.total,wait=(econ.initiatives.cooldown[def.id]||0)>econ.day,choice=ctx.ui.trade[def.id];
    let picker='';
    if(def.scope==='province')picker=`<select data-input="init-target" data-id="${def.id}" aria-label="Province">${[...rt.provinces.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${p.id}" ${+choice===p.id?'selected':''}>${esc(p.name)}${p.id in econ.surveys?' (surveyed)':''}</option>`).join('')}</select>`;
    else if(def.scope==='city')picker=`<select data-input="init-target" data-id="${def.id}" aria-label="Port city">${snap.places.filter(p=>p.kind==='city'&&p.coastal).sort((a,b)=>b.out-a.out).map(p=>`<option value="${p.id}" ${+choice===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`;
    else if(def.scope==='partner')picker=`<select data-input="init-target" data-id="${def.id}" aria-label="Partner">${civ.nations.filter(n=>n.id!==econ.nation&&ctx.ws?.nations[n.id]).sort((a,b)=>(ctx.ws.relations[b.id]||0)-(ctx.ws.relations[a.id]||0)).map(n=>`<option value="${n.id}" ${+choice===n.id?'selected':''}>${esc(n.name)}</option>`).join('')}</select>`;
    const fx=describeFx(def.fx).map(c=>`<span class="fx ${c.positive===null?'':c.positive?'up':'down'}">${esc(c.text)}</span>`).join('');
    html+=`<div class="card program"><div class="card-head"><span class="card-icon">${icon(INIT_ICON[def.id]||'star')}</span><strong>${esc(def.name)}</strong><span class="chip flat">${money(cost)}</span></div><small>${esc(def.desc)}</small><div class="fx-list">${fx}<span class="fx">${def.months} months</span></div><div class="card-actions">${picker}<button class="primary" data-act="launch" data-id="${def.id}" ${wait||econ.treasury<cost||active.length>=slots?'disabled':''}>${wait?`From ${isoDate(ctx.world,econ.initiatives.cooldown[def.id])}`:'Launch'}</button></div></div>`;
  }
  return html+'</div>';
}
function targetName(ctx,def,target){if(def.scope==='province')return ctx.civ.provinces.find(p=>p.id===target)?.name||'';if(def.scope==='city')return ctx.civ.cities.find(c=>c.id===target)?.name||'';return ctx.civ.nations.find(n=>n.id===target)?.name||'';}

export const handlers={
  sub:(ctx,d)=>{const tab=document.body.dataset.ministryTab||'economy';ctx.ui.sub[tab]=d.sub;ctx.rerender();},
  'open-tab':(ctx,d)=>ctx.open(d.tab),
  'open-industry':(ctx,d)=>{ctx.ui.industry.open=d.ind;ctx.open('industry');},
  lens:(ctx,d)=>{ctx.atlas.setLens(ctx.atlas.lens===d.lens?null:d.lens);},
  borrow:ctx=>ctx.act(borrow(ctx.world,ctx.econ,current(ctx.world,ctx.econ).revenue.total*.1)),
  repay:ctx=>ctx.act(repay(ctx.world,ctx.econ,current(ctx.world,ctx.econ).revenue.total*.1)),
  'regions-mode':(ctx,d)=>{ctx.ui.regions.mode=d.mode;ctx.rerender();},
  'regions-sort':(ctx,d)=>{const r=ctx.ui.regions;if(r.sort===d.key)r.dir*=-1;else{r.sort=d.key;r.dir=d.key==='name'?1:-1;}ctx.rerender();},
  fly:(ctx,d)=>ctx.flyTo(d.key),
  launch:(ctx,d)=>{const select=document.querySelector(`[data-input="init-target"][data-id="${d.id}"]`),target=select?+select.value:0,r=launchInitiative(ctx.world,ctx.econ,d.id,target);if(r.ok&&d.id==='mission'&&ctx.ws?.nations[target]){ctx.ws.nations[target].mission=ctx.econ.day+24*30;}ctx.act(r);},
};
export const inputs={
  rate:(ctx,value,el)=>{setRate(ctx.world,ctx.econ,el.dataset.tax,+value);document.getElementById(`out-${el.dataset.tax}`).textContent=pct(+value,1);ctx.live();refreshBudget(ctx);},
  spend:(ctx,value,el)=>{setSpend(ctx.world,ctx.econ,el.dataset.spend,+value);document.getElementById(`out-spend-${el.dataset.spend}`).textContent=`${Math.round(+value*100)}%`;ctx.live();refreshBudget(ctx);},
  'regions-search':(ctx,value)=>{ctx.ui.regions.search=value;const pos=document.querySelector('[data-input="regions-search"]').selectionStart;ctx.rerender();const el=document.querySelector('[data-input="regions-search"]');el?.focus();el?.setSelectionRange(pos,pos);},
  'init-target':(ctx,value,el)=>{ctx.ui.trade[el.dataset.id]=value;},
};
