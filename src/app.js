import {DEFAULTS,validateSettings} from './core/settings.js';
import {stagesForSettings} from './core/invalidation.js';
import {wrapX,latitude,longitude} from './core/geo.js';
import {calculateStatistics} from './core/statistics.js';
import {WorldRenderer as MapRenderer} from './render/world-renderer.js';
import {MAP_MODES} from './render/modes.js';
import {TerrainEditor} from './editor/brushes.js';
import {DetailEditor} from './editor/detail-editor.js';
import {initTheme} from './ui/theme.js';
import {initGeneralSettings} from './ui/general-settings.js';
import {formatElevation} from './ui/units.js';
import {$,initControls,readForm,setForm,showToast,tab} from './ui/controls.js';
import {inspect} from './ui/inspector.js';
import {showStatistics} from './ui/statistics.js';
import {showLegend} from './ui/legend.js';
import {initLibrary} from './ui/library.js';
import {initCivilization} from './ui/civilization.js';
import {initGameUI} from './ui/game.js';
import {initWorkspace} from './ui/workspace.js';
import {reconcileGeography} from './civilization/generator.js';

let world=null,job=null,selected=-1,selectedPosition=null,tool='pan',space=false,pointer=null,preview=null,lastPaint=0;
let civilization=null,game=null;
const renderer=new MapRenderer($('map')),editor=new TerrainEditor();
const detailEditor=new DetailEditor((detail,bounds)=>{renderer.updateDetails(detail,bounds);markUnsaved();updateHistory();});
const activeEditor=()=>$('edit-scope').value==='detail'?detailEditor:editor;
initTheme($('theme-toggle'));
initGeneralSettings();
window.addEventListener('atlas-units-changed',()=>{if(world){showStatistics(world);showInspection();}showStrength();showLegend(renderer);renderer.draw();updateChanges();});
window.addEventListener('atlas-render-error',event=>showToast(`Regional detail: ${event.detail} The global map is still available.`,true));
const stageProgress={terrain:[0,36],climate:[36,72],koppen:[72,75],hydrology:[75,93],surface:[93,94],biomes:[94,97],statistics:[97,100],complete:[100,100]};
const library=initLibrary({getCurrent:()=>world,adopt,isBusy:()=>!!job||!!civilization?.busy,renderer});
function markUnsaved(){ $('world-state').textContent='Unsaved'; }
function showInspection(){
  if(!world||selected<0)return;inspect(world,selected);
  const p=selectedPosition||{u:(selected%world.width+.5)/world.width,v:(Math.floor(selected/world.width)+.5)/world.height},visual=renderer.sampleElevation(p.u,p.v);
  $('inspect-panel').insertAdjacentHTML('beforeend',`<div class="info-section-title">Visual terrain</div><div class="data-row"><span>Detail elevation</span><strong>${formatElevation(visual)}</strong></div><p class="help">Climate and drainage use the global grid. Visual detail is generated separately.</p>`);
}
function adopt(next,{fit=true,resetHistory=true,newWorld=true,products=['elevation']}={}){
  world=next;preview=null;
  if(resetHistory){editor.reset();detailEditor.reset();}
  if(newWorld){selected=-1;selectedPosition=null;renderer.selected=-1;library?.clearId();$('inspect-panel').innerHTML='<div class="inspector-empty"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="13"/><path d="M24 3v11m0 20v11M3 24h11m20 0h11"/></svg><strong>No location selected</strong><p>Click the map to see terrain, climate and drainage.</p></div>';}
  if(!world.meta.statistics)world.meta.statistics=calculateStatistics(world);
  if(world.meta.civilization&&products.some(p=>['elevation','terrain','climate','hydrology'].includes(p))&&!newWorld)reconcileGeography(world);
  renderer.setWorld(world,fit,products);setForm(world.settings);$('world-name').value=world.name;
  $('map-dimensions').textContent=`${world.width.toLocaleString()} × ${world.height.toLocaleString()}`;
  $('empty-state').hidden=true;markUnsaved();showStatistics(world);showLegend(renderer);showInspection();
  updateHistory();updateChanges();$('status').textContent=`Ready · ${world.seed}`;
  civilization?.onAdopt(world);
}
function updateHistory(){const history=activeEditor(),locked=!!job||!!civilization?.busy;$('undo').disabled=locked||!history.undoStack.length;$('redo').disabled=locked||!history.redoStack.length;}
function updateChanges(){if(job)return;let changed=false;try{changed=world&&stagesForSettings(world.settings,readForm()).size>0;}catch{changed=true;}$('apply-settings').hidden=!changed;$('settings-note').textContent=changed?'Settings changed. Apply them, or generate a new world.':'Same seed and settings give the same world.';$('settings-note').classList.toggle('changed',changed);}
function busy(value){$('generate').disabled=value;$('apply-settings').disabled=value;$('cancel').hidden=!value;$('progress').hidden=!value;$('save-world').disabled=value;$('toggle-edit').disabled=value;for(const el of $('settings-form').elements)el.disabled=value;$('reset-settings').disabled=value;$('randomize').disabled=value;if(value){renderer.tiles.dispose();renderer.previewing=true;renderer.draw();}civilization?.setPhysicalBusy(value);updateHistory();}
function runJob(payload,{fit=false,resetHistory=false,newWorld=false,onFailure=()=>{}}={}){
  if(game?.readOnly)return;
  if(job)job.worker.terminate();
  const worker=new Worker(new URL('./generation/worker.js',import.meta.url),{type:'module'}),start=performance.now();
  job={worker,start,onFailure};busy(true);$('status').textContent='Generating';$('progress-message').textContent=payload.products?.includes('elevation')?'Updating edited terrain':'Building world';$('progress-bar').value=0;$('progress-percent').textContent='0%';
  const fail=message=>{if(job?.worker!==worker)return;worker.terminate();job=null;onFailure();preview=null;if(world)renderer.setWorld(world);busy(false);updateChanges();$('status').textContent=world?`Ready · ${world.seed}`:'Generation failed';if(!world)$('empty-state').hidden=false;showToast(message,true);};
  worker.onmessage=({data})=>{
    if(job?.worker!==worker)return;
    if(data.type==='progress'){const [a,b]=stageProgress[data.stage]||[0,100],p=Math.round(a+(b-a)*Math.max(0,Math.min(1,data.progress||0)));$('progress-message').textContent=data.message||data.stage;$('progress-bar').value=p;$('progress-percent').textContent=p+'%';$('progress-stage').textContent=data.stage.charAt(0).toUpperCase()+data.stage.slice(1);}
    else if(data.type==='error'){console.error(data.stack);fail(data.message);}
    else if(data.type==='complete'){const elapsed=(performance.now()-start)/1000;worker.terminate();job=null;adopt(data.world,{fit,resetHistory,newWorld,products:payload.products});busy(false);updateChanges();$('status').textContent=`Ready · ${elapsed.toFixed(1)}s · ${world.seed}`;}
  };
  worker.onerror=e=>fail(e.message||'The worker could not start. Run the app through a local static server.');
  worker.postMessage(payload);
}
function generate(){if(game?.readOnly||civilization?.busy)return;try{const settings=readForm();civilization?.closeEditor();runJob({settings,products:['terrain']},{fit:!world||world.width!==settings.width||world.height!==settings.height,resetHistory:true,newWorld:true});}catch(e){showToast(e.message,true);}}
function cancel(){if(!job){if(civilization?.busy)civilization.cancel();return;}job.worker.terminate();job.onFailure();job=null;preview=null;if(world)renderer.setWorld(world);else $('empty-state').hidden=false;busy(false);updateChanges();$('status').textContent=world?`Ready · ${world.seed}`:'Cancelled';showToast('Generation cancelled.');}
initControls(updateChanges);$('generate').onclick=generate;$('cancel').onclick=cancel;
const strengthOutput=document.createElement('output');strengthOutput.id='brush-strength-label';$('brush-strength').after(strengthOutput);
function showStrength(){const v=+$('brush-strength').value;strengthOutput.value=['pan','raise','lower'].includes(tool)?formatElevation(v):`${Math.round(v/900*100)}%`;}
$('brush-strength').oninput=showStrength;showStrength();
$('apply-settings').onclick=()=>{try{const settings=readForm(),stages=stagesForSettings(world.settings,settings);if(!stages.size)return;if(stages.has('terrain'))return generate();runJob({world,settings,products:[...stages]});}catch(e){showToast(e.message,true);}};
$('world-name').addEventListener('input',()=>{if(world)world.name=$('world-name').value.trim()||'Untitled world';markUnsaved();});
$('map-mode').onchange=()=>{const next=$('map-mode').value;civilization?.onModeChange(renderer.mode,next);renderer.mode=next;renderer.draw();showLegend(renderer);};
$('month').onchange=()=>{renderer.month=Number($('month').value);renderer.draw();showLegend(renderer);};
for(const name of ['coasts','rivers','shading','grid','valleys','ice','sprites','boldRelief'])$(`overlay-${name}`).onchange=e=>{renderer.overlays[name]=e.target.checked;if(name==='boldRelief'&&e.target.checked){renderer.overlays.shading=true;$('overlay-shading').checked=true;}renderer.draw();};
$('lod-enabled').onchange=e=>{renderer.lodEnabled=e.target.checked;renderer.tiles.dispose();renderer.tiles.failed=false;renderer.draw();};
$('zoom-in').onclick=()=>{renderer.camera.zoom(1.35);renderer.draw();};$('zoom-out').onclick=()=>{renderer.camera.zoom(1/1.35);renderer.draw();};$('camera-reset').onclick=()=>{if(world)renderer.camera.fit(world.width,world.height);renderer.draw();};
$('toggle-settings').onclick=()=>{const el=document.querySelector('.workspace');el.classList.toggle(innerWidth<=580?'mobile-settings':'settings-hidden');};
$('toggle-inspector').onclick=()=>{const el=document.querySelector('.workspace');el.classList.toggle(innerWidth<=850?'mobile-info':'info-hidden');};
$('tab-inspect').onclick=()=>tab('inspect');$('tab-statistics').onclick=()=>tab('statistics');
$('toggle-edit').onclick=()=>{civilization?.closeEditor();const el=$('editor-tools');el.hidden=!el.hidden;$('toggle-edit').setAttribute('aria-expanded',!el.hidden);if(el.hidden){tool='pan';renderer.brush=null;setTool('pan');}renderer.draw();};
function setTool(value){if(game?.readOnly)value='pan';tool=value;showStrength();for(const el of document.querySelectorAll('[data-tool]'))el.classList.toggle('active',el.dataset.tool===tool);$('map').classList.toggle('painting',tool!=='pan');if(tool==='pan')renderer.brush=null;renderer.draw();}
for(const el of document.querySelectorAll('[data-tool]'))el.onclick=()=>setTool(el.dataset.tool);
$('edit-scope').onchange=()=>{const local=$('edit-scope').value==='detail';for(const el of document.querySelectorAll('[data-tool="land"],[data-tool="ocean"]'))el.disabled=local;if(local&&['land','ocean'].includes(tool))setTool('raise');if(local){renderer.lodEnabled=true;$('lod-enabled').checked=true;if(world&&renderer.camera.scale<2)renderer.camera.zoom(2.1/renderer.camera.scale);if(!['physical','elevation'].includes(renderer.mode)){$('map-mode').value='physical';$('map-mode').onchange();}renderer.draw();}$('edit-help').textContent=local?'Size in screen pixels · visual terrain only · waterways protected':'Size in global cells · updates climate & drainage';updateHistory();};
$('brush-size').oninput=()=>{$('brush-size-label').value=$('brush-size').value;};
function historyAction(action){if(game?.readOnly||!world||job||civilization?.busy)return;if(activeEditor()===detailEditor){detailEditor[action](world);showInspection();updateHistory();return;}const stacks={undo:[...editor.undoStack],redo:[...editor.redoStack]},next={...world,layers:{...world.layers,elevation:world.layers.elevation.slice()}};if(!editor[action](next))return;runJob({world:next,products:['elevation']},{onFailure:()=>{editor.undoStack=stacks.undo;editor.redoStack=stacks.redo;}});}
$('undo').onclick=()=>historyAction('undo');$('redo').onclick=()=>historyAction('redo');
const canvas=$('map');
function point(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function cell(p){const w=renderer.camera.toWorld(p.x,p.y);if(!world||w.y<0||w.y>=world.height)return null;return {x:wrapX(w.x,world.width),y:w.y,index:Math.floor(w.y)*world.width+Math.floor(wrapX(w.x,world.width))};}
function dab(p){const c=cell(p);if(!c)return;if(pointer?.local){detailEditor.dab(c.x/world.width,c.y/world.height);return;}const radius=+$('brush-size').value,strength=+$('brush-strength').value;if(pointer?.lastCell){const a=pointer.lastCell,dx=c.x-a.x-Math.round((c.x-a.x)/world.width)*world.width,dy=c.y-a.y,steps=Math.min(100,Math.ceil(Math.hypot(dx,dy)/Math.max(1,radius/3)));for(let s=1;s<=steps;s++)editor.dab(wrapX(a.x+dx*s/steps,world.width),a.y+dy*s/steps,radius,strength/Math.max(1,steps**0.35),tool);}else editor.dab(c.x,c.y,radius,strength,tool);pointer.lastCell=c;renderer.setWorld(preview);}
canvas.addEventListener('pointerdown',e=>{if(!world||e.button!==0&&e.button!==1)return;const p=point(e);canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});pointer={...p,startX:p.x,startY:p.y,id:e.pointerId,moved:false,local:activeEditor()===detailEditor,paint:tool!=='pan'&&!space&&e.button===0&&!job&&!civilization?.busy};canvas.classList.add('dragging');if(pointer.paint){if(pointer.local)detailEditor.begin(world,tool,+$('brush-size').value/renderer.camera.scale/world.width,+$('brush-strength').value);else{preview={...world,meta:{...world.meta,preview:true},layers:{...world.layers,elevation:world.layers.elevation.slice()}};editor.begin(preview);}dab(p);}});
canvas.addEventListener('pointermove',e=>{const p=point(e),c=cell(p);if(c){$('coordinates').textContent=`${latitude(Math.floor(c.y),world.height).toFixed(2)}° · ${longitude(Math.floor(c.x),world.width).toFixed(2)}°`;renderer.brush=tool!=='pan'&&!space&&!job?{x:renderer.camera.toWorld(p.x,p.y).x,y:c.y,radius:+$('brush-size').value/(activeEditor()===detailEditor?renderer.camera.scale:1)}:null;}else renderer.brush=null;
  if(pointer){const dx=p.x-pointer.x,dy=p.y-pointer.y;pointer.moved ||= Math.hypot(p.x-pointer.startX,p.y-pointer.startY)>3;if(pointer.paint){if(performance.now()-lastPaint>35){dab(p);lastPaint=performance.now();}}else renderer.camera.pan(dx,dy);pointer.x=p.x;pointer.y=p.y;}
  renderer.draw();});
function endPointer(e){if(!pointer||pointer.id!==e.pointerId)return;const p=point(e);if(pointer.paint){dab(p);if(pointer.local){detailEditor.end();showInspection();}else{const stacks={undo:[...editor.undoStack],redo:[...editor.redoStack]};if(editor.end()){delete preview.meta.preview;runJob({world:preview,products:['elevation']},{onFailure:()=>{editor.undoStack=stacks.undo;editor.redoStack=stacks.redo;}});}else{preview=null;renderer.setWorld(world);}}}else if(!pointer.moved&&e.button===0){const c=cell(p);if(c){selected=c.index;selectedPosition={u:c.x/world.width,v:c.y/world.height};renderer.selected=selected;showInspection();if(game?.selecting){const id=world.layers.ownership?.[c.index];if(id)game.selectNation(id);}else if(!civilization?.inspectCell(c.index,c.x,c.y)){tab('inspect');game?.showInspector('right');}renderer.draw();}}pointer=null;canvas.classList.remove('dragging');}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',e=>{if(pointer?.paint){editor.rollback();detailEditor.rollback();preview=null;renderer.setWorld(world);}pointer=null;canvas.classList.remove('dragging');});canvas.addEventListener('pointerleave',()=>{if(!pointer){renderer.brush=null;renderer.draw();}});
canvas.addEventListener('wheel',e=>{e.preventDefault();const p=point(e);renderer.camera.zoom(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*0.002),p.x,p.y);renderer.draw();},{passive:false});
canvas.addEventListener('dblclick',e=>{if(tool==='pan'){const p=point(e);renderer.camera.zoom(1.7,p.x,p.y);renderer.draw();}});
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;if(e.code==='Space'&&!e.target.closest('button')){e.preventDefault();space=true;renderer.brush=null;renderer.draw();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();historyAction(e.shiftKey?'redo':'undo');}if(e.key==='Escape'){if(job)cancel();else if(!$('editor-tools').hidden)$('toggle-edit').click();}if(e.key==='0')$('camera-reset').click();});document.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>space=false);
window.addEventListener('beforeunload',()=>{if(job)job.worker.terminate();civilization?.dispose();game?.dispose();renderer.dispose();});
// Minimal read-only integration surface for custom tools and automated browser verification.
civilization=initCivilization({getWorld:()=>world,renderer,isBusy:()=>!!job,changed:markUnsaved,setPan:()=>setTool('pan'),onBusyChanged:updateHistory});
game=initGameUI({getWorld:()=>world,renderer,civilization,setPan:()=>setTool('pan'),isBusy:()=>!!job||civilization.busy,changed:markUnsaved});
initWorkspace({renderer,getWorld:()=>world});
window.atlas={get world(){return world;},get busy(){return !!job||civilization.busy;},get renderer(){return renderer;},get civilization(){return civilization;},get game(){return game;},generate,cancel};
renderer.resize();setTimeout(generate,0);

