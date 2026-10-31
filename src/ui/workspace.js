import {$,showToast} from './controls.js';

/** Workspace conveniences: setting search, shortcut help and keyboard navigation.
 * Everything here is additive; the generator, editors and game keep their own keys. */
export function initWorkspace({renderer,getWorld}){
  const search=$('settings-search'),panel=$('settings-panel');
  // Setting search filters the visible stage by label text and opens matching sections.
  const items=root=>root.querySelectorAll('.field,.range-field,.check-field,.civ-field-grid>.field,.two-fields>.field');
  function filter(){
    const query=search.value.trim().toLowerCase(),stage=[...panel.querySelectorAll('.stage-content')].find(el=>!el.hidden);if(!stage)return;
    panel.classList.toggle('searching',!!query);
    for(const el of items(stage)){const text=(el.textContent+' '+(el.title||'')).toLowerCase();el.classList.toggle('search-miss',!!query&&!text.includes(query));}
    for(const details of stage.querySelectorAll('details')){if(query){details.dataset.wasOpen??=String(details.open);details.open=[...items(details)].some(el=>!el.classList.contains('search-miss'));details.classList.toggle('search-miss',!details.open);}else{if(details.dataset.wasOpen!==undefined){details.open=details.dataset.wasOpen==='true';delete details.dataset.wasOpen;}details.classList.remove('search-miss');}}
    const matches=[...items(stage)].filter(el=>!el.classList.contains('search-miss')).length;panel.dataset.matches=query?String(matches):'';
  }
  search.addEventListener('input',filter);search.addEventListener('keydown',e=>{if(e.key==='Escape'&&search.value){e.stopPropagation();search.value='';filter();}});
  document.addEventListener('atlas-stage-changed',()=>{search.value='';filter();});

  // Shortcut help.
  const shortcuts=$('shortcuts');$('open-shortcuts').onclick=()=>shortcuts.showModal();$('close-shortcuts').onclick=()=>shortcuts.close();
  for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});

  // Layers and legend popovers close on an outside click.
  document.addEventListener('pointerdown',e=>{const bar=document.querySelector('.overlay-controls');if(bar&&!bar.hidden&&!bar.contains(e.target)&&!e.target.closest('#show-map-overlays'))$('hide-map-overlays')?.click();});

  // P toggles every province layer at once, remembering which ones were on.
  let savedProvinces=null;const PROVINCE_LAYERS=['provinces','provinceColors','provinceNames'];
  function toggleProvinces(){
    const on=PROVINCE_LAYERS.some(k=>renderer.overlays[k]);
    if(on){savedProvinces=Object.fromEntries(PROVINCE_LAYERS.map(k=>[k,!!renderer.overlays[k]]));for(const k of PROVINCE_LAYERS)renderer.overlays[k]=false;}
    else{const restore=savedProvinces||{provinces:true,provinceColors:false,provinceNames:true};for(const k of PROVINCE_LAYERS)renderer.overlays[k]=restore[k];}
    for(const k of PROVINCE_LAYERS){const box=$(`overlay-${k}`);if(box)box.checked=!!renderer.overlays[k];}
    renderer.draw();showToast(on?'Provinces hidden (P)':'Provinces shown (P)');
  }
  const typing=e=>e.target.matches('input,select,textarea,[contenteditable]')||e.ctrlKey||e.metaKey||e.altKey;
  document.addEventListener('keydown',e=>{
    if(typing(e)||document.querySelector('dialog[open]'))return;
    const view=document.body.dataset.view||'generator',key=e.key;
    if(key==='?'){e.preventDefault();shortcuts.showModal();return;}
    if(key==='l'||key==='L'){e.preventDefault();$('show-map-overlays')?.click();return;}
    if((key==='p'||key==='P')&&getWorld()?.meta.civilization&&view!=='selection'){e.preventDefault();toggleProvinces();return;}
    if(key==='k'||key==='K'){e.preventDefault();if(view==='game')$('game-map-key').click();else{const legend=$('map-legend');legend.classList.toggle('collapsed');}return;}
    if(view==='generator'){
      if(key==='/'){e.preventDefault();if(document.querySelector('.workspace').classList.contains('settings-hidden'))$('toggle-settings').click();search.focus();return;}
      if(key==='['){e.preventDefault();$('toggle-settings').click();return;}
      if(key===']'){e.preventDefault();$('toggle-inspector').click();return;}
    }
    if(key==='+'||key==='='){e.preventDefault();$('zoom-in').click();return;}
    if(key==='-'||key==='_'){e.preventDefault();$('zoom-out').click();return;}
    // Arrow keys pan when the map has focus (selection uses arrows to step nations).
    if(view!=='selection'&&document.activeElement===$('map')&&getWorld()&&key.startsWith('Arrow')){
      e.preventDefault();const c=renderer.camera,step=c.width/c.scale*.12;if(key==='ArrowLeft')c.x-=step;if(key==='ArrowRight')c.x+=step;if(key==='ArrowUp')c.y-=step;if(key==='ArrowDown')c.y+=step;c.constrain?.();renderer.draw();
    }
  });
  window.addEventListener('resize',()=>{const t=document.querySelector('.overlay-controls');if(t&&!t.hidden)$('hide-map-overlays')?.click();});
}
