import {clamp} from '../../core/geo.js';
import {seededRandom} from '../../core/random.js';
import {GOOD_BY_ID} from '../../data/resources.js';
import {worldContext,blocOf} from './state.js';
import {AGREEMENTS,SANCTION_BY_ID,SANCTION_LEVELS,STRATEGIC,termWith,marketResults} from './market.js';
import {ideologyGroup} from './ai.js';
/** Deliberately small diplomacy: a trade relation with every nation, three kinds of agreement, three
 * levels of sanctions (with coalitions and retaliation) and regional trade blocs. */
export const relationLabel=v=>v>=60?'Close partner':v>=30?'Friendly':v>=8?'Cordial':v>-8?'Neutral':v>-30?'Cool':v>-60?'Hostile':'Adversary';

/** Where a relation is heading and why: [{label,value}]. */
export function relationTerms(world,ws,id){
  const ctx=worldContext(world),p=ws.player,terms=[],res=marketResults(ws),add=(label,value)=>{if(Math.abs(value)>=.5)terms.push({label,value:+value.toFixed(1)});};
  add('Shared identity and politics',ctx.affinity(p,id));
  if(res){const key=p<id?`${p}:${id}`:`${id}:${p}`,v=res.pairs.get(key)||0;let total=0;for(const [k,x] of res.pairs)if(k.split(':').map(Number).includes(id))total+=x;add('Trade with you',clamp(28*(total?v/total:0)*3,0,22));}
  const t=termWith(ws,id);if(t)add(AGREEMENTS[t.kind].name,t.kind==='free'?18:t.kind==='trade'?10:7);
  const bp=blocOf(ws,p);if(bp?.members.includes(id))add(`Fellow member of the ${bp.name}`,12);
  for(const s of ws.sanctions){if(s.by===p&&s.on===id)add(`Your ${SANCTION_BY_ID[s.level].name.toLowerCase()}`,SANCTION_BY_ID[s.level].relation);if(s.on===p&&s.by===id)add('Their sanctions on you',-10);
    if(s.by===p&&s.on!==id&&blocOf(ws,s.on)?.members.includes(id))add('You sanction a bloc partner',-12);
    if(s.by===p&&s.on!==id&&ws.sanctions.some(x=>x.by===id&&x.on===s.on))add('Shared sanctions',6);}
  if(ws.nations[id]?.mission>ws.day)add('Trade mission',12);
  return terms;
}
export function relationTarget(world,ws,id){return clamp(relationTerms(world,ws,id).reduce((s,t)=>s+t.value,0),-100,100);}
/** Monthly drift of every relation towards its target. */
export function relationsMonth(world,ws){for(const id of Object.keys(ws.relations)){const v=ws.relations[id],t=relationTarget(world,ws,+id);ws.relations[id]=+clamp(v+(t-v)*.06,-100,100).toFixed(2);}}

/* ---------- agreements ---------- */
export function agreementQuote(world,ws,id,kind,good){
  const a=AGREEMENTS[kind],rel=ws.relations[id]??0,n=ws.nations[id];if(!a||!n)return {ok:false,error:'Unknown agreement.'};
  if(ws.sanctions.some(s=>(s.by===ws.player&&s.on===id)||(s.by===id&&s.on===ws.player)))return {ok:false,error:'Lift sanctions first.'};
  if(kind==='contract'){if(!GOOD_BY_ID[good])return {ok:false,error:'Choose a good to contract.'};const res=marketResults(ws),x=res?.exp.get(id)?.[GOOD_BY_ID[good].index]||0;if(x<=0)return {ok:false,error:`${n.name||'They'} export no ${GOOD_BY_ID[good].name.toLowerCase()}.`};}
  const bp=blocOf(ws,id),pb=blocOf(ws,ws.player);if(kind==='free'&&bp&&bp!==pb)return {ok:false,error:'They trade freely only inside their bloc. Join it instead.'};
  const need=a.minRelation+(n.policy.openness<.4?10:0);return {ok:true,accept:rel>=need,need,rel,kind,good};
}
export function signAgreement(world,ws,id,kind,good){
  const q=agreementQuote(world,ws,id,kind,good);if(!q.ok)return q;if(!q.accept)return {ok:false,error:`They decline: relations need to be at least ${q.need} (now ${Math.round(q.rel)}).`};
  ws.terms[id]={kind,since:ws.day,until:kind==='contract'?ws.day+3650:null,good:kind==='contract'?good:undefined,price:kind==='contract'?ws.goods.price[GOOD_BY_ID[good].index]:undefined};
  ws.relations[id]=clamp((ws.relations[id]||0)+4,-100,100);return {ok:true};
}
export function cancelAgreement(world,ws,id){if(!ws.terms[id])return {ok:false,error:'No agreement.'};delete ws.terms[id];ws.relations[id]=clamp((ws.relations[id]||0)-10,-100,100);return {ok:true};}

/* ---------- sanctions ---------- */
/** Impose (or change) sanctions; target retaliates and like-minded nations may join. Returns the coalition. */
export function imposeSanctions(world,ws,id,level,news=()=>{}){
  if(!SANCTION_BY_ID[level])return {ok:false,error:'Unknown sanction level.'};const ctx=worldContext(world),target=ctx.byId.get(id),me=ctx.byId.get(ws.player);if(!target||id===ws.player)return {ok:false,error:'Choose a foreign nation.'};
  ws.sanctions=ws.sanctions.filter(s=>!(s.by===ws.player&&s.on===id));ws.sanctions.push({by:ws.player,on:id,level,since:ws.day});delete ws.terms[id];
  ws.relations[id]=clamp((ws.relations[id]||0)+SANCTION_BY_ID[level].relation*.6,-100,100);
  const r=seededRandom(`${world.seed}:${world.meta.civilization.seed}`,`sanction:${id}:${ws.day}`),joined=[];
  // Retaliation, scaled to how hawkish the target is.
  const t=ws.nations[id],rank=SANCTION_LEVELS.findIndex(s=>s.id===level),back=SANCTION_LEVELS[Math.max(0,Math.min(rank,Math.round(rank*(t?.policy.hawk??.5)+(r()-.4))))];
  ws.sanctions=ws.sanctions.filter(s=>!(s.by===id&&s.on===ws.player));ws.sanctions.push({by:id,on:ws.player,level:back.id,since:ws.day,retaliation:true});
  news(`${target.name} retaliates with ${back.name.toLowerCase()} on ${me?.name||'you'}.`,'bad',id);
  for(const n of ctx.nations){if(n.id===ws.player||n.id===id)continue;const rel=ws.relations[n.id]||0,aff=ctx.affinity(n.id,id),bloc=blocOf(ws,n.id);if(bloc?.members.includes(id))continue;
    const chance=clamp((rel-25)/80-aff/60+(ideologyGroup(n)===ideologyGroup(me)?.08:0),0,.75);if(r()<chance){ws.sanctions.push({by:n.id,on:id,level:level==='embargo'?'broad':level,since:ws.day,coalition:ws.player});joined.push(n.id);}}
  if(joined.length)news(`${joined.length} nation${joined.length>1?'s':''} join${joined.length>1?'':'s'} your sanctions on ${target.name}.`,'info',id);
  return {ok:true,joined,retaliation:back.id};
}
export function liftSanctions(world,ws,id,news=()=>{}){
  const had=ws.sanctions.some(s=>s.by===ws.player&&s.on===id);if(!had)return {ok:false,error:'No sanctions to lift.'};
  ws.sanctions=ws.sanctions.filter(s=>!(s.by===ws.player&&s.on===id)&&!(s.coalition===ws.player&&s.on===id));
  const ctx=worldContext(world);news(`Sanctions on ${ctx.byId.get(id)?.name||'a nation'} are lifted.`,'info',id);
  ws.relations[id]=clamp((ws.relations[id]||0)+8,-100,100);return {ok:true};
}

/* ---------- blocs ---------- */
export function blocQuote(world,ws,blocId){
  const b=ws.blocs.find(x=>x.id===blocId);if(!b)return {ok:false,error:'Unknown bloc.'};if(b.members.includes(ws.player))return {ok:true,member:true,bloc:b};
  if(blocOf(ws,ws.player))return {ok:false,error:'Leave your current bloc first.'};
  const rels=b.members.map(id=>ws.relations[id]||0),avg=rels.reduce((s,v)=>s+v,0)/rels.length,min=Math.min(...rels),sanctioned=ws.sanctions.some(s=>(s.by===ws.player&&b.members.includes(s.on))||(s.on===ws.player&&b.members.includes(s.by)));
  return {ok:true,member:false,bloc:b,avg,min,accept:!sanctioned&&avg>=25&&min>=-5,need:'an average relation of 25 and no member below −5',sanctioned};
}
export function joinBloc(world,ws,blocId,news=()=>{}){
  const q=blocQuote(world,ws,blocId);if(!q.ok)return q;if(q.member)return {ok:false,error:'Already a member.'};if(!q.accept)return {ok:false,error:q.sanctioned?'Members will not admit a nation in a sanctions dispute with them.':`Members need ${q.need} (average now ${Math.round(q.avg)}).`};
  q.bloc.members.push(ws.player);for(const id of q.bloc.members)if(id!==ws.player){ws.relations[id]=clamp((ws.relations[id]||0)+6,-100,100);}
  news(`You join the ${q.bloc.name}: free trade with ${q.bloc.members.length-1} members.`,'good');return {ok:true};
}
export function leaveBloc(world,ws,news=()=>{}){
  const b=blocOf(ws,ws.player);if(!b)return {ok:false,error:'You are not in a bloc.'};b.members=b.members.filter(id=>id!==ws.player);
  for(const id of b.members)ws.relations[id]=clamp((ws.relations[id]||0)-12,-100,100);news(`You leave the ${b.name}.`,'warn');return {ok:true};
}

/* ---------- AI diplomacy, once a year ---------- */
export function aiDiplomacyYear(world,ws,year,news){
  const ctx=worldContext(world),r=seededRandom(`${world.seed}:${world.meta.civilization.seed}`,`ai-diplomacy:${year}`);
  // Old AI sanctions lapse; hostile neighbours occasionally sanction each other.
  ws.sanctions=ws.sanctions.filter(s=>{if(s.by===ws.player||s.on===ws.player&&!s.retaliation)return true;if(s.retaliation){return ws.sanctions.some(x=>x.by===ws.player&&x.on===s.by)||r()>.25;}if(s.coalition)return ws.sanctions.some(x=>x.by===s.coalition&&x.on===s.on);const keep=r()>.3;if(!keep)news(`${ctx.byId.get(s.by)?.name} lifts sanctions on ${ctx.byId.get(s.on)?.name}.`,'info',s.by);return keep;});
  for(const n of ctx.nations){if(n.id===ws.player||r()>.06)continue;const s=ws.nations[n.id];if(!s)continue;const rival=(ctx.links.get(n.id)||[]).filter(l=>l.border&&l.id!==ws.player).sort((a,b)=>ctx.affinity(n.id,a.id)-ctx.affinity(n.id,b.id))[0];
    if(rival&&ctx.affinity(n.id,rival.id)<-2&&s.policy.hawk>.45&&!ws.sanctions.some(x=>x.by===n.id&&x.on===rival.id)){const level=s.policy.hawk>.75?'broad':'targeted';ws.sanctions.push({by:n.id,on:rival.id,level,since:ws.day});news(`${n.name} imposes ${SANCTION_BY_ID[level].name.toLowerCase()} on ${ctx.byId.get(rival.id)?.name}.`,'warn',n.id);}}
  // Blocs grow with like-minded neighbours and shed unhappy members.
  for(const b of ws.blocs){const founder=b.founder;
    for(const id of [...b.members]){if(id===ws.player||id===founder)continue;const st=ws.nations[id];if(st&&st.stab<15&&r()<.25){b.members=b.members.filter(x=>x!==id);news(`${ctx.byId.get(id)?.name} leaves the ${b.name}.`,'warn',id);}}
    if(r()<.3){const candidates=(ctx.links.get(founder)||[]).filter(l=>l.id!==ws.player&&!blocOf(ws,l.id)&&!ws.sanctions.some(s=>(s.by===l.id&&b.members.includes(s.on))||(s.on===l.id&&b.members.includes(s.by)))).map(l=>({id:l.id,score:ctx.affinity(founder,l.id)+l.conn*25})).filter(c=>c.score>16).sort((a,c)=>c.score-a.score);
      if(candidates[0]){b.members.push(candidates[0].id);news(`${ctx.byId.get(candidates[0].id)?.name} joins the ${b.name}.`,'info',candidates[0].id);}}
  }
}
export {STRATEGIC};
