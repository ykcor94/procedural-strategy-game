import {rowArea} from '../core/geo.js';
import {escapeHTML as esc} from './controls.js';
import {formatElevation,formatTemperature,formatRainfall} from './units.js';

const number=v=>Number(v||0).toLocaleString(undefined,{maximumFractionDigits:1});
/** Read the authoritative cell or national statistic, independent of visible LOD. */
export function mapProbe(world,mode,index,month=-1){
  const l=world.layers,civ=world.meta.civilization,nation=civ?.nations.find(n=>n.id===l.ownership?.[index]),province=civ?.provinces?.find(p=>p.id===l.province?.[index]),n=world.width*world.height;
  const area=rowArea(Math.floor(index/world.width),world.height)*4*Math.PI*6371**2/(2*world.width),population=l.population?.[index]||0,rows=[];
  let heading=province?.name||nation?.name||'Map location',kind=province?'province':nation?'nation':null,id=province?.id||nation?.id;
  if(mode==='economy-nations'||mode==='technology'){
    heading=nation?.name||'Unclaimed land';kind=nation?'nation':null;id=nation?.id;
    if(nation){rows.push(['Annual national output',`${number(nation.economicOutput??nation.gdp)} WU`],['Output per resident',`${number(nation.gdpPerCapita)} WU`],['Technology',`${number((nation.technology||0)*100)} / 100`],['Population',number(nation.population)]);}
  }else if(['population','economy','trade','habitability'].includes(mode)){
    rows.push(['Cell population',number(population)],['Density',`${number(population/Math.max(.001,area))} / km²`]);
    if(mode==='economy'||mode==='trade')rows.push(['Annual cell output',`${number(l.economicOutput?.[index])} WU`],['Output per resident',`${number(l.productivity?.[index])} WU`],['Trade access',`${number((l.tradeAccess?.[index]||0)*100)}%`]);
    if(mode==='habitability')rows.push(['Habitability',`${number((l.habitability?.[index]||0)*100)}%`],['Settlement potential',`${number((l.settlementPotential?.[index]||0)*100)}%`]);
    rows.push(['Cell area',`${number(area)} km²`]);
  }else if(mode==='temperature')rows.push([month<0?'Annual temperature':'Monthly temperature',formatTemperature(month<0?l.annualTemperature[index]:l.temperature?.[month*n+index]??l.annualTemperature[index])]);
  else if(mode==='precipitation')rows.push([month<0?'Annual precipitation':'Monthly precipitation',formatRainfall(month<0?l.annualPrecipitation[index]:l.precipitation?.[month*n+index]??l.annualPrecipitation[index]/12)]);
  else if(mode==='hydrology')rows.push(['Elevation',formatElevation(l.elevation[index])],['Drainage basin',number(l.basin?.[index])],['River flow',`${number(l.flow?.[index])} m³/s`]);
  else if(['cultural','cultural-family','linguistic','religion'].includes(mode)){
    const key=mode==='linguistic'?'language':mode==='religion'?'religion':'culture',entity=civ?.[{language:'languages',religion:'religions',culture:'cultures'}[key]]?.find(e=>e.id===l[key]?.[index]);
    heading=entity?.name||'No recorded community';kind=entity?key:null;id=entity?.id;rows.push(['Local population',number(population)],['Country',nation?.name||'Unclaimed']);
    if(mode==='cultural-family')rows.push(['Family',civ?.families.find(f=>f.id===entity?.family)?.name||'—']);
  }else rows.push(['Elevation',formatElevation(l.elevation[index])],['Temperature',formatTemperature(l.annualTemperature[index])],['Population',number(population)]);
  if(!rows.length)rows.push(['Population',number(population)]);
  return {heading,rows,kind,id};
}

export function initMapProbe({getWorld,renderer,focusEntity}){
  const canvas=document.getElementById('map'),wrap=document.getElementById('canvas-wrap'),popup=document.createElement('div');
  popup.id='map-probe';popup.className='map-probe';popup.hidden=true;popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Map value');wrap.append(popup);let pressed=null;
  const hide=()=>{popup.hidden=true;};
  canvas.addEventListener('pointerdown',event=>{hide();if(event.button===1){event.preventDefault();pressed={x:event.clientX,y:event.clientY};}},true);
  canvas.addEventListener('pointerup',event=>{
    if(event.button!==1||!pressed)return;const start=pressed;pressed=null;if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>4)return;
    const w=getWorld();if(!w)return;const bounds=canvas.getBoundingClientRect(),screen={x:event.clientX-bounds.left,y:event.clientY-bounds.top},p=renderer.camera.toWorld(screen.x,screen.y);if(p.y<0||p.y>=w.height)return;
    const x=(Math.floor(p.x)%w.width+w.width)%w.width,index=Math.floor(p.y)*w.width+x,info=mapProbe(w,renderer.mode,index,renderer.month);
    popup.innerHTML=`<button class="map-probe-close icon-button" aria-label="Close"><svg class="icon"><use href="#i-close"/></svg></button><strong>${esc(info.heading)}</strong>${info.rows.map(([label,value])=>`<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}${info.kind?'<button class="map-probe-inspect">Open details</button>':''}<small>${(90-(Math.floor(p.y)+.5)/w.height*180).toFixed(2)}° · ${((x+.5)/w.width*360-180).toFixed(2)}°</small>`;
    popup.hidden=false;popup.style.left=Math.max(8,Math.min(screen.x+12,wrap.clientWidth-popup.offsetWidth-8))+'px';popup.style.top=Math.max(8,Math.min(screen.y+12,wrap.clientHeight-popup.offsetHeight-8))+'px';popup.querySelector('.map-probe-close').onclick=hide;popup.querySelector('.map-probe-inspect')?.addEventListener('click',()=>{focusEntity(info.kind,info.id);hide();});
  },true);
  canvas.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});canvas.addEventListener('wheel',hide,{passive:true});document.getElementById('map-mode').addEventListener('change',hide);window.addEventListener('resize',hide);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});return {hide};
}

/** Map layers live in a toolbar popover. `#hide-map-overlays` and
 * `#show-map-overlays` keep their meaning for the game views. */
export function initOverlayDisclosure(){
  const bar=document.querySelector('.overlay-controls'),toolbar=document.querySelector('.map-toolbar'),close=document.createElement('button'),open=document.createElement('button');
  bar.id='map-overlay-controls';bar.setAttribute('role','dialog');
  close.id='hide-map-overlays';close.className='overlay-dismiss icon-button';close.type='button';close.innerHTML='<svg class="icon"><use href="#i-close"/></svg>';close.title='Close layers';close.setAttribute('aria-label','Close layers');bar.prepend(close);
  open.id='show-map-overlays';open.className='overlay-restore';open.type='button';open.innerHTML='<svg class="icon"><use href="#i-layers"/></svg><span>Layers</span>';open.title='Map layers (L)';open.setAttribute('aria-controls',bar.id);open.setAttribute('aria-haspopup','dialog');
  toolbar.insertBefore(open,document.getElementById('toggle-edit'));
  function set(hidden){bar.hidden=hidden;open.setAttribute('aria-expanded',String(!hidden));open.classList.toggle('active',!hidden);if(!hidden)bar.querySelector('input')?.focus({preventScroll:true});}
  close.onclick=()=>set(true);open.onclick=()=>set(!bar.hidden);
  bar.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();set(true);open.focus();}});
  set(true);
}
