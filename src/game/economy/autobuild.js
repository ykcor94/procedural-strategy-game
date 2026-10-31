import {clamp} from '../../core/geo.js';
import {BUILDINGS,BUILDING_BY_ID} from '../../data/buildings.js';
import {RESOURCE_IDS} from '../../data/resources.js';
import {provinceResources,worldTypical} from '../resources.js';
import {quoteProject,queueProject,current,slotsFree} from './sim.js';
/** The auto-build fund: a share of revenue set aside each month and spent by standing directives — what to
 * build and where — so routine development runs itself. Each project is paid from the fund, never the
 * treasury, and carries an "auto" badge in the queue. */
export const FUND_SHARES=Object.freeze([0,.02,.05,.08,.12,.18]);
export const DIRECTIVE_TYPES=Object.freeze([
  {id:'best',name:'Best return',blurb:'Whichever productive project pays for itself fastest.'},
  {id:'housing',name:'Housing where short',blurb:'Homes wherever new jobs lack workers.'},
  {id:'port',name:'Harbours',blurb:'Deeper ports in coastal cities.'},
  {id:'civic',name:'Civic works',blurb:'Monuments, parks and temples where stability is lowest.'},
  ...BUILDINGS.filter(b=>b.tier==='A').map(b=>({id:b.id,name:b.name,blurb:b.summary,building:true})),
]);
export const DIRECTIVE_BY_ID=Object.freeze(Object.fromEntries(DIRECTIVE_TYPES.map(d=>[d.id,d])));
export const WHERE=Object.freeze([
  {id:'any',name:'Anywhere'},{id:'province',name:'One province'},{id:'poorest',name:'Poorest provinces'},{id:'unemployed',name:'High unemployment'},{id:'resource',name:'Near a resource'},
]);
export const PRESETS=Object.freeze({
  balanced:{name:'Balanced growth',directives:[{type:'best',where:'any',weight:2},{type:'housing',where:'any',weight:1},{type:'civic',where:'any',weight:.5}]},
  industrialise:{name:'Industrialise',directives:[{type:'heavy',where:'any',weight:2},{type:'energy',where:'any',weight:1.5},{type:'mining',where:'resource',target:'iron',weight:1}]},
  regional:{name:'Regional development',directives:[{type:'best',where:'poorest',weight:2},{type:'best',where:'unemployed',weight:1.5},{type:'housing',where:'any',weight:.5}]},
  housing:{name:'Housing first',directives:[{type:'housing',where:'any',weight:1}]},
  prestige:{name:'Prestige',directives:[{type:'civic',where:'any',weight:1}]},
});
export function ensureFund(econ){econ.fund||={share:0,balance:0,directives:[],nextId:1,log:[],spent:0,built:0};return econ.fund;}

/* ---------- player actions ---------- */
export function setFundShare(econ,share){if(!FUND_SHARES.includes(+share))return {ok:false,error:'Unknown share.'};ensureFund(econ).share=+share;return {ok:true};}
export function addDirective(econ,spec={}){const f=ensureFund(econ);if(f.directives.length>=8)return {ok:false,error:'Up to eight directives.'};const type=DIRECTIVE_BY_ID[spec.type]?spec.type:'best';
  const d={id:f.nextId++,on:true,type,where:WHERE.some(w=>w.id===spec.where)?spec.where:'any',target:spec.target??0,weight:clamp(+spec.weight||1,.25,4),max:clamp(+spec.max||2,1,6),size:clamp(+spec.size||2,1,3),payback:clamp(+spec.payback||25,3,60),limit:Math.max(0,+spec.limit||0),built:0,spent:0};f.directives.push(d);return {ok:true,directive:d};}
export function updateDirective(econ,id,patch){const d=ensureFund(econ).directives.find(x=>x.id===+id);if(!d)return {ok:false,error:'No such directive.'};
  for(const [k,v] of Object.entries(patch)){if(k==='type'&&DIRECTIVE_BY_ID[v])d.type=v;else if(k==='where'&&WHERE.some(w=>w.id===v)){d.where=v;d.target=v==='resource'?'iron':0;}else if(k==='target')d.target=d.where==='resource'?String(v):+v;else if(k==='on')d.on=!!v;else if(['weight','max','size','payback','limit'].includes(k))d[k]=+v;}
  d.weight=clamp(d.weight,.25,4);d.max=clamp(Math.round(d.max),1,6);d.size=clamp(Math.round(d.size),1,3);d.payback=clamp(d.payback,3,60);d.limit=Math.max(0,Math.round(d.limit));return {ok:true};}
export function removeDirective(econ,id){const f=ensureFund(econ);f.directives=f.directives.filter(d=>d.id!==+id);return {ok:true};}
export function applyPreset(econ,key){const p=PRESETS[key];if(!p)return {ok:false,error:'Unknown preset.'};const f=ensureFund(econ);f.directives=[];for(const d of p.directives)addDirective(econ,d);if(!f.share)f.share=.05;return {ok:true};}

/* ---------- site search ---------- */
/** Places a directive may build in. */
export function directivePlaces(world,econ,d,snap=current(world,econ)){
  let places=snap.places;
  if(d.where==='province')places=places.filter(p=>p.province===+d.target);
  else if(d.where==='poorest'){const byProv=new Map();for(const p of snap.places){const g=byProv.get(p.province)||{out:0,pop:0};g.out+=p.out;g.pop+=p.pop;byProv.set(p.province,g);}const ranked=[...byProv].map(([id,g])=>[id,g.pop?g.out/g.pop:0]).sort((a,b)=>a[1]-b[1]),keep=new Set(ranked.slice(0,Math.max(1,Math.ceil(ranked.length*.3))).map(r=>r[0]));places=places.filter(p=>keep.has(p.province));}
  else if(d.where==='unemployed')places=places.filter(p=>p.unemployment>snap.unemployment+.02);
  else if(d.where==='resource'){const k=RESOURCE_IDS.indexOf(String(d.target)),res=provinceResources(world),typ=worldTypical(world);if(k>=0)places=places.filter(p=>{const rec=res.get(p.province);return rec&&rec.score[k]>1.25*typ[k];});}
  return places;
}
/** The best project a directive would queue now, or null. */
export function directiveCandidate(world,econ,d,snap=current(world,econ)){
  const places=directivePlaces(world,econ,d,snap).filter(p=>slotsFree(econ,p)>0);let best=null;
  const consider=(type,place,score)=>{const q=quoteProject(world,econ,type,place,d.size);if(!q.ok)return;const s=score(q);if(s!=null&&(!best||s<best.score))best={...q,score:s};};
  if(d.type==='best'){for(const b of BUILDINGS.filter(b=>b.tier==='A'))for(const p of places)if(b.where.includes(p.kind))consider(b.id,p.key,q=>q.payback<=d.payback?q.payback:null);}
  else if(d.type==='housing'){for(const p of places)if(p.kind==='city'&&p.labour<.98)consider('housing',p.key,q=>p.labour);}
  else if(d.type==='port'){for(const p of places)if(p.kind==='city'&&p.coastal)consider('port',p.key,q=>q.payback<=d.payback*2?q.payback:null);}
  else if(d.type==='civic'){const civic=BUILDINGS.filter(b=>b.tier==='C');for(const p of places.filter(p=>p.kind==='city').sort((a,b)=>a.stability-b.stability).slice(0,4))for(const b of civic)consider(b.id,p.key,q=>p.stability+q.cost/Math.max(1e-9,q.prestige||1)/Math.max(1,snap.revenue.total)*50);}
  else if(BUILDING_BY_ID[d.type]){const b=BUILDING_BY_ID[d.type];for(const p of places)if(b.where.includes(p.kind))consider(d.type,p.key,q=>q.payback<=d.payback?q.payback:null);}
  return best;
}

/** Monthly: credit the fund, then let directives queue projects in proportion to their weight. */
export function autoBuildMonth(world,econ,emit=()=>{}){
  const f=ensureFund(econ),snap=current(world,econ);f.balance+=f.share*snap.revenue.total/12;
  const live=f.directives.filter(d=>d.on&&(!d.limit||d.built<d.limit));if(!live.length||f.balance<=0)return;
  live.sort((a,b)=>a.spent/a.weight-b.spent/b.weight);
  for(const d of live){
    const active=econ.queue.filter(p=>p.auto===d.id).length;if(active>=d.max)continue;
    const q=directiveCandidate(world,econ,d,snap);if(!q||q.cost>f.balance)continue;
    const r=queueProject(world,econ,q.type,q.place,q.size);if(!r.ok)continue;
    r.project.auto=d.id;r.project.reserve=q.cost;f.balance-=q.cost;d.spent+=q.cost;d.built++;f.built++;f.spent+=q.cost;
    f.log.unshift({day:econ.day,type:q.type,place:q.placeName,cost:q.cost,directive:d.id});if(f.log.length>30)f.log.length=30;
    emit(`Auto-build fund: ${BUILDING_BY_ID[q.type].name} started in ${q.placeName}.`);
  }
}
