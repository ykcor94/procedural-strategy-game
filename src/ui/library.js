import {$,showToast,escapeHTML as esc} from './controls.js';
import {download} from '../persistence/world-file.js';
import {worldToBlob,readWorld} from '../persistence/binary-world.js';
import {listWorlds,saveWorld,getWorld,deleteWorld} from '../persistence/storage.js';
export function initLibrary({getCurrent,adopt,isBusy,renderer}){
  let saveId=null;
  const guard=()=>{if(isBusy())throw new Error('Wait for generation to finish, or cancel it first.');if(!getCurrent())throw new Error('Generate a world first.');return getCurrent();};
  const error=e=>showToast(e.message,true);
  async function save(copy=false){try{const world=guard();world.name=$('world-name').value.trim()||'Untitled world';const summary=`${world.width} × ${world.height} · seed ${world.seed}`;saveId=await saveWorld(world.name,worldToBlob(world),summary,copy?undefined:saveId||undefined);$('world-state').textContent='Saved';showToast('World saved in this browser.');if($('save-manager').open)await refresh();}catch(e){error(e);}}
  async function refresh(){try{const items=await listWorlds();$('save-list').innerHTML=items.length?items.map(item=>`<div class="save-item"><div class="save-description"><strong>${esc(item.name)}</strong><small>${esc(item.summary)}<br>${new Date(item.savedAt).toLocaleString()}</small></div><button data-load="${esc(item.id)}">Load</button><button data-delete="${esc(item.id)}" class="delete-save">Delete</button></div>`).join(''):'<p class="help">No saved worlds yet.</p>';
    for(const el of $('save-list').querySelectorAll('[data-load]'))el.onclick=async()=>{try{if(isBusy())throw new Error('Cancel generation before loading a world.');const item=await getWorld(el.dataset.load);const world=await readWorld(item.data);adopt(world);saveId=item.id;$('world-state').textContent='Saved';$('save-manager').close();showToast(`Loaded ${world.name}.`);}catch(e){error(e);}};
    for(const el of $('save-list').querySelectorAll('[data-delete]'))el.onclick=async()=>{try{if(el.dataset.confirm!=='yes'){el.textContent='Confirm';el.dataset.confirm='yes';setTimeout(()=>{el.textContent='Delete';delete el.dataset.confirm;},4000);return;}await deleteWorld(el.dataset.delete);if(saveId===el.dataset.delete)saveId=null;await refresh();}catch(e){error(e);}};
  }catch(e){error(e);}}
  $('save-world').onclick=()=>save();$('save-copy').onclick=()=>save(true);
  $('open-saves').onclick=()=>{$('save-manager').showModal();refresh();};$('close-saves').onclick=()=>$('save-manager').close();
  $('file-menu').onclick=()=>{$('export-menu').hidden=!$('export-menu').hidden;$('file-menu').setAttribute('aria-expanded',!$('export-menu').hidden);};
  document.addEventListener('click',e=>{if(!e.target.closest('.file-actions')){$('export-menu').hidden=true;$('file-menu').setAttribute('aria-expanded','false');}});
  const fileName=world=>(world.name||'world').replace(/[^\p{L}\p{N}_ -]/gu,'').slice(0,60)||'world';
  $('export-world').onclick=()=>{try{const world=guard();world.name=$('world-name').value.trim()||'Untitled world';download(worldToBlob(world),fileName(world)+'.atlas');$('export-menu').hidden=true;showToast('Complete world file exported.');}catch(e){error(e);}};
  $('export-png').onclick=async()=>{try{const world=guard(),blob=await renderer.exportPNG();if(!blob)throw new Error('PNG export failed.');download(blob,`${fileName(world)}-${renderer.mode}.png`);$('export-menu').hidden=true;showToast('Map exported at native world resolution.');}catch(e){error(e);}};
  $('export-region').onclick=async()=>{try{const world=guard(),blob=await renderer.exportViewportPNG();if(!blob)throw new Error('Region export failed.');download(blob,`${fileName(world)}-region.png`);$('export-menu').hidden=true;showToast('Visible region exported with the currently loaded detail.');}catch(e){error(e);}};
  $('import-world').onclick=$('library-import').onclick=()=>{$('file-input').click();$('export-menu').hidden=true;};
  $('file-input').onchange=async()=>{try{if(isBusy())throw new Error('Cancel generation before importing a world.');const file=$('file-input').files[0];if(!file)return;if(file.size>700*1024*1024)throw new Error('World file exceeds 700 MB.');const world=await readWorld(file);adopt(world);saveId=null;$('save-manager').close();showToast(`Imported ${world.name}.`);}catch(e){error(e);}finally{$('file-input').value='';}};
  return {clearId(){saveId=null;}};
}
