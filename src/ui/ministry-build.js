import {esc,compact,pct,meter,stat,dayLabel,paybackLabel} from './ministry-kit.js';
import {BUILDINGS,BUILDING_BY_ID,SIZES,TIER_NAMES} from '../data/buildings.js';
import {quoteProject,queueProject,cancelProject,moveProject,toggleProject,setBuildPolicy} from '../game/economy/sim.js';
import {TUNING} from '../game/economy/model.js';
const STATUS={building:'Building',queued:'Waiting for a free crew',capacity:'Waiting for builders',funds:'Waiting for funds',paused:'Paused',unrest:'Halted by unrest'};
const BLOCKER={capacity:'Builders are the bottleneck. Expand Construction & materials, or build less at once.',funds:'Projects are waiting for money. Raise revenue, borrow, or lower the cash reserve.',queued:'Every crew is busy. Administrative capacity decides how many projects run at once.',unrest:'Unrest is stopping work in some places.'};
const kindLabel=b=>b.where.includes('route')?'route':b.where.includes('rural')&&!b.where.includes('city')?'province':'city';

function placeOptions(ctx,b){
  const {snap,rt,econ}=ctx;
  if(b.where.includes('route'))return rt.routes.filter(r=>!r.maritime&&(econ.routeLevels[r.id]||0)<3).sort((a,c)=>c.volume0-a.volume0).slice(0,120).map(r=>({value:`r${r.id}`,label:`${r.fromName} – ${r.toName} (level ${econ.routeLevels[r.id]||0})`}));
  return snap.places.filter(p=>b.where.includes(p.kind)).sort((a,c)=>c.out-a.out).slice(0,200).map(p=>({value:p.key,label:`${p.name} · ${compact(p.out)} WU · ${p.slots-p.used-econ.queue.filter(q=>q.place===p.key).length} slots free`}));
}
function bestSites(ctx,b){
  const {world,econ,snap}=ctx;if(b.where.includes('route')||b.tier==='B')return [];
  const list=[];for(const p of snap.places){if(!b.where.includes(p.kind))continue;const q=quoteProject(world,econ,b.id,p.key,ctx.ui.build.size);if(q.ok)list.push(q);}
  return (b.tier==='A'?list.sort((a,c)=>a.payback-c.payback):list.sort((a,c)=>c.cost-a.cost)).slice(0,6);
}
function queueRow(ctx,p,index){
  const b=BUILDING_BY_ID[p.type],pctDone=p.done/p.work,remaining=p.work-p.done,rate=p.work/p.days*(p.rush?TUNING.rush[0]:1),eta=p.status==='building'?remaining/rate:null;
  return `<div class="queue-row ${p.status}"><div class="queue-main"><span class="tier t${b.tier}" title="${TIER_NAMES[b.tier]}">${b.tier}</span><div><strong>${esc(b.name)}</strong><small>${esc(p.placeName)} · ${SIZES[p.size-1].name}</small></div></div>${meter(pctDone*100,{className:'queue-meter',label:'Progress'})}<div class="queue-info"><span>${STATUS[p.status]||p.status}${p.rush?' · rushed':''}</span><span>${Math.round(pctDone*100)}%${eta!==null?` · about ${dayLabel(eta)}`:''}</span></div><div class="queue-tools"><button data-act="build-move" data-id="${p.id}" data-delta="-1" aria-label="Move up" ${index===0?'disabled':''}>▲</button><button data-act="build-move" data-id="${p.id}" data-delta="1" aria-label="Move down" ${index===ctx.econ.queue.length-1?'disabled':''}>▼</button><button data-act="build-toggle" data-id="${p.id}" data-key="paused" aria-pressed="${p.paused}" title="Pause">${p.paused?'▶':'⏸'}</button><button data-act="build-toggle" data-id="${p.id}" data-key="rush" aria-pressed="${p.rush}" title="Rush: 50% faster, 30% dearer">⚡</button><button data-act="build-cancel" data-id="${p.id}" aria-label="Cancel project" title="Cancel (half of spending is recovered)">✕</button></div></div>`;
}
export function render(ctx){
  const {snap,econ,ui,money}=ctx,b=BUILDING_BY_ID[ui.build.type]||BUILDINGS[0],options=placeOptions(ctx,b);
  if(ui.build.place&&!options.some(o=>o.value===ui.build.place)){
    const key=ui.build.place,place=snap.index.get(key),route=key[0]==='r'&&ctx.rt.routeById.get(+key.slice(1));
    if(place&&b.where.includes(place.kind))options.unshift({value:key,label:`${place.name} · ${compact(place.out)} WU`});
    else if(route&&b.where.includes('route'))options.unshift({value:key,label:`${route.fromName} – ${route.toName}`});
    else ui.build.place='';
  }
  if(!ui.build.place&&options.length)ui.build.place=options[0].value;
  const blockers=econ.queue.map(p=>p.status).filter(s=>BLOCKER[s]),blocker=blockers.length?BLOCKER[blockers.sort((a,c)=>blockers.filter(x=>x===c).length-blockers.filter(x=>x===a).length)[0]]:'';
  const active=econ.queue.filter(p=>p.status==='building').length;
  let html=`<div class="kit-grid">${stat('Build capacity',`${money(snap.build.capacity)} a day`,`${pct(snap.build.capacity*365/Math.max(1,snap.gdp),1)} of output a year`)}${stat('Crews at work',`${active} of ${snap.build.slots}`,'set by administration')}${stat('Queued',String(econ.queue.length),`${money(econ.queue.reduce((s,p)=>s+p.work-p.done,0))} left to spend`)}${stat('Public works',money(snap.build.stock),`upkeep ${money(snap.spending.items.find(i=>i.id==='upkeep').amount)} a year`)}</div>`;
  html+=`<p class="help">Builders are paid from the treasury as work proceeds. The bigger your construction and heavy industry, the faster you can build. ${blocker?`<strong>${esc(blocker)}</strong>`:''}</p>`;
  html+=`<div class="build-policy"><label class="check-field"><input type="checkbox" data-input="build-borrow" ${econ.borrowBuild?'checked':''}> Let builders borrow when the treasury runs dry</label><label class="field inline">Keep in reserve <select data-input="build-reserve">${[0,.1,.25,.5].map(v=>`<option value="${v}" ${econ.reserve===v?'selected':''}>${v?pct(v,0)+' of a year’s revenue':'Nothing'}</option>`).join('')}</select></label></div>`;
  html+=`<div class="info-section-title">Queue</div>${econ.queue.length?`<div class="queue">${econ.queue.map((p,i)=>queueRow(ctx,p,i)).join('')}</div>`:'<p class="help">Nothing is being built. Choose a project below, or press “Build here” on a city.</p>'}`;
  html+='<div class="info-section-title">New project</div>';
  const groups=['A','B','C'].map(tier=>`<optgroup label="${TIER_NAMES[tier]}">${BUILDINGS.filter(x=>x.tier===tier).map(x=>`<option value="${x.id}" ${x.id===b.id?'selected':''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
  html+=`<div class="build-form"><label class="field">Project<select data-input="build-type">${groups}</select></label><p class="help">${esc(b.summary)}</p><label class="field">${kindLabel(b)==='route'?'Trade route':kindLabel(b)==='province'?'Province':'Place'}<select data-input="build-place">${options.map(o=>`<option value="${esc(o.value)}" ${o.value===ui.build.place?'selected':''}>${esc(o.label)}</option>`).join('')||'<option value="">Nowhere suitable</option>'}</select></label>${b.where.includes('route')?'':`<div class="segmented" role="group" aria-label="Project size">${SIZES.map(s=>`<button data-act="build-size" data-size="${s.id}" aria-pressed="${s.id===ui.build.size}">${s.name}</button>`).join('')}</div>`}`;
  const q=ui.build.place?quoteProject(ctx.world,econ,b.id,ui.build.place,ui.build.size):{ok:false,error:'Choose somewhere to build.'};
  if(q.ok){
    const afford=econ.treasury+(econ.borrowBuild?snap.credit.available:0)>=q.cost;
    html+=`<div class="quote"><div><span>Cost</span><strong>${money(q.cost)}</strong></div><div><span>Time</span><strong>${dayLabel(q.days)}</strong></div>${q.tier==='A'?`<div><span>Adds output</span><strong class="up">+${money(q.gain)}/yr</strong></div><div><span>Pays for itself in</span><strong>${paybackLabel(q.payback)}</strong></div>`:q.taxGain>0?`<div><span>Adds revenue</span><strong class="up">+${money(q.taxGain)}/yr</strong></div><div><span>Pays for itself in</span><strong>${paybackLabel(q.payback)}</strong></div>`:`<div><span>Effect</span><strong>${esc(q.detail||'')}</strong></div>`}</div><p class="help">${esc(q.detail||'')}${q.tier==='A'&&q.fit<.6?' · poor site: costs more and yields less':''}</p><button class="primary" data-act="build-queue" ${ctx.econ.queue.length>=60?'disabled':''}>Queue project${afford?'':' (can’t afford yet)'}</button>`;
  }else html+=`<p class="help warn">${esc(q.error)}</p>`;
  html+='</div>';
  const sites=bestSites(ctx,b);
  if(sites.length)html+=`<div class="info-section-title">${b.tier==='A'?'Best sites':'Largest places'}</div><div class="rows">${sites.map(s=>`<button class="site-row" data-act="build-site" data-place="${esc(s.place)}"><span><strong>${esc(s.placeName)}</strong><small>${esc(s.detail||'')}</small></span><span class="num">${b.tier==='A'?paybackLabel(s.payback):money(s.cost)}</span></button>`).join('')}</div>`;
  return html;
}
export const handlers={
  'build-size':(ctx,d)=>{ctx.ui.build.size=+d.size;ctx.rerender();},
  'build-queue':ctx=>{const b=ctx.ui.build,r=queueProject(ctx.world,ctx.econ,b.type,b.place,b.size);if(ctx.act(r))ctx.live();},
  'build-cancel':(ctx,d)=>ctx.act(cancelProject(ctx.world,ctx.econ,+d.id)),
  'build-move':(ctx,d)=>ctx.act(moveProject(ctx.world,ctx.econ,+d.id,+d.delta)),
  'build-toggle':(ctx,d)=>ctx.act(toggleProject(ctx.world,ctx.econ,+d.id,d.key)),
  'build-site':(ctx,d)=>{ctx.ui.build.place=d.place;ctx.rerender();},
};
export const inputs={
  'build-type':(ctx,value)=>{ctx.ui.build.type=value;ctx.ui.build.place='';ctx.rerender();},
  'build-place':(ctx,value)=>{ctx.ui.build.place=value;ctx.rerender();},
  'build-borrow':(ctx,value)=>{setBuildPolicy(ctx.world,ctx.econ,{borrowBuild:value});ctx.rerender();},
  'build-reserve':(ctx,value)=>{setBuildPolicy(ctx.world,ctx.econ,{reserve:+value});ctx.rerender();},
};
