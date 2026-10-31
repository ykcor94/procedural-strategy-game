import {KOPPEN} from '../data/climates.js';
import {BIOMES} from '../data/biomes.js';
import {latitude,longitude} from '../core/geo.js';
import {regionAt} from '../core/world.js';
import {$,escapeHTML as esc} from './controls.js';
import {temperature,rainfall,isImperial,unitLabels,formatElevation,formatTemperature,formatRainfall,formatDischarge} from './units.js';
const row=(name,value)=>`<div class="data-row"><span>${name}</span><strong>${value}</strong></div>`;
const num=(v,d=0)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:d});
export function climateChart(world,i){
  const n=world.width*world.height,t=[],p=[];
  for(let m=0;m<12;m++){t.push(temperature(world.layers.temperature[m*n+i]));p.push(rainfall(world.layers.precipitation[m*n+i]));}
  const tempStep=isImperial()?20:10,rainStep=isImperial()?4:100;
  const low=Math.min(temperature(-10),Math.floor(Math.min(...t)/tempStep)*tempStep),high=Math.max(temperature(30),Math.ceil(Math.max(...t)/tempStep)*tempStep),maxRain=Math.max(rainStep,Math.ceil(Math.max(...p)/rainStep)*rainStep),x=m=>27+m*17,ty=v=>103-(v-low)/(high-low)*86;
  let svg=`<svg class="chart" viewBox="0 0 240 132" role="img" aria-label="Monthly temperature and precipitation chart"><text x="0" y="9" font-size="7" fill="#a87a55">${unitLabels().temperature}</text><text x="239" y="9" font-size="7" text-anchor="end" fill="#7198a3">${unitLabels().rainfall}</text>`;
  for(let k=0;k<=3;k++){const y=17+k*86/3,v=high-(high-low)*k/3;svg+=`<path d="M21 ${y}H222" stroke="#dce3d5" stroke-width=".5"/><text x="17" y="${y+2.5}" text-anchor="end" fill="#8a9781" font-size="7">${Math.round(v)}</text><text x="226" y="${y+2.5}" fill="#8a9781" font-size="7">${num(maxRain*(1-k/3),isImperial()?1:0)}</text>`;}
  for(let m=0;m<12;m++){const rh=p[m]/maxRain*86;svg+=`<rect x="${x(m)-5}" y="${103-rh}" width="10" height="${rh}" rx="1" fill="#86adba" opacity=".85"/><text x="${x(m)}" y="116" text-anchor="middle" font-size="7" fill="#7b8a73">${'JFMAMJJASOND'[m]}</text>`;}
  svg+=`<polyline points="${t.map((v,m)=>`${x(m)},${ty(v)}`).join(' ')}" fill="none" stroke="#b67a4b" stroke-width="1.6"/>`;
  t.forEach((v,m)=>svg+=`<circle cx="${x(m)}" cy="${ty(v)}" r="1.6" fill="#b67a4b"/>`);
  return svg+'</svg><div class="chart-note"><span><i class="temp"></i>Temperature</span><span><i class="rain"></i>Precipitation</span></div>';
}
export function inspect(world,i){
  if(i<0||!world)return;
  const {width:w,height:h,layers:l}=world,x=i%w,y=Math.floor(i/w),land=l.elevation[i]>0,climate=KOPPEN.find(c=>c.id===l.koppen[i])||KOPPEN[0],biome=BIOMES.find(b=>b.id===l.biome[i])||BIOMES[0],lake=!!l.lake[i],river=!!l.river[i],lat=latitude(y,h),lon=longitude(x,w),type=!land?'Ocean':lake?'Lake':river?'River valley':biome.name;
  $('inspect-panel').innerHTML=`<h2 class="location-title">${esc(type)}</h2><p class="coordinate-label">${Math.abs(lat).toFixed(2)}° ${lat>=0?'N':'S'} &nbsp; ${Math.abs(lon).toFixed(2)}° ${lon>=0?'E':'W'}</p>
    <div class="type-badge"><span class="swatch" style="background:${climate.color}"></span>${esc(climate.code)} <span style="font-weight:400">${esc(climate.name)}</span></div><p class="description">${esc(climate.description)}</p>
    <div class="info-section-title">Terrain & surface</div>${row(land?'Elevation':'Ocean depth',`${formatElevation(Math.abs(l.elevation[i]))}${land?'':' below sea level'}`)}${row('Biome',esc(biome.name))}
    ${land&&l.naturalMoisture?row('Rain-fed soil moisture',`${num(l.naturalMoisture[i]*100)}%`):land?row('Soil moisture',`${num(l.soilMoisture[i]*100)}%`):''}
    ${land&&l.surfaceMoisture?row('Surface moisture',`${num(l.surfaceMoisture[i]*100)}%`):''}
    ${!land&&l.annualIce?row('Mean sea ice',`${num(l.annualIce[i]/255*100)}%`):''}
    <div class="info-section-title">Annual climate</div>${row('Mean temperature',formatTemperature(l.annualTemperature[i]))}${row('Precipitation',`${formatRainfall(l.annualPrecipitation[i])} / year`)}${climateChart(world,i)}
    <div class="info-section-title">Hydrology</div>${row('Surface water',!land?'Ocean':lake?'Lake':river?'River':'None')}${land?row('Drainage basin',num(l.basin[i])):''}${land?row('Catchment discharge',formatDischarge(l.flow[i])):''}${lake&&l.lakeDepth?row('Lake depth',formatElevation(l.lakeDepth[i],1)):''}${land&&l.filledElevation?row('Routing elevation',formatElevation(l.filledElevation[i])):''}
    <div class="info-section-title">Grid reference</div>${row('Cell',`${x}, ${y} · #${i}`)}${row('Region',`#${regionAt(world,i)}`)}`;
}
