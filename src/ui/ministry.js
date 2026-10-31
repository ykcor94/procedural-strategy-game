import {$,showToast} from './controls.js';
import {money,toggleMoneyUnit,stabilityClass,esc} from './ministry-kit.js';
import {setEconomyProvider} from './economy-card.js';
import {ensureEconomy,advanceEconomy,current,touch,runtime,onEconomyEvent} from '../game/economy/sim.js';
import {INDUSTRY_COUNT} from '../data/industries.js';
import * as economyTab from './ministry-economy.js';
import * as reformsTab from './ministry-reforms.js';
import * as buildTab from './ministry-build.js';
import * as industryTab from './ministry-industry.js';

/** The national ministry: a treasury strip in the game header and a docked panel with Economy, Reforms,
 * Construction and Industry tabs. All state lives in meta.game.economy; this module only presents it. */
const TABS=[
  {id:'economy',label:'Economy',key:'E',icon:'coin',module:economyTab},
  {id:'reforms',label:'Reforms',key:'R',icon:'scales',module:reformsTab},
  {id:'build',label:'Construction',key:'C',icon:'hammer',module:buildTab},
  {id:'industry',label:'Industry',key:'I',icon:'factory',module:industryTab},
];
const icon=name=>`<svg class="icon"><use href="#i-${name}"/></svg>`;

export function initMinistry({getWorld,renderer,civilization,rerenderInspector,changed}){
  let active=false,econ=null,error=false,openTab=null,lastRender=0,lastHistory=-1,pending=0,world=null;
  const ui={sub:{economy:'overview'},regions:{mode:'provinces',sort:'out',dir:-1,search:''},laws:{selected:{},open:null},build:{type:'farming',place:'',size:2,filter:'all'},trade:{},industry:{}};
  const handlers={},inputs={};
  for(const t of TABS){Object.assign(handlers,t.module.handlers||{});Object.assign(inputs,t.module.inputs||{});}

  document.body.insertAdjacentHTML('beforeend',`<aside id="ministry" class="ministry" hidden aria-label="National ministry"><header class="ministry-head"><nav class="ministry-tabs" role="tablist" aria-label="Ministry">${TABS.map(t=>`<button role="tab" id="ministry-tab-${t.id}" data-ministry-tab="${t.id}" title="${t.label} (${t.key})" aria-selected="false">${icon(t.icon)}<span>${t.label}</span><kbd>${t.key}</kbd></button>`).join('')}</nav><button id="ministry-close" class="icon-button" aria-label="Close ministry"><svg class="icon"><use href="#i-close"/></svg></button></header><div id="ministry-body" class="ministry-body" tabindex="-1"></div></aside>`);
  $('player-name').insertAdjacentHTML('afterend',`<div id="game-ledger" class="game-ledger" hidden>
    <button id="ledger-treasury" class="ledger-chip" title="Treasury and monthly balance. Click to switch between world units and your currency."><span>Treasury</span><strong>—</strong><small></small></button>
    <button id="ledger-stability" class="ledger-chip" data-ministry-tab="reforms" title="Stability: open the reform desk"><span>Stability</span><strong>—</strong><div class="meter"><i></i></div></button>
    <button id="ledger-gdp" class="ledger-chip" data-ministry-tab="economy" title="Annual output and output per person"><span>Output</span><strong>—</strong><small></small></button></div>`);
  $('game-menu-button').insertAdjacentHTML('beforebegin',`<nav id="ministry-nav" class="ministry-nav" aria-label="Ministry" hidden>${TABS.map(t=>`<button data-ministry-tab="${t.id}" title="${t.label} (${t.key})" aria-label="${t.label}" aria-pressed="false">${icon(t.icon)}<span class="badge" hidden></span></button>`).join('')}</nav>`);

  const nation=()=>getWorld()?.meta.civilization.nations.find(n=>n.id===econ?.nation);
  function context(){
    const w=getWorld(),rt=runtime(w,econ),snap=current(w,econ),n=nation();
    const ctx={world:w,civ:w.meta.civilization,econ,rt,snap,nation:n,ui,money:v=>money(v,n),
      act(result,{quiet=false}={}){if(!result?.ok){showToast(result?.error||'That could not be done.',true);return false;}touch(w,econ);changed?.();if(!quiet)render();updateStrip();return true;},
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
    const queue=econ.queue.length;for(const b of $('ministry-nav').querySelectorAll('[data-ministry-tab]')){b.setAttribute('aria-pressed',String(b.dataset.ministryTab===openTab));if(b.dataset.ministryTab==='build'){const badge=b.querySelector('.badge');badge.hidden=!queue;badge.textContent=queue;}}
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
    openTab=tab;$('ministry').hidden=false;document.body.classList.add('ministry-open');render();updateStrip();
  }
  function close(){openTab=null;$('ministry').hidden=true;document.body.classList.remove('ministry-open');updateStrip();}
  function toggle(tab){if(!active)return;if(openTab===tab)close();else open(tab);}
  $('ministry-close').onclick=close;
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-ministry-tab]');if(t&&active){e.preventDefault();if(t.closest('#ministry'))open(t.dataset.ministryTab);else toggle(t.dataset.ministryTab);return;}
    const build=e.target.closest('[data-ministry-build]');if(build&&active){e.preventDefault();ui.build.place=build.dataset.ministryBuild;open('build');return;}
  });
  $('ledger-treasury').addEventListener('click',()=>{toggleMoneyUnit();updateStrip();render();});
  $('ministry').addEventListener('click',e=>{
    const el=e.target.closest('[data-act]');if(!el||!active||!econ)return;
    const fn=handlers[el.dataset.act];if(!fn)return;e.preventDefault();try{fn(context(),el.dataset,e);}catch(err){console.error(err);showToast(err.message,true);}
  });
  $('ministry').addEventListener('input',e=>{
    const el=e.target.closest('[data-input]');if(!el||!active||!econ)return;const fn=inputs[el.dataset.input];if(fn)fn(context(),el.type==='checkbox'?el.checked:el.value,el,false);
  });
  $('ministry').addEventListener('change',e=>{
    const el=e.target.closest('[data-input]');if(!el||!active||!econ)return;const fn=inputs[el.dataset.input];if(fn)fn(context(),el.type==='checkbox'?el.checked:el.value,el,true);
  });
  window.addEventListener('keydown',e=>{
    if(!active||e.target.matches('input,select,textarea,[contenteditable]')||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]'))return;
    const tab=TABS.find(t=>t.key.toLowerCase()===e.key.toLowerCase());if(tab){e.preventDefault();e.stopImmediatePropagation();toggle(tab.id);}
    else if(e.key==='Escape'&&openTab){/* Escape keeps its pause-menu meaning; the panel has its own close button. */}
  },true);

  onEconomyEvent(({text,tone})=>{if(active&&tone!=='info')showToast(text,tone==='bad'||tone==='warn');});
  setEconomyProvider((kind,entity)=>{
    if(!active||!econ||error)return null;
    const w=getWorld(),snap=current(w,econ);
    const places=kind==='city'?[snap.index.get(`c${entity.id}`)]:kind==='province'?snap.places.filter(p=>p.province===entity.id):kind==='nation'&&entity.id===econ.nation?snap.places:[];
    const list=places.filter(Boolean);if(!list.length)return null;
    const outs=new Float64Array(INDUSTRY_COUNT);let total=0,jobs=0,tax=0,unemployed=0,used=0,slots=0;
    for(const p of list){for(let k=0;k<INDUSTRY_COUNT;k++)outs[k]+=p.outs[k];total+=p.out;jobs+=p.jobs;tax+=p.tax;unemployed+=p.unemployment*p.jobs;used+=p.used;slots+=p.slots;}
    const key=kind==='city'?`c${entity.id}`:kind==='province'?`p${entity.id}`:'';const place=key&&snap.index.get(key);
    return {outs,total,live:{jobs,tax,unemployment:jobs?unemployed/jobs:0,growth:snap.industry.map(i=>i.growth),build:place?{key,used:place.used,slots:place.slots}:null}};
  });

  function start(){
    const w=getWorld();if(!w?.meta.game)return;
    try{error=false;econ=ensureEconomy(w);active=true;current(w,econ);}catch(e){console.error(e);error=true;active=false;showToast(`The economy could not start: ${e.message}`,true);return;}
    $('game-ledger').hidden=$('ministry-nav').hidden=false;lastHistory=econ.hist.at(-1)?.d??-1;updateStrip();
  }
  function stop(){active=false;econ=null;openTab=null;$('ministry').hidden=true;$('game-ledger').hidden=$('ministry-nav').hidden=true;document.body.classList.remove('ministry-open');}
  /** Called every animation frame while the clock runs. */
  function tick(){
    if(!active||!econ)return;const w=getWorld();
    if(Math.floor(w.meta.game.elapsedHours/24)<=econ.day)return;
    try{advanceEconomy(w,econ);}catch(e){console.error(e);error=true;active=false;showToast(`The economy stopped: ${e.message}`,true);return;}
    updateStrip();
    const month=econ.hist.at(-1)?.d;if(month!==lastHistory){lastHistory=month;rerenderInspector?.();}
    const now=performance.now();if(openTab&&now-lastRender>600&&!document.activeElement?.matches?.('#ministry input[type=range]'))render();
  }
  return {start,stop,tick,open,close,toggle,render,updateStrip,get active(){return active;},get economy(){return econ;},get tab(){return openTab;},get ui(){return ui;}};
}
