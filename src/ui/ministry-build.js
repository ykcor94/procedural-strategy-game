import {esc,pct,meter,dayLabel,paybackLabel,tile,section} from './ministry-kit.js';
import {BUILDINGS,BUILDING_BY_ID,SIZES,TIER_NAMES} from '../data/buildings.js';
import {INDUSTRY_BY_ID} from '../data/industries.js';
import {RESOURCE_IDS,GOOD_BY_ID} from '../data/resources.js';
import {quoteProject,queueProject,cancelProject,moveProject,toggleProject,setBuildPolicy,current} from '../game/economy/sim.js';
import {TUNING} from '../game/economy/model.js';
import {FUND_SHARES,DIRECTIVE_TYPES,DIRECTIVE_BY_ID,WHERE,PRESETS,ensureFund,setFundShare,addDirective,updateDirective,removeDirective,applyPreset,directiveCandidate} from '../game/economy/autobuild.js';
import {ring} from './charts.js';
import {seq} from './atlas.js';
import {icon,INDUSTRY_ICON,BUILDING_ICON} from './icons.js';
/** Construction: pick a project from the palette, and the best sites light up on the map and in a ranked
 * list. The queue reads as a timeline; the auto-build fund keeps routine development going on its own. */
const STATUS={building:['Building','up'],queued:['Waiting for a crew','flat'],capacity:['Waiting for builders','flat'],funds:['Waiting for funds','down'],paused:['Paused','flat'],unrest:['Halted by unrest','down']};
const BLOCKER={capacity:'Builders are the bottleneck. Expand Construction & materials, or build less at once.',funds:'Projects are waiting for money. Raise revenue, borrow, or lower the cash reserve.',queued:'Every crew is busy. Administrative capacity decides how many projects run at once.',unrest:'Unrest is stopping work in some places.'};
const TIERS=[['A','Productive'],['B','Enabling'],['C','Civic']];
const iconFor=b=>b.industry?INDUSTRY_ICON[b.industry]:BUILDING_ICON[b.id]||'hammer';
const colorFor=b=>b.industry?INDUSTRY_BY_ID[b.industry].color:b.tier==='C'?'#c2a8d8':'#8fb5c8';

/** Quotes for every eligible place, ranked. */
function sites(ctx,b){
  const {world,econ,snap}=ctx;if(b.where.includes('route'))return [];const list=[];
  for(const p of snap.places){if(!b.where.includes(p.kind))continue;const q=quoteProject(world,econ,b.id,p.key,ctx.ui.build.size);if(q.ok)list.push({...q,province:p.province,kind:p.kind});}
  if(b.tier==='A'||b.id==='port')return list.sort((a,c)=>a.payback-c.payback);
  if(b.id==='housing'){const lab=k=>snap.index.get(k)?.labour??1;return list.sort((a,c)=>lab(a.place)-lab(c.place));}
  return list.sort((a,c)=>(snap.index.get(a.place)?.stability??50)-(snap.index.get(c.place)?.stability??50));
}
/** Map lens: provinces coloured by how good their best site is for the chosen project. */
function siteLens(ctx,b){
  return ()=>{const c=current(ctx.world,ctx.econ),list=sites({...ctx,snap:c},b),best=new Map();for(const q of list){const v=b.tier==='A'||b.id==='port'?q.payback:1;if(!best.has(q.province)||v<best.get(q.province).v)best.set(q.province,{v,q});}
    const colors=new Map(),vals=[...best.values()].map(x=>x.v).filter(Number.isFinite),lo=Math.min(...vals,1),hi=Math.min(60,Math.max(...vals,lo+1));
    for(const [pid,x] of best)colors.set(pid,Number.isFinite(x.v)?seq(1-(Math.min(hi,x.v)-lo)/(hi-lo||1)):[170,166,150]);
    return {title:`Sites: ${b.name}`,spec:{colors},legend:b.tier==='A'||b.id==='port'?{kind:'seq',stops:[{color:`rgb(${seq(0).join(',')})`,label:`${Math.round(hi)} yr`},{color:`rgb(${seq(.5).join(',')})`,label:''},{color:`rgb(${seq(1).join(',')})`,label:`${lo.toFixed(1)} yr`}],note:'Brighter provinces pay back sooner. Grey: nowhere to build.'}:{kind:'cat',items:[{color:`rgb(${seq(1).join(',')})`,label:'Can build here'}]},
      describe:pid=>{const x=best.get(pid);return x?`${esc(x.q.placeName)}<br>${paybackLabel(x.q.payback)} payback · ${ctx.money(x.q.cost)}`:'Nowhere to build';}};};
}
export function onOpen(ctx){const b=BUILDING_BY_ID[ctx.ui.build.type]||BUILDINGS[0];if(!b.where.includes('route'))ctx.atlas.custom(siteLens(ctx,b));}
export function onClose(ctx){ctx.atlas.custom(null);}

function queueRow(ctx,p,index){
  const b=BUILDING_BY_ID[p.type],pctDone=p.done/p.work,remaining=p.work-p.done,rate=p.work/p.days*(p.rush?TUNING.rush[0]:1),eta=p.status==='building'?remaining/rate:null,[label,tone]=STATUS[p.status]||[p.status,'flat'],auto=p.auto?ensureFund(ctx.econ).directives.find(d=>d.id===p.auto):null;
  return `<div class="queue-row ${p.status}" data-hover-key="${esc(p.place)}"><span class="q-icon" style="--c:${colorFor(b)}">${icon(iconFor(b))}</span><div class="q-main"><strong>${esc(b.name)}${auto?` <span class="chip flat" data-tip="Started by the auto-build fund (${esc(DIRECTIVE_BY_ID[auto.type]?.name||'')})">${icon('robot','icon-inline')}auto</span>`:''}</strong><small>${esc(p.placeName)} · ${SIZES[p.size-1].name}</small>${meter(pctDone*100,{className:'queue-meter',label:'Progress'})}<small><span class="chip ${tone}">${label}${p.rush?' · rushed':''}</span> ${Math.round(pctDone*100)}%${eta!==null?` · about ${dayLabel(eta)} left`:''}</small></div><div class="queue-tools"><button data-act="build-move" data-id="${p.id}" data-delta="-1" aria-label="Move up" ${index===0?'disabled':''}>${icon('up')}</button><button data-act="build-move" data-id="${p.id}" data-delta="1" aria-label="Move down" ${index===ctx.econ.queue.length-1?'disabled':''}>${icon('down')}</button><button data-act="build-toggle" data-id="${p.id}" data-key="paused" aria-pressed="${p.paused}" title="Pause">${icon(p.paused?'play':'pause')}</button><button data-act="build-toggle" data-id="${p.id}" data-key="rush" aria-pressed="${p.rush}" title="Rush: 50% faster, 30% dearer">${icon('bolt')}</button><button data-act="build-cancel" data-id="${p.id}" aria-label="Cancel project" title="Cancel (half of spending is recovered)">${icon('close')}</button></div></div>`;
}
function placeOptions(ctx,b){
  const {snap,rt,econ}=ctx;
  if(b.where.includes('route'))return rt.routes.filter(r=>!r.maritime&&(econ.routeLevels[r.id]||0)<3).sort((a,c)=>c.volume0-a.volume0).slice(0,120).map(r=>({value:`r${r.id}`,label:`${r.fromName} – ${r.toName} (level ${econ.routeLevels[r.id]||0})`}));
  return snap.places.filter(p=>b.where.includes(p.kind)).sort((a,c)=>c.out-a.out).slice(0,200).map(p=>({value:p.key,label:`${p.name} · ${p.slots-p.used-econ.queue.filter(q=>q.place===p.key).length} slots free`}));
}
export function render(ctx){
  const {snap,econ,ui,money}=ctx,b=BUILDING_BY_ID[ui.build.type]||BUILDINGS[0],options=placeOptions(ctx,b),active=econ.queue.filter(p=>p.status==='building').length;
  if(ui.build.place&&!options.some(o=>o.value===ui.build.place)){const key=ui.build.place,place=snap.index.get(key),route=key[0]==='r'&&ctx.rt.routeById.get(+key.slice(1));if(place&&b.where.includes(place.kind))options.unshift({value:key,label:place.name});else if(route&&b.where.includes('route'))options.unshift({value:key,label:`${route.fromName} – ${route.toName}`});else ui.build.place='';}
  const ranked=sites(ctx,b);if(!ui.build.place)ui.build.place=ranked[0]?.place||options[0]?.value||'';
  const blockers=econ.queue.map(p=>p.status).filter(s=>BLOCKER[s]),blocker=blockers.length?BLOCKER[blockers.sort((a,c)=>blockers.filter(x=>x===c).length-blockers.filter(x=>x===a).length)[0]]:'';
  let html=`<div class="tiles compact">${tile('Build capacity',`${money(snap.build.capacity)}/day`,{icon:icon('crane'),sub:`${pct(snap.build.capacity*365/Math.max(1,snap.gdp),1)} of output a year`,tip:'Set by your construction and heavy industry.'})}${tile('Crews',`${active} / ${snap.build.slots}`,{icon:icon('people'),sub:'projects at once'})}${tile('Queued',String(econ.queue.length),{icon:icon('clipboard'),sub:`${money(econ.queue.reduce((s,p)=>s+p.work-p.done,0))} to go`})}${tile('Auto-build fund',money(ensureFund(econ).balance),{icon:icon('robot'),sub:econ.fund.share?`${pct(econ.fund.share,0)} of revenue`:'off',act:'scroll-fund'})}</div>`;
  if(blocker)html+=`<p class="help warn">${icon('warning','icon-inline')}${esc(blocker)}</p>`;
  html+=section('New project')+`<div class="segmented" role="tablist">${TIERS.map(([t,label])=>`<button data-act="build-tier" data-tier="${t}" aria-pressed="${(ui.build.tier||b.tier)===t}">${label}</button>`).join('')}</div><div class="palette">${BUILDINGS.filter(x=>x.tier===(ui.build.tier||b.tier)).map(x=>`<button class="palette-item${x.id===b.id?' active':''}" style="--c:${colorFor(x)}" data-act="build-type" data-type="${x.id}" data-tip="${esc(x.summary)}">${icon(iconFor(x))}<span>${esc(x.name)}</span></button>`).join('')}</div>`;
  html+=`<div class="build-form"><p class="help">${esc(b.summary)}</p>`;
  if(!b.where.includes('route'))html+=`<div class="segmented" role="group" aria-label="Project size">${SIZES.map(s=>`<button data-act="build-size" data-size="${s.id}" aria-pressed="${s.id===ui.build.size}">${s.name}</button>`).join('')}</div>`;
  html+=`<label class="field">${b.where.includes('route')?'Trade route':'Where'}<select data-input="build-place">${options.map(o=>`<option value="${esc(o.value)}" ${o.value===ui.build.place?'selected':''}>${esc(o.label)}</option>`).join('')||'<option value="">Nowhere suitable</option>'}</select></label>`;
  const q=ui.build.place?quoteProject(ctx.world,econ,b.id,ui.build.place,ui.build.size):{ok:false,error:'Choose somewhere to build.'};
  if(q.ok){const afford=econ.treasury+(econ.borrowBuild?snap.credit.available:0)>=q.cost;
    html+=`<div class="quote-card">${q.tier==='A'?ring(Math.min(1,q.suit/1.15),{size:52,label:`${Math.round(q.suit/1.15*100)}%`,color:q.fit<.6?'var(--warning)':'var(--positive)',tip:'Site fit: how well the place suits this industry. Poor sites cost more and yield less.'}):`<span class="q-icon big" style="--c:${colorFor(b)}">${icon(iconFor(b))}</span>`}<div class="quote"><div><span>Cost</span><strong>${money(q.cost)}</strong></div><div><span>Time</span><strong>${dayLabel(q.days)}</strong></div>${q.tier==='A'?`<div><span>Adds output</span><strong class="up">+${money(q.gain)}/yr</strong></div><div><span>Pays back in</span><strong>${paybackLabel(q.payback)}</strong></div>`:q.taxGain>0?`<div><span>Adds revenue</span><strong class="up">+${money(q.taxGain)}/yr</strong></div><div><span>Pays back in</span><strong>${paybackLabel(q.payback)}</strong></div>`:`<div><span>Effect</span><strong>${esc(q.detail||'')}</strong></div>`}</div></div><p class="help">${esc(q.detail||'')}</p><button class="primary wide-button" data-act="build-queue" ${econ.queue.length>=60?'disabled':''}>${icon('hammer')}Queue in ${esc(q.placeName)}${afford?'':' (can’t afford yet)'}</button>`;
  }else html+=`<p class="help warn">${esc(q.error)}</p>`;
  html+='</div>';
  if(ranked.length)html+=section(b.tier==='A'||b.id==='port'?'Best sites':b.id==='housing'?'Shortest of workers':'Where it helps most','<span class="dim">also lit on the map</span>')+`<div class="rows">${ranked.slice(0,8).map(s=>`<button class="site-row${s.place===ui.build.place?' active':''}" data-act="build-site" data-place="${esc(s.place)}" data-hover-key="${esc(s.place)}"><span><strong>${esc(s.placeName)}</strong><small>${esc(s.detail||'')}</small></span>${s.tier==='A'?`<span class="fit-bar" data-tip="Site fit"><b style="width:${Math.min(100,s.suit/1.15*100).toFixed(0)}%"></b></span>`:''}<span class="num">${b.tier==='A'||b.id==='port'?paybackLabel(s.payback):money(s.cost)}</span></button>`).join('')}</div>`;
  html+=section('Queue',`<span class="dim">${econ.queue.length} project${econ.queue.length===1?'':'s'}</span>`)+(econ.queue.length?`<div class="queue">${econ.queue.map((p,i)=>queueRow(ctx,p,i)).join('')}</div>`:'<p class="help">Nothing is being built. Pick a project above, or press “Build here” on a city.</p>');
  html+=`<div class="build-policy"><label class="check-field"><input type="checkbox" data-input="build-borrow" ${econ.borrowBuild?'checked':''}> Let builders borrow when the treasury runs dry</label><label class="field inline">Keep in reserve <select data-input="build-reserve">${[0,.1,.25,.5].map(v=>`<option value="${v}" ${econ.reserve===v?'selected':''}>${v?pct(v,0)+' of a year’s revenue':'Nothing'}</option>`).join('')}</select></label></div>`;
  return html+fund(ctx);
}

/* ---------- auto-build fund ---------- */
function fund(ctx){
  const {econ,money,snap,rt}=ctx,f=ensureFund(econ);
  let html=`<div id="auto-fund">${section(`${icon('robot')}Auto-build fund`,`<span class="dim">${money(f.share*snap.revenue.total/12)}/month</span>`)}<p class="help">Set aside a share of revenue; standing directives spend it on projects for you. Fund projects never touch the treasury.</p>`;
  html+=`<div class="segmented" role="group" aria-label="Share of revenue">${FUND_SHARES.map(v=>`<button data-act="fund-share" data-share="${v}" aria-pressed="${f.share===v}">${v?pct(v,0):'Off'}</button>`).join('')}</div>`;
  html+=`<div class="fund-stats"><span>${icon('coins','icon-inline')}Balance <strong>${money(f.balance)}</strong></span><span>${icon('hammer','icon-inline')}Started <strong>${f.built}</strong></span><span>Spent <strong>${money(f.spent)}</strong></span></div>`;
  html+=`<div class="chip-row">${Object.entries(PRESETS).map(([k,p])=>`<button class="preset" data-act="fund-preset" data-preset="${k}">${esc(p.name)}</button>`).join('')}</div>`;
  const provinces=[...rt.provinces.values()].sort((a,b)=>a.name.localeCompare(b.name));
  html+=f.directives.length?`<div class="directives">${f.directives.map(d=>{const cand=d.on?directiveCandidate(ctx.world,econ,d):null,type=DIRECTIVE_BY_ID[d.type];return `<div class="directive${d.on?'':' off'}"><div class="directive-row"><label class="switch" title="On or off"><input type="checkbox" data-input="dir-on" data-id="${d.id}" ${d.on?'checked':''}><span></span></label>
      <select data-input="dir-type" data-id="${d.id}" aria-label="Build">${DIRECTIVE_TYPES.map(t=>`<option value="${t.id}" ${t.id===d.type?'selected':''}>${esc(t.name)}</option>`).join('')}</select>
      <select data-input="dir-where" data-id="${d.id}" aria-label="Where">${WHERE.map(w=>`<option value="${w.id}" ${w.id===d.where?'selected':''}>${esc(w.name)}</option>`).join('')}</select>
      ${d.where==='province'?`<select data-input="dir-target" data-id="${d.id}" aria-label="Province">${provinces.map(p=>`<option value="${p.id}" ${+d.target===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`:d.where==='resource'?`<select data-input="dir-target" data-id="${d.id}" aria-label="Resource">${RESOURCE_IDS.map(r=>`<option value="${r}" ${d.target===r?'selected':''}>${esc(GOOD_BY_ID[r].name)}</option>`).join('')}</select>`:''}
      <button class="icon-button" data-act="dir-remove" data-id="${d.id}" aria-label="Remove directive">${icon('close')}</button></div>
      <div class="directive-row small"><label>Weight <select data-input="dir-weight" data-id="${d.id}">${[.5,1,2,3].map(v=>`<option value="${v}" ${d.weight===v?'selected':''}>${v}×</option>`).join('')}</select></label><label>At once <select data-input="dir-max" data-id="${d.id}">${[1,2,3,4].map(v=>`<option value="${v}" ${d.max===v?'selected':''}>${v}</option>`).join('')}</select></label>${type?.building||d.type==='best'||d.type==='port'?`<label>Max payback <select data-input="dir-payback" data-id="${d.id}">${[8,15,25,40].map(v=>`<option value="${v}" ${d.payback===v?'selected':''}>${v} yr</option>`).join('')}</select></label>`:''}<label>Size <select data-input="dir-size" data-id="${d.id}">${SIZES.map(s=>`<option value="${s.id}" ${d.size===s.id?'selected':''}>${s.name}</option>`).join('')}</select></label><span class="dim">${d.built} built</span></div>
      <small class="dim">${cand?`Next: ${esc(BUILDING_BY_ID[cand.type].name)} in ${esc(cand.placeName)} for ${money(cand.cost)}${cand.cost>f.balance?' (saving up)':''}`:d.on?'No suitable site right now.':'Off.'}</small></div>`;}).join('')}</div>`:'<p class="help">No directives yet. Pick a preset or add one.</p>';
  html+=`<button data-act="dir-add" ${f.directives.length>=8?'disabled':''}>${icon('plus')}Add directive</button>`;
  if(f.log.length)html+=`<ul class="event-log compact">${f.log.slice(0,6).map(l=>`<li><span>${esc(BUILDING_BY_ID[l.type]?.name||l.type)} · ${esc(l.place)}</span><strong>${money(l.cost)}</strong></li>`).join('')}</ul>`;
  return html+'</div>';
}
const refreshLens=ctx=>{const b=BUILDING_BY_ID[ctx.ui.build.type];if(b&&!b.where.includes('route'))ctx.atlas.custom(siteLens(ctx,b));else ctx.atlas.custom(null);};
export const handlers={
  'build-tier':(ctx,d)=>{ctx.ui.build.tier=d.tier;const first=BUILDINGS.find(x=>x.tier===d.tier);if(BUILDING_BY_ID[ctx.ui.build.type]?.tier!==d.tier&&first){ctx.ui.build.type=first.id;ctx.ui.build.place='';}refreshLens(ctx);ctx.rerender();},
  'build-type':(ctx,d)=>{ctx.ui.build.type=d.type;ctx.ui.build.place='';refreshLens(ctx);ctx.rerender();},
  'build-size':(ctx,d)=>{ctx.ui.build.size=+d.size;refreshLens(ctx);ctx.rerender();},
  'build-queue':ctx=>{const b=ctx.ui.build,r=queueProject(ctx.world,ctx.econ,b.type,b.place,b.size);if(ctx.act(r)){ctx.live();refreshLens(ctx);}},
  'build-cancel':(ctx,d)=>ctx.act(cancelProject(ctx.world,ctx.econ,+d.id)),
  'build-move':(ctx,d)=>ctx.act(moveProject(ctx.world,ctx.econ,+d.id,+d.delta)),
  'build-toggle':(ctx,d)=>ctx.act(toggleProject(ctx.world,ctx.econ,+d.id,d.key)),
  'build-site':(ctx,d)=>{ctx.ui.build.place=d.place;ctx.rerender();},
  'scroll-fund':()=>document.getElementById('auto-fund')?.scrollIntoView({behavior:'smooth'}),
  'fund-share':(ctx,d)=>ctx.act(setFundShare(ctx.econ,+d.share)),
  'fund-preset':(ctx,d)=>ctx.act(applyPreset(ctx.econ,d.preset)),
  'dir-add':ctx=>ctx.act(addDirective(ctx.econ,{type:'best',where:'any'})),
  'dir-remove':(ctx,d)=>ctx.act(removeDirective(ctx.econ,+d.id)),
};
const dir=key=>(ctx,value,el,commit)=>{if(commit)ctx.act(updateDirective(ctx.econ,+el.dataset.id,{[key]:value}));};
export const inputs={
  'build-place':(ctx,value,el,commit)=>{if(!commit)return;ctx.ui.build.place=value;ctx.rerender();},
  'build-borrow':(ctx,value,el,commit)=>{if(!commit)return;setBuildPolicy(ctx.world,ctx.econ,{borrowBuild:value});ctx.rerender();},
  'build-reserve':(ctx,value,el,commit)=>{if(!commit)return;setBuildPolicy(ctx.world,ctx.econ,{reserve:+value});ctx.rerender();},
  'dir-on':dir('on'),'dir-type':dir('type'),'dir-where':dir('where'),'dir-target':dir('target'),'dir-weight':dir('weight'),'dir-max':dir('max'),'dir-payback':dir('payback'),'dir-size':dir('size'),
};
