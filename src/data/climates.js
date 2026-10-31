import {KOPPEN_PALETTE} from './koppen-palette.js';
// IDs are persisted in world files: append new classes rather than reordering.
const entries = [
  ['Ocean','Ocean','#315b70','Marine water; Köppen classes apply to land.'],
  ['Af','Tropical rainforest','#1b6b45','Warm in every month, with rain in every month.'],
  ['Am','Tropical monsoon','#3a8851','Warm throughout the year, with a short dry season and abundant annual rain.'],
  ['Aw','Tropical savanna · dry winter','#a3b65d','Warm throughout the year, with a pronounced dry winter.'],
  ['As','Tropical savanna · dry summer','#b7bd72','Warm throughout the year, with an uncommon dry summer.'],
  ['BWh','Hot desert','#dfbd81','Very low precipitation and a warm annual mean.'],
  ['BWk','Cold desert','#c5b79e','Very low precipitation and a cool annual mean.'],
  ['BSh','Hot steppe','#ccba66','Semi-arid grassland climate with a warm annual mean.'],
  ['BSk','Cold steppe','#b5b28a','Semi-arid grassland climate with a cool annual mean.'],
];
const colors = {
  Csa:'#c3aa55', Csb:'#b7b76c', Csc:'#b5bf8c', Cwa:'#80a46a', Cwb:'#74a383', Cwc:'#8ba895',
  Cfa:'#589164', Cfb:'#438c7e', Cfc:'#68a19c',
  Dsa:'#b18d72', Dsb:'#a69d83', Dsc:'#95a09b', Dsd:'#8998a1',
  Dwa:'#8c9d6c', Dwb:'#7b9e81', Dwc:'#72918f', Dwd:'#758698',
  Dfa:'#69875b', Dfb:'#4e7c67', Dfc:'#607d83', Dfd:'#687b99',
};
for (const group of ['C','D']) for (const rain of ['s','w','f']) for (const heat of group==='C'?['a','b','c']:['a','b','c','d']) {
  const code=group+rain+heat;
  const season={s:'dry summer',w:'dry winter',f:'year-round precipitation'}[rain];
  const summer={a:'hot summer',b:'warm summer',c:'short cool summer',d:'very cold winter'}[heat];
  entries.push([code,`${group==='C'?'Temperate':'Continental'} · ${season} · ${summer}`,colors[code],
    `${group==='C'?'Mild winters':'Freezing winters'}, ${season}, and ${summer}.`]);
}
entries.push(['ET','Tundra','#a4b4af','The warmest month is above freezing but no warmer than 10°C.'],
  ['EF','Ice cap','#e7edf0','Every monthly mean temperature is at or below freezing.']);
export const KOPPEN = Object.freeze(entries.map(([code,name,color,description],id)=>Object.freeze({id,code,name,color:KOPPEN_PALETTE[code]||color,description})));
export const KOPPEN_BY_CODE = Object.freeze(Object.fromEntries(KOPPEN.map(item=>[item.code,item])));
