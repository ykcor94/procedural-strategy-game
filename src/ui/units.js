// All saved/generated values stay SI. Preferences affect presentation only.
export const UNIT_SYSTEMS=Object.freeze({metric:'Metric',imperial:'Imperial'});
let system='metric';
try {if(typeof localStorage!=='undefined'&&localStorage.getItem('atlas-units')==='imperial')system='imperial';}catch{}
export const getUnitSystem=()=>system;
export function setUnitSystem(next) {
  if(!Object.hasOwn(UNIT_SYSTEMS,next))throw new Error('Unknown measurement system.');
  const previous=system;system=next;
  try{localStorage.setItem('atlas-units',next);}catch{}
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('atlas-units-changed',{detail:{previous,current:next}}));
}
export const isImperial=(unit=system)=>unit==='imperial';
export const temperature=(c,unit=system)=>isImperial(unit)?c*1.8+32:c;
export const temperatureDelta=(c,unit=system)=>isImperial(unit)?c*1.8:c;
export const elevation=(m,unit=system)=>isImperial(unit)?m/.3048:m;
export const elevationSI=(value,unit=system)=>isImperial(unit)?value*.3048:value;
export const distance=(km,unit=system)=>isImperial(unit)?km/1.609344:km;
export const rainfall=(mm,unit=system)=>isImperial(unit)?mm/25.4:mm;
export const discharge=(cumec,unit=system)=>isImperial(unit)?cumec/.028316846592:cumec;
export const area=(km2,unit=system)=>isImperial(unit)?km2/2.589988110336:km2;
export const unitLabels=(unit=system)=>isImperial(unit)?{temperature:'°F',elevation:'ft',distance:'mi',rainfall:'in',discharge:'ft³/s',area:'mi²'}:{temperature:'°C',elevation:'m',distance:'km',rainfall:'mm',discharge:'m³/s',area:'km²'};
export const number=(value,digits=0)=>Number(value).toLocaleString(undefined,{maximumFractionDigits:digits});
export const formatTemperature=(c,digits=1)=>`${number(temperature(c),digits)} ${unitLabels().temperature}`;
export const formatElevation=(m,digits=0)=>`${number(elevation(m),digits)} ${unitLabels().elevation}`;
export const formatRainfall=(mm)=>`${number(rainfall(mm),isImperial()?1:0)} ${unitLabels().rainfall}`;
export const formatDischarge=(q)=>`${number(discharge(q),1)} ${unitLabels().discharge}`;
export const formatDistance=(km,digits=1)=>`${number(distance(km),digits)} ${unitLabels().distance}`;
