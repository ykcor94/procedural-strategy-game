import {getUnitSystem,setUnitSystem} from './units.js';

export function initGeneralSettings() {
  const dialog=document.getElementById('general-settings'),select=document.getElementById('unit-system');
  select.value=getUnitSystem();select.onchange=()=>setUnitSystem(select.value);
  document.getElementById('open-general').onclick=()=>dialog.showModal();
  document.getElementById('close-general').onclick=()=>dialog.close();
}
