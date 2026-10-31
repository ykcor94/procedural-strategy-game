import {clamp,seededRandom,generateName,languageAt,xy,neighbors,Queue,wrappedDelta,cityFootprint} from './society-utils.js';
import {generateDemonym} from './names.js';

// Mirrors settlementKind in generator.js (not imported to avoid a module cycle).
const kind=pop=>pop>=20000000?'megalopolis':pop>=2000000?'metropolis':pop>=100000?'city':pop>=10000?'town':'village';
function institutions(nation){const s=String(nation.government||'').toLowerCase();return /technocrat/.test(s)?.82:/merchant|social democracy|constitutional|democra|parliament|feder/.test(s)?.72:/military|dictat|fascist/.test(s)?.39:/absolute|authoritarian|communist/.test(s)?.46:.59;}
function religiousTechnologyBonus(world,nation){const civ=world.meta.civilization,capital=civ.cities.find(c=>c.id===nation.capital),religion=capital?civ.religions?.find(r=>r.id===world.layers.religion?.[capital.cell]):null;return religion?.traits?.some(t=>t==='scholarship'||t==='craftsmanship')?.012:0;}
function currencyCode(world,nation,name,used){const clean=String(name).normalize('NFD').replace(/[^A-Za-z]/g,'').toUpperCase(),start=String(nation.name).normalize('NFD').replace(/[^A-Za-z]/g,'').toUpperCase();let code=(start.slice(0,2)+clean[0]).padEnd(3,'A').slice(0,3);const random=seededRandom(`${world.seed}:${world.meta.civilization.seed}`,`currency-code:${nation.id}`);for(let attempt=0;used.has(code)&&attempt<17576;attempt++){const number=(Math.floor(random()*17576)+attempt)%17576;code=String.fromCharCode(65+Math.floor(number/676),65+Math.floor(number/26)%26,65+number%26);}used.add(code);return code;}
export function refreshCurrencyIdentities(world){const civ=world.meta.civilization,used=new Set(civ.nations.filter(n=>n.manual?.currency&&/^[A-Z]{3}$/.test(n.currency?.code)).map(n=>n.currency.code));for(const nation of civ.nations){if(nation.manual?.currency||!nation.currency)continue;const currency=nation.currency;if(currency.demonymSourceName!==nation.name){const language=languageAt(world,nation.center??0);nation.demonym=generateDemonym(language,`${world.seed}:${civ.seed}`,`demonym:${nation.id}`,nation.name);currency.unit||=String(currency.name).split(' ').at(-1)||'mark';currency.name=`${nation.demonym} ${currency.unit}`;currency.demonymSourceName=nation.name;}const old=currency.code;if(!/^[A-Z]{3}$/.test(old)||used.has(old)){currency.code=currencyCode(world,nation,currency.name,used);currency.symbol=currency.code;}else used.add(old);}return world;}
export function initializeEconomicProfiles(world,{onlyChanged=false}={}){
  const civ=world.meta.civilization,l=world.layers,acc=new Map(civ.nations.map(n=>[n.id,{population:0,habitability:0,coasts:0,mineral:0}]));
  for(let i=0;i<l.ownership.length;i++){const a=acc.get(l.ownership[i]);if(!a)continue;const pop=l.population[i],weight=Math.max(1,pop);a.population+=weight;a.habitability+=(l.habitability[i]||0)*weight;a.coasts+=Math.exp(-(l.coastDistance?.[i]??7)/5)*weight;a.mineral+=Math.min(1,l.elevation[i]/3500)*weight;}
  for(const nation of civ.nations){if(onlyChanged&&Number.isFinite(nation.baseProductivity)&&nation.economicProfile?.government===nation.government)continue;const a=acc.get(nation.id),r=seededRandom(`${world.seed}:${civ.seed}`,`economy:${nation.id}`),inst=clamp(institutions(nation)+(r()-.5)*.23,.2,.95),h=a.habitability/(a.population||1),coastal=a.coasts/(a.population||1),resources=clamp(.2+h*.35+a.mineral/(a.population||1)*.3+r()*.3,0,1),inequality=clamp(Number.isFinite(+civ.settings.developmentInequality)?+civ.settings.developmentInequality:.6,0,1),heritage=.7+(r()-.5)*inequality*.95;
    nation.economicProfile={government:nation.government,institutions:inst,infrastructure:clamp(.2+inst*.45+(nation.urbanization||0)*.3+r()*.1,0,1),resources,education:clamp(.25+inst*.5+r()*.25,0,1),heritage};
    if(!nation.manual?.technology){nation.baseTechnology=clamp(.08+(Number.isFinite(+civ.settings.technologyLevel)?+civ.settings.technologyLevel:.6)*.7+inst*.13+(nation.urbanization||0)*.13+coastal*.07+(heritage-.7)*.3,.06,.98);nation.religiousTechnologyBonus=religiousTechnologyBonus(world,nation);nation.technology=clamp(nation.baseTechnology+nation.religiousTechnologyBonus,.03,.99);}
    // Crowding relative to the land's carrying capacity lowers output per person;
    // sparse, resource-rich countries earn a rent. Population alone never buys wealth.
    const fill=nation.carryingCapacity>0&&nation.population>0?clamp(nation.population/nation.carryingCapacity,.12,8):1,areaPerThousand=nation.population>0?(nation.area||0)/(nation.population/1000):0;
    nation.economicProfile.landPressure=+fill.toFixed(3);
    const crowding=Math.pow(fill,-.17),rent=1+.32*resources*clamp(Math.log10(1+areaPerThousand)/2,0,1);
    nation.baseProductivity=(550+68000*Math.pow(nation.technology,2.5))*(.65+inst*.55)*heritage*(.8+resources*.35)*crowding*rent;
    if(!nation.currency||!nation.manual?.currency){const language=languageAt(world,nation.center??0),demonym=generateDemonym(language,`${world.seed}:${civ.seed}`,`demonym:${nation.id}`,nation.name),unit=['crown','mark','dinar','sol','talent','ducat','peso','cairn'][Math.floor(r()*8)],rate=Number((Math.pow(10,r()*3-1)*(1.3-nation.technology*.6)).toPrecision(4));nation.demonym=demonym;nation.currency={name:`${demonym} ${unit}`,unit,demonymSourceName:nation.name,code:'',symbol:'',rate,base:'WU',rateDefinition:'local currency units per world unit'};}
  }
  refreshCurrencyIdentities(world);
}
export function applyReligiousTechnology(world){for(const nation of world.meta.civilization.nations){if(nation.manual?.technology)continue;const old=nation.technology,base=nation.baseTechnology??(old-(nation.religiousTechnologyBonus||0));nation.baseTechnology=base;nation.religiousTechnologyBonus=religiousTechnologyBonus(world,nation);nation.technology=clamp(base+nation.religiousTechnologyBonus,.03,.99);nation.baseProductivity*=(550+68000*nation.technology**2.5)/(550+68000*old**2.5);}return world;}

export function reweightTradeRoutes(world){const civ=world.meta.civilization,l=world.layers,cities=new Map(civ.cities.map(c=>[c.id,c])),nations=new Map(civ.nations.map(n=>[n.id,n])),languages=new Map((civ.languages||civ.cultures.map(c=>c.language)).map(l=>[l.id,l]));for(const city of civ.cities)city.tradeVolume=0;const family=city=>languages.get(city.manual?.language?city.language:city.manual?.culture?civ.cultures.find(c=>c.id===city.culture)?.language?.id:l.language?.[city.cell]||city.culture)?.family;
  for(const route of civ.tradeRoutes||[]){const from=cities.get(route.from),to=cities.get(route.to);if(!from||!to)continue;const same=family(from)&&family(from)===family(to);route.languageBonus=same?1.4:1;route.gravity=tradeGravity(from,to,route.cost,route.languageBonus);route.volume=tradeVolume(from,to,route.cost,nations,same);from.tradeVolume+=route.volume;to.tradeVolume+=route.volume;}return world;
}

function tradeGrid(world){
  const w=Math.min(world.width,128),h=Math.max(8,Math.round(world.height*w/world.width)),n=w*h,l=world.layers,land=new Uint8Array(n),river=new Uint8Array(n),elevation=new Float32Array(n),hab=new Float32Array(n),owner=new Uint16Array(n),source=new Int32Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=y*w+x,sx=Math.min(world.width-1,Math.floor((x+.5)*world.width/w)),sy=Math.min(world.height-1,Math.floor((y+.5)*world.height/h)),i=sy*world.width+sx;source[k]=i;let landCount=0,total=0,channelFlow=0,sumE=0,sumH=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const yy=Math.max(0,Math.min(world.height-1,sy+dy)),xx=(sx+dx+world.width)%world.width,j=yy*world.width+xx;total++;if(l.elevation[j]>0&&!l.lake?.[j]){landCount++;sumE+=l.elevation[j];sumH+=l.habitability[j]||0;if(l.river?.[j]||(l.riverDistance?.[j]??Infinity)<.8)channelFlow=Math.max(channelFlow,l.flow?.[j]||0);}}land[k]=landCount>=total*.5?1:0;river[k]=land[k]&&channelFlow>500?1:0;elevation[k]=sumE/Math.max(1,landCount);hab[k]=sumH/Math.max(1,landCount);owner[k]=l.ownership[i];}
  const index=city=>Math.min(h-1,Math.floor(city.y/world.height*h))*w+Math.min(w-1,Math.floor(city.x/world.width*w));
  return {w,h,n,land,river,elevation,hab,owner,source,index};
}
function travelSearch(grid,start){const {w,h,n,land,river,elevation,hab,owner}=grid,distance=new Float64Array(n),previous=new Int32Array(n),queue=new Queue();distance.fill(Infinity);previous.fill(-1);distance[start]=0;queue.push(start,0,0);
  while(queue.size){const {cell:i,cost}=queue.pop();if(cost!==distance[i])continue;const x=i%w,y=Math.floor(i/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy||y+dy<0||y+dy>=h)continue;const j=(y+dy)*w+(x+dx+w)%w,latitude=(.5-(y+.5)/h)*Math.PI,km=Math.hypot(dx*40075/w*Math.max(.12,Math.cos(latitude)),dy*20037.5/h),ci=!land[i]?.32:river[i]?.52:1+elevation[i]/4500+(1-hab[i])*.3,cj=!land[j]?.32:river[j]?.52:1+elevation[j]/4500+(1-hab[j])*.3,border=owner[i]&&owner[j]&&owner[i]!==owner[j]?1.06:1,next=cost+km*(ci+cj)*.5*border+(land[i]!==land[j]?18:0);if(next<distance[j]){distance[j]=next;previous[j]=i;queue.push(j,0,next);}}}
  return {distance,previous};
}
function routePoints(world,grid,from,to,previous){const source=grid.index(from),target=grid.index(to),reverse=[];let k=target;for(let guard=0;guard<grid.n&&k>=0;guard++){reverse.push(k);if(k===source)break;k=previous[k];}if(reverse.at(-1)!==source)return null;const cells=reverse.reverse(),points=[from.x,from.y];let prior=from.x,sea=0,rivers=0,distance=0;
  for(const cell of cells){let x=(cell%grid.w+.5)/grid.w*world.width,y=(Math.floor(cell/grid.w)+.5)/grid.h*world.height;x+=Math.round((prior-x)/world.width)*world.width;points.push(x,y);prior=x;sea+=!grid.land[cell];rivers+=grid.river[cell];}
  const tx=to.x+Math.round((prior-to.x)/world.width)*world.width;points.push(tx,to.y);
  const reduced=[points[0],points[1]];for(let i=2;i<points.length-2;i+=2){const a=reduced.length-2,dx=points[i]-reduced[a],dy=points[i+1]-reduced[a+1],ex=points[i+2]-points[i],ey=points[i+3]-points[i+1];if(Math.abs(dx*ey-dy*ex)<1e-5&&dx*ex+dy*ey>=0)continue;reduced.push(points[i],points[i+1]);}reduced.push(points.at(-2),points.at(-1));
  for(let i=2;i<reduced.length;i+=2){const latitude=(.5-(reduced[i+1]+reduced[i-1])/(2*world.height))*Math.PI;distance+=Math.hypot((reduced[i]-reduced[i-2])/world.width*40075*Math.cos(latitude),(reduced[i+1]-reduced[i-1])/world.height*20037.5);}
  return {points:reduced,cells,distanceKm:distance,seaShare:sea/Math.max(1,cells.length),riverShare:rivers/Math.max(1,cells.length)};
}

/** Softened gravity. The square of cost confined every hub's links to its
 * nearest neighbours; long-haul trade now competes on economic mass. */
export function tradeGravity(a,b,cost,bonus=1){return a.population*b.population/Math.pow(70+cost,1.45)*bonus;}
export function tradeVolume(from,to,cost,nations,same){return Math.min(from.population*(nations.get(from.nation)?.baseProductivity||10000),to.population*(nations.get(to.nation)?.baseProductivity||10000))*.045*Math.exp(-cost/42000)*(same?1.15:1);}
function cityDistance(a,b,world){const dx=Math.min(Math.abs(a.x-b.x),world.width-Math.abs(a.x-b.x)),lat=(.5-(a.y+b.y)/2/world.height)*Math.PI;return Math.hypot(dx*Math.max(.15,Math.cos(lat))*2,(a.y-b.y)*2)/world.width;}

/** Tiered trade network: global gateways (spread by farthest-point sampling),
 * every nation's principal city, then regional centres. Gateways link to their
 * neighbours and to at least one other landmass; every other hub feeds the
 * nearest higher tier and trades with a few partners, damped by their degree. */
export function generateTradeRoutes(world){
  const civ=world.meta.civilization,l=world.layers,grid=tradeGrid(world),setting=Number.isFinite(+civ.settings.tradeRoutes)?+civ.settings.tradeRoutes:160,hubCount=clamp(Math.round(setting),0,300),languages=new Map((civ.languages||civ.cultures.map(c=>c.language)).map(l=>[l.id,l])),nations=new Map(civ.nations.map(n=>[n.id,n])),routes=new Map(),traffic=new Float64Array(grid.n),cityTraffic=new Map();
  const living=civ.cities.filter(c=>c.population>0),score=c=>Math.pow(c.population,.7)*(c.port?1.65:1)*(c.capital?1.35:1)*(1+.4*Math.exp(-(l.riverDistance?.[c.cell]??8)/3)),chosen=new Map();
  const tier1=hubCount?clamp(Math.round(hubCount*.18),Math.min(6,hubCount),40):0,pool=[...living].sort((a,b)=>score(b)-score(a)).slice(0,Math.max(60,tier1*8));
  // Tier 1: score-weighted farthest-point sampling spreads gateways over the planet.
  if(pool.length&&tier1){chosen.set(pool[0].id,{city:pool[0],tier:1});const nearest=new Float64Array(pool.length).fill(Infinity);let last=pool[0],count=1;
    while(count<Math.min(tier1,pool.length)){let best=-1,bestValue=-1;for(let k=0;k<pool.length;k++){nearest[k]=Math.min(nearest[k],cityDistance(pool[k],last,world));if(chosen.has(pool[k].id))continue;const value=Math.sqrt(score(pool[k])/score(pool[0]))*nearest[k];if(value>bestValue){bestValue=value;best=k;}}if(best<0)break;chosen.set(pool[best].id,{city:pool[best],tier:1});last=pool[best];count++;}}
  // Tier 2: each nation's principal city; Tier 3: remaining centres by score.
  const principal=new Map();for(const city of living){const old=principal.get(city.nation);if(!old||score(city)>score(old))principal.set(city.nation,city);}
  for(const city of [...principal.values()].sort((a,b)=>score(b)-score(a)))if(chosen.size<hubCount&&!chosen.has(city.id))chosen.set(city.id,{city,tier:2});
  for(const city of [...living].sort((a,b)=>score(b)-score(a)))if(chosen.size<hubCount&&!chosen.has(city.id))chosen.set(city.id,{city,tier:3});
  const hubs=[...chosen.values()],searches=new Map(),degree=new Map(),landmass=c=>l.landmass?.[c.cell]||0,family=c=>languages.get(l.language?.[c.cell]||c.culture)?.family;
  const search=hub=>{let s=searches.get(hub.city.id);if(!s){s=travelSearch(grid,grid.index(hub.city));searches.set(hub.city.id,s);}return s;};
  const link=(a,b,tier)=>{const from=a.city,to=b.city,low=Math.min(from.id,to.id),high=Math.max(from.id,to.id),key=`${low}:${high}`;if(from.id===to.id||routes.has(key))return false;const s=search(a),cost=s.distance[grid.index(to)];if(!Number.isFinite(cost))return false;const path=routePoints(world,grid,from,to,s.previous);if(!path)return false;
    const same=family(from)&&family(from)===family(to),gravity=tradeGravity(from,to,cost,same?1.4:1),volume=tradeVolume(from,to,cost,nations,same),route={id:routes.size+1,from:from.id,to:to.id,points:path.points,distanceKm:path.distanceKm,cost,gravity,volume,tier,languageBonus:same?1.4:1,kind:path.seaShare>.15?'maritime':path.riverShare>.16?'river':'overland',seaShare:path.seaShare,riverShare:path.riverShare};
    routes.set(key,route);degree.set(from.id,(degree.get(from.id)||0)+1);degree.set(to.id,(degree.get(to.id)||0)+1);const strength=Math.log1p(gravity)*(tier===1?1.4:1);for(const cell of path.cells)traffic[cell]+=strength;cityTraffic.set(from.id,(cityTraffic.get(from.id)||0)+volume);cityTraffic.set(to.id,(cityTraffic.get(to.id)||0)+volume);return true;};
  const gateways=hubs.filter(h=>h.tier===1),costTo=(a,b)=>search(a).distance[grid.index(b.city)];
  for(const a of gateways){
    const others=gateways.filter(b=>b!==a&&Number.isFinite(costTo(a,b))).sort((x,y)=>costTo(a,x)-costTo(a,y));for(const b of others.slice(0,3))link(a,b,1);
    // A long-haul lane to another landmass, chosen by economic mass rather than proximity.
    const abroad=others.filter(b=>landmass(b.city)!==landmass(a.city)).sort((x,y)=>tradeGravity(y.city,a.city,costTo(a,y))-tradeGravity(x.city,a.city,costTo(a,x)));for(const b of abroad.slice(0,1+(a.city.port?1:0)))link(a,b,1);
  }
  // Join disconnected gateway groups with their cheapest connection.
  const parent=new Map(gateways.map(h=>[h.city.id,h.city.id])),find=x=>{while(parent.get(x)!==x){parent.set(x,parent.get(parent.get(x)));x=parent.get(x);}return x;};
  for(const route of routes.values())if(parent.has(route.from)&&parent.has(route.to))parent.set(find(route.from),find(route.to));
  for(let guard=0;guard<gateways.length;guard++){if(new Set(gateways.map(h=>find(h.city.id))).size<=1)break;let best=null;for(const a of gateways)for(const b of gateways){if(find(a.city.id)===find(b.city.id))continue;const cost=costTo(a,b);if(Number.isFinite(cost)&&(!best||cost<best.cost))best={a,b,cost};}if(!best)break;link(best.a,best.b,1);parent.set(find(best.a.city.id),find(best.b.city.id));}
  for(const a of hubs.filter(h=>h.tier>1)){
    const s=search(a),reach=b=>Number.isFinite(s.distance[grid.index(b.city)]),higher=hubs.filter(b=>b!==a&&b.tier<a.tier&&reach(b)).sort((x,y)=>s.distance[grid.index(x.city)]-s.distance[grid.index(y.city)]);if(higher.length)link(a,higher[0],a.tier);
    const partners=hubs.filter(b=>b!==a&&reach(b)).map(b=>{const cost=s.distance[grid.index(b.city)],same=family(a.city)&&family(a.city)===family(b.city);return {b,value:tradeGravity(a.city,b.city,cost,same?1.4:1)*(b.city.nation!==a.city.nation?1.25:1)/(1+(degree.get(b.city.id)||0)*.35)};}).sort((x,y)=>y.value-x.value);
    let added=0;for(const {b}of partners){if(added>=(a.tier===2?3:2))break;if(link(a,b,a.tier))added++;}
  }
  civ.tradeRoutes=[...routes.values()].sort((a,b)=>b.volume-a.volume);civ.tradeRevision=(civ.tradeRevision||0)+1;
  let maxTraffic=1;for(const value of traffic)maxTraffic=Math.max(maxTraffic,value);const accessDistance=new Float64Array(grid.n),q=new Queue();accessDistance.fill(Infinity);
  for(let i=0;i<grid.n;i++)if(traffic[i]>0){accessDistance[i]=-Math.log(.03+traffic[i]/maxTraffic)*260;q.push(i,0,accessDistance[i]);}
  for(const {city}of hubs){const i=grid.index(city);if(accessDistance[i]>0){accessDistance[i]=0;q.push(i,0,0);}}
  while(q.size){const {cell:i,cost}=q.pop();if(accessDistance[i]!==cost)continue;neighbors(i,grid.w,grid.h,j=>{const next=cost+40075/grid.w*(grid.land[j]?(grid.river[j]?.5:1.1):.4);if(next<accessDistance[j]){accessDistance[j]=next;q.push(j,0,next);}});}
  const access=new Float32Array(l.population.length);for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){const i=y*world.width+x;if(!l.ownership[i])continue;const j=Math.min(grid.h-1,Math.floor(y/world.height*grid.h))*grid.w+Math.min(grid.w-1,Math.floor(x/world.width*grid.w)),regional=Number.isFinite(accessDistance[j])?Math.exp(-Math.max(0,accessDistance[j])/1800):.1,river=Math.exp(-(l.riverDistance?.[i]??8)/5),coast=Math.exp(-(l.coastDistance?.[i]??8)/6);access[i]=clamp(regional*.72+river*.12+coast*.16,0,1);}
  l.tradeAccess=access;let maxCity=1;for(const value of cityTraffic.values())maxCity=Math.max(maxCity,value);for(const city of civ.cities){city.tradeVolume=cityTraffic.get(city.id)||0;city.tradeAccess=clamp((access[city.cell]||0)*.85+Math.log1p(city.tradeVolume)/Math.log1p(maxCity)*.15,0,1);city.tradeRoutes=civ.tradeRoutes.filter(r=>r.from===city.id||r.to===city.id).map(r=>r.id);}
  return world;
}

/** Repair only routes touched by moved settlements. Identity/ownership edits do
 * not repeat the backbone search, while routes never point at abandoned sites. */
export function repairTradeRoutes(world,{networkChanged=false}={}){
  const civ=world.meta.civilization,cities=new Map(civ.cities.map(c=>[c.id,c])),width=world.width,moved=new Set(),different=(x,y,city)=>Math.abs(wrappedDelta(x,city.x,width))>1e-6||Math.abs(y-city.y)>1e-6;
  for(const route of civ.tradeRoutes||[]){const from=cities.get(route.from),to=cities.get(route.to);if(from&&different(route.points[0],route.points[1],from))moved.add(from.id);if(to&&different(route.points.at(-2),route.points.at(-1),to))moved.add(to.id);}
  if(!moved.size&&!networkChanged)return false;
  const grid=tradeGrid(world),searches=new Map();
  for(const route of civ.tradeRoutes){if(!moved.has(route.from)&&!moved.has(route.to))continue;const reverse=!moved.has(route.from),from=cities.get(reverse?route.to:route.from),to=cities.get(reverse?route.from:route.to);let search=searches.get(from.id);if(!search){search=travelSearch(grid,grid.index(from));searches.set(from.id,search);}const path=routePoints(world,grid,from,to,search.previous);if(!path)continue;
    let points=path.points;if(reverse){const reversed=[];for(let k=points.length-2;k>=0;k-=2)reversed.push(points[k],points[k+1]);const shift=to.x-reversed[0];for(let k=0;k<reversed.length;k+=2)reversed[k]+=shift;points=reversed;}
    Object.assign(route,{points,cost:search.distance[grid.index(to)],distanceKm:path.distanceKm,seaShare:path.seaShare,riverShare:path.riverShare,kind:path.seaShare>.15?'maritime':path.riverShare>.16?'river':'overland'});
  }
  reweightTradeRoutes(world);
  // Refresh corridor access from the retained paths, not from fresh pairwise
  // searches. This also removes traffic from a deleted hub's former routes.
  const traffic=new Float64Array(grid.n),hubs=new Set();for(const route of civ.tradeRoutes){hubs.add(route.from);hubs.add(route.to);const covered=new Set();for(let k=2;k<route.points.length;k+=2){const ax=route.points[k-2],ay=route.points[k-1],dx=route.points[k]-ax,dy=route.points[k+1]-ay,steps=Math.max(1,Math.ceil(Math.hypot(dx/width*grid.w,dy/world.height*grid.h)*2));for(let s=0;s<=steps;s++){const x=((ax+dx*s/steps)%width+width)%width,y=clamp(ay+dy*s/steps,0,world.height-.0001),i=Math.floor(y/world.height*grid.h)*grid.w+Math.floor(x/width*grid.w);covered.add(i);}}for(const i of covered)traffic[i]+=Math.log1p(route.gravity);}
  let maximum=1;for(const value of traffic)maximum=Math.max(maximum,value);const distance=new Float64Array(grid.n),q=new Queue();distance.fill(Infinity);for(let i=0;i<grid.n;i++)if(traffic[i]>0){distance[i]=-Math.log(.03+traffic[i]/maximum)*260;q.push(i,0,distance[i]);}for(const id of hubs){const city=cities.get(id);if(!city)continue;const i=grid.index(city);if(distance[i]>0){distance[i]=0;q.push(i,0,0);}}
  while(q.size){const {cell:i,cost}=q.pop();if(distance[i]!==cost)continue;neighbors(i,grid.w,grid.h,j=>{const next=cost+40075/grid.w*(grid.land[j]?(grid.river[j]?.5:1.1):.4);if(next<distance[j]){distance[j]=next;q.push(j,0,next);}});}
  const l=world.layers,access=new Float32Array(l.population.length);for(let y=0;y<world.height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(!l.ownership[i])continue;const j=Math.min(grid.h-1,Math.floor(y/world.height*grid.h))*grid.w+Math.min(grid.w-1,Math.floor(x/width*grid.w)),regional=Number.isFinite(distance[j])?Math.exp(-Math.max(0,distance[j])/1800):.1;access[i]=clamp(regional*.72+Math.exp(-(l.riverDistance?.[i]??8)/5)*.12+Math.exp(-(l.coastDistance?.[i]??8)/6)*.16,0,1);}
  l.tradeAccess=access;for(const city of civ.cities)city.tradeRoutes=civ.tradeRoutes.filter(r=>r.from===city.id||r.to===city.id).map(r=>r.id);civ.tradeRevision=(civ.tradeRevision||0)+1;return true;
}

/** A stable national settlement tradition: some peoples concentrate in cities,
 * others stay rural regardless of wealth. Coasts and dense lowlands urbanize more. */
function urbanBias(world,nation){
  if(Number.isFinite(nation.urbanBias))return nation.urbanBias;const civ=world.meta.civilization,r=seededRandom(`${world.seed}:${civ.seed}`,`urban-tradition:${nation.id}`),normal=Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(Math.PI*2*r()),density=nation.area>0?nation.population/nation.area:0,world_density=civ.population&&civ.claimedArea?civ.population/civ.claimedArea:density||1;
  nation.urbanBias=+clamp(normal*.55+clamp(Math.log10(Math.max(1e-3,density/Math.max(1e-3,world_density))),-1,1)*.18,-1.4,1.4).toFixed(3);return nation.urbanBias;
}
/** Metropolitan footprint: the core keeps most residents; suburbs and satellite
 * towns occupy nearby cells of the same region, weighted by habitability. */
function spreadCity(world,city,key,regionAt){
  const l=world.layers,w=world.width,h=world.height,pop=city.population,cx=city.cell%w,cy=Math.floor(city.cell/w),latitude=Math.cos(((cy+.5)/h-.5)*Math.PI),cellKm=40075/w,outerKm=30*Math.pow(Math.max(1,pop)/1e6,.45),sigma=outerKm/cellKm;
  if(pop<120000||sigma<.42){l.population[city.cell]+=pop;city.footprint=[city.cell,pop];return;}
  const reach=Math.min(4,Math.ceil(sigma*1.9)),cells=[city.cell],weights=[1];let total=1;
  for(let dy=-reach;dy<=reach;dy++)for(let dx=-reach;dx<=reach;dx++){if(!dx&&!dy)continue;const y=cy+dy;if(y<0||y>=h)continue;const i=y*w+(cx+dx+w)%w;if(regionAt[i]!==key||l.lake?.[i]||l.elevation[i]<=0)continue;const d=Math.hypot(dx*Math.max(.2,latitude),dy);if(d>reach)continue;const weight=Math.exp(-d*d/(2*sigma*sigma))*(.35+(l.habitability?.[i]||0));if(weight<.02)continue;cells.push(i);weights.push(weight);total+=weight;}
  const core=Math.max(.35+.15*Math.exp(-pop/8e6),1/total),scale=(1-core)/Math.max(1e-9,total-1),footprint=[];let assigned=0;
  for(let k=1;k<cells.length;k++){const amount=Math.floor(pop*weights[k]*scale);if(amount<=0)continue;l.population[cells[k]]+=amount;footprint.push(cells[k],amount);assigned+=amount;}
  l.population[city.cell]+=pop-assigned;city.footprint=[city.cell,pop-assigned,...footprint];
}
/** Redistribution is explicit and conservative; ordinary economic recalculation never moves people. */
export function deriveUrbanization(world,{initial=false}={}){
  const civ=world.meta.civilization,l=world.layers,nations=new Map(civ.nations.map(n=>[n.id,n])),provinces=new Map((civ.provinces||[]).map(p=>[p.id,p])),regions=new Map(),regionAt=new Array(l.population.length),rural=new Float64Array(l.population.length),cityMass=new Map(),concentration=clamp(Number.isFinite(+civ.settings.populationConcentration)?+civ.settings.populationConcentration:.55,0,1);
  for(const city of civ.cities){const f=cityFootprint(city);for(let k=0;k<f.length;k+=2)cityMass.set(f[k],(cityMass.get(f[k])||0)+f[k+1]);}
  for(let i=0;i<l.population.length;i++){const nation=l.ownership[i];if(!nation)continue;const province=l.province?.[i],key=provinces.get(province)?.nation===nation?`p${province}`:`n${nation}`;regionAt[i]=key;if(!regions.has(key))regions.set(key,{nation,cells:[],cities:[],total:0,rural:0,urban:0});const region=regions.get(key);region.cells.push(i);region.total+=l.population[i];rural[i]=Math.max(0,l.population[i]-(initial?0:cityMass.get(i)||0));region.rural+=rural[i];}
  for(const city of civ.cities)regions.get(regionAt[city.cell])?.cities.push(city);
  // A locked custom city may draw residents from its country's other regions without losing them.
  const regionalNations=new Map();for(const region of regions.values()){region.locked=region.cities.filter(c=>c.manual?.population).reduce((s,c)=>s+c.population,0);if(!regionalNations.has(region.nation))regionalNations.set(region.nation,[]);regionalNations.get(region.nation).push(region);}for(const siblings of regionalNations.values())for(const region of siblings)if(region.locked>region.total){let deficit=region.locked-region.total;for(const donor of siblings){if(donor===region||!deficit)continue;const amount=Math.min(deficit,Math.max(0,donor.total-donor.locked));donor.total-=amount;region.total+=amount;deficit-=amount;}}
  for(const [key,region]of regions){const nation=nations.get(region.nation),cities=region.cities,total=region.total;if(!cities.length||!total)continue;const technology=clamp(Number(nation.technology??civ.settings.technologyLevel??.6),0,1),trade=cities.reduce((s,c)=>s+(c.tradeAccess??.35)*Math.max(1,c.population),0)/Math.max(1,cities.reduce((s,c)=>s+Math.max(1,c.population),0)),bias=urbanBias(world,nation),variation=clamp(Number.isFinite(+civ.settings.urbanizationVariation)?+civ.settings.urbanizationVariation:.5,0,1),base=clamp((+civ.settings.urbanization||.62)*(.51+technology*.6+trade*.18+(nation.economicProfile?.institutions??institutions(nation))*.12),.02,.97),target=clamp(1/(1+Math.exp(-(Math.log(base/(1-base))+bias*variation*2.4))),.03,.97);nation.urbanTarget=target;
    const fixed=cities.filter(c=>c.manual?.population),flex=cities.filter(c=>!c.manual?.population),random=seededRandom(`${world.seed}:${civ.seed}`,`regional-urbanization:${key}`);let fixedTotal=fixed.reduce((sum,c)=>sum+c.population,0);if(fixedTotal>total){let used=0;for(const city of fixed){city.population=Math.floor(total*city.population/fixedTotal);used+=city.population;}if(fixed.length)fixed[0].population+=total-used;fixedTotal=total;}
    const budget=Math.min(total,Math.max(fixedTotal,cities.some(c=>c.capital)?2000:0,Math.floor(total*target))),weights=flex.map(c=>{const potential=l.settlementPotential?.[c.cell]||.001,variation=.18-.14*concentration+Math.pow(random(),1.3+concentration*3.5)*2;return (.18+Math.pow(potential,.55+concentration*.8))*(c.capital?1.5:1)*(1+(c.tradeAccess||0)*.35)*variation;}),capacities=flex.map(c=>{const potential=Math.max(.001,l.settlementPotential?.[c.cell]||0),geographic=(civ.settings.totalPopulation||1)*.035*Math.pow(potential,1.55)*(1+technology*.5),regional=total*(.18+potential*.9);return Math.floor(Math.max(2500,Math.min(total,Math.max(geographic,regional))));});
    for(const city of flex)city.population=0;let remaining=budget-fixedTotal,active=flex.map((_,i)=>i);
    // Give provincial towns a meaningful base before concentrating the metropolitan remainder.
    const floor=Math.min(10000,Math.floor(remaining/Math.max(1,flex.length)*.35));for(let k=0;k<flex.length;k++){const amount=Math.min(floor,capacities[k],remaining);flex[k].population=amount;remaining-=amount;}
    for(let pass=0;remaining>0&&active.length&&pass<flex.length+2;pass++){const sum=active.reduce((s,k)=>s+weights[k],0);let used=0;for(const k of active){const portion=Math.min(capacities[k]-flex[k].population,Math.max(0,Math.floor(remaining*weights[k]/Math.max(.000001,sum))));flex[k].population+=portion;used+=portion;}remaining-=used;active=active.filter(k=>flex[k].population<capacities[k]);if(!used&&active.length){const k=active[0],portion=Math.min(remaining,capacities[k]-flex[k].population);flex[k].population+=portion;remaining-=portion;}}
    // Map settlements represent functioning towns and villages, rather than tiny random cohorts.
    for(const city of flex)if(city.population<2000&&!city.capital&&!Object.values(city.manual||{}).some(Boolean)){let receiver=null;for(const c of cities)if(c!==city&&!c.manual?.population&&c.population>=2000&&(!receiver||c.population>receiver.population))receiver=c;if(receiver)receiver.population+=city.population;city.population=0;}
    region.urban=cities.reduce((sum,c)=>sum+c.population,0);for(const city of cities)city.kind=kind(city.population);
  }
  const removed=new Set(civ.cities.filter(c=>!Object.values(c.manual||{}).some(Boolean)&&!c.capital&&c.population===0).map(c=>c.id));civ.cities=civ.cities.filter(c=>!removed.has(c.id));
  for(const region of regions.values()){const target=Math.max(0,region.total-region.urban);if(!region.rural)for(const i of region.cells){rural[i]=l.lake?.[i]?0:Math.pow(.01+(l.habitability?.[i]||0),.7);region.rural+=rural[i];}let assigned=0,best=region.cells[0],bestWeight=-1;for(const i of region.cells){const weight=rural[i];if(weight>bestWeight){bestWeight=weight;best=i;}l.population[i]=region.rural?Math.floor(weight*target/region.rural):0;assigned+=l.population[i];}for(const city of region.cities)if(!removed.has(city.id))spreadCity(world,city,regionAt[city.cell],regionAt);l.population[best]+=target-assigned;}
  return world;
}

export function recomputeEconomy(world){
  const civ=world.meta.civilization,l=world.layers,nations=new Map(civ.nations.map(n=>[n.id,n])),prod=new Float32Array(l.population.length),output=new Float64Array(l.population.length),urban=new Map();
  const cityIds=new Set(civ.cities.map(c=>c.id));civ.tradeRoutes=(civ.tradeRoutes||[]).filter(r=>cityIds.has(r.from)&&cityIds.has(r.to));
  refreshCurrencyIdentities(world);
  reweightTradeRoutes(world);
  for(const nation of civ.nations){nation.economicOutput=0;nation.gdp=0;nation.tradeVolume=0;nation.tradeAccess=0;nation._economicWeight=0;if(!Number.isFinite(nation.baseProductivity))nation.baseProductivity=12000;if(!Number.isFinite(nation.technology))nation.technology=.5;}
  for(const city of civ.cities){const nation=nations.get(city.nation);if(!nation)continue;city.tradeAccess=clamp(l.tradeAccess?.[city.cell]??city.tradeAccess??.25,0,1);city.productivity=nation.baseProductivity*(.82+city.tradeAccess*.48+Math.log10(Math.max(10,city.population))*.045)*(city.port?1.08:1);city.economicOutput=city.gdp=city.population*city.productivity;city.gdpPerCapita=city.productivity;city.sectors={agriculture:clamp(.25-nation.technology*.2,.025,.25),industry:clamp(.18+nation.technology*.27,.12,.45)};city.sectors.services=1-city.sectors.agriculture-city.sectors.industry;const f=cityFootprint(city);for(let k=0;k<f.length;k+=2){const value=urban.get(f[k])||{population:0,output:0},share=city.population?f[k+1]/city.population:1;value.population+=f[k+1];value.output+=city.economicOutput*share;urban.set(f[k],value);}}
  for(let i=0;i<prod.length;i++){const nation=nations.get(l.ownership[i]),pop=l.population[i];if(!nation||!pop)continue;const access=l.tradeAccess?.[i]||.1,h=l.habitability?.[i]||.1,geology=.06*Math.sin(i%world.width*.071+Math.floor(i/world.width)*.093),base=nation.baseProductivity*(.62+h*.25+access*.2+geology),city=urban.get(i),urbanPop=Math.min(pop,city?.population||0),p=(base*(pop-urbanPop)+(city?city.output*urbanPop/Math.max(1,city.population):0))/pop;prod[i]=Math.max(1,p);output[i]=pop*prod[i];nation.economicOutput+=output[i];nation.tradeAccess+=access*pop;nation._economicWeight+=pop;}
  const byId=new Map(civ.cities.map(c=>[c.id,c]));for(const route of civ.tradeRoutes||[]){const from=byId.get(route.from),to=byId.get(route.to),a=from&&nations.get(from.nation),b=to&&nations.get(to.nation);if(a)a.tradeVolume+=route.volume;if(b&&to.nation!==from?.nation)b.tradeVolume+=route.volume;}
  for(const nation of civ.nations){nation.gdp=nation.economicOutput;nation.gdpPerCapita=nation.population?nation.gdp/nation.population:0;nation.tradeAccess/=Math.max(1,nation._economicWeight);delete nation._economicWeight;}
  l.productivity=prod;l.economicOutput=output;civ.economy={output:civ.nations.reduce((sum,n)=>sum+n.gdp,0),unit:'WU',currencyDescription:'World units are a common annual purchasing-power measure.',tradeVolume:(civ.tradeRoutes||[]).reduce((sum,r)=>sum+r.volume,0),routes:civ.tradeRoutes?.length||0};return world;
}

export function generateEconomy(world,{routes=true,urbanization=false,preserveProfiles=false}={}){initializeEconomicProfiles(world,{onlyChanged:preserveProfiles});if(routes||!world.layers.tradeAccess)generateTradeRoutes(world);if(urbanization)deriveUrbanization(world);return recomputeEconomy(world);}
