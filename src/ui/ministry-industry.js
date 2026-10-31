import {esc,pct,compact,trend,tip} from './ministry-kit.js';
import {INDUSTRIES} from '../data/industries.js';
import {FUND_LEVELS,DEFAULT_BOARD} from '../game/economy/model.js';
import {economicIdentity} from '../game/economy/industry-gen.js';
import {setBoard} from '../game/economy/sim.js';
const seg=(industry,key,labels,value,helps=[])=>`<div class="segmented small" role="group" aria-label="${key}">${labels.map((label,i)=>`<button data-act="board" data-ind="${industry}" data-key="${key}" data-value="${i}" aria-pressed="${value===i}" title="${esc(helps[i]||'')}">${label}</button>`).join('')}</div>`;
export function render(ctx){
  const {snap,econ,money}=ctx,identity=economicIdentity(snap.industry.map(i=>i.share)),slots=snap.build.prioritySlots,used=snap.build.priority.length;
  let html=`<section class="ministry-hero"><span class="kicker">National strengths</span><h2>${esc(identity.title.replace(/^./,c=>c.toUpperCase()))}</h2><p class="help">Decide which industries the state backs. Priorities (${used} of ${slots} in use) build cheaper and grow faster; funding buys output now at a monthly cost; regulation trades output for steadiness.</p></section>`;
  html+=INDUSTRIES.map(i=>({i,data:snap.industry[i.index]})).sort((a,b)=>b.data.out-a.data.out).map(({i,data})=>{
    const b=econ.board[i.id]||DEFAULT_BOARD,strong=identity.strengths.includes(i.id),cost=FUND_LEVELS[b.fund]*.1*data.out;
    return `<article class="industry-card"><header><i style="background:${i.color}"></i><div><strong>${esc(i.name)}${strong?' <em class="strength" title="A national strength">★</em>':''}</strong><small>${esc(i.blurb)}</small></div><div class="ind-figures"><b>${pct(data.share)}</b><span>${trend(data.growth)}</span></div></header><div class="ind-bar"><b style="width:${Math.min(100,data.share*100*3)}%;background:${i.color}"></b></div><p class="ind-stats"><span>Output ${money(data.out)}</span><span>${compact(data.jobs)} jobs</span>${cost?`<span>Subsidy ${money(cost)} a year</span>`:''}</p>
      <div class="ind-controls"><label>${tip('Invest','Priority: 20% cheaper to build, +0.6% growth a year, uses a priority slot. Neglect: slower growth and dearer building.')}${seg(i.id,'invest',['Neglect','Normal','Priority'],b.invest)}</label><label>${tip('Fund','Subsidy as a share of the industry’s output. Raises efficiency at once; costs the treasury every month.')}${seg(i.id,'fund',FUND_LEVELS.map(v=>v?pct(v,0):'None'),b.fund)}</label><label>${tip('Regulate','Strict rules cut output by 5% but steady the nation. Light rules add 3% output and unsettle it.')}${seg(i.id,'regulate',['Light','Standard','Strict'],b.regulate)}</label></div></article>`;
  }).join('');
  return html;
}
export const handlers={
  board:(ctx,d)=>ctx.act(setBoard(ctx.world,ctx.econ,d.ind,d.key,+d.value)),
};
