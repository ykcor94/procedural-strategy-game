import {esc,compact,pct,meter,tile,chip,subtabs,section} from './ministry-kit.js';
import {CENSUS_INTERVALS,POLICIES,DEMO_INITIATIVES,AGE_BANDS} from '../data/demography.js';
import {aggregate,censusCost,setCensusInterval,orderEmergencyCensus,setDemoPolicy,launchDemoInitiative,demoInitiativeSlots,projectNation} from '../game/demography/sim.js';
import {diversity,medianAge,shareOf,NO_RELIGION} from '../game/demography/model.js';
import {isoDate,current} from '../game/economy/sim.js';
import {lineChart,donut,pyramid,bars,shareBar,spark} from './charts.js';
import {icon} from './icons.js';
/** Demographics: the census, groups, places, migration, projections and population policy. While the panel
 * is open the map shows your nation's census through a population lens, with other nations greyed out. */
const SUBS=[['overview','Census',icon('clipboard')],['groups','Groups',icon('people')],['places','Places',icon('city')],['migration','Migration',icon('passport')],['projections','Outlook',icon('chart')],['policies','Policy',icon('scales')]];
const LAYERS=[['density','Density'],['growth','Growth'],['urban','Urban'],['culture','Cultures'],['language','Languages'],['religion','Religions'],['diversity','Diversity'],['literacy','Literacy'],['life','Life exp.'],['age','Median age'],['migration','Migration']];
const KIND={c:['culture','Cultures','cultures'],l:['language','Languages','languages'],r:['religion','Religions','religions']};
const year=(ctx,day)=>new Date(Date.parse(ctx.world.meta.game.startDate+'T00:00:00Z')+day*864e5).getUTCFullYear();
const registry=(ctx,k)=>new Map((k==='c'?ctx.civ.cultures:k==='l'?ctx.civ.languages||[]:ctx.civ.religions).map(e=>[e.id,e]));
const gname=(reg,id)=>id===NO_RELIGION?'No religion':reg.get(id)?.name||(id?'Unknown':'Others');
const gcolor=(reg,id)=>reg.get(id)?.color||(id===NO_RELIGION?'#c9c0a8':'#8f968c');
const perK=(v,pop)=>pop?`${(v/pop*1000).toFixed(1)}‰`:'—';

export function onOpen(ctx){if(!ctx.demo)return;ctx.demo.census.fresh=false;ctx.atlas.push(`demo:${ctx.ui.people.layer}`,{group:ctx.ui.people.group});}
export function onClose(ctx){ctx.atlas.pop();}
const lens=ctx=>ctx.atlas.setLens(`demo:${ctx.ui.people.layer}`,{group:ctx.ui.people.group});

export function render(ctx){
  if(!ctx.demo?.census.data)return '<p class="help">The first census is being prepared.</p>';
  const sub=ctx.ui.sub.people,layer=ctx.ui.people.layer;
  const chips=`<div class="layer-chips" role="group" aria-label="Map layer">${icon('atlas')}${LAYERS.map(([id,label])=>`<button data-act="people-layer" data-layer="${id}" aria-pressed="${layer===id&&!ctx.ui.people.group}">${label}</button>`).join('')}</div>`;
  return subtabs(SUBS,sub)+chips+(sub==='groups'?groups(ctx):sub==='places'?places(ctx):sub==='migration'?migration(ctx):sub==='projections'?projections(ctx):sub==='policies'?policies(ctx):overview(ctx));
}

/* ---------- census overview ---------- */
function censusBar(ctx){
  const {demo,snap,money}=ctx,c=demo.census,data=c.data,next=Math.max(0,c.next-demo.day),cost=censusCost(demo,snap.revenue.total),em=censusCost(demo,snap.revenue.total,true);
  return `<section class="census-bar"><div><span class="kicker">${icon('clipboard','icon-inline')}Census of ${year(ctx,data.day)}</span><strong>${data.accuracy>=1?'Exact count':`About ${Math.round(data.accuracy*100)}% accurate`}</strong><small>${c.emergency?`Emergency census under way: ${c.emergency.left} month${c.emergency.left===1?'':'s'} left`:`Next census in ${next>=365?`${(next/365).toFixed(1)} years`:`${Math.ceil(next/30)} months`} (${isoDate(ctx.world,c.next)})`}</small></div>
    <label class="field inline">Every <select data-input="census-interval">${CENSUS_INTERVALS.map(y=>`<option value="${y}" ${c.interval===y?'selected':''}>${y} year${y>1?'s':''} · ${money(cost/y)}/yr</option>`).join('')}</select></label>
    <button data-act="census-now" ${c.emergency?'disabled':''} data-tip="A census now takes three months and costs ${esc(money(em))}.">${icon('clipboard')}Census now</button></section>`;
}
function overview(ctx){
  const {demo}=ctx,c=demo.census,n=c.data.national,prev=c.prev?.national,hist=c.history,natural=n.births-n.deaths,net=(n.immigrants||0)-(n.emigrants||0);
  let html=censusBar(ctx);
  html+=`<div class="tiles">
    ${tile('Population',compact(n.pop),{icon:icon('people'),chip:chip(n.growth||0,{digits:2,tip:'Yearly growth since the last census'}),spark:spark(hist.map(h=>h.pop),{color:'var(--accent)'})})}
    ${tile('Urban',pct(n.urban,0),{icon:icon('city'),sub:prev?`${pct(prev.urban,0)} last census`:'',spark:spark(hist.map(h=>h.urban),{color:'#6a8fd0'})})}
    ${tile('Natural change',n.births?perK(natural,n.pop):'—',{icon:icon('baby'),sub:n.births?`${perK(n.births,n.pop)} births · ${perK(n.deaths,n.pop)} deaths`:'registered from the first full year',tone:n.births&&natural<0?'bad':n.births?'good':''})}
    ${tile('Net migration',n.births?perK(net,n.pop):'—',{icon:icon('passport'),sub:`${compact(n.immigrants||0)} in · ${compact(n.emigrants||0)} out`,act:'sub',data:{sub:'migration'},tone:net<0?'bad':''})}
    ${tile('Life expectancy',`${n.life.toFixed(1)} yr`,{icon:icon('heart'),spark:spark(hist.map(h=>h.life),{color:'var(--danger)'})})}
    ${tile('Literacy',pct(n.lit,0),{icon:icon('book'),spark:spark(hist.map(h=>h.lit),{color:'#a77bd0'})})}
    ${tile('Fertility',`${n.fert.toFixed(2)}`,{icon:icon('cradle'),sub:n.fert<2.1?'children per woman · below replacement':'children per woman'})}
    ${tile('Median age',`${medianAge(n.bands).toFixed(1)}`,{icon:icon('pyramid'),sub:`${pct(n.bands[4]/n.pop,0)} over 65`})}
  </div>`;
  html+=section('Age structure',prev?'<span class="dim">outline: previous census</span>':'')+`<div class="chart-card">${pyramid(n.bands,{previous:c.prev?.national?.bands||null,labels:AGE_BANDS.map(b=>b.range),format:v=>compact(v)})}</div>`;
  if(hist.length>1)html+=section('Census history')+`<div class="chart-card">${lineChart([{label:'Population',color:'var(--accent)',values:hist.map(h=>h.pop)}],{labels:hist.map(h=>String(year(ctx,h.day))),format:v=>compact(v)})}</div>`;
  html+=section('Who lives here','<button class="link-button" data-act="sub" data-sub="groups">Groups ›</button>')+`<div class="donut-row">${['c','l','r'].map(k=>{const reg=registry(ctx,k);return `<div>${donut(n.groups[k].map(([id,s])=>({label:gname(reg,id),value:s,color:gcolor(reg,id),act:'people-group',data:{kind:k,group:id}})),{size:96,thickness:15,center:pct(n.groups[k][0]?.[1]||0,0),sub:KIND[k][1].toLowerCase()})}<small>${esc(gname(reg,n.groups[k][0]?.[0]))}</small></div>`;}).join('')}</div>`;
  return html;
}

/* ---------- groups ---------- */
function groups(ctx){
  const {demo}=ctx,n=demo.census.data.national,sat=new Map((demo.satisfaction||[]).map(g=>[`${g.kind[0]}:${g.id}`,g.sat])),growth=n.groupGrowth||{};
  let html=`<p class="help">Shares from the census of ${year(ctx,demo.census.data.day)}. Click a group to map where it lives. Minorities’ contentment depends on your population policy and feeds national stability.</p>`;
  for(const k of ['c','l','r']){const reg=registry(ctx,k),list=n.groups[k].filter(([,s])=>s>.002);
    html+=section(KIND[k][1],`<span class="dim">diversity ${diversity(n.groups[k]).toFixed(2)}</span>`)+shareBar(list.map(([id,s])=>({label:gname(reg,id),value:s,color:gcolor(reg,id)})),{height:12});
    html+=`<div class="group-list">${list.map(([id,s])=>{const g=growth[k]?.[id],st=sat.get(`${k}:${id}`);return `<button class="group-row${ctx.ui.people.group===id&&ctx.ui.people.kind===k?' active':''}" data-act="people-group" data-kind="${k}" data-group="${id}"><i style="background:${gcolor(reg,id)}"></i><span><strong>${esc(gname(reg,id))}</strong><small>${compact(s*n.pop)} people${g!=null?` · ${(g*100).toFixed(2)}%/yr`:''}</small></span><b>${pct(s,1)}</b>${st!=null?`<span class="sat-bar" data-tip="Contentment ${Math.round(st)} / 100"><b class="${st<40?'down':st<55?'flat':'up'}" style="width:${st}%"></b></span>`:'<span></span>'}</button>`;}).join('')}</div>`;}
  return html;
}

/* ---------- places ---------- */
function places(ctx){
  const {demo,civ}=ctx,data=demo.census.data,p=ctx.ui.people,q=(p.search||'').toLowerCase(),regC=registry(ctx,'c'),regL=registry(ctx,'l'),regR=registry(ctx,'r'),byProv=new Map();
  for(const u of Object.values(data.places)){let g=byProv.get(u.province);if(!g){g={id:u.province,name:civ.provinces.find(x=>x.id===u.province)?.name||'?',units:[]};byProv.set(u.province,g);}g.units.push(u);}
  const rows=[...byProv.values()].map(g=>{const a=aggregate(g.units);a.growth=g.units.reduce((s,u)=>s+u.growth*u.pop,0)/Math.max(1,a.pop);return {...g,a,mig:a.migIn-a.migOut};}).filter(r=>!q||r.name.toLowerCase().includes(q)||r.units.some(u=>u.name.toLowerCase().includes(q)));
  const key={pop:r=>r.a.pop,growth:r=>r.a.growth,urban:r=>r.a.urban,lit:r=>r.a.lit,div:r=>diversity(r.a.groups.c),mig:r=>r.a.pop?r.mig/r.a.pop:0,name:r=>r.name}[p.sort]||(r=>r.a.pop);
  rows.sort((a,b)=>p.sort==='name'?a.name.localeCompare(b.name)*p.dir*-1:(key(a)-key(b))*p.dir);
  const chipOf=(reg,groups)=>{const [id,s]=groups[0]||[0,0];return `<span class="gchip" style="--c:${gcolor(reg,id)}" data-tip="${esc(groups.slice(0,3).map(([g,v])=>`${gname(reg,g)} ${Math.round(v*100)}%`).join(' · '))}">${esc(gname(reg,id))} ${Math.round(s*100)}%</span>`;};
  const head=[['name','Place'],['pop','People'],['growth','Growth'],['urban','Urban'],['div','Diversity'],['lit','Literacy'],['mig','Migration']].map(([k,l])=>`<th><button data-act="people-sort" data-key="${k}">${l}${p.sort===k?(p.dir<0?' ▾':' ▴'):''}</button></th>`).join('');
  const row=(name,a,growth,mig,key,sub,cls='',toggle='')=>`<tr class="${cls}" data-act="fly" data-key="${key}" data-hover-key="${key}" tabindex="0"><td>${toggle}<strong>${esc(name)}</strong><small>${chipOf(regC,a.groups.c)}${chipOf(regL,a.groups.l)}${chipOf(regR,a.groups.r)}${sub}</small></td><td>${compact(a.pop)}</td><td>${(growth*100).toFixed(2)}%</td><td>${pct(a.urban,0)}</td><td>${diversity(a.groups.c).toFixed(2)}</td><td>${pct(a.lit,0)}</td><td class="${mig<0?'down':'up'}">${perK(mig,a.pop)}</td></tr>`;
  let html=`<div class="toolbar"><input type="search" data-input="people-search" placeholder="Find a province or city" value="${esc(p.search||'')}"></div><div class="table-scroll"><table class="kit-table people-table"><thead><tr>${head}</tr></thead><tbody>`;
  for(const r of rows.slice(0,120)){const open=p.open===r.id,cityCount=r.units.filter(u=>u.urban).length;html+=row(r.name,r.a,r.a.growth,r.mig,`p${r.id}`,'','',cityCount?`<button class="row-toggle" data-act="people-open" data-id="${r.id}" aria-expanded="${open}" aria-label="Show cities">${open?'▾':'▸'}</button>`:'');if(open||q)for(const u of r.units.filter(u=>u.urban).sort((a,b)=>b.pop-a.pop))html+=row(`↳ ${u.name}`,aggregate([u]),u.growth,(u.last?.mi||0)-(u.last?.mo||0),u.key,'','city-row');}
  html+='</tbody></table></div><p class="help">Census figures. ▸ lists a province’s cities; click a row to open it on the map.</p>';
  return html;
}

/* ---------- migration ---------- */
function migration(ctx){
  const {demo,ws,wctx,econ}=ctx,f=demo.flows;
  let html=`<div class="tiles compact">${tile('Arriving',`${compact(f.imm)}/yr`,{icon:icon('passport'),sub:'immigrants and refugees (estimate)'})}${tile('Leaving',`${compact(f.emi)}/yr`,{icon:icon('down'),sub:'emigrants (estimate)'})}${tile('Refugees',`${compact(f.ref)}/yr`,{icon:icon('tent')})}${tile('To the cities',`${compact(f.urban)}/yr`,{icon:icon('city'),sub:`${compact(f.internal)}/yr between provinces`})}</div>`;
  html+=`<p class="help">Flows are the registry’s running estimates; the census confirms them. People come for wages and stability, from neighbours and partners; they leave when you are poorer or less stable than the world around you.</p>`;
  const sources=(wctx.links.get(econ.nation)||[]).slice(0,10).map(l=>{const n=ws?.nations[l.id];if(!n||!n.pop)return null;const pc=n.gdp/n.pop,push=Math.max(.05,1+.6*Math.log(Math.max(.05,current(ctx.world,econ).gdpPerCapita/Math.max(1e-6,pc)))+(50-n.stab)/60);return {id:l.id,v:l.conn*Math.sqrt(n.pop)*push};}).filter(Boolean).sort((a,b)=>b.v-a.v).slice(0,6),total=sources.reduce((s,x)=>s+x.v,0)||1;
  if(sources.length)html+=section('Where newcomers come from')+bars(sources.map(s=>({label:ctx.nationById(s.id)?.name||'?',icon:ctx.flag(s.id,11),value:s.v/total,valueLabel:pct(s.v/total,0),color:'#8ccfc0'})));
  html+=policyBlock(ctx,'immigration')+policyBlock(ctx,'refugees');
  return html;
}

/* ---------- projections ---------- */
function projections(ctx){
  const {demo,econ,nation}=ctx,p=ctx.ui.people,proj=projectNation(demo,nation,{years:p.years,scenario:p.scenario,services:econ.spend.services}),now=proj[0],end=proj.at(-1),y0=year(ctx,demo.census.data.day);
  let html=`<div class="toolbar"><div class="segmented" role="group" aria-label="Scenario">${[['current','Current policy'],['natalist','With family allowance'],['open','Open borders'],['closed','Closed borders']].map(([id,l])=>`<button data-act="people-scenario" data-scenario="${id}" aria-pressed="${p.scenario===id}">${l}</button>`).join('')}</div><div class="segmented" role="group" aria-label="Horizon">${[10,20,30].map(y=>`<button data-act="people-years" data-years="${y}" aria-pressed="${p.years===y}">${y} yr</button>`).join('')}</div></div>`;
  html+=`<div class="tiles compact">${tile(`Population ${y0+p.years}`,compact(end.pop),{icon:icon('people'),chip:chip(Math.pow(end.pop/now.pop,1/p.years)-1,{digits:2,tip:'Average yearly change'})})}${tile('Median age',`${medianAge(now.bands).toFixed(0)} → ${medianAge(end.bands).toFixed(0)}`,{icon:icon('pyramid')})}${tile('Working age',`${pct((now.bands[1]+now.bands[2]+now.bands[3])/now.pop,0)} → ${pct((end.bands[1]+end.bands[2]+end.bands[3])/end.pop,0)}`,{icon:icon('factory'),sub:'aged 15–64'})}${tile('Fertility',`${now.fert.toFixed(2)} → ${end.fert.toFixed(2)}`,{icon:icon('cradle')})}</div>`;
  html+=section('Population outlook','<span class="dim">band widens with uncertainty</span>')+`<div class="chart-card">${lineChart([{label:'Projected',color:'var(--accent)',values:proj.map(x=>x.pop)}],{labels:proj.map(x=>String(y0+x.year)),format:v=>compact(v),band:proj.map(x=>({lo:x.pop*(1-x.spread),hi:x.pop*(1+x.spread)}))})}</div>`;
  for(const k of ['c','r']){const reg=registry(ctx,k),ids=now.groups[k].slice(0,4).map(e=>e[0]);
    html+=section(`${KIND[k][1]} outlook`)+`<div class="chart-card">${lineChart(ids.map(id=>({label:gname(reg,id),color:gcolor(reg,id),values:proj.map(x=>shareOf(x.groups[k],id)*100),format:v=>`${v.toFixed(1)}%`})),{labels:proj.map(x=>String(y0+x.year)),format:v=>`${v.toFixed(0)}%`,zero:true})}</div>`;}
  html+=section(`Age structure in ${y0+p.years}`,'<span class="dim">outline: today</span>')+`<div class="chart-card">${pyramid(end.bands,{previous:now.bands,labels:AGE_BANDS.map(b=>b.range),format:v=>compact(v)})}</div>`;
  return html+'<p class="help">Projections start from the last census and assume today’s policies, development and migration continue. They know nothing of wars, booms or famines.</p>';
}

/* ---------- policy ---------- */
function policyBlock(ctx,axisId){
  const axis=POLICIES.find(a=>a.id===axisId),now=ctx.demo.policies[axisId];
  return section(`${icon(axis.icon)}${axis.name}`)+`<p class="help">${esc(axis.blurb)}</p><div class="option-cards">${axis.options.map(o=>{const fx=Object.entries(o.fx).map(([k,v])=>fxText(k,v)).filter(Boolean);return `<button class="option-card${o.id===now?' active':''}" data-act="people-policy" data-axis="${axisId}" data-choice="${o.id}" aria-pressed="${o.id===now}"><strong>${esc(o.name)}</strong><small>${esc(o.desc)}</small><span class="fx-list">${fx.map(([t,c])=>`<span class="fx ${c}">${esc(t)}</span>`).join('')}</span></button>`;}).join('')}</div>`;
}
function fxText(k,v){
  const map={imm:['Immigration ×'+v,v>=1?'up':'down'],skilled:['Skilled arrivals',''],stab:[`Stability ${v>0?'+':''}${v}`,v>0?'up':'down'],cost:[`Costs ${(v*100).toFixed(1)}% of revenue`,'down'],assim:[`Assimilation ×${v}`,''],lang:[`Language shift ×${v}`,''],conv:[v?`Conversion ×${v}`:'No conversion',''],secular:[`Secularisation ×${v}`,''],minority:[`Minority contentment ${v>0?'+':''}${v}`,v>0?'up':'down'],refugees:[v?`Refugees ${Math.round(v*100)}%`:'No refugees','']};
  return map[k]||null;
}
function policies(ctx){
  const {demo,snap,money,rt}=ctx,slots=demoInitiativeSlots(rt.inst),active=demo.initiatives.active;
  let html=['minorities','language','religion'].map(a=>policyBlock(ctx,a)).join('');
  html+=section('Population programmes',`<span class="dim">${active.length} of ${slots} slots</span>`);
  if(active.length)html+='<div class="cards">'+active.map(a=>{const def=DEMO_INITIATIVES.find(d=>d.id===a.id);return `<div class="card program active"><div class="card-head"><span class="card-icon">${icon(def.icon)}</span><strong>${esc(def.name)}</strong></div><small>${a.left} of ${a.total} months left${a.target?` · ${esc(def.scope==='city'?ctx.civ.cities.find(c=>c.id===a.target)?.name||'':ctx.civ.provinces.find(p=>p.id===a.target)?.name||'')}`:''}</small>${meter((a.total-a.left)/a.total*100,{label:def.name})}</div>`;}).join('')+'</div>';
  const provinces=[...rt.provinces.values()].sort((a,b)=>a.name.localeCompare(b.name)),cities=Object.values(demo.places).filter(u=>u.urban).sort((a,b)=>a.name.localeCompare(b.name));
  html+='<div class="cards">'+DEMO_INITIATIVES.map(def=>{const cost=def.cost*snap.revenue.total,wait=(demo.initiatives.cooldown[def.id]||0)>demo.day,running=def.scope==='nation'&&active.some(a=>a.id===def.id),choice=ctx.ui.people[`t:${def.id}`];
    const picker=def.scope==='province'?`<select data-input="people-target" data-id="${def.id}" aria-label="Province">${provinces.map(p=>`<option value="${p.id}" ${+choice===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`:def.scope==='city'?`<select data-input="people-target" data-id="${def.id}" aria-label="City">${cities.map(u=>`<option value="${u.id}" ${+choice===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select>`:'';
    return `<div class="card program"><div class="card-head"><span class="card-icon">${icon(def.icon)}</span><strong>${esc(def.name)}</strong><span class="chip flat">${money(cost)}</span></div><small>${esc(def.desc)}</small><span class="fx">${def.months} months</span><div class="card-actions">${picker}<button class="primary" data-act="people-launch" data-id="${def.id}" ${wait||running||ctx.econ.treasury<cost||active.length>=slots?'disabled':''}>${wait?'Cooling down':running?'Running':'Launch'}</button></div></div>`;}).join('')+'</div>';
  return html;
}

export const handlers={
  'people-layer':(ctx,d)=>{ctx.ui.people.layer=d.layer;ctx.ui.people.group=0;lens(ctx);ctx.rerender();},
  'people-group':(ctx,d)=>{const k=d.kind,id=+d.group;if(ctx.ui.people.group===id&&ctx.ui.people.kind===k){ctx.ui.people.group=0;}else{ctx.ui.people.group=id;ctx.ui.people.kind=k;ctx.ui.people.layer=KIND[k][0];}lens(ctx);ctx.rerender();},
  'people-open':(ctx,d)=>{ctx.ui.people.open=ctx.ui.people.open===+d.id?null:+d.id;ctx.rerender();},
  'people-sort':(ctx,d)=>{const p=ctx.ui.people;if(p.sort===d.key)p.dir*=-1;else{p.sort=d.key;p.dir=d.key==='name'?1:-1;}ctx.rerender();},
  'people-scenario':(ctx,d)=>{ctx.ui.people.scenario=d.scenario;ctx.rerender();},
  'people-years':(ctx,d)=>{ctx.ui.people.years=+d.years;ctx.rerender();},
  'people-policy':(ctx,d)=>ctx.act(setDemoPolicy(ctx.demo,d.axis,d.choice)),
  'census-now':ctx=>ctx.act(orderEmergencyCensus(ctx.demo,ctx.econ,ctx.snap.revenue.total)),
  'people-launch':(ctx,d)=>{const select=document.querySelector(`[data-input="people-target"][data-id="${d.id}"]`);ctx.act(launchDemoInitiative(ctx.demo,ctx.econ,ctx.rt.inst,ctx.snap.revenue.total,d.id,select?+select.value:0,ctx.rt.provinces));},
};
export const inputs={
  'census-interval':(ctx,value,el,commit)=>{if(commit)ctx.act(setCensusInterval(ctx.demo,+value));},
  'people-target':(ctx,value,el)=>{ctx.ui.people[`t:${el.dataset.id}`]=value;},
  'people-search':(ctx,value)=>{ctx.ui.people.search=value;const el=document.querySelector('[data-input="people-search"]'),pos=el.selectionStart;ctx.rerender();const again=document.querySelector('[data-input="people-search"]');again?.focus();again?.setSelectionRange(pos,pos);},
};
