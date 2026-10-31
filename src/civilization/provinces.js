import {clamp,seededRandom,generatePersonName,generateToponym,languageAt,featureWords,mixHex,xy,neighbors,Queue,areas,pointDistance} from './society-utils.js';

function makeProvince(world,nation,cell,id,source){const seed=`${world.seed}:${world.meta.civilization.seed}`,r=seededRandom(seed,`province:${id}:${cell}`),language=languageAt(world,cell),toponym=generateToponym(language,seed,`province:${id}`,{features:featureWords(world,cell),kind:'province'});return {id,nation:nation.id,name:toponym.name,nameMeaning:toponym.meaning,meaning:toponym.meaning,center:cell,label:xy(cell,world.width),color:mixHex(nation.color,(r()-.5)*.22),governor:{name:generatePersonName(language,seed,`governor:${id}`),age:30+Math.floor(r()*45),title:'Governor'},population:0,area:0,cities:[],settlements:[],cultures:[],languages:[],religions:[],economicOutput:0,gdp:0,gdpPerCapita:0,technology:nation.technology||0,manual:{},...(source?{originProvince:source.id}:{} )};}
function components(world,grid){const n=grid.length,seen=new Uint8Array(n),queue=new Int32Array(n),groups=[];for(let start=0;start<n;start++)if(grid[start]&&!seen[start]){const id=grid[start],cells=[];let a=0,b=0;queue[b++]=start;seen[start]=1;while(a<b){const i=queue[a++];cells.push(i);neighbors(i,world.width,world.height,j=>{if(!seen[j]&&grid[j]===id){seen[j]=1;queue[b++]=j;}});}groups.push({id,cells});}return groups;}

/** Polar slivers and nearby islets share administration; explicit player boundaries always win. */
export function mergeTinyProvinces(world){
  const civ=world.meta.civilization,l=world.layers,rows=areas(world),byId=new Map(civ.provinces.map(p=>[p.id,p])),stats=new Map(),nationalArea=new Map(),nationalCount=new Map();
  for(let i=0;i<l.province.length;i++){const id=l.province[i],p=byId.get(id);if(!p)continue;if(!stats.has(id))stats.set(id,{cells:[],area:0,latitude:0,edges:new Map()});const a=stats.get(id),area=rows[Math.floor(i/world.width)];a.cells.push(i);a.area+=area;a.latitude+=Math.abs((Math.floor(i/world.width)+.5)/world.height*180-90)*area;neighbors(i,world.width,world.height,j=>{const other=l.province[j];if(other&&other!==id&&byId.get(other)?.nation===p.nation)a.edges.set(other,(a.edges.get(other)||0)+1);});}
  for(const [id,a]of stats){const p=byId.get(id);nationalArea.set(p.nation,(nationalArea.get(p.nation)||0)+a.area);nationalCount.set(p.nation,(nationalCount.get(p.nation)||0)+1);}
  const deleted=new Set();for(const [id,a]of [...stats].sort((a,b)=>a[1].area-b[1].area)){const p=byId.get(id);if(deleted.has(id)||Object.values(p.manual||{}).some(Boolean)||nationalCount.get(p.nation)<2)continue;const average=nationalArea.get(p.nation)/nationalCount.get(p.nation),polar=a.latitude/a.area>58,tiny=polar&&a.area<Math.max(250,Math.min(25000,average*.14))||a.cells.length<=2&&a.area<average*.045;if(!tiny)continue;
    const allowed=other=>!deleted.has(other)&&other!==id&&byId.get(other)?.nation===p.nation&&!byId.get(other)?.manual?.territory;let target=[...a.edges].filter(([other])=>allowed(other)).sort((x,y)=>y[1]-x[1]||stats.get(y[0]).area-stats.get(x[0]).area)[0]?.[0];
    if(!target){let distance=Infinity;for(const [other,b]of stats)if(allowed(other)){const d=pointDistance(xy(a.cells[0],world.width),xy(b.cells[0],world.width),world.width);if(d<distance&&d<Math.max(5,world.width*.1)){distance=d;target=other;}}if(target)byId.get(target).archipelagic=true;}
    if(!target)continue;for(const cell of a.cells)l.province[cell]=target;const to=stats.get(target);to.cells.push(...a.cells);to.area+=a.area;to.latitude+=a.latitude;for(const [other,count]of a.edges)if(other!==target)to.edges.set(other,(to.edges.get(other)||0)+count);deleted.add(id);nationalCount.set(p.nation,nationalCount.get(p.nation)-1);
  }
  civ.provinces=civ.provinces.filter(p=>!deleted.has(p.id));return world;
}

export function regenerateProvinces(world,settings={}){
  const civ=world.meta.civilization;if(!civ)return world;const s={...civ.settings,...settings},l=world.layers,n=l.ownership.length,w=world.width,h=world.height,landComponents=components(world,l.ownership),byNation=new Map(civ.nations.map(n=>[n.id,n])),province=new Uint16Array(n),rows=areas(world),areaByNation=new Map();let landArea=0;
  for(let i=0;i<n;i++)if(l.ownership[i]){const area=rows[Math.floor(i/w)];landArea+=area;areaByNation.set(l.ownership[i],(areaByNation.get(l.ownership[i])||0)+area);}
  const average=landArea/Math.max(1,civ.nations.length),r=seededRandom(`${world.seed}:${civ.seed}`,'provinces'),desired=new Map();
  for(const nation of civ.nations){const area=areaByNation.get(nation.id)||0,scale=Math.sqrt(area/Math.max(1,average)),variation=1+(r()-.5)*clamp(+s.provinceVariability||0,0,1);desired.set(nation.id,clamp(Math.round((+s.provinceAverage||8)*scale*variation),1,128));}
  const groupsByNation=new Map();for(const group of landComponents){if(!groupsByNation.has(group.id))groupsByNation.set(group.id,[]);groupsByNation.get(group.id).push(group);}
  const seeds=[],provinces=[];let id=0;
  for(const [nationId,groups]of groupsByNation){const nation=byNation.get(nationId);if(!nation)continue;const totalCells=groups.reduce((sum,g)=>sum+g.cells.length,0),target=Math.max(groups.length,desired.get(nationId));
    for(const group of groups){const candidates=group.cells.length>4096?group.cells.filter((_,k)=>k%Math.ceil(group.cells.length/4096)===0):group.cells,count=Math.min(candidates.length,Math.max(1,Math.round(target*group.cells.length/totalCells)));let first=candidates[0],best=-1;for(const i of candidates){const score=(l.settlementPotential?.[i]||0)+Math.log1p(l.population[i])*.03;if(score>best){best=score;first=i;}}
      const local=[first],distance=new Float32Array(candidates.length);distance.fill(Infinity);let done=0;
      while(local.length<count){while(done<local.length){const p=xy(local[done++],w);for(let k=0;k<candidates.length;k++){const q=xy(candidates[k],w),d=pointDistance(p,q,w);if(d<distance[k])distance[k]=d;}}
        let index=-1,score=-1;for(let k=0;k<candidates.length;k++){if(distance[k]<.01)continue;const value=distance[k]*(.72+(l.habitability?.[candidates[k]]||0)*.28)*(1+((candidates[k]*17%23)/23)*.05);if(value>score){score=value;index=k;}}if(index<0)break;local.push(candidates[index]);}
      for(const cell of local){if(id>=65534)break;id++;const p=makeProvince(world,nation,cell,id);provinces.push(p);seeds.push({cell,id,nation:nationId});}
    }
  }
  const q=new Queue(),distance=new Float64Array(n),seedMask=new Uint8Array(n),nationForId=new Map(seeds.map(s=>[s.id,s.nation]));distance.fill(Infinity);for(const seed of seeds){province[seed.cell]=seed.id;distance[seed.cell]=0;seedMask[seed.cell]=1;q.push(seed.cell,seed.id,0);}
  while(q.size){const {cell:i,id,cost}=q.pop();if(province[i]!==id||distance[i]!==cost)continue;neighbors(i,w,h,j=>{if(l.ownership[j]!==nationForId.get(id)||seedMask[j]&&province[j]!==id)return;const e=Math.max(l.elevation[i],l.elevation[j]),slope=Math.abs(l.elevation[i]-l.elevation[j]),riverCross=(l.river?.[i]||l.river?.[j])&&l.flowTo?.[i]!==j&&l.flowTo?.[j]!==i;const step=.8+slope/900+Math.max(0,e-900)/4500+(riverCross?.45:0),next=cost+step*(.94+.12*Math.sin((i%w)*.37+Math.floor(i/w)*.29));if(next<distance[j]){distance[j]=next;province[j]=id;q.push(j,id,next);}});}
  l.province=province;civ.provinces=provinces;mergeTinyProvinces(world);civ.provinceRevision=(civ.provinceRevision||0)+1;return world;
}

export function createProvince(world,nationId,cell){const civ=world.meta.civilization,nation=civ.nations.find(n=>n.id===+nationId);if(!nation||world.layers.ownership[cell]!==nation.id)throw new Error('Choose land inside the province’s country.');const id=Math.max(0,...civ.provinces.map(p=>p.id))+1;if(id>65534)throw new Error('Province ID capacity reached.');const p=makeProvince(world,nation,cell,id);p.manual.created=true;civ.provinces.push(p);world.layers.province[cell]=id;return p;}
export function transferProvinceCells(world,provinceId,indices){const p=world.meta.civilization?.provinces.find(p=>p.id===+provinceId);if(!p)throw new Error('Province not found.');for(const i of indices)if(Number.isInteger(i)&&i>=0&&i<world.layers.province.length&&world.layers.ownership[i]===p.nation)world.layers.province[i]=p.id;p.manual.territory=true;repairProvinces(world);return p;}

/** Keep manual boundaries, repair only missing/foreign references, then split disconnected parts. */
export function repairProvinces(world){
  const civ=world.meta.civilization,l=world.layers;if(!civ||!l.province||!Array.isArray(civ.provinces))return regenerateProvinces(world);const n=l.province.length,w=world.width,h=world.height,nations=new Map(civ.nations.map(n=>[n.id,n])),byId=new Map(civ.provinces.map(p=>[p.id,p])),ownerSets=new Map(),queue=new Int32Array(n);
  for(let i=0;i<n;i++){const id=l.province[i];if(!id||!l.ownership[i])continue;if(!ownerSets.has(id))ownerSets.set(id,new Set());ownerSets.get(id).add(l.ownership[i]);}
  // An intact administrative unit can change sovereign without losing its identity.
  for(const [id,owners]of ownerSets)if(owners.size===1&&byId.has(id))byId.get(id).nation=[...owners][0];
  let a=0,b=0,hasHoles=false;for(let i=0;i<n;i++){const p=byId.get(l.province[i]);if(!l.ownership[i]||!nations.has(l.ownership[i]))l.province[i]=0;else if(!p||p.nation!==l.ownership[i]){l.province[i]=0;hasHoles=true;}else queue[b++]=i;}
  if(hasHoles)while(a<b){const i=queue[a++],id=l.province[i],owner=l.ownership[i];neighbors(i,w,h,j=>{if(l.ownership[j]===owner&&!l.province[j]){l.province[j]=id;queue[b++]=j;}});}
  let nextId=Math.max(0,...civ.provinces.map(p=>p.id));
  for(let i=0;i<n;i++)if(l.ownership[i]&&!l.province[i]){if(nextId>=65534)throw new Error('Province ID capacity reached.');const nation=nations.get(l.ownership[i]),p=makeProvince(world,nation,i,++nextId);civ.provinces.push(p);byId.set(p.id,p);a=0;b=0;queue[b++]=i;l.province[i]=p.id;while(a<b){const cell=queue[a++];neighbors(cell,w,h,j=>{if(l.ownership[j]===nation.id&&!l.province[j]){l.province[j]=p.id;queue[b++]=j;}});}}
  const parts=components(world,l.province),grouped=new Map();for(const part of parts){if(!grouped.has(part.id))grouped.set(part.id,[]);grouped.get(part.id).push(part);}
  for(const [id,groups]of grouped)if(groups.length>1){groups.sort((a,b)=>b.cells.length-a.cells.length);const source=byId.get(id);if(source?.manual?.territory||source?.archipelagic)continue;for(const group of groups.slice(1)){if(nextId>=65534)break;const nation=nations.get(l.ownership[group.cells[0]]),p=makeProvince(world,nation,group.cells[0],++nextId,source);civ.provinces.push(p);for(const cell of group.cells)l.province[cell]=p.id;}}
  const used=new Set(l.province);civ.provinces=civ.provinces.filter(p=>used.has(p.id));mergeTinyProvinces(world);civ.provinceRevision=(civ.provinceRevision||0)+1;return world;
}
