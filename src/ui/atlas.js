import {$,escapeHTML as esc} from './controls.js';
import {clamp} from '../core/geo.js';
import {compact,pct} from './ministry-kit.js';
import {icon,INDUSTRY_ICON} from './icons.js';
import {current} from '../game/economy/sim.js';
import {INDUSTRIES} from '../data/industries.js';
import {GOODS,GOOD_BY_ID,RESOURCE_IDS} from '../data/resources.js';
import {provinceResources,worldTypical} from '../game/resources.js';
import {marketResults,tradeSummary} from '../game/world/market.js';
import {blocOf} from '../game/world/state.js';
import {relationLabel} from '../game/world/diplomacy.js';
import {normalizeGroups,diversity,medianAge} from '../game/demography/model.js';
/** Atlas lenses: economy, resource, trade and demography maps of the running campaign. They live in their
 * own map popover (and in the Demographics panel) rather than the main map-mode list, colour provinces or
 * nations over the political map, and explain every colour with a legend and a hover read-out. */
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const lerp=(a,b,t)=>a.map((v,k)=>Math.round(v+(b[k]-v)*t));
const SEQ=[[236,229,182],[173,211,158],[96,170,154],[58,124,150],[76,79,140],[124,56,118]].map(c=>c);
const DIV=[[198,84,70],[232,170,120],[236,230,206],[130,190,180],[40,128,140]];
export function seq(t){t=clamp(t,0,1)*(SEQ.length-1);const a=Math.min(SEQ.length-2,Math.floor(t));return lerp(SEQ[a],SEQ[a+1],t-a);}
export function div(t){t=(clamp(t,-1,1)+1)/2*(DIV.length-1);const a=Math.min(DIV.length-2,Math.floor(t));return lerp(DIV[a],DIV[a+1],t-a);}
const css=c=>`rgb(${c.join(',')})`;
const MUTE='rgb(118,124,118)';
const seqStops=(lo,hi,fmt)=>({kind:'seq',stops:[0,.25,.5,.75,1].map(t=>({color:css(seq(t)),label:fmt(lo+(hi-lo)*t)}))});
const divStops=(m,fmt)=>({kind:'div',stops:[-1,-.5,0,.5,1].map(t=>({color:css(div(t)),label:fmt(t*m)}))});

/* ---------- data helpers ---------- */
function provincePlaces(snap){const m=new Map();for(const p of snap.places){if(!m.has(p.province))m.set(p.province,[]);m.get(p.province).push(p);}return m;}
/** Census figures grouped by province. */
function censusProvinces(demo){
  const m=new Map(),data=demo?.census.data;if(!data)return m;
  for(const u of Object.values(data.places)){let g=m.get(u.province);if(!g){g={pop:0,urban:0,bands:[0,0,0,0,0],c:[],l:[],r:[],lit:0,life:0,growth:0,mig:0,cities:[]};m.set(u.province,g);}
    g.pop+=u.pop;if(u.urban){g.urban+=u.pop;g.cities.push(u);}for(let k=0;k<5;k++)g.bands[k]+=u.bands[k];for(const k of ['c','l','r'])for(const [id,s] of u.groups[k])g[k].push([id,s*u.pop]);g.lit+=u.lit*u.pop;g.life+=u.life*u.pop;g.growth+=u.growth*u.pop;g.mig+=((u.last?.mi||0)-(u.last?.mo||0));}
  for(const g of m.values()){for(const k of ['c','l','r'])g[k]=normalizeGroups(g[k]);g.lit/=g.pop||1;g.life/=g.pop||1;g.growth/=g.pop||1;g.urbanShare=g.pop?g.urban/g.pop:0;}
  return m;
}
const MIXED=(groups,margin=.2)=>groups.length>1&&groups[0][1]<.62&&groups[0][1]-groups[1][1]<margin;

/* ---------- lens catalogue ---------- */
export const LENS_GROUPS=[
  {id:'economy',name:'Economy',icon:'coins',lenses:[['output','Output per person'],['growth','Growth this year'],['industry','Leading industry'],['jobs','Unemployment'],['projects','Construction'],['world-growth','World growth'],['world-stability','World stability']]},
  {id:'resources',name:'Resources',icon:'pick',lenses:[['res:richest','Richest resource'],...RESOURCE_IDS.map(id=>[`res:${id}`,GOOD_BY_ID[id].name])]},
  {id:'trade',name:'Trade & diplomacy',icon:'handshake',lenses:[['partners','Your trade partners'],['relations','Relations'],['blocs','Trade blocs'],['sanctions','Sanctions'],['dependence','Import dependence']]},
  {id:'people',name:'Population',icon:'people',lenses:[['demo:density','Density'],['demo:growth','Growth'],['demo:urban','Urbanisation'],['demo:culture','Cultures'],['demo:language','Languages'],['demo:religion','Religions'],['demo:diversity','Diversity'],['demo:literacy','Literacy'],['demo:life','Life expectancy'],['demo:age','Median age'],['demo:migration','Migration']]},
];
const LENS_NAMES=Object.fromEntries(LENS_GROUPS.flatMap(g=>g.lenses));

/** Build a lens: {spec for the renderer, legend, describe(provinceId,nationId)}. */
function buildLens(id,camp,world,opts={}){
  const civ=world.meta.civilization,econ=camp.econ,ws=camp.ws,demo=camp.demo,snap=current(world,econ),player=econ.nation,provinces=new Map(civ.provinces.map(p=>[p.id,p])),nations=new Map(civ.nations.map(n=>[n.id,n]));
  const colors=new Map(),nationColors=new Map(),stripes=new Map(),provinceNation=new Map(civ.provinces.map(p=>[p.id,p.nation]));let legend={kind:'none'},describe=()=>'',focus=0,title=LENS_NAMES[id]||'Atlas';
  const byProv=provincePlaces(snap);
  const provinceStat=fn=>{const out=new Map();for(const [pid,list] of byProv)out.set(pid,fn(list));return out;};
  if(id==='output'||id==='growth'||id==='jobs'||id==='industry'||id==='projects'){
    if(id==='output'){const v=provinceStat(l=>{const out=l.reduce((s,p)=>s+p.out,0),pop=l.reduce((s,p)=>s+p.pop,0);return pop?out/pop:0;}),vals=[...v.values()],lo=Math.min(...vals),hi=Math.max(...vals),f=x=>clamp(Math.log(x/lo)/Math.log(Math.max(1.0001,hi/lo)),0,1);for(const [pid,x] of v)colors.set(pid,seq(f(x)));
      const pcs=Object.values(ws.nations).map(n=>n.pop?n.gdp/n.pop:0).filter(x=>x>0),wlo=Math.min(...pcs),whi=Math.max(...pcs);for(const n of Object.values(ws.nations))if(n.id!==player&&n.pop)nationColors.set(n.id,seq(clamp(Math.log((n.gdp/n.pop)/wlo)/Math.log(Math.max(1.0001,whi/wlo)),0,1)).map(c=>Math.round(c*.85+30)));
      legend={...seqStops(lo,hi,x=>compact(x)),note:'Your provinces; other nations are shaded by national output per person.'};describe=(pid,nid)=>v.has(pid)?`${compact(v.get(pid))} WU per person`:ws.nations[nid]?`${compact(ws.nations[nid].gdp/Math.max(1,ws.nations[nid].pop))} WU per person (national)`:'';}
    if(id==='growth'){const v=provinceStat(l=>{const now=l.reduce((s,p)=>s+p.out,0),old=l.reduce((s,p)=>s+(econ.snap[p.key]||p.out),0);return old?now/old-1:0;});for(const [pid,x] of v)colors.set(pid,div(x/.06));for(const n of Object.values(ws.nations))if(n.id!==player)nationColors.set(n.id,div(n.growth/.06));
      legend={...divStops(.06,x=>`${x>0?'+':''}${(x*100).toFixed(0)}%`),note:'Provinces since January; nations by their growth this year.'};describe=(pid,nid)=>v.has(pid)?`${(v.get(pid)*100).toFixed(1)}% since January`:ws.nations[nid]?`${(ws.nations[nid].growth*100).toFixed(1)}% a year`:'';}
    if(id==='jobs'){const v=provinceStat(l=>{const j=l.reduce((s,p)=>s+p.jobs,0);return j?l.reduce((s,p)=>s+p.unemployment*p.jobs,0)/j:0;});for(const [pid,x] of v)colors.set(pid,seq(x/.25));focus=player;legend={...seqStops(0,.25,x=>pct(x,0))};describe=pid=>v.has(pid)?`${pct(v.get(pid))} unemployed`:'';}
    if(id==='industry'){const best=outs=>{let b=0;for(let k=1;k<outs.length;k++)if(outs[k]>outs[b])b=k;return INDUSTRIES[b];},v=provinceStat(l=>{const o=new Float64Array(INDUSTRIES.length);for(const p of l)for(let k=0;k<o.length;k++)o[k]+=p.outs[k];return best(o);});
      for(const [pid,ind] of v)colors.set(pid,rgb(ind.color));for(const n of Object.values(ws.nations))if(n.id!==player)nationColors.set(n.id,rgb(best(n.shares).color).map(c=>Math.round(c*.8+28)));
      const used=new Set([...v.values()].map(i=>i.id));legend={kind:'cat',items:INDUSTRIES.filter(i=>used.has(i.id)).map(i=>({color:i.color,label:i.name,icon:INDUSTRY_ICON[i.id]}))};describe=(pid,nid)=>v.has(pid)?v.get(pid).name:ws.nations[nid]?`${best(ws.nations[nid].shares).name} (national)`:'';}
    if(id==='projects'){const count=new Map();for(const p of econ.queue){const prov=p.place[0]==='p'?+p.place.slice(1):snap.index.get(p.place)?.province;if(prov)count.set(prov,(count.get(prov)||0)+1);}for(const [key,list] of Object.entries(econ.built)){const prov=key[0]==='p'?+key.slice(1):snap.index.get(key)?.province;if(prov)count.set(prov,(count.get(prov)||0)+list.length*.5);}
      for(const pid of byProv.keys())colors.set(pid,seq(clamp((count.get(pid)||0)/6,0,1)));focus=player;legend={kind:'seq',stops:[{color:css(seq(0)),label:'None'},{color:css(seq(.5)),label:'Some'},{color:css(seq(1)),label:'Many'}],note:'Projects queued, and half-weighted projects completed.'};describe=pid=>`${econ.queue.filter(p=>(p.place[0]==='p'?+p.place.slice(1):snap.index.get(p.place)?.province)===pid).length} under way`;}
  }
  else if(id==='world-growth'||id==='world-stability'){
    for(const n of Object.values(ws.nations))nationColors.set(n.id,id==='world-growth'?div(n.growth/.06):seq(n.stab/100));
    legend=id==='world-growth'?divStops(.06,x=>`${x>0?'+':''}${(x*100).toFixed(0)}%`):seqStops(0,100,x=>Math.round(x));
    describe=(pid,nid)=>{const n=ws.nations[nid];return n?id==='world-growth'?`${(n.growth*100).toFixed(1)}% a year`:`Stability ${Math.round(n.stab)}`:'';};
  }
  else if(id.startsWith('res:')){
    const res=provinceResources(world),typ=worldTypical(world),surveyed=pid=>pid in (econ.surveys||{});
    const known=(pid,k)=>!GOODS[k].hidden||surveyed(pid)||res.get(pid).score[k]>1.6*typ[k];
    if(id==='res:richest'){const items=new Set();for(const [pid,rec] of res){let best=-1,score=1.25;for(let k=0;k<RESOURCE_IDS.length;k++){if(RESOURCE_IDS[k]==='stone')continue;const rel=rec.score[k]/(typ[k]||1e-6);if(rel>score&&known(pid,k)){score=rel;best=k;}}if(best>=0){colors.set(pid,rgb(GOODS[best].color));items.add(best);}else colors.set(pid,[150,152,140]);}
      legend={kind:'cat',items:[...items].sort((a,b)=>a-b).map(k=>({color:GOODS[k].color,label:GOODS[k].name,icon:GOODS[k].icon})),note:'The resource each province holds most of, against the world typical. Unsurveyed mineral deposits stay hidden.'};}
    else{const rid=id.slice(4),k=RESOURCE_IDS.indexOf(rid),good=GOOD_BY_ID[rid];let hi=0;for(const rec of res.values())hi=Math.max(hi,rec.score[k]);for(const [pid,rec] of res){if(!known(pid,k)){colors.set(pid,[128,130,124]);continue;}colors.set(pid,lerp([232,228,212],rgb(good.color),clamp(rec.score[k]/Math.max(1e-6,hi*.7),0,1)));}
      legend={kind:'seq',stops:[{color:'rgb(232,228,212)',label:'None'},{color:css(lerp([232,228,212],rgb(good.color),.5)),label:'Some'},{color:good.color,label:'Rich'}],note:`${good.blurb}${good.hidden?' Grey provinces have not been surveyed.':''}`};title=good.name;}
    describe=pid=>{const rec=res.get(pid);if(!rec)return '';const top=RESOURCE_IDS.map((r,k)=>({r,k,rel:rec.score[k]/(typ[k]||1e-6)})).filter(x=>x.rel>1.2&&known(pid,x.k)&&x.r!=='stone').sort((a,b)=>b.rel-a.rel).slice(0,4);return top.length?top.map(x=>`${icon(GOOD_BY_ID[x.r].icon,'icon-inline')}${esc(GOOD_BY_ID[x.r].name)} ×${x.rel.toFixed(1)}`).join('<br>'):'No notable deposits known';};
  }
  else if(['partners','relations','blocs','sanctions','dependence'].includes(id)){
    const res=marketResults(ws);
    if(id==='partners'){const t=res?tradeSummary(ws,res,player):null,max=Math.max(1e-9,...(t?.partners||[]).map(p=>p.value));for(const p of t?.partners||[])nationColors.set(p.id,seq(Math.sqrt(p.value/max)));nationColors.set(player,[255,241,189]);legend={...seqStops(0,1,x=>x===0?'Little':x===1?'Most':''),note:'Goods traded with you each year, at world prices.'};describe=(pid,nid)=>{const p=t?.partners.find(x=>x.id===nid);return p?`${compact(p.value)} WU a year with you`:nid===player?'You':'No direct trade';};}
    if(id==='relations'){for(const [nid,v] of Object.entries(ws.relations))nationColors.set(+nid,div(v/80));nationColors.set(player,[255,241,189]);legend=divStops(80,x=>Math.round(x));describe=(pid,nid)=>nid===player?'You':ws.relations[nid]!=null?`${relationLabel(ws.relations[nid])} (${Math.round(ws.relations[nid])})`:'';}
    if(id==='blocs'){for(const b of ws.blocs)for(const m of b.members)nationColors.set(m,rgb(b.color));legend={kind:'cat',items:ws.blocs.map(b=>({color:b.color,label:`${b.name} (${b.members.length})`}))};describe=(pid,nid)=>blocOf(ws,nid)?.name||'Not in a bloc';}
    if(id==='sanctions'){for(const s of ws.sanctions){if(s.on===player)nationColors.set(s.by,[205,82,68]);else if(s.by===player)nationColors.set(s.on,[226,150,70]);else{if(!nationColors.has(s.on))nationColors.set(s.on,[214,190,140]);}}nationColors.set(player,[255,241,189]);
      legend={kind:'cat',items:[{color:'rgb(205,82,68)',label:'Sanctioning you'},{color:'rgb(226,150,70)',label:'Sanctioned by you'},{color:'rgb(214,190,140)',label:'Under other sanctions'}]};describe=(pid,nid)=>ws.sanctions.filter(s=>s.by===nid||s.on===nid).map(s=>`${esc(nations.get(s.by)?.name||'')} → ${esc(nations.get(s.on)?.name||'')}: ${s.level}`).join('<br>')||'No sanctions';}
    if(id==='dependence'){const dep=new Map();for(const n of Object.values(ws.nations)){const t=res?tradeSummary(ws,res,n.id):null;if(t&&n.gdp)dep.set(n.id,t.imports/n.gdp);}const hi=Math.max(.01,...dep.values());for(const [nid,v] of dep)nationColors.set(nid,seq(Math.sqrt(v/hi)));legend={...seqStops(0,hi,x=>pct(x,0)),note:'Imports as a share of output.'};describe=(pid,nid)=>dep.has(nid)?`Imports ${pct(dep.get(nid),1)} of output`:'';}
  }
  else if(id.startsWith('demo:')){
    focus=player;const layer=id.slice(5),cp=censusProvinces(demo),names=kind=>new Map((kind==='c'?civ.cultures:kind==='l'?civ.languages||[]:civ.religions).map(e=>[e.id,e]));
    const area=pid=>Math.max(1,provinces.get(pid)?.area||1);
    if(['culture','language','religion'].includes(layer)){
      const kind=layer[0]==='c'?'c':layer[0]==='l'?'l':'r',reg=names(kind),colorOf=gid=>rgb(reg.get(gid)?.color||'#9aa092'),single=opts.group||0,used=new Map();
      for(const [pid,g] of cp){const groups=g[kind];if(!groups.length)continue;
        if(single){const s=groups.find(e=>e[0]===single)?.[1]||0;colors.set(pid,lerp([236,232,214],colorOf(single),clamp(s/.8,0,1)));continue;}
        for(const [gid,s] of groups.slice(0,3))if(s>.05)used.set(gid,(used.get(gid)||0)+s*g.pop);
        if(MIXED(groups)){const top=groups.filter(e=>e[1]>=Math.max(.18,groups[0][1]-.2)).slice(0,3).map(e=>colorOf(e[0]));stripes.set(pid,top);}else colors.set(pid,colorOf(groups[0][0]));}
      legend=single?{kind:'seq',stops:[{color:'rgb(236,232,214)',label:'0%'},{color:css(lerp([236,232,214],colorOf(single),.5)),label:'40%'},{color:css(colorOf(single)),label:'80%+'}],note:`Share of ${reg.get(single)?.name||'the group'} at the last census.`}
        :{kind:'cat',items:[...used].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([gid])=>({color:reg.get(gid)?.color||'#9aa092',label:reg.get(gid)?.name||(gid===65534?'No religion':'Others')})),note:'Striped provinces are mixed: no group leads by more than 20 points.'};
      describe=pid=>{const g=cp.get(pid);if(!g)return '';return g[kind].slice(0,4).map(([gid,s])=>`<i class="sw" style="background:${reg.get(gid)?.color||'#9aa092'}"></i>${esc(reg.get(gid)?.name||(gid===65534?'No religion':gid?'Unknown':'Others'))} ${(s*100).toFixed(0)}%`).join('<br>');};
    } else {
      const metric={density:g=>g.pop,growth:g=>g.growth,urban:g=>g.urbanShare,diversity:g=>diversity(g.c),literacy:g=>g.lit,life:g=>g.life,age:g=>medianAge(g.bands),migration:g=>g.pop?g.mig/g.pop:0}[layer]||(g=>g.pop);
      const v=new Map();for(const [pid,g] of cp)v.set(pid,layer==='density'?g.pop/area(pid):metric(g));const vals=[...v.values()];
      if(layer==='growth'||layer==='migration'){const m=layer==='growth'?.03:.015;for(const [pid,x] of v)colors.set(pid,div(x/m));legend=divStops(m,x=>`${x>0?'+':''}${(x*100).toFixed(1)}%`);}
      else{let lo=Math.min(...vals),hi=Math.max(...vals);if(layer==='density'){const f=x=>clamp(Math.log1p(x)/Math.log1p(hi),0,1);for(const [pid,x] of v)colors.set(pid,seq(f(x)));legend=seqStops(0,hi,x=>`${compact(x)}/km²`);legend.stops=legend.stops.map((s,k)=>({...s,label:k===0?'0':k===4?`${compact(hi)}/km²`:''}));}
        else{if(hi-lo<1e-6)hi=lo+1;for(const [pid,x] of v)colors.set(pid,seq((x-lo)/(hi-lo)));const fmt=layer==='life'||layer==='age'?x=>`${x.toFixed(0)} yr`:x=>pct(x,0);legend=seqStops(lo,hi,fmt);}}
      describe=pid=>{const g=cp.get(pid);if(!g)return '';return `${compact(g.pop)} people · ${pct(g.urbanShare,0)} urban<br>Growth ${(g.growth*100).toFixed(2)}%/yr · literacy ${pct(g.lit,0)}<br>Life ${g.life.toFixed(1)} yr · median age ${medianAge(g.bands).toFixed(0)}`;};
    }
    legend.note=(legend.note?legend.note+' ':'')+(demo?.census.data?`Census figures; other nations are greyed out.`:'');
  }
  return {spec:{level:'province',colors,nationColors,stripes,focus,mute:MUTE,provinceNation},legend,describe,title};
}

/* ---------- the UI ---------- */
export function initAtlas({getWorld,renderer,campaign}){
  let active=false,lensId=null,lens=null,opts={},saved=null,highlight=null,customBuild=null;
  document.querySelector('.map-toolbar').insertAdjacentHTML('beforeend',`<button id="atlas-button" class="atlas-button" hidden aria-expanded="false" aria-controls="atlas-panel" title="Atlas: economy, resource, trade and population maps (M)">${icon('atlas')}<span>Atlas</span></button>`);
  document.getElementById('canvas-wrap').insertAdjacentHTML('beforeend',`<div id="atlas-panel" class="atlas-panel" hidden role="dialog" aria-label="Atlas lenses"></div><div id="atlas-legend" class="atlas-legend" hidden></div><div id="atlas-hover" class="atlas-hover" hidden></div>`);
  const panel=$('atlas-panel'),legendEl=$('atlas-legend'),hover=$('atlas-hover');
  function renderPanel(){
    panel.innerHTML=`<div class="atlas-head"><strong>Atlas</strong><button class="text-button" data-lens="">Off</button></div>${LENS_GROUPS.map(g=>`<section><h4>${icon(g.icon)}${g.name}</h4><div class="lens-chips${g.id==='resources'?' resources':''}">${g.lenses.map(([id,name])=>{const good=id.startsWith('res:')&&id!=='res:richest'?GOOD_BY_ID[id.slice(4)]:null;return `<button data-lens="${id}" aria-pressed="${lensId===id}" ${good?`style="--c:${good.color}" title="${esc(name)}"`:''}>${good?icon(good.icon):''}<span>${esc(name)}</span></button>`;}).join('')}</div></section>`).join('')}<p class="help">Lenses colour the political map with live figures. Population lenses use your latest census.</p>`;
  }
  function renderLegend(){
    if(!lens){legendEl.hidden=true;return;}const l=lens.legend;
    let body='';if(l.kind==='seq'||l.kind==='div')body=`<div class="atlas-ramp">${l.stops.map(s=>`<span style="background:${s.color}"></span>`).join('')}</div><div class="atlas-ramp-labels">${l.stops.map(s=>`<span>${esc(s.label)}</span>`).join('')}</div>`;
    else if(l.kind==='cat')body=`<div class="atlas-items">${l.items.map(i=>`<span><i style="background:${i.color}"></i>${i.icon?icon(i.icon,'icon-inline'):''}${esc(i.label)}</span>`).join('')}</div>`;
    legendEl.innerHTML=`<div class="atlas-legend-head"><strong>${esc(lens.title)}</strong><button class="icon-button" data-lens="" aria-label="Turn lens off" title="Turn lens off">${icon('close')}</button></div>${body}${l.note?`<p>${esc(l.note)}</p>`:''}`;legendEl.hidden=false;
  }
  function apply(){
    const camp=campaign(),world=getWorld();if(!active||!camp||!lensId){renderer.atlas=null;lens=null;renderLegend();renderer.draw();return;}
    try{const c=lensId==='custom'&&customBuild?customBuild():null;lens=c?{...c,spec:{level:'province',focus:camp.econ.nation,mute:MUTE,provinceNation:new Map(world.meta.civilization.provinces.map(p=>[p.id,p.nation])),stripes:new Map(),nationColors:new Map(),...c.spec}}:buildLens(lensId,camp,world,opts);renderer.atlas={...lens.spec,highlight};if(renderer.mode!=='political'&&!['cultural','linguistic','religion','cultural-family','flags','ideology','technology','economy-nations'].includes(renderer.mode)){saved??=renderer.mode;switchMode('political');}}catch(e){console.error(e);renderer.atlas=null;lens=null;}
    renderLegend();renderer.draw();
  }
  function switchMode(mode){const select=$('map-mode');if(select&&[...select.options].some(o=>o.value===mode)){select.value=mode;select.onchange?.();}else renderer.mode=mode;}
  function setLens(id,options={}){lensId=id||null;opts=options;if(!lensId&&saved){switchMode(saved);saved=null;}apply();renderPanel();}
  $('atlas-button').onclick=()=>{panel.hidden=!panel.hidden;$('atlas-button').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)renderPanel();};
  for(const el of [panel,legendEl])el.addEventListener('click',e=>{const b=e.target.closest('[data-lens]');if(!b)return;setLens(b.dataset.lens);if(b.closest('#atlas-panel')&&innerWidth<760)panel.hidden=true;});
  document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!e.target.closest('#atlas-button')){panel.hidden=true;$('atlas-button').setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',e=>{if(!active||e.target.matches('input,select,textarea')||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]'))return;if(e.key==='m'||e.key==='M'){e.preventDefault();$('atlas-button').click();}});
  const canvas=$('map');
  canvas.addEventListener('pointermove',e=>{
    if(!active||!lens){hover.hidden=true;return;}const world=getWorld(),r=canvas.getBoundingClientRect(),p=renderer.camera.toWorld(e.clientX-r.left,e.clientY-r.top);if(p.y<0||p.y>=world.height){hover.hidden=true;return;}
    const i=Math.floor(p.y)*world.width+((Math.floor(p.x)%world.width)+world.width)%world.width,pid=world.layers.province?.[i],nid=world.layers.ownership[i];if(!nid){hover.hidden=true;return;}
    const text=lens.describe(pid,nid);if(!text){hover.hidden=true;return;}const civ=world.meta.civilization,name=lens.spec.focus&&nid!==lens.spec.focus?civ.nations.find(n=>n.id===nid)?.name:civ.provinces.find(x=>x.id===pid)?.name||civ.nations.find(n=>n.id===nid)?.name;
    hover.innerHTML=`<strong>${esc(name||'')}</strong><div>${text}</div>`;hover.hidden=false;const wrap=$('canvas-wrap').getBoundingClientRect();hover.style.left=`${Math.min(wrap.width-230,e.clientX-wrap.left+14)}px`;hover.style.top=`${Math.min(wrap.height-90,e.clientY-wrap.top+14)}px`;
  },{passive:true});
  canvas.addEventListener('pointerleave',()=>{hover.hidden=true;});
  return {
    start(){active=true;$('atlas-button').hidden=false;},
    stop(){active=false;$('atlas-button').hidden=true;panel.hidden=true;setLens(null);},
    refresh(){if(lensId)apply();},
    setLens,get lens(){return lensId;},
    /** A lens supplied by a panel (e.g. construction sites): `build()` returns {title,spec:{colors},legend,describe}. */
    custom(build){if(!build){if(lensId==='custom'){customBuild=null;this.pop();}return;}const first=lensId!=='custom';customBuild=build;if(first)this.push('custom');else apply();},
    /** Temporarily outline a province (from a hovered table row); `key` is p<id> or c<id>. */
    hint(key){const camp=campaign(),world=getWorld();let pid=null;if(key&&camp){if(key[0]==='p')pid=+key.slice(1);else if(key[0]==='c')pid=world.meta.civilization.cities.find(c=>c.id===+key.slice(1))?.province||world.layers.province[world.meta.civilization.cities.find(c=>c.id===+key.slice(1))?.cell];}
      if(pid===highlight)return;highlight=pid;if(renderer.atlas){renderer.atlas={...renderer.atlas,highlight};renderer.draw();}else if(pid){renderer.atlas={level:'province',colors:new Map(),highlight,outline:false};renderer.draw();}else if(!lensId){renderer.atlas=null;renderer.draw();}},
    /** Demographics panel helper: push a population lens and restore the previous one later. */
    push(id,options){if(!this._stack)this._stack=[];this._stack.push({lensId,opts});setLens(id,options);},
    pop(){const prev=this._stack?.pop();setLens(prev?.lensId||null,prev?.opts||{});},
  };
}
