import {esc,pct,signed,signedPct,stabilityClass,dayLabel,section} from './ministry-kit.js';
import {LAW_AXES} from '../data/laws.js';
import {INDUSTRY_BY_ID} from '../data/industries.js';
import {effectivePosition} from '../game/economy/model.js';
import {enactLaw,lawQuote,isoDate} from '../game/economy/sim.js';
import {gauge,diverging,radar} from './charts.js';
import {icon,LAW_ICON} from './icons.js';
const PCT_KEYS={income:'Income tax yield',corporate:'Corporate tax yield',consumption:'Consumption tax yield',property:'Property tax yield',royalty:'Royalty yield',fees:'Port fee yield',openness:'Foreign trade volume',buildSpeed:'Build speed',buildCost:'Build cost',credit:'Borrowing limit',subsidy:'Subsidy efficiency'};
/** Plain-language list of a position's effects. */
export function describeFx(fx){
  const out=[],good=(text,positive)=>out.push({text,positive});
  for(const [k,v]of Object.entries(fx)){
    if(k==='ind'){for(const [id,x]of Object.entries(v))if(x)good(`${INDUSTRY_BY_ID[id].name} output ${signedPct(x,0)}`,x>0);continue;}
    if(k==='growth'&&v)good(`Growth ${signedPct(v,1)} a year`,v>0);
    else if(PCT_KEYS[k]&&v)good(`${PCT_KEYS[k]} ${signedPct(v,0)}`,k==='buildCost'?v<0:v>0);
    else if(k==='corruption'&&v)good(`Corruption ${signedPct(v,0)}`,v<0);
    else if(k==='unemp'&&v)good(`Unemployment ${signedPct(v,0)}`,v<0);
    else if(k==='interest'&&v)good(`Loan interest ${signedPct(v,1)}`,v<0);
    else if(k==='stab'&&v)good(`Stability ${signed(v)}`,v>0);
    else if(k==='welfare')good(`Welfare costs ${pct(v,0)} of baseline revenue`,null);
    else if(k==='tariffCap')good(`Tariffs up to ${pct(v,0)}`,null);
    else if(k==='enterprise'&&v)good(`State firms keep ${pct(v,0)} of profits`,null);
    else if(k==='prioritySlots')good(`${v} priority industr${v>1?'ies':'y'}`,null);
    else if(k==='load')good(v?`Needs administrative capacity ${pct(v,0)}`:'No administrative demands',null);
  }
  return out;
}
const chips=fx=>describeFx(fx).map(c=>`<span class="fx ${c.positive===null?'':c.positive?'up':'down'}">${esc(c.text)}</span>`).join('')||'<span class="fx">No direct effect</span>';
const TERM_ICON={tax:'percent',jobs:'people',welfare:'heart',mood:'speech',law:'scales',services:'graduation',admin:'clipboard',corruption:'ban',regulation:'office',prestige:'star',debt:'coins',insolvent:'warning',shock:'bolt',prices:'cart',shortage:'warning',minorities:'people',demopolicy:'passport',sanctions:'ban'};

function stabilityCard(ctx){
  const {econ,snap}=ctx,terms=snap.stability.terms.slice().sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).filter(t=>Math.abs(t.value)>.05).slice(0,10),max=Math.max(8,...terms.map(t=>Math.abs(t.value)));
  const restless=Object.values(snap.places.reduce((m,p)=>{const g=m[p.province]||(m[p.province]={id:p.province,pop:0,stab:0});g.pop+=p.pop;g.stab+=p.stability*p.pop;return m;},{})).map(g=>({id:g.id,stab:g.pop?g.stab/g.pop:0})).filter(g=>g.stab<45).sort((a,b)=>a.stab-b.stab).slice(0,4);
  return `<section class="stability-card ${stabilityClass(econ.stability)}"><div class="stability-top">${gauge(econ.stability,{bands:[{to:25,color:'var(--danger)'},{to:45,color:'var(--warning)'},{to:70,color:'#a8b48a'},{to:85,color:'var(--positive)'},{to:100,color:'var(--accent)'}],label:String(Math.round(econ.stability)),sub:snap.stability.band,width:160})}<div><span class="kicker">Stability</span><p class="help">Heading towards <strong>${Math.round(snap.stability.target)}</strong>. Low stability cuts tax collection and halts building; above 70 it speeds growth and softens reform shocks.</p>${restless.length?`<p class="help warn">${icon('warning','icon-inline')}Restless: ${restless.map(r=>`<button class="link-button" data-act="fly" data-key="p${r.id}">${esc(ctx.civ.provinces.find(p=>p.id===r.id)?.name||'?')} (${Math.round(r.stab)})</button>`).join(', ')}</p>`:''}</div></div>
    ${diverging(terms.map(t=>({label:t.label,icon:icon(TERM_ICON[t.id]||'scales','icon-inline'),value:t.value,valueLabel:signed(t.value)})),{max})}</section>`;
}
function axisCard(ctx,axis){
  const {econ,ui,money}=ctx,st=econ.laws[axis.id],ep=effectivePosition(st),selected=ui.laws.selected[axis.id],current=axis.positions[st.pos],mood=econ.mood[axis.id],cooling=(econ.cooldown[axis.id]||0)>econ.day,n=axis.positions.length,x=i=>(i+.5)/n*100,open=selected!==undefined&&selected!==st.pos;
  const nodes=axis.positions.map((p,i)=>{const locked=(p.req?.inst&&ctx.rt.inst<p.req.inst)||(p.req?.tech&&ctx.rt.tech<p.req.tech),tipHtml=`<b>${esc(p.name)}</b><div>${esc(p.desc)}</div><div class="fx-list">${chips(p.fx)}</div>${locked?`<div class="down">Needs institutions of ${Math.round((p.req.inst||0)*100)}</div>`:''}`;
    return `<button class="node${i===st.pos?' current':''}${i===selected?' selected':''}${locked?' locked':''}" style="left:${x(i)}%" data-act="law-pick" data-axis="${axis.id}" data-pos="${i}" aria-label="${esc(p.name)}" data-tip-html="${esc(tipHtml)}">${locked?icon('ban'):''}</button><span class="node-label${i===st.pos?' current':''}" style="left:${x(i)}%">${esc(p.name)}</span>`;}).join('');
  const progress=st.progress<1?`<span class="phase">${Math.round(st.progress*100)}% in force</span>`:cooling?`<span class="phase dim">locked until ${isoDate(ctx.world,econ.cooldown[axis.id])}</span>`:'';
  let html=`<section class="law-axis${open?' open':''}"><div class="law-head"><span class="law-icon">${icon(LAW_ICON[axis.id]||'scales')}</span><span><strong>${esc(axis.name)}</strong><small>${esc(axis.blurb)}</small></span><span class="law-now">${esc(current.name)}${progress}</span></div>
    <div class="law-track"><span class="rail"></span><span class="fill" style="left:${x(Math.min(ep,st.from))}%;width:${Math.abs(x(ep)-x(st.from))}%"></span><span class="mood" style="left:${x(mood)}%" data-tip="The public leans towards ${esc(axis.positions[Math.round(mood)].name)}">${icon('people')}</span>${nodes}</div>`;
  if(open){const target=axis.positions[selected],q=lawQuote(ctx.world,econ,axis.id,selected);
    html+=`<div class="law-detail proposal"><div class="card-head"><strong>${esc(current.name)} → ${esc(target.name)}</strong><button class="icon-button" data-act="law-clear" data-axis="${axis.id}" aria-label="Close">${icon('close')}</button></div><p>${esc(target.desc)}</p><div class="fx-list">${chips(target.fx)}</div>`;
    if(q.ok){html+=`<div class="price"><div><span>Cost</span><strong class="${q.affordable?'':'down'}">${money(q.cost)}</strong></div><div><span>Shock</span><strong class="down">−${q.shock.toFixed(1)}</strong></div><div><span>Phase-in</span><strong>${q.months} months</strong></div><div><span>Then locked</span><strong>${dayLabel(axis.cooldown)}</strong></div></div>
      <div class="price projected"><div><span>Revenue</span><strong class="${q.delta.revenue>=0?'up':'down'}">${q.delta.revenue>=0?'+':'−'}${money(Math.abs(q.delta.revenue))}/yr</strong></div><div><span>Stability (long run)</span><strong class="${q.delta.stability>=0?'up':'down'}">${signed(q.delta.stability)}</strong></div><div><span>Growth</span><strong class="${q.delta.growth>=0?'up':'down'}">${signedPct(q.delta.growth,2)}</strong></div><div><span>Unemployment</span><strong class="${q.delta.unemployment<=0?'up':'down'}">${signedPct(q.delta.unemployment,1)}</strong></div></div>
      <p class="help">${Math.abs(selected-mood)<=Math.abs(st.pos-mood)?`${icon('up','icon-inline')}Closer to what the public wants`:`${icon('down','icon-inline')}Further from what the public wants`}${q.retreat?' · reversing a recent change costs half':''}.</p><button class="primary" data-act="law-enact" data-axis="${axis.id}" data-pos="${selected}" ${q.affordable?'':'disabled'}>Enact ${esc(target.name)}</button>`;}
    else html+=`<p class="help warn">${esc(q.error)}</p>`;
    html+='</div>';}
  return html+'</section>';
}
export function render(ctx){
  const {econ}=ctx,axes=LAW_AXES.map(a=>({label:a.name.split(' ')[0]})),now=LAW_AXES.map(a=>effectivePosition(econ.laws[a.id])/(a.positions.length-1)),mood=LAW_AXES.map(a=>econ.mood[a.id]/(a.positions.length-1));
  let html=stabilityCard(ctx);
  html+=section('Positions at a glance')+`<div class="radar-card">${radar(axes,[{label:'Public mood',color:'#86c79a',values:mood},{label:'Your laws',color:'#d9c48f',values:now}])}<div class="legend-list"><span><i style="background:#d9c48f"></i>Your laws</span><span><i style="background:#86c79a"></i>Public mood</span><p class="help">Each spoke runs from the first position (centre) to the last. Where the shapes part, the public is unhappy.</p></div></div>`;
  html+=section('National positions','<span class="dim">click a position to price it</span>')+LAW_AXES.map(a=>axisCard(ctx,a)).join('');
  if(econ.shocks.length)html+=section('Recent shocks')+`<ul class="event-log">${econ.shocks.map(s=>`<li class="warn">${esc(s.label)}: ${signed(s.v*s.left/s.total)} stability, fading over ${s.left} months</li>`).join('')}</ul>`;
  return html;
}
export const handlers={
  'law-pick':(ctx,d)=>{const st=ctx.econ.laws[d.axis];if(+d.pos===st.pos)delete ctx.ui.laws.selected[d.axis];else ctx.ui.laws.selected[d.axis]=+d.pos;ctx.rerender();},
  'law-clear':(ctx,d)=>{delete ctx.ui.laws.selected[d.axis];ctx.rerender();},
  'law-enact':(ctx,d)=>{const r=enactLaw(ctx.world,ctx.econ,d.axis,+d.pos);if(ctx.act(r)){delete ctx.ui.laws.selected[d.axis];ctx.rerender();}},
};
