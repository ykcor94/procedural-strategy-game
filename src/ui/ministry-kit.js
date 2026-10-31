import {escapeHTML as esc} from './controls.js';
export {esc};
/** Small view helpers shared by the ministry tabs and the economy card. */
const formats=[2,1,0].map(d=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:d}));
/** Three significant-ish digits: 1.04T, 12.5B, 480B. */
export const compact=v=>{const n=Number.isFinite(v)?v:0,a=Math.abs(n);return formats[a>=100?2:a>=10?1:0].format(n);};
export const integer=v=>Math.round(v||0).toLocaleString();
export const pct=(v,digits=1)=>`${((v||0)*100).toFixed(digits)}%`;
export const signed=(v,digits=1)=>`${v>0?'+':v<0?'−':''}${Math.abs(v).toFixed(digits)}`;
export const signedPct=(v,digits=1)=>`${v>0?'+':v<0?'−':''}${(Math.abs(v)*100).toFixed(digits)}%`;
export const tone=v=>v>5e-4?'up':v<-5e-4?'down':'flat';

let unit='wu';try{unit=localStorage.getItem('atlas-money-unit')==='currency'?'currency':'wu';}catch{}
/** Money is stored in WU; players may read it in their national currency. */
export function money(value,nation){
  if(unit==='currency'&&nation?.currency?.rate)return `${compact(value*nation.currency.rate)} ${esc(nation.currency.code||nation.currency.symbol||'')}`;
  return `${compact(value)} WU`;
}
export const moneyUnit=()=>unit;
export function toggleMoneyUnit(){unit=unit==='wu'?'currency':'wu';try{localStorage.setItem('atlas-money-unit',unit);}catch{}return unit;}

export function sparkline(values,{width=132,height=30,className=''}={}){
  const list=values.filter(Number.isFinite);if(list.length<2)return `<svg class="spark ${className}" viewBox="0 0 ${width} ${height}" aria-hidden="true"></svg>`;
  const lo=Math.min(...list),hi=Math.max(...list),span=hi-lo||Math.abs(hi)||1,points=list.map((v,i)=>`${(i/(list.length-1)*width).toFixed(1)},${(height-3-(v-lo)/span*(height-6)).toFixed(1)}`);
  return `<svg class="spark ${className}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points.join(' ')}"/></svg>`;
}
export const segments=(parts,className='')=>{const total=parts.reduce((s,p)=>s+Math.max(0,p.value),0)||1;return `<div class="stack ${className}" role="img" aria-label="${esc(parts.map(p=>`${p.label} ${pct(p.value/total,0)}`).join(', '))}">${parts.filter(p=>p.value>0).map(p=>`<span style="flex:${p.value};background:${p.color}" title="${esc(p.label)} · ${pct(p.value/total)}"></span>`).join('')}</div>`;};
export const meter=(value,{max=100,className='',label=''}={})=>`<div class="meter ${className}" role="meter" aria-valuenow="${Math.round(value)}" aria-valuemin="0" aria-valuemax="${max}" aria-label="${esc(label)}"><i style="width:${Math.max(0,Math.min(100,value/max*100)).toFixed(1)}%"></i></div>`;
export const stat=(label,value,sub='')=>`<div class="kit-stat"><span>${label}</span><strong>${value}</strong>${sub?`<small>${sub}</small>`:''}</div>`;
export const tip=(label,text)=>`<span class="tip" tabindex="0" data-tip="${esc(text)}" aria-label="${esc(text)}">${label}</span>`;
export const trend=(v,digits=1)=>`<span class="trend ${tone(v)}">${v>0?'▲':v<0?'▼':'■'} ${(Math.abs(v)*100).toFixed(digits)}%</span>`;
export const stabilityClass=s=>s<25?'crisis':s<45?'unrest':s<70?'steady':s<85?'confident':'golden';
export const dayLabel=days=>days>=730?`${(days/365).toFixed(1)} years`:days>=60?`${Math.round(days/30)} months`:`${Math.max(1,Math.round(days))} days`;
export const paybackLabel=y=>!Number.isFinite(y)?'—':y>60?'60+ years':`${y.toFixed(1)} years`;

/** Dashboard tile: icon, label, big value, sub line, optional sparkline and trend chip; clickable with `act`. */
export const tile=(label,value,{sub='',icon='',spark='',chip='',tip='',act='',data={},tone=''}={})=>`<${act?'button':'div'} class="tile ${tone}"${act?` data-act="${act}"`:''}${Object.entries(data).map(([k,v])=>` data-${k}="${esc(v)}"`).join('')}${tip?` data-tip="${esc(tip)}"`:''}><span class="tile-head">${icon}<span>${label}</span>${chip}</span><strong>${value}</strong>${sub?`<small>${sub}</small>`:''}${spark}</${act?'button':'div'}>`;
/** Coloured change chip. `good` flips the colour sense for figures where down is good. */
export const chip=(v,{digits=1,good=1,suffix='%',scale=100,tip=''}={})=>{const shown=(Math.abs(v)*scale).toFixed(digits),zero=+shown===0,t=zero?'flat':v*good>0?'up':'down';return `<span class="chip ${t}"${tip?` data-tip="${esc(tip)}"`:''}>${zero?'■':v>0?'▲':'▼'} ${shown}${suffix}</span>`;};
export const subtabs=(items,active,act='sub')=>`<div class="subtabs" role="tablist">${items.map(([id,label,icon])=>`<button role="tab" data-act="${act}" data-sub="${id}" aria-selected="${active===id}">${icon||''}${label}</button>`).join('')}</div>`;
export const section=(title,extra='')=>`<div class="info-section-title">${title}${extra?`<span class="section-extra">${extra}</span>`:''}</div>`;
