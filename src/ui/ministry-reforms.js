import {esc,pct,signed,signedPct,meter,stabilityClass,dayLabel} from './ministry-kit.js';
import {LAW_AXES} from '../data/laws.js';
import {INDUSTRY_BY_ID} from '../data/industries.js';
import {effectivePosition} from '../game/economy/model.js';
import {enactLaw,lawQuote,isoDate} from '../game/economy/sim.js';
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

function stabilityCard(ctx){
  const {econ,snap}=ctx,terms=snap.stability.terms.slice().sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).filter(t=>Math.abs(t.value)>.05).slice(0,9),max=Math.max(8,...terms.map(t=>Math.abs(t.value)));
  const restless=Object.values(snap.places.reduce((m,p)=>{const g=m[p.province]||(m[p.province]={id:p.province,pop:0,stab:0});g.pop+=p.pop;g.stab+=p.stability*p.pop;return m;},{})).map(g=>({id:g.id,stab:g.pop?g.stab/g.pop:0})).filter(g=>g.stab<45).sort((a,b)=>a.stab-b.stab).slice(0,4);
  return `<section class="stability-card ${stabilityClass(econ.stability)}"><div class="stability-top"><div><span class="kicker">Stability</span><strong>${Math.round(econ.stability)}</strong> <em>${snap.stability.band}</em></div><div class="dim">heading towards ${Math.round(snap.stability.target)}</div></div>${meter(econ.stability,{className:'stab-meter',label:'Stability'})}
    <details class="stab-terms"><summary>What moves it</summary>${terms.map(t=>`<div class="term"><span>${esc(t.label)}</span><div class="term-bar"><b class="${t.value>=0?'up':'down'}" style="width:${Math.abs(t.value)/max*50}%;${t.value>=0?'left:50%':`right:50%`}"></b></div><strong class="${t.value>=0?'up':'down'}">${signed(t.value)}</strong></div>`).join('')}<p class="help">Low stability cuts tax collection and halts building. Above 70 it speeds growth and makes reform cheaper.</p></details>
    ${restless.length?`<p class="help warn">Restless: ${restless.map(r=>`${esc(ctx.civ.provinces.find(p=>p.id===r.id)?.name||'?')} (${Math.round(r.stab)})`).join(', ')}</p>`:''}</section>`;
}
function axisCard(ctx,axis){
  const {econ,ui,money}=ctx,st=econ.laws[axis.id],ep=effectivePosition(st),open=ui.laws.open===axis.id,selected=ui.laws.selected[axis.id],current=axis.positions[st.pos],mood=econ.mood[axis.id],cooling=(econ.cooldown[axis.id]||0)>econ.day;
  const track=axis.positions.map((p,i)=>{
    const locked=(p.req?.inst&&ctx.rt.inst<p.req.inst)||(p.req?.tech&&ctx.rt.tech<p.req.tech);
    return `<button class="pos${i===st.pos?' current':''}${i===selected?' selected':''}${locked?' locked':''}" data-act="law-pick" data-axis="${axis.id}" data-pos="${i}" aria-pressed="${i===(selected??st.pos)}" title="${esc(p.desc)}">${locked?'🔒 ':''}${esc(p.name)}</button>`;
  }).join('');
  let detail=`<div class="law-detail"><strong>${esc(current.name)}</strong><p>${esc(current.desc)}</p><div class="fx-list">${chips(current.fx)}</div></div>`;
  if(selected!==undefined&&selected!==st.pos){
    const target=axis.positions[selected],q=lawQuote(ctx.world,econ,axis.id,selected);
    detail=`<div class="law-detail proposal"><strong>${esc(target.name)}</strong><p>${esc(target.desc)}</p><div class="fx-list">${chips(target.fx)}</div>`;
    if(q.ok){
      detail+=`<div class="price"><div><span>Cost</span><strong class="${q.affordable?'':'down'}">${money(q.cost)}</strong></div><div><span>Stability shock</span><strong class="down">−${q.shock.toFixed(1)}</strong></div><div><span>Phased in over</span><strong>${q.months} months</strong></div><div><span>Then locked</span><strong>${dayLabel(axis.cooldown)}</strong></div></div><div class="price projected"><div><span>Revenue</span><strong class="${q.delta.revenue>=0?'up':'down'}">${q.delta.revenue>=0?'+':'−'}${money(Math.abs(q.delta.revenue))}/yr</strong></div><div><span>Long-run stability</span><strong class="${q.delta.stability>=0?'up':'down'}">${signed(q.delta.stability)}</strong></div><div><span>Growth</span><strong class="${q.delta.growth>=0?'up':'down'}">${signedPct(q.delta.growth,2)}</strong></div></div>`;
      detail+=`<p class="help">${Math.abs(selected-mood)<=Math.abs(st.pos-mood)?'Closer to what the public wants':'Further from what the public wants'}${q.retreat?' · reversing a recent change costs half':''}.</p><button class="primary" data-act="law-enact" data-axis="${axis.id}" data-pos="${selected}" ${q.affordable?'':'disabled'}>Enact ${esc(target.name)}</button>`;
    }else detail+=`<p class="help warn">${esc(q.error)}</p>`;
    detail+='</div>';
  }
  const progress=st.progress<1?`<span class="phase">${Math.round(st.progress*100)}% in force</span>`:cooling?`<span class="phase dim">locked until ${isoDate(ctx.world,econ.cooldown[axis.id])}</span>`:'';
  return `<section class="law-axis${open?' open':''}" data-axis="${axis.id}"><button class="law-head" data-act="law-open" data-axis="${axis.id}" aria-expanded="${open}"><span><strong>${esc(axis.name)}</strong><small>${esc(axis.blurb)}</small></span><span class="law-now">${esc(current.name)}${progress}</span></button>${open?`<div class="law-body"><div class="track" style="--n:${axis.positions.length}">${track}<i class="mood-mark" style="left:${(mood+.5)/axis.positions.length*100}%" title="Public mood leans towards ${esc(axis.positions[Math.round(mood)].name)}"></i></div><p class="help mood-note">▲ marks the public mood: ${esc(axis.positions[Math.round(mood)].name)}.</p>${detail}</div>`:''}</section>`;
}
export function render(ctx){
  return `<p class="help">Reforms take months to bite and shake confidence. Matching the public mood is cheap; overruling it is not.</p>${stabilityCard(ctx)}<div class="info-section-title">National positions</div>${LAW_AXES.map(a=>axisCard(ctx,a)).join('')}${ctx.econ.shocks.length?`<div class="info-section-title">Recent shocks</div><ul class="event-log">${ctx.econ.shocks.map(s=>`<li class="warn">${esc(s.label)}: ${signed(s.v*s.left/s.total)} stability, fading over ${s.left} months</li>`).join('')}</ul>`:''}`;
}
export const handlers={
  'law-open':(ctx,d)=>{ctx.ui.laws.open=ctx.ui.laws.open===d.axis?null:d.axis;ctx.rerender();},
  'law-pick':(ctx,d)=>{ctx.ui.laws.selected[d.axis]=+d.pos;ctx.ui.laws.open=d.axis;ctx.rerender();},
  'law-enact':(ctx,d)=>{const r=enactLaw(ctx.world,ctx.econ,d.axis,+d.pos);if(ctx.act(r)){delete ctx.ui.laws.selected[d.axis];ctx.rerender();}},
};
