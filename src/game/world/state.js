import {clamp} from '../../core/geo.js';
import {seededRandom} from '../../core/random.js';
import {INDUSTRIES,INDUSTRY_COUNT} from '../../data/industries.js';
import {GOOD_COUNT} from '../../data/resources.js';
import {gridAdjacency} from '../../civilization/identity.js';
import {sampleEnvironment,industryProfile} from '../economy/industry-gen.js';
import {nationEndowment,worldTypical} from '../resources.js';
import {RESOURCE_IDS} from '../../data/resources.js';
import {createNationDemography} from '../demography/model.js';
import {personality,ideologyGroup} from './ai.js';

/** The living world of a campaign: every nation's aggregate economy and demography, the world goods
 * market, relations with the player, agreements, sanctions and trade blocs. Plain JSON under
 * meta.game.world; derived matrices (distances, affinities) are rebuilt on load and never saved. */
export const WORLD_VERSION=1;
const BLOC_WORDS=['Accord','Compact','League','Union','Concord','Pact','Commonwealth','Partnership'];
const BLOC_COLORS=['#d5a24a','#5fa3c9','#b06aa8','#6fb27d','#cf6a5a','#8a8fd6'];

/* ---------- derived context ---------- */
const memo=new WeakMap();
/** Static relationships between nations: capitals, neighbours, shared faith, language family and ideology. */
export function worldContext(world){
  const civ=world.meta.civilization,cached=memo.get(world);if(cached&&cached.revision===civ.revision)return cached;
  const w=world.width,nations=civ.nations.filter(n=>n.population>0&&n.area>0),byId=new Map(nations.map(n=>[n.id,n])),cities=new Map(civ.cities.map(c=>[c.id,c]));
  const pos=new Map(nations.map(n=>{const c=cities.get(n.capital);return [n.id,c?{x:c.x,y:c.y}:{x:(n.center??0)%w,y:Math.floor((n.center??0)/w)}];}));
  const {adj}=gridAdjacency(world.layers.ownership,w,world.height),family=new Map();
  for(const n of nations){const lang=(civ.languages||[]).find(l=>l.id===n.officialLanguage);family.set(n.id,lang?.family??civ.cultures.find(c=>c.language?.id===n.officialLanguage)?.family??0);}
  const routeLinks=new Map(),key=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
  for(const r of civ.tradeRoutes||[]){const a=cities.get(r.from)?.nation,b=cities.get(r.to)?.nation;if(a&&b&&a!==b){const k=key(a,b);routeLinks.set(k,(routeLinks.get(k)||0)+Math.log1p(r.volume||0));}}
  const distance=(a,b)=>{const p=pos.get(a),q=pos.get(b);if(!p||!q)return 1;let dx=Math.abs(p.x-q.x);dx=Math.min(dx,w-dx);return Math.hypot(dx,p.y-q.y)/w;};
  // Sparse trade connectivity: neighbours, route partners and the nearest few dozen nations.
  const links=new Map();
  for(const a of nations){
    const list=[];
    for(const b of nations){if(a===b)continue;const d=distance(a.id,b.id),border=adj.get(a.id)?.has(b.id)?1:0,routes=routeLinks.get(key(a.id,b.id))||0;
      const conn=Math.exp(-d/.16)+.35*border+.08*routes;if(conn>.02||border||routes)list.push({id:b.id,conn,border:!!border,d});}
    list.sort((x,y)=>y.conn-x.conn);links.set(a.id,list.slice(0,40));
  }
  const affinity=(a,b)=>{const x=byId.get(a),y=byId.get(b);if(!x||!y)return 0;let v=0;if(x.dominantReligion&&x.dominantReligion===y.dominantReligion)v+=18;if(family.get(a)&&family.get(a)===family.get(b))v+=12;if(ideologyGroup(x)===ideologyGroup(y))v+=12;else if((ideologyGroup(x)==='democratic')!==(ideologyGroup(y)==='democratic'))v-=6;if(adj.get(a)?.has(b))v-=4;return v;};
  const ctx={revision:civ.revision,nations,byId,pos,adj,links,distance,affinity,family,routeLinks,key};memo.set(world,ctx);return ctx;
}

/** Industry shares for a nation as a whole: the same site model the player's places use, at national scale. */
function nationalShares(world,nation,cells){
  const env=sampleEnvironment(world,cells),end=nationEndowment(world,nation.id),typ=worldTypical(world),size=Math.max(1,Math.sqrt(cells.length)),rel=ids=>ids.reduce((s,id)=>s+end[RESOURCE_IDS.indexOf(id)],0)/Math.max(1e-6,size*ids.reduce((s,id)=>s+typ[RESOURCE_IDS.indexOf(id)],0));
  const attrs={env,u:clamp(nation.urbanization||.4,0,1)*.7,ore:clamp(1-Math.exp(-.6*rel(['iron','copper','precious'])),0,1),fuel:clamp(1-Math.exp(-.55*rel(['coal','oil'])),0,1),port:env.coast>.25?1:0,capital:.4,access:nation.tradeAccess??.5,degree:3,holy:0,tech:nation.technology??.5,resources:clamp(.5*(rel(['iron','copper','coal','oil'])),0,1)};
  return Array.from(industryProfile(world,attrs,`nation:${nation.id}`).share);
}

/* ---------- creation ---------- */
export function createWorldState(world,econ){
  const civ=world.meta.civilization,ctx=worldContext(world),seed=`${world.seed}:${civ.seed}`,r=seededRandom(seed,'world-campaign'),cells=new Map();
  for(let i=0;i<world.layers.ownership.length;i++){const id=world.layers.ownership[i];if(!id)continue;let list=cells.get(id);if(!list)cells.set(id,list=[]);list.push(i);}
  const nations={};
  for(const n of ctx.nations){
    const pr=seededRandom(seed,`world-nation:${n.id}`),shares=nationalShares(world,n,cells.get(n.id)||[]),pers=personality(n,pr);
    nations[n.id]={id:n.id,gdp:n.economicOutput||0,gdp0:n.economicOutput||0,pop:n.population||0,pop0:n.population||0,growth:0,popGrowth:0,stab:clamp(40+38*(n.economicProfile?.institutions??.5)+(pr()-.5)*14,15,92),
      shares:shares.map(v=>+v.toFixed(5)),policy:pers,cycle:pr()*Math.PI*2,debt:+(.2+.5*pr()).toFixed(3),inflation:.02,cpi:1,
      demo:createNationDemography(world,n,pr),census:{interval:pers.census,last:0,next:Math.round(pr()*pers.census*365),view:null},hist:[{d:0,gdp:Math.round(n.economicOutput||0),pop:Math.round(n.population||0)}],events:0};
    nations[n.id].census.view=snapshotNation(nations[n.id],0);
  }
  const ws={version:WORLD_VERSION,day:0,player:econ.nation,goods:{price:new Array(GOOD_COUNT).fill(1),calib:null,hist:[]},nations,relations:{},terms:{},sanctions:[],blocs:[],news:[],cycle:r()*Math.PI*2,shocks:[],nextId:1};
  for(const n of ctx.nations)if(n.id!==econ.nation)ws.relations[n.id]=+clamp(ctx.affinity(econ.nation,n.id)+(r()-.5)*20,-60,70).toFixed(1);
  foundBlocs(world,ws,ctx,r);
  return ws;
}
/** The visible census copy of a nation's demography. */
export function snapshotNation(state,day){const d=state.demo;return {day,pop:Math.round(state.pop),bands:d.bands.slice(),urban:d.urban,lit:d.lit,life:d.life,fert:d.fert,groups:{c:d.groups.c.map(e=>e.slice()),l:d.groups.l.map(e=>e.slice()),r:d.groups.r.map(e=>e.slice())},growth:state.popGrowth,mig:d.mig||0};}

/** Three to six regional blocs of like-minded neighbours. */
function foundBlocs(world,ws,ctx,r){
  const count=clamp(Math.round(ctx.nations.length/14),2,6),taken=new Set();
  const seeds=[...ctx.nations].sort((a,b)=>(b.economicOutput||0)-(a.economicOutput||0));
  for(const founder of seeds){
    if(ws.blocs.length>=count)break;if(taken.has(founder.id)||founder.id===ws.player)continue;
    const members=[founder.id];
    for(const link of ctx.links.get(founder.id)||[]){if(members.length>=6)break;if(taken.has(link.id)||link.id===ws.player)continue;if(ctx.affinity(founder.id,link.id)+link.conn*20+(r()-.5)*14>14)members.push(link.id);}
    if(members.length<3)continue;for(const id of members)taken.add(id);
    const word=BLOC_WORDS[Math.floor(r()*BLOC_WORDS.length)],place=founder.name.replace(/^(Republic|Kingdom|State) of /,'');
    ws.blocs.push({id:ws.nextId++,name:`${place} ${word}`,color:BLOC_COLORS[ws.blocs.length%BLOC_COLORS.length],members,founded:0,founder:founder.id});
  }
}
export const blocOf=(ws,id)=>ws.blocs.find(b=>b.members.includes(id));

/** Validate a saved world block; throws on damage. */
export function validateWorldState(ws,nationIds){
  const fail=why=>{throw new Error(`Invalid campaign world: ${why}.`);};
  if(!ws||ws.version!==WORLD_VERSION||!Number.isInteger(ws.day)||ws.day<0)fail('version');
  if(!ws.nations||typeof ws.nations!=='object')fail('nations');
  for(const [id,n] of Object.entries(ws.nations)){if(nationIds&&!nationIds.has(+id))fail('nation id');if(![n.gdp,n.pop,n.stab].every(Number.isFinite)||n.gdp<0||n.pop<0)fail('nation figures');if(!Array.isArray(n.shares)||n.shares.length!==INDUSTRY_COUNT)fail('shares');if(!n.demo||!Array.isArray(n.demo.bands))fail('demography');}
  if(!Array.isArray(ws.goods?.price)||ws.goods.price.length!==GOOD_COUNT||ws.goods.price.some(v=>!Number.isFinite(v)||v<=0))fail('prices');
  if(!Array.isArray(ws.sanctions)||!Array.isArray(ws.blocs)||!Array.isArray(ws.news))fail('lists');
  return true;
}
