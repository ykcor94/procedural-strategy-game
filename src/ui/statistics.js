import {KOPPEN} from '../data/climates.js';
import {BIOMES} from '../data/biomes.js';
import {$,escapeHTML as esc} from './controls.js';
import {formatElevation,formatTemperature,formatRainfall} from './units.js';
const percent=v=>(v*100).toFixed(1)+'%';
const num=(v,d=0)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:d});
const row=(label,value)=>`<div class="data-row"><span>${label}</span><strong>${value}</strong></div>`;
function distribution(data,registry){return data.map(item=>{const entry=registry.find(x=>x.id===item.id);if(!entry)return '';return `<div class="distribution-row" title="${esc(entry.description)}"><span class="swatch" style="background:${entry.color}"></span><span>${entry.code&&entry.code!==entry.name?esc(entry.code)+' · ':''}${esc(entry.name)}</span><span>${percent(item.share)}</span></div><div class="distribution-track"><span style="width:${Math.max(.2,item.share*100)}%;background:${entry.color}"></span></div>`;}).join('');}
export function showStatistics(world) {
  const s=world.meta.statistics;
  if(!s)return;
  const h=world.meta.hydrology||{};
  $('statistics-panel').innerHTML=`
    <div class="big-stats">
      <div><div class="stat-number">${percent(s.landShare)}</div><div class="stat-label">LAND AREA</div></div>
      <div><div class="stat-number">${percent(s.oceanShare)}</div><div class="stat-label">OCEAN AREA</div></div>
    </div>
    <div class="share-bar"><span style="width:${s.landShare*100}%"></span></div>
    ${row('Lowest point',formatElevation(s.minElevation))}
    ${row('Highest point',formatElevation(s.maxElevation))}
    ${world.meta.continents?row('Major continents',num(world.meta.continents.majorCount)):''}
    ${world.meta.continents?row('Islands',num(world.meta.continents.islandCount)):''}
    ${row('Global mean temperature',formatTemperature(s.meanTemperature))}
    ${row('Land mean temperature',formatTemperature(s.meanLandTemperature))}
    ${row('Land precipitation',`${formatRainfall(s.meanPrecipitation)}/yr`)}
    <div class="info-section-title">Rivers & lakes</div>
    ${row('Cells with rivers',`${percent(s.riverShare)} of land`)}
    ${row('Lake area',`${percent(s.lakeShare)} of land`)}
    ${row('River cells',num(s.riverCells))}
    ${row('Lake cells',num(s.lakeCells))}
    ${h.lakeCount!=null?row('Lakes',num(h.lakeCount)):''}
    ${h.endorheicLakes!=null?row('Closed-basin lakes',num(h.endorheicLakes)):''}
    ${h.basinCount!=null?row('Drainage basins',num(h.basinCount)):''}
    <p class="help">Areas and means use spherical cell weights. Land includes inland water. River coverage measures cells containing channels.</p>
    <div class="info-section-title">Köppen climate · land area</div>
    ${distribution(s.climate,KOPPEN)}
    <div class="info-section-title">Biomes · land area</div>
    ${distribution(s.biome,BIOMES)}`;
}
