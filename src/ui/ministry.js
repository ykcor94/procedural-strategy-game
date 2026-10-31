import {$,showToast} from './controls.js';
import {money,toggleMoneyUnit,stabilityClass,esc,compact} from './ministry-kit.js';
import {setEconomyProvider} from './economy-card.js';
import {advanceEconomy,current,touch,runtime,onEconomyEvent} from '../game/economy/sim.js';
import {ensureCampaign} from '../game/campaign.js';
import {marketResults,tradeSummary} from '../game/world/market.js';
import {worldContext} from '../game/world/state.js';
import {INDUSTRY_COUNT} from '../data/industries.js';
import {installIcons} from './icons.js';
import {installTooltip} from './tooltip.js';
import {initAtlas} from './atlas.js';
import {flagSVG} from '../civilization/flags.js';
import * as economyTab from './ministry-economy.js';
import * as tradeTab from './ministry-trade.js';
import * as industryTab from './ministry-industry.js';
import * as buildTab from './ministry-build.js';
import * as reformsTab from './ministry-reforms.js';
import * as peopleTab from './ministry-people.js';
import * as worldTab from './ministry-world.js';

/** The national ministry: a status strip in the game header and a docked panel with Economy, Trade,
 * Industry, Construction, Reforms, Demographics and World tabs. State lives in meta.game (economy, world,
 * demography); this module only presents it and routes `data-act` / `data-input` events to the tabs. */
const TABS=[
  {id:'economy',label:'Economy',key:'E',icon:'coin',module:economyTab},
  {id:'trade',label:'Trade',key:'T',icon:'globe',module:tradeTab},
  {id:'industry',label:'Industry',key:'I',icon:'factory',module:industryTab},
  {id:'build',label:'Construction',key:'C',icon:'hammer',module:buildTab},
  {id:'reforms',label:'Reforms',key:'R',icon:'scales',module:reformsTab},
  {id:'people',label:'Demographics',key:'D',icon:'people',module:peopleTab},
  {id:'world',label:'World',key:'W',icon:'news',module:worldTab},
];
const icon=name=>`<svg class="icon"><use href="#i-${name}"/></svg>`;

export function initMinistry({getWorld,renderer,civilization,rerenderInspector,changed}){
  installIcons();installTooltip();
  let active=false,econ=null,error=false,openTab=null,lastRender=0,lastHistory=-1,camp=null;
  const ui={sub:{economy:'overview',trade:'markets',people:'overview',world:'news'},regions:{mode:'provinces',sort:'out',dir:-1,search:''},laws:{selected:{},open:null},build:{type:'farming',place:'',size:2,filter:'all',tier:'A'},trade:{},industry:{open:null},people:{layer:'culture',kind:'c',group:0,scenario:'current',sort:'pop',dir:-1,search:'',years:20},world:{sort:'gdp',dir:-1,nation:0}};
  const handlers={},inputs={};
  for(const t of TABS){Object.assign(handlers,t.module.handlers||{});Object.assign(inputs,t.module.inputs||{});}
  const atlas=initAtlas({getWorld,renderer,campaign:()=>camp});

  document.body.insertAdjacentHTML('beforeend',`<aside id="ministry" class="ministry" hidden aria-label="National ministry"><header class="ministry-head"><nav class="ministry-tabs" role="tablist" aria-label="Ministry">${TABS.map(t=>`<button role="tab" id="ministry-tab-${t.id}" data-ministry-tab="${t.id}" title="${t.label} (${t.key})" aria-selected="false">${icon(t.icon)}<span>${t.label}</span><kbd>${t.key}</kbd></button>`).join('')}</nav><button id="ministry-close" class="icon-button" aria-label="Close ministry" title="Close (Esc)"><svg class="icon"><use href="#i-close"/></svg></button></header><div id="ministry-body" class="ministry-body" tabindex="-1"></div></aside>`);
  $('player-name').insertAdjacentHTML('afterend',`<div id="game-ledger" class="game-ledger" hidden>
    <button id="ledger-treasury" class="ledger-chip" title="Treasury and monthly balance. Click to switch between world units and your currency."><span>Treasury</span><strong>—</strong><small></small></button>
    <button id="ledger-stability" class="ledger-chip" data-ministry-tab="reforms" title="Stability: open Reforms"><span>Stability</span><strong>—</strong><div class="meter"><i></i></div></button>
    <button id="ledger-gdp" class="ledger-chip" data-ministry-tab="economy" title="Annual output and output per person"><span>Output</span><strong>—</strong><small></small></button>
    <button id="ledger-people" class="ledger-chip" data-ministry-tab="people" title="Population at the last census: open Demographics"><span>People</span><strong>—</strong><small></small></button></div>`);
  $('game-menu-button').insertAdjacentHTML('beforebegin',`<nav id="ministry-nav" class="ministry-nav" aria-label="Ministry" hidden>${TABS.map(t=>`<button data-ministry-tab="${t.id}" title="${t.label} (${t.key})" aria-label="${t.label}" aria-pressed="false">${icon(t.icon)}<span class="badge" hidden></span></button>`).join('')}</nav>`);

  const nation=()=>getWorld()?.meta.civilization.nations.find(n=>n.id===econ?.nation);
  const nationCache=new Map();
  function context(){
    const w=getWorld(),rt=runtime(w,econ),snap=current(w,econ),n=nation(),civ=w.meta.civilization;
    if(nationCache.get('civ')!==civ){nationCache.clear();nationCache.set('civ',civ);for(const x of civ.nations)nationCache.set(x.id,x);}
    const ctx={world:w,civ,econ,rt,snap,nation:n,ui,money:v=>money(v,n),ws:camp?.ws,demo:camp?.demo,res:camp?.ws?marketResults(camp.ws):null,wctx:worldContext(w),atlas,
      nationById:id=>nationCache.get(+id),flag:(id,h=14)=>{const x=nationCache.get(+id);return x?.flag?`<span class="mini-flag" style="height:${h}px;width:${Math.round(h*5/3)}px">${flagSVG(x.flag,Math.round(h*5/3),h)}</span>`:'';},
      act(result,{quiet=false}={}){if(!result?.ok){showToast(result?.error||'That could not be done.',true);return false;}touch(w,econ);changed?.();if(!quiet)render();updateStrip();atlas.refresh();return true;},
      rerender:()=>render(),live:()=>{touch(w,econ);changed?.();updateStrip();},
      open:(tab,sub)=>open(tab,sub),
      focus:(kind,id)=>{if(innerWidth<=760)close();civilization.focusEntity(kind,id,true);},
      flyTo:key=>{if(innerWidth<=760)close();const id=+key.slice(1);civilization.focusEntity(key[0]==='c'?'city':'province',id,true);}};
    return ctx;
  }
  function updateStrip(){
    if(!active||!econ)return;
    const w=getWorld(),snap=current(w,econ),n=nation(),net=(snap.revenue.total-snap.spending.total)/12;
    const t=$('ledger-treasury');t.querySelector('strong').textContent=money(econ.treasury,n);const small=t.querySelector('small');small.textContent=`${net>=0?'+':'−'}${money(Math.abs(net),n)}/mo`;small.className=net>=0?'up':'down';t.classList.toggle('overdrawn',econ.treasury<0);
    const s=$('ledger-stability');s.querySelector('strong').textContent=`${Math.round(econ.stability)} · ${snap.stability.band}`;s.querySelector('i').style.width=`${econ.stability}%`;s.className=`ledger-chip stab-${stabilityClass(econ.stability)}`;
    const g=$('ledger-gdp');g.querySelector('strong').textContent=money(snap.gdp,n);g.querySelector('small').textContent=`${money(snap.gdpPerCapita,n)} per person`;
    const census=camp?.demo?.census.data;if(census){const p=$('ledger-people');p.querySelector('strong').textContent=compact(census.national.pop);const growth=census.national.growth||0;p.querySelector('small').textContent=`${growth>=0?'+':'−'}${Math.abs(growth*100).toFixed(2)}%/yr · census ${new Date(Date.parse(w.meta.game.startDate+'T00:00:00Z')+census.day*864e5).getUTCFullYear()}`;}
    const queue=econ.queue.length;for(const b of $('ministry-nav').querySelectorAll('[data-ministry-tab]')){b.setAttribute('aria-pressed',String(b.dataset.ministryTab===openTab));const badge=b.querySelector('.badge');if(b.dataset.ministryTab==='build'){badge.hidden=!queue;badge.textContent=queue;}if(b.dataset.ministryTab==='people'){const fresh=camp?.demo?.census.fresh;badge.hidden=!fresh;badge.textContent='!';}}
  }
  function render(){
    if(!active||!econ||!openTab)return;
    const body=$('ministry-body'),scroll=body.scrollTop,tab=TABS.find(t=>t.id===openTab);
    try{body.innerHTML=tab.module.render(context());}catch(e){console.error(e);body.innerHTML=`<p class="help">This page could not be drawn: ${esc(e.message)}</p>`;}
    body.scrollTop=scroll;lastRender=performance.now();
    for(const b of $('ministry').querySelectorAll('.ministry-tabs [data-ministry-tab]')){const on=b.dataset.ministryTab===openTab;b.setAttribute('aria-selected',String(on));b.classList.toggle('active',on);}
  }
  function open(tab='economy',sub){
    if(!active)return;if(!TABS.some(t=>t.id===tab))tab='economy';if(sub)ui.sub[tab]=sub;
    const previous=openTab;if(previous&&previous!==tab)TABS.find(t=>t.id===previous).module.onClose?.(context());
    openTab=tab;$('ministry').hidden=false;document.body.classList.add('ministry-open');document.body.dataset.ministryTab=tab;
    TABS.find(t=>t.id===tab).module.onOpen?.(context());render();updateStrip();
  }
  function close(){if(openTab)TABS.find(t=>t.id===openTab).module.onClose?.(context());openTab=null;$('ministry').hidden=true;document.body.classList.remove('ministry-open');delete document.body.dataset.ministryTab;updateStrip();}
  function toggle(tab){if(!active)return;if(openTab===tab)close();else open(tab);}
  $('ministry-close').onclick=close;
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-ministry-tab]');if(t&&active){e.preventDefault();if(t.closest('#ministry'))open(t.dataset.ministryTab);else toggle(t.dataset.ministryTab);return;}
    const partner=e.target.closest('[data-ministry-partner]');if(partner&&active){e.preventDefault();ui.sub.trade='partners';ui.trade.partner=+partner.dataset.ministryPartner;open('trade');return;}
    const build=e.target.closest('[data-ministry-build]');if(build&&active){e.preventDefault();ui.build.place=build.dataset.ministryBuild;open('build');return;}
  });
  $('ledger-treasury').addEventListener('click',()=>{toggleMoneyUnit();updateStrip();render();});
  $('ministry').addEventListener('click',e=>{
    const el=e.target.closest('[data-act]');if(!el||!active||!econ)return;
    const fn=handlers[el.dataset.act];if(!fn)return;e.preventDefault();try{fn(context(),el.dataset,e);}catch(err){console.error(err);showToast(err.message,true);}
  });
  $('ministry').addEventListener('input',e=>{const el=e.target.closest('[data-input]');if(!el||!active||!econ)return;const fn=inputs[el.dataset.input];if(fn)fn(context(),el.type==='checkbox'?el.checked:el.value,el,false);});
  $('ministry').addEventListener('change',e=>{const el=e.target.closest('[data-input]');if(!el||!active||!econ)return;const fn=inputs[el.dataset.input];if(fn)fn(context(),el.type==='checkbox'?el.checked:el.value,el,true);});
  $('ministry').addEventListener('pointerover',e=>{const el=e.target.closest('[data-hover-key]');if(!el||!active)return;atlas.hint(el.dataset.hoverKey);});
  $('ministry').addEventListener('pointerleave',()=>atlas.hint(null));
  window.addEventListener('keydown',e=>{
    if(!active||e.target.matches('input,select,textarea,[contenteditable]')||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]'))return;
    const tab=TABS.find(t=>t.key.toLowerCase()===e.key.toLowerCase());if(tab){e.preventDefault();e.stopImmediatePropagation();toggle(tab.id);}
    else if(e.key==='Escape'&&openTab&&$('ministry').contains(document.activeElement)){e.preventDefault();e.stopImmediatePropagation();close();}
  },true);

  onEconomyEvent(({text,tone})=>{if(active&&tone!=='info')showToast(text,tone==='bad'||tone==='warn');});
  setEconomyProvider((kind,entity)=>{
    if(!active||!econ||error)return null;
    const w=getWorld(),snap=current(w,econ);
    if(kind==='nation'&&entity.id!==econ.nation&&camp?.ws?.nations[entity.id])return {foreign:foreignCard(entity.id)};
    const places=kind==='city'?[snap.index.get(`c${entity.id}`)]:kind==='province'?snap.places.filter(p=>p.province===entity.id):kind==='nation'&&entity.id===econ.nation?snap.places:[];
    const list=places.filter(Boolean);if(!list.length)return null;
    const outs=new Float64Array(INDUSTRY_COUNT);let total=0,jobs=0,tax=0,unemployed=0,used=0,slots=0;
    for(const p of list){for(let k=0;k<INDUSTRY_COUNT;k++)outs[k]+=p.outs[k];total+=p.out;jobs+=p.jobs;tax+=p.tax;unemployed+=p.unemployment*p.jobs;used+=p.used;slots+=p.slots;}
    const key=kind==='city'?`c${entity.id}`:kind==='province'?`p${entity.id}`:'';const place=key&&snap.index.get(key);
    return {outs,total,live:{jobs,tax,unemployment:jobs?unemployed/jobs:0,growth:snap.industry.map(i=>i.growth),build:place?{key,used:place.used,slots:place.slots}:null}};
  });
  /** Live figures of a foreign nation for its inspector card. Demography follows its census unless the
   * "live foreign figures" display setting is on. */
  function foreignCard(id){
    const ws=camp.ws,n=ws.nations[id],live=liveForeign(),view=live?null:n.census.view,res=marketResults(ws),trade=res?tradeSummary(ws,res,id):null,w=getWorld();
    return {gdp:n.gdp,gdp0:n.gdp0,growth:n.growth,stab:n.stab,pop:live?n.pop:view?.pop??n.pop,popGrowth:live?n.popGrowth:view?.growth??0,censusYear:view?new Date(Date.parse(w.meta.game.startDate+'T00:00:00Z')+view.day*864e5).getUTCFullYear():null,
      style:n.policy.style,relation:ws.relations[id]??0,hist:n.hist,trade,money:v=>money(v,nation())};
  }
  const liveForeign=()=>{try{return localStorage.getItem('atlas-live-foreign')==='true';}catch{return false;}};

  function start(){
    const w=getWorld();if(!w?.meta.game)return;
    try{error=false;camp=ensureCampaign(w);econ=camp.econ;active=true;current(w,econ);}catch(e){console.error(e);error=true;active=false;showToast(`The economy could not start: ${e.message}`,true);return;}
    $('game-ledger').hidden=$('ministry-nav').hidden=false;lastHistory=econ.hist.at(-1)?.d??-1;atlas.start();updateTradeVolumes();updateStrip();
  }
  function stop(){if(openTab)close();active=false;econ=null;camp=null;openTab=null;$('ministry').hidden=true;$('game-ledger').hidden=$('ministry-nav').hidden=true;document.body.classList.remove('ministry-open');atlas.stop();renderer.tradeVolume=null;}
  /** Live route volumes for the trade map: sanctions cut routes, agreements and blocs lift them, and every
   * route follows the growth of the economies at either end. */
  function updateTradeVolumes(){
    const w=getWorld(),ws=camp?.ws;if(!ws)return;const civ=w.meta.civilization,cities=new Map(civ.cities.map(c=>[c.id,c])),map=new Map(),snap=current(w,econ),own=new Map(snap.trade.routes.map(r=>[r.id,r]));
    const ratio=id=>{const n=ws.nations[id];return n&&n.gdp0>0?Math.sqrt(n.gdp/n.gdp0):1;};
    for(const r of civ.tradeRoutes||[]){const o=own.get(r.id);if(o){map.set(r.id,o.volume0>0?o.volume/o.volume0:1);continue;}
      const a=cities.get(r.from)?.nation,b=cities.get(r.to)?.nation;let f=Math.sqrt(ratio(a)*ratio(b));
      if(a&&b&&a!==b){const s=ws.sanctions.find(x=>(x.by===a&&x.on===b)||(x.by===b&&x.on===a));if(s)f*=s.level==='embargo'?0:s.level==='broad'?.35:.8;else if(ws.blocs.some(bl=>bl.members.includes(a)&&bl.members.includes(b)))f*=1.15;}
      map.set(r.id,f);}
    renderer.tradeVolume=map;
  }
  /** Called every animation frame while the clock runs. */
  function tick(){
    if(!active||!econ)return;const w=getWorld();
    if(Math.floor(w.meta.game.elapsedHours/24)<=econ.day)return;
    try{advanceEconomy(w,econ);}catch(e){console.error(e);error=true;active=false;showToast(`The economy stopped: ${e.message}`,true);return;}
    updateStrip();
    const month=econ.hist.at(-1)?.d;if(month!==lastHistory){lastHistory=month;rerenderInspector?.();updateTradeVolumes();atlas.refresh();renderer.draw();}
    const now=performance.now();if(openTab&&now-lastRender>700&&!document.activeElement?.matches?.('#ministry input[type=range],#ministry input[type=search],#ministry select'))render();
  }
  return {start,stop,tick,open,close,toggle,render,updateStrip,atlas,get active(){return active;},get economy(){return econ;},get campaign(){return camp;},get tab(){return openTab;},get ui(){return ui;}};
}
