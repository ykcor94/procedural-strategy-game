import {clamp} from '../core/geo.js';
import {sampleBilinear} from '../core/sampling.js';
import {flagSVG} from '../civilization/flags.js';
import {createCityScene,paintCityScene} from './procedural-city.js';
import {buildTerritoryGeometry,traceRing,traceChain,lodBand} from './territory-geometry.js';

export const CIVILIZATION_MODES=new Set(['political','flags','cultural','cultural-family','linguistic','religion','population','habitability','ideology','economy','economy-nations','technology','trade']);
export const TERRITORY_MODES=new Set(['political','flags','cultural','cultural-family','linguistic','religion','ideology','technology','economy-nations']);
const cache=new WeakMap();
const rgb=hex=>{const v=parseInt((hex||'#b6b29b').slice(1),16);return [v>>16&255,v>>8&255,v&255];};
export const IDEOLOGY_COLORS={democratic:'#74b8b0',monarchist:'#b79ac6',authoritarian:'#c98e73',socialist:'#c36f78',religious:'#c2b773',federal:'#83a3ca'};
export function ideologyGroup(nation){const s=`${nation?.ideology||''} ${nation?.government||''}`.toLowerCase();return /commun|social/.test(s)?'socialist':/theocra|relig/.test(s)?'religious':/dictat|military|fasc|authorit|regime/.test(s)?'authoritarian':/monarch|kingdom|empire|duchy/.test(s)?'monarchist':/feder/.test(s)?'federal':'democratic';}

function settlementLayout(world,cities,previous){
  // Territory painting and identity edits do not move settlements. Compare
  // actual coordinates so those edits never repeat the quadratic proximity pass.
  if(previous&&previous.positions.length===cities.length&&cities.every((c,k)=>{const p=previous.positions[k];return p.id===c.id&&p.x===c.x&&p.y===c.y;}))return previous;
  const distances=new Float64Array(cities.length);distances.fill(Infinity);
  for(let a=0;a<cities.length;a++)for(let b=a+1;b<cities.length;b++){
    const x=Math.abs(cities[a].x-cities[b].x),dx=Math.min(x,world.width-x),dy=cities[a].y-cities[b].y,d=dx*dx+dy*dy;
    if(d<distances[a])distances[a]=d;if(d<distances[b])distances[b]=d;
  }
  return {positions:cities.map(c=>({id:c.id,x:c.x,y:c.y})),nearest:new Map(cities.map((c,k)=>[c.id,Math.sqrt(distances[k])]))};
}

/** Diameter in global cells. The small display floor is still subordinate to
 * neighboring cities, so separate street plans cannot engulf one another. */
export function cityFootprintCells(population,worldWidth,nearest=Infinity){
  const diameterKm=2*Math.sqrt(Math.max(1,population)/(1500*Math.PI)),physical=diameterKm/40075*worldWidth;
  // A village must stay a village beside a megacity. The old common minimum
  // footprint inflated a few thousand residents to the size of a million.
  return Math.min(Math.max(physical,worldWidth/65536),Math.max(0,nearest)*.78);
}

function data(world){
  const civ=world.meta.civilization;
  if(!civ)return null;
  let entry=cache.get(world);
  if(!entry||entry.invalidated||entry.revision!==civ.revision||entry.civ!==civ){
    const previous=entry;
    const nations=new Map((civ.nations||[]).map(n=>[n.id,n])),cultures=new Map((civ.cultures||[]).map(c=>[c.id,c])),families=new Map((civ.families||[]).map(f=>[f.id,f])),languages=new Map((civ.languages||[]).map(v=>[v.id,v])),religions=new Map((civ.religions||[]).map(v=>[v.id,v]));
    entry={revision:civ.revision,civ,nations,cultures,families,languages,religions,flags:previous?.flags||new Map(),geometry:previous?.geometry||new Map(),anchors:new Map(),palettes:{political:[],flags:[],cultural:[],'cultural-family':[],linguistic:[],religion:[],ideology:[],technology:[],'economy-nations':[]}};
    entry.contourSeed=[...String(world.seed)].reduce((v,c)=>Math.imul(v^c.charCodeAt(0),16777619),2166136261)>>>0;
    entry.settlementLayout=settlementLayout(world,civ.cities||[],previous?.settlementLayout);
    const maxEconomy=Math.max(1,...[...nations.values()].map(n=>n.economicOutput||n.gdp||0));
    for(const n of nations.values()){entry.palettes.political[n.id]=entry.palettes.flags[n.id]=rgb(n.color);entry.palettes.ideology[n.id]=rgb(IDEOLOGY_COLORS[ideologyGroup(n)]);const t=clamp(n.technology||0,0,1);entry.palettes.technology[n.id]=[206-130*t,179-30*t,120+45*t];entry.palettes['economy-nations'][n.id]=economicTotalColor(n.economicOutput||n.gdp||0,maxEconomy);}
    for(const c of cultures.values()){
      entry.palettes.cultural[c.id]=rgb(c.color);
      const base=rgb(families.get(c.family)?.color||c.color),variation=((c.id*137)%23)-11;
      entry.palettes.linguistic[c.id]=base.map(v=>clamp(v+variation,45,225));
    }
    for(const language of languages.values())entry.palettes.linguistic[language.id]=rgb(language.color||families.get(language.family)?.color||'#a6b2a0');
    for(const family of families.values())entry.palettes['cultural-family'][family.id]=rgb(family.color);
    for(const religion of religions.values())entry.palettes.religion[religion.id]=rgb(religion.color);
    if(world.layers.culture)entry.familyGrid=Uint16Array.from(world.layers.culture,id=>cultures.get(id)?.family||0);
    cache.set(world,entry);
  }
  return entry;
}
export function invalidateCivilizationGeometry(world){const entry=cache.get(world);if(entry)entry.invalidated=true;}
/** Relative, logarithmic total-output palette: each nation has one color. */
export function atlasMetricColor(relative){const stops=[[223,215,171],[135,186,162],[58,142,148],[64,92,137],[129,73,119]],p=clamp(relative,0,1)*(stops.length-1),a=Math.min(stops.length-2,Math.floor(p)),f=p-a;return stops[a].map((v,k)=>Math.round(v+(stops[a+1][k]-v)*f));}
export function economicTotalColor(output,maxOutput){return atlasMetricColor(clamp(Math.log1p(Math.max(0,output)/1e8)/Math.log1p(Math.max(1,maxOutput)/1e8),0,1));}
export function civilizationColor(mode,l,i,world){
  if(l.elevation[i]<=0)return [20,45,59];
  if(l.lake?.[i])return [57,110,131];
  const d=world&&data(world);
  if(!d)return [154,157,135];
  const id=(mode==='cultural'?l.culture:mode==='linguistic'?(l.language||l.culture):mode==='religion'?l.religion:mode==='cultural-family'?d.familyGrid:l.ownership)?.[i]||0;
  return d.palettes[mode]?.[id]||[166,170,153];
}

const sampleCache=new WeakMap();
/** Visual sea-adjacent coverage, independent of authoritative ownership. */
export function civilizationSampleIndices(world){
  const old=sampleCache.get(world),l=world.layers,w=world.width,h=world.height,n=w*h;if(old?.elevation===l.elevation&&old.lake===l.lake)return old.indices;
  const indices=new Int32Array(n),queue=new Int32Array(n);indices.fill(-1);let end=0;
  const land=i=>l.elevation[i]>0&&!l.lake?.[i];
  for(let i=0;i<n;i++)if(land(i)){indices[i]=i;const x=i%w,y=Math.floor(i/w);if(!land(y*w+(x+1)%w)||!land(y*w+(x+w-1)%w)||y&&!land(i-w)||y<h-1&&!land(i+w))queue[end++]=i;}
  // Every refined islet receives its nearest coarse-land attribution. The
  // physical tile mask, rather than this coverage field, determines land.
  for(let q=0;q<end;q++){const i=queue[q],x=i%w,y=Math.floor(i/w);for(const j of [y*w+(x+1)%w,y*w+(x+w-1)%w,...(y?[i-w]:[]),...(y<h-1?[i+w]:[])])if(indices[j]<0){indices[j]=indices[i];queue[end++]=j;}}
  sampleCache.set(world,{elevation:l.elevation,lake:l.lake,indices});return indices;
}

function modeGeometry(mode){return mode==='cultural'?'culture':mode==='linguistic'?'language':mode==='cultural-family'?'family':mode==='religion'?'religion':'ownership';}

/** Directed cell edges remain authoritative. Collinear vertices are removed,
 * but no polygon simplification is allowed to cross a cell center. */
export function extractTerritories(grid,width,height){
  const groups=new Map(),stride=width+1;
  function edge(id,ax,ay,bx,by,dir){let edges=groups.get(id);if(!edges)groups.set(id,edges=[]);edges.push({a:ay*stride+ax,b:by*stride+bx,dir});}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,id=grid[i];if(!id)continue;
    if(y===0||grid[i-width]!==id)edge(id,x,y,x+1,y,0);
    if(x===width-1||grid[i+1]!==id)edge(id,x+1,y,x+1,y+1,1);
    if(y===height-1||grid[i+width]!==id)edge(id,x+1,y+1,x,y+1,2);
    if(x===0||grid[i-1]!==id)edge(id,x,y+1,x,y,3);
  }
  const result=new Map();
  for(const [id,edges]of groups){
    const outgoing=new Map();
    edges.forEach((e,k)=>{let list=outgoing.get(e.a);if(!list)outgoing.set(e.a,list=[]);list.push(k);});
    const visited=new Uint8Array(edges.length),polygons=[];
    for(let start=0;start<edges.length;start++)if(!visited[start]){
      const points=[],first=edges[start].a;let k=start,guard=0;
      while(k!==undefined&&!visited[k]&&guard++<=edges.length){
        const e=edges[k];visited[k]=1;points.push(e.a%stride,Math.floor(e.a/stride));
        if(e.b===first)break;
        const next=(outgoing.get(e.b)||[]).filter(j=>!visited[j]);
        if(next.length>1){const priority=[1,0,3,2];next.sort((a,b)=>priority.indexOf((edges[a].dir-e.dir+4)%4)-priority.indexOf((edges[b].dir-e.dir+4)%4));}
        k=next[0];
      }
      if(points.length<6)continue;
      const reduced=[];
      for(let j=0;j<points.length;j+=2){
        const p=(j-2+points.length)%points.length,n=(j+2)%points.length;
        if((points[j]-points[p])*(points[n+1]-points[j+1])!==(points[j+1]-points[p+1])*(points[n]-points[j]))reduced.push(points[j],points[j+1]);
      }
      if(reduced.length>=6){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(let j=0;j<reduced.length;j+=2){minX=Math.min(minX,reduced[j]);maxX=Math.max(maxX,reduced[j]);minY=Math.min(minY,reduced[j+1]);maxY=Math.max(maxY,reduced[j+1]);}polygons.push({points:reduced,bounds:[minX,minY,maxX,maxY]});}
    }
    result.set(id,polygons);
  }
  return result;
}

/** Each international edge is emitted once; coastlines are a separate graph. */
export function buildBorderPaths(grid,elevation,width,height,coasts=false){
  const groups=new Map(),stride=width+1;
  const add=(a,b,x1,y1,x2,y2)=>{if(a===b||(!coasts&&(!a||!b)))return;const key=a<b?`${a}:${b}`:`${b}:${a}`;let edges=groups.get(key);if(!edges)groups.set(key,edges=[]);edges.push([y1*stride+x1,y2*stride+x2]);};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;if(!coasts&&elevation[i]<=0)continue;
    const right=y*width+(x+1)%width;
    if(coasts||elevation[right]>0)add(grid[i],grid[right],x+1,y,x+1,y+1);
    if(y<height-1&&(coasts||elevation[i+width]>0))add(grid[i],grid[i+width],x,y+1,x+1,y+1);
  }
  const paths=[];
  for(const [pair,edges]of groups){
    const adjacent=new Map();edges.forEach(([a,b],k)=>{for(const v of [a,b]){let list=adjacent.get(v);if(!list)adjacent.set(v,list=[]);list.push(k);}});
    const used=new Uint8Array(edges.length);
    function trace(start,vertex){const points=[],first=vertex;let k=start,guard=0;while(k!==undefined&&!used[k]&&guard++<=edges.length){used[k]=1;points.push(vertex%stride,Math.floor(vertex/stride));const e=edges[k];vertex=e[0]===vertex?e[1]:e[0];const next=adjacent.get(vertex)||[];if(vertex===first||next.length!==2){points.push(vertex%stride,Math.floor(vertex/stride));break;}k=next.find(j=>!used[j]);if(k===undefined)points.push(vertex%stride,Math.floor(vertex/stride));}let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(let j=0;j<points.length;j+=2){x0=Math.min(x0,points[j]);x1=Math.max(x1,points[j]);y0=Math.min(y0,points[j+1]);y1=Math.max(y1,points[j+1]);}paths.push({pair,points,closed:vertex===first,bounds:[x0,y0,x1,y1]});}
    edges.forEach(([a,b],k)=>{if(!used[k]&&((adjacent.get(a)?.length||0)!==2||(adjacent.get(b)?.length||0)!==2))trace(k,(adjacent.get(a)?.length||0)!==2?a:b);});
    edges.forEach(([a],k)=>{if(!used[k])trace(k,a);});
  }
  return paths;
}

/** A bounded Douglas–Peucker approximation. Its maximum tolerance is .3 cell,
 * decreasing at each zoom level; no visual refinement changes cell ownership. */
export function simplifyBorder(points,tolerance){
  if(points.length<=4)return points;
  const n=points.length/2,keep=new Uint8Array(n),stack=[[0,n-1]],limit=tolerance*tolerance;keep[0]=keep[n-1]=1;
  while(stack.length){const [a,b]=stack.pop(),ax=points[a*2],ay=points[a*2+1],dx=points[b*2]-ax,dy=points[b*2+1]-ay,length=dx*dx+dy*dy;let max=limit,index=-1;
    for(let i=a+1;i<b;i++){const px=points[i*2]-ax,py=points[i*2+1]-ay,t=length?clamp((px*dx+py*dy)/length,0,1):0,d=(px-t*dx)**2+(py-t*dy)**2;if(d>max){max=d;index=i;}}
    if(index>=0){keep[index]=1;stack.push([a,index],[index,b]);}
  }
  const result=[];for(let i=0;i<n;i++)if(keep[i])result.push(points[i*2],points[i*2+1]);return result;
}
function geometry(world,key){
  const d=data(world);if(!d)return null;
  const existing=d.geometry.get(key);if(existing?.validated===d)return existing;
  const extended=key.endsWith(':extended'),baseKey=key.split(':')[0],l=world.layers,source=baseKey==='coast'?l.elevation:baseKey==='lake'?l.lake:baseKey==='family'?d.familyGrid:baseKey==='language'?(l.language||l.culture):l[baseKey];
  if(!source)return null;
  // Identity, city and population edits reuse the exact border graph. Compare
  // authoritative cells rather than hashes, so no collision can hide an edit.
  if(existing&&existing.snapshot.length===source.length){let equal=true;for(let i=0;i<source.length;i++)if(existing.snapshot[i]!== (baseKey==='coast'?Number(source[i]>0):source[i])){equal=false;break;}if(equal){existing.validated=d;return existing;}}
  let grid=baseKey==='coast'?Uint8Array.from(source,v=>v>0?1:0):baseKey==='lake'?Uint8Array.from(source,(v,i)=>v&&l.elevation[i]>0?1:0):source;
  if(extended){const samples=civilizationSampleIndices(world);grid=Int32Array.from(grid,(v,i)=>v||(samples[i]>=0?(source[samples[i]]||-1):0));}
  // Unclaimed land is its own neutral vector territory. Never leave a smoothed
  // land raster beneath categorical fills: it creates gray coastal halos.
  const categorical=!['coast','lake'].includes(baseKey),polygonGrid=categorical?Int32Array.from(grid,(v,i)=>v||(l.elevation[i]>0?-1:0)):grid;
  const border=baseKey==='coast'?(a,b)=>a!==b:extended?(a,b)=>a!==0&&b!==0:(a,b)=>a>0&&b>0,built=buildTerritoryGeometry(polygonGrid,world.width,world.height,{border,smoothing:baseKey==='coast'||baseKey==='lake'?1:2});
  const result={polygons:built.polygons,chains:built.chains,borders:baseKey==='lake'?[]:built.borders,snapshot:baseKey==='coast'?grid.slice():source.slice(),validated:d};
  d.geometry.set(key,result);return result;
}

function visible(bounds,shift,camera){const halfX=camera.width/(2*camera.scale),halfY=camera.height/(2*camera.scale);return bounds[2]+shift>=camera.x-halfX&&bounds[0]+shift<=camera.x+halfX&&bounds[3]>=camera.y-halfY&&bounds[1]<=camera.y+halfY;}

function flagImage(d,nation,renderer){
  const key=JSON.stringify(nation.flag);let item=d.flags.get(key);if(item)return item;
  if(typeof Image==='undefined')return null;
  const image=new Image();item={image,ready:false};d.flags.set(key,item);image.onload=()=>{item.ready=true;renderer.draw();};image.onerror=()=>{item.failed=true;};image.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(flagSVG(nation.flag,720,432))}`;return item;
}
const polygonArea=points=>{let a=0;for(let k=0;k<points.length;k+=2){const j=(k+2)%points.length;a+=points[k]*points[j+1]-points[j]*points[k+1];}return a/2;};

/** Draw independent fill, border and selection passes for the physical-mask
 * compositor. Ownership is never read from a visual terrain tile. */
export function drawCivilizationTerritories(ctx,renderer,from,to,camera=renderer.camera,options={}){
  const world=renderer.world,d=data(world);if(!d)return;
  const mode=options.mode||renderer.mode,pass=options.pass||'all',extended=options.extended??Boolean(renderer.refinedPoliticalMask),suffix=extended?':extended':'',scale=camera.scale;
  const key=pass==='borderMask'?'ownership':pass==='selectionFill'?(options.kind==='province'?'province':'ownership'):pass==='provinces'?'province':modeGeometry(mode),g=geometry(world,key+suffix);if(!g)return;
  const band=lodBand(scale),ring=(p,shift=0)=>traceRing(ctx,g,p,band,shift),chain=(path,shift=0)=>traceChain(ctx,path,band,shift);
  const fill=pass==='fill'||pass==='all',borders=pass==='borders'||pass==='all';
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  for(let copy=from;copy<=to;copy++){
    const shift=copy*world.width;
    if(pass==='selectionFill'){
      const id=options.kind==='province'?renderer.selectedProvince:renderer.selectedNation;
      if(id){ctx.beginPath();for(const p of g.polygons.get(id)||[])if(visible(p.bounds,shift,camera))ring(p,shift);ctx.fillStyle='#fff';ctx.fill('evenodd');}continue;
    }
    if(pass==='borderMask'){
      ctx.strokeStyle='#fff';ctx.lineWidth=(options.width||4)/scale;ctx.beginPath();for(const path of g.borders)if(visible(path.bounds,shift,camera))chain(path,shift);ctx.stroke();continue;
    }
    if(pass==='provinces'){
      if(!renderer.overlays.provinces&&!renderer.overlays.provinceColors)continue;
      const provinces=new Map((d.civ.provinces||[]).map(p=>[p.id,p]));
      if(renderer.overlays.provinceColors)for(const [id,polygons]of g.polygons){const province=provinces.get(id);if(!province||renderer.selectedNation&&province.nation!==renderer.selectedNation)continue;ctx.beginPath();for(const p of polygons)if(visible(p.bounds,shift,camera))ring(p,shift);ctx.fillStyle=province.color||'#b8c3a1';const alpha=ctx.globalAlpha;ctx.globalAlpha=alpha*.38;ctx.fill('evenodd');ctx.globalAlpha=alpha;}
      // A wrapped province's closed fill has an artificial meridian edge.
      // Stroke only true neighboring-cell boundaries, each exactly once.
      if(renderer.overlays.provinces){ctx.beginPath();for(const path of g.borders){if(renderer.selectedNation){const ids=path.pair.split(':').map(Number);if(!ids.some(id=>provinces.get(id)?.nation===renderer.selectedNation))continue;}if(visible(path.bounds,shift,camera))chain(path,shift);}ctx.strokeStyle='rgba(37,45,41,.68)';ctx.lineWidth=.8/scale;ctx.setLineDash([3/scale,2/scale]);ctx.stroke();ctx.setLineDash([]);}continue;
    }
    if(fill&&TERRITORY_MODES.has(mode))for(const [id,polygons]of g.polygons){
      ctx.beginPath();let any=false;for(const p of polygons)if(visible(p.bounds,shift,camera)){ring(p,shift);any=true;}if(!any)continue;
      const color=d.palettes[mode]?.[id]||[166,170,153];ctx.fillStyle=`rgb(${color.join(',')})`;ctx.fill('evenodd');
      if(mode==='flags'&&id>0){const nation=d.nations.get(id),flag=nation&&flagImage(d,nation,renderer);if(flag?.ready){const originals=geometry(world,'ownership')?.polygons.get(id)||polygons;
        // Each connected territory receives a complete flag. Distant colonies
        // and islands cannot stretch a flag across the intervening ocean.
        for(const component of originals)if(polygonArea(component.points)>0&&visible(component.bounds,shift,camera)){
          const [x0,y0,x1,y1]=component.bounds,bw=Math.max(.5,x1-x0),bh=Math.max(.5,y1-y0),fw=Math.max(bw,bh*5/3),fh=fw*3/5;
          ctx.save();ctx.beginPath();for(const p of polygons)ring(p,shift);ctx.clip('evenodd');ctx.drawImage(flag.image,(x0+x1-fw)/2+shift,(y0+y1-fh)/2,fw,fh);ctx.restore();
        }
      }}
    }
    if(fill&&renderer.atlas&&TERRITORY_MODES.has(mode)&&options.atlas!==false)drawAtlas(ctx,renderer,world,suffix,shift,camera,band);
    if(borders&&renderer.overlays.borders!==false&&(CIVILIZATION_MODES.has(mode)||mode==='physical')){
      ctx.strokeStyle='rgba(31,43,43,.68)';ctx.lineWidth=(.65+.3*clamp((Math.log2(scale)-.5)/1.5,0,1))/scale;ctx.beginPath();for(const path of g.borders)if(visible(path.bounds,shift,camera))chain(path,shift);ctx.stroke();
    }
    if(pass==='all'&&!extended&&CIVILIZATION_MODES.has(mode)&&renderer.overlays.coasts){const coast=geometry(world,'coast');ctx.beginPath();for(const path of coast.borders)traceChain(ctx,path,band,shift);ctx.strokeStyle='rgba(12,35,44,.85)';ctx.lineWidth=1.05/scale;ctx.stroke();}
  }
  if(pass==='all'&&!extended&&TERRITORY_MODES.has(mode)){const lakes=geometry(world,'lake');ctx.fillStyle='#396e83';for(let copy=from;copy<=to;copy++){ctx.beginPath();for(const polygons of lakes?.polygons.values()||[])for(const p of polygons)if(visible(p.bounds,copy*world.width,camera))traceRing(ctx,lakes,p,lodBand(scale),copy*world.width);ctx.fill('evenodd');}}
  ctx.restore();
}

/* ---------- atlas lenses ---------- */
const patternCache=new Map();
/** Diagonal stripes in the colours of a mixed region, at a constant on-screen width. */
function stripePattern(ctx,colors){
  const key=colors.map(c=>c.join(',')).join('|');let canvas=patternCache.get(key);
  if(!canvas&&typeof document!=='undefined'){const stripe=7,size=stripe*colors.length*2;canvas=document.createElement('canvas');canvas.width=canvas.height=size;const c=canvas.getContext('2d');
    for(let k=-colors.length*2;k<colors.length*4;k++){c.fillStyle=`rgb(${colors[((k%colors.length)+colors.length)%colors.length].join(',')})`;c.beginPath();c.moveTo(k*stripe,0);c.lineTo(k*stripe+stripe,0);c.lineTo(k*stripe+stripe-size,size);c.lineTo(k*stripe-size,size);c.closePath();c.fill();}
    patternCache.set(key,canvas);if(patternCache.size>400)patternCache.delete(patternCache.keys().next().value);}
  if(!canvas)return null;const pattern=ctx.createPattern(canvas,'repeat');return pattern;
}
/** Province- or nation-level colours from live campaign data (see ui/atlas.js), painted over the political
 * fill. Foreign nations can be muted to one neutral tone so the player's own country stands out. */
function drawAtlas(ctx,renderer,world,suffix,shift,camera,band){
  const a=renderer.atlas,scale=camera.scale;
  if(a.focus){const own=geometry(world,'ownership'+suffix);if(own){ctx.beginPath();let any=false;for(const [id,polygons]of own.polygons){if(id===a.focus)continue;for(const p of polygons)if(visible(p.bounds,shift,camera)){traceRing(ctx,own,p,band,shift);any=true;}}if(any){ctx.fillStyle=a.mute||'rgb(126,130,124)';ctx.fill('evenodd');}}}
  if(a.nationColors){const own=geometry(world,'ownership'+suffix);if(own)for(const [id,polygons]of own.polygons){const color=a.nationColors.get(id);if(!color)continue;ctx.beginPath();let any=false;for(const p of polygons)if(visible(p.bounds,shift,camera)){traceRing(ctx,own,p,band,shift);any=true;}if(any){ctx.fillStyle=Array.isArray(color)?`rgb(${color.join(',')})`:color;ctx.fill('evenodd');}}}
  const g=geometry(world,(a.level==='nation'?'ownership':'province')+suffix);if(!g)return;
  for(const [id,polygons]of g.polygons){
    const stripes=a.stripes?.get(id),color=a.colors?.get(id);if(!stripes&&!color)continue;
    ctx.beginPath();let any=false;for(const p of polygons)if(visible(p.bounds,shift,camera)){traceRing(ctx,g,p,band,shift);any=true;}if(!any)continue;
    if(stripes){const pattern=stripePattern(ctx,stripes);if(pattern){pattern.setTransform?.(new DOMMatrix().scale(1/scale));ctx.fillStyle=pattern;ctx.fill('evenodd');continue;}}
    ctx.fillStyle=Array.isArray(color)?`rgb(${color.join(',')})`:color;ctx.fill('evenodd');
  }
  if(a.highlight){const polygons=g.polygons.get(a.highlight);if(polygons){ctx.beginPath();for(const p of polygons)if(visible(p.bounds,shift,camera))traceRing(ctx,g,p,band,shift);ctx.fillStyle='rgba(255,241,189,.28)';ctx.fill('evenodd');ctx.strokeStyle='#fff1bd';ctx.lineWidth=2.2/scale;ctx.stroke();}}
  if(a.level!=='nation'&&a.outline!==false){ctx.beginPath();for(const path of g.borders){if(a.focus){const ids=path.pair.split(':').map(Number);const provinces=a.provinceNation;if(provinces&&!ids.some(id=>provinces.get(id)===a.focus))continue;}if(visible(path.bounds,shift,camera))traceChain(ctx,path,band,shift);}ctx.strokeStyle='rgba(30,38,36,.55)';ctx.lineWidth=.7/scale;ctx.stroke();}
}

export function visibleTradeRoutes(routes,limit=80,{view=null,width=0,volume=null}={}){
  const vol=r=>r.volume*(volume?.get(r.id)??1),ordered=[...routes].filter(r=>r.points?.length>=4&&(!view||routeInView(r,view,width))).sort((a,b)=>vol(b)-vol(a)),chosen=new Set(),result=[];
  // Global tonnage alone hides every inland network behind a few sea lanes, and the busiest regions hide
  // the rest of the world: reserve room for each transport geography and for every part of the view.
  if(view){const bins=new Map(),bx=8,by=5;for(const r of ordered){const b=routeBounds(r),cx=((b[0]+b[2])/2-view[0]+width*4)%width,cy=(b[1]+b[3])/2,key=`${Math.min(bx-1,Math.max(0,Math.floor(cx/Math.max(1e-6,view[2]-view[0])*bx)))}:${Math.min(by-1,Math.max(0,Math.floor((cy-view[1])/Math.max(1e-6,view[3]-view[1])*by)))}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(r);}
    const per=Math.max(1,Math.floor(limit*.45/Math.max(1,bins.size)));for(const list of bins.values())for(const r of list.slice(0,per)){chosen.add(r);result.push(r);}}
  for(const [kind,share]of [['maritime',.4],['overland',.35],['river',.25]])for(const route of ordered.filter(r=>r.kind===kind&&!chosen.has(r)).slice(0,Math.max(1,Math.floor(limit*share*(view?.55:1))))){chosen.add(route);result.push(route);}
  for(const route of ordered)if(result.length<limit&&!chosen.has(route)){chosen.add(route);result.push(route);}
  return result.slice(0,limit).sort((a,b)=>vol(a)-vol(b));
}
const boundsCache=new WeakMap();
function routeBounds(r){const b=boundsCache.get(r);if(b&&b.points===r.points)return b.v;const p=r.points;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(let j=0;j<p.length;j+=2){x0=Math.min(x0,p[j]);x1=Math.max(x1,p[j]);y0=Math.min(y0,p[j+1]);y1=Math.max(y1,p[j+1]);}const v=[x0,y0,x1,y1];boundsCache.set(r,{points:p,v});return v;}
function routeInView(r,view,width){const b=routeBounds(r);if(b[3]<view[1]||b[1]>view[3])return false;for(let k=-2;k<=2;k++)if(b[2]+k*width>=view[0]&&b[0]+k*width<=view[2])return true;return false;}
/** Split mixed journeys by the actual geography of each leg. A maritime
 * classification describes a route's economics, not every kilometer of it. */
export function tradeRouteSegments(world,route,{landAt}={}){
  const p=route.points;if(!p||p.length<4)return [];const l=world.layers,w=world.width,h=world.height,result=[];let group=null;
  for(let j=2;j<p.length;j+=2){const ax=p[j-2],ay=p[j-1],dx=p[j]-ax,dy=p[j+1]-ay,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.4));for(let k=0;k<steps;k++){
    const x0=ax+dx*k/steps,y0=ay+dy*k/steps,x1=ax+dx*(k+1)/steps,y1=ay+dy*(k+1)/steps,x=((x0+x1)/2%w+w)%w,y=clamp((y0+y1)/2,0,h-.0001),i=Math.floor(y)*w+Math.floor(x),land=landAt?landAt(x,y):sampleBilinear(l.elevation,x/w,y/h,w,h)>0&&!l.lake?.[i],river=land&&(l.river?.[i]||l.riverDistance&&sampleBilinear(l.riverDistance,x/w,y/h,w,h)<.8),kind=!land?'maritime':river?'river':'overland';
    if(!group||group.kind!==kind){group={kind,points:[x0,y0,x1,y1]};result.push(group);}else group.points.push(x1,y1);
  }}return result;
}
const routeVisualCache=new WeakMap();
export function drawTradeRoutes(ctx,renderer,from,to,camera=renderer.camera){
  const routes=renderer.world.meta.civilization?.tradeRoutes||[];if(!routes.length||!(renderer.overlays.tradeRoutes||renderer.mode==='trade'||['economy','economy-nations'].includes(renderer.mode)&&camera.scale>camera.minScale*2))return;
  const zoom=Math.log2(renderer.world.width*camera.scale/850),halfX=camera.width/(2*camera.scale),halfY=camera.height/(2*camera.scale),view=[camera.x-halfX,camera.y-halfY,camera.x+halfX,camera.y+halfY],volume=renderer.tradeVolume||null;
  const limit=renderer.overlays.allRoutes?routes.length:clamp(Math.round(60+zoom*35),50,320),selected=visibleTradeRoutes(routes,limit,{view,width:renderer.world.width,volume}),vol=r=>r.volume*(volume?.get(r.id)??1),max=Math.max(1,...selected.map(vol));
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  for(const route of selected){const v=volume?.get(route.id)??1,width=(.85+Math.sqrt(vol(route)/max)*2.3)*(v===0?.6:1),refined=zoom>3,edits=renderer.world.meta.detail?.edits;let cached=routeVisualCache.get(route);if(!cached||cached.points!==route.points||cached.world!==renderer.world||cached.refined!==refined||cached.edits!==edits){cached={points:route.points,world:renderer.world,refined,edits,segments:tradeRouteSegments(renderer.world,route,{landAt:refined&&renderer.isVisualLand?(x,y)=>renderer.isVisualLand(x,y):null})};routeVisualCache.set(route,cached);}
    for(const segment of cached.segments){const p=segment.points,blocked=v===0,color=blocked?'rgba(229,96,80,.9)':segment.kind==='maritime'?'rgba(80,233,222,.95)':segment.kind==='river'?'rgba(72,177,235,.95)':'rgba(228,164,61,.96)';ctx.setLineDash(blocked?[2/camera.scale,4/camera.scale]:segment.kind==='maritime'?[6/camera.scale,4/camera.scale]:[]);for(let copy=from-1;copy<=to+1;copy++){ctx.beginPath();ctx.moveTo(p[0]+copy*renderer.world.width,p[1]);for(let j=2;j<p.length;j+=2)ctx.lineTo(p[j]+copy*renderer.world.width,p[j+1]);ctx.strokeStyle=segment.kind==='maritime'?'rgba(7,51,64,.8)':'rgba(57,57,39,.67)';ctx.lineWidth=(width+1.5)/camera.scale;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=width/camera.scale;ctx.stroke();}}}
  ctx.restore();
}

function labelText(ctx,text,x,y,fontSize,color,spacing=0){
  ctx.font=`${fontSize}px Georgia, 'Times New Roman', serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=3;ctx.strokeStyle='rgba(232,230,207,.66)';
  if(spacing&&'letterSpacing'in ctx)ctx.letterSpacing=`${spacing}px`;
  ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);
  if('letterSpacing'in ctx)ctx.letterSpacing='0px';
}
function collide(box,occupied){return occupied.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]);}
function random(seed){return()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}

const citySprites=new WeakMap();
function citySprite(city,renderer,visibility){
  const world=renderer.world,key=`urban4:${visibility.x}:${visibility.y}:${city.population}:${city.culture}:${visibility.footprint}:${renderer.terrainRevision||0}`,frame=renderer.citySceneFrame||0;let sprites=citySprites.get(world);if(!sprites)citySprites.set(world,sprites=new Map());const old=sprites.get(city.id);if(old?.key===key){old.frame=frame;return old.scene;}
  const scene=createCityScene(world,city,{footprint:visibility.footprint,position:{x:visibility.x,y:visibility.y},landAt:(x,y)=>renderer.isVisualLand?renderer.isVisualLand(x,y):true});
  sprites.set(city.id,{key,scene,frame});if(sprites.size>200)for(const [id,item]of sprites)if(item.frame<frame-2&&sprites.size>180)sprites.delete(id);return scene;
}
export function cityVisibility(renderer,city,camera=renderer.camera){
  const world=renderer.world,d=world&&data(world);if(!world||!d||renderer.overlays.cities===false)return {visible:false,selectable:false,marker:false,sprite:false,x:city.x,y:city.y};
  const zoom=Math.log2(world.width*camera.scale/850),importance=Math.log10(Math.max(1,city.population)),threshold=city.capital?.45:clamp(3.8-(importance-3)*.72,.8,4.5),spriteThreshold=clamp(7.5-(importance-3)*.8,4,7.6),eligible=zoom>threshold&&(CIVILIZATION_MODES.has(renderer.mode)||['physical','biome','elevation'].includes(renderer.mode)),position=eligible?(renderer.visualCityPosition?.(city)||city):city;
  const footprint=cityFootprintCells(city.population,world.width,d.settlementLayout.nearest.get(city.id)),spriteSize=Math.min(8192,footprint*camera.scale),visible=zoom>threshold&&CIVILIZATION_MODES.has(renderer.mode)||zoom>threshold&&['physical','biome','elevation'].includes(renderer.mode);
  const fade=clamp((zoom-spriteThreshold)/1.1,0,1),spriteAlpha=fade*fade*(3-2*fade);
  return {visible,selectable:visible,marker:visible&&spriteAlpha<1,sprite:visible&&spriteAlpha>0,x:position.x,y:position.y,spriteSize,footprint,zoom,spriteAlpha,markerAlpha:1-spriteAlpha};
}

export function provinceMetricValue(province,kind){return kind==='population'?province.population||0:kind==='density'?province.density??((province.population||0)/Math.max(1,province.area||0)):kind==='urbanization'?province.urbanization||0:kind==='technology'?province.technology||0:kind==='trade'?province.tradeAccess||0:kind==='economy'?province.economicOutput||province.gdp||0:0;}
export function provinceMetricText(value,kind){if(['urbanization','trade'].includes(kind))return `${Math.round(value*100)}%`;if(kind==='technology')return `${Math.round(value*100)}`;if(kind==='density')return `${value<10?value.toFixed(1):Math.round(value)}/km²`;return value>=1e12?`${(value/1e12).toFixed(1)}T`:value>=1e9?`${(value/1e9).toFixed(1)}B`:value>=1e6?`${(value/1e6).toFixed(1)}M`:value>=1e3?`${(value/1e3).toFixed(1)}k`:`${Math.round(value)}`;}

export function drawCivilizationLabels(ctx,renderer,from,to,camera=renderer.camera,{pass='all'}={}){
  const world=renderer.world,d=data(world);if(!d)return;
  const mode=renderer.mode,c=world.meta.civilization,scale=camera.scale,zoom=Math.log2(world.width*scale/850),occupied=[];
  const screen=(x,y)=>({x:(x-camera.x)*scale+camera.width/2,y:(y-camera.y)*scale+camera.height/2});
  ctx.save();ctx.scale(1/scale,1/scale);
  // Coordinates are now screen pixels measured from the world-space origin.
  // Shifting by the camera origin makes all typography independent of map scale.
  ctx.translate(camera.x*scale-camera.width/2,camera.y*scale-camera.height/2);
  if(!['sprites','bridges'].includes(pass)&&renderer.overlays.labels!==false&&TERRITORY_MODES.has(mode)){
    const key=modeGeometry(mode),entities=key==='culture'?c.cultures:key==='language'?(c.languages||c.cultures):key==='family'?c.families:key==='religion'?(c.religions||[]):c.nations,g=geometry(world,key);if(!g){ctx.restore();return;}
    const ordered=[...(entities||[])].sort((a,b)=>(b.area||b.population||0)-(a.area||a.population||0));
    for(const entity of ordered){
      const polygons=g.polygons.get(entity.id)||[];let largest=polygons.reduce((a,b)=>!a||(b.bounds[2]-b.bounds[0])*(b.bounds[3]-b.bounds[1])>(a.bounds[2]-a.bounds[0])*(a.bounds[3]-a.bounds[1])?b:a,null);if(!largest)continue;
      const b=largest.bounds,breadth=(b[2]-b[0])*scale,depth=(b[3]-b[1])*scale;
      if(breadth<37||depth<19)continue;
      const name=entity.name||'Unnamed',text=name.toLocaleUpperCase(),fontSize=clamp(Math.sqrt(breadth*depth)*.115,10,24);
      ctx.font=`${fontSize}px Georgia,serif`;const width=ctx.measureText(text).width+8;if(width>breadth*1.5&&zoom<2)continue;
      const anchorKey=`${key}:${entity.id}`;
      let anchor=d.anchors.get(anchorKey)||entity.label;if(!anchor||anchor.x<b[0]||anchor.x>b[2]||anchor.y<b[1]||anchor.y>b[3])anchor={x:(b[0]+b[2])/2,y:(b[1]+b[3])/2};
      // A label anchor may never migrate onto a neighboring state or ocean.
      const grid=key==='family'?d.familyGrid:key==='language'?(world.layers.language||world.layers.culture):world.layers[key];let index=Math.floor(anchor.y)*world.width+Math.floor(anchor.x);
      if(grid[index]!==entity.id){const center={...anchor};let best=Infinity;for(let y=Math.ceil(b[1]);y<b[3];y++)for(let x=Math.ceil(b[0]);x<b[2];x++){index=y*world.width+x;if(grid[index]!==entity.id)continue;const score=(x+.5-center.x)**2+(y+.5-center.y)**2;if(score<best){best=score;anchor={x:x+.5,y:y+.5};}}}d.anchors.set(anchorKey,anchor);
      for(let copy=from;copy<=to;copy++){
        const p=screen(anchor.x+copy*world.width,anchor.y),box=[p.x-width/2,p.y-fontSize*.65,p.x+width/2,p.y+fontSize*.65];if(box[2]<0||box[0]>camera.width||box[3]<0||box[1]>camera.height||collide(box,occupied))continue;
        labelText(ctx,text,p.x,p.y,fontSize,'#283c3e',fontSize>15?.8:.4);occupied.push(box);
      }
    }
  }
  const showCities=renderer.overlays.cities!==false&&(CIVILIZATION_MODES.has(mode)||['physical','biome','elevation'].includes(mode));
  if(showCities&&zoom>.25){
    const cities=[...c.cities].sort((a,b)=>Number(b.capital)-Number(a.capital)||b.population-a.population),markers=[];
    for(const city of cities){const visibility=cityVisibility(renderer,city,camera);if(!visibility.visible)continue;const importance=Math.log10(Math.max(1,city.population));
      for(let copy=from;copy<=to;copy++){
        const p=screen(visibility.x+copy*world.width,visibility.y),radius=city.capital?3.5:clamp(importance*.45,1.5,3.2),spriteSize=visibility.spriteSize,margin=visibility.sprite?Math.max(100,spriteSize/2):100;
        if(p.x<-margin||p.x>camera.width+margin||p.y<-margin||p.y>camera.height+margin)continue;
        if(pass!=='labels'&&visibility.sprite){
          const scene=citySprite(city,renderer,visibility);ctx.save();ctx.globalAlpha=visibility.spriteAlpha;paintCityScene(ctx,scene,p.x,p.y,spriteSize,{bridgesOnly:pass==='bridges'});ctx.restore();
        }
        if(pass==='sprites'||pass==='bridges')continue;
        const markerBox=[p.x-radius-3,p.y-radius-3,p.x+radius+3,p.y+radius+3];if(collide(markerBox,markers))continue;markers.push(markerBox);
        if(visibility.marker){ctx.save();ctx.globalAlpha=visibility.markerAlpha;ctx.fillStyle='#f7efcd';ctx.strokeStyle='#263e43';ctx.lineWidth=1.25;ctx.beginPath();if(city.capital){for(let j=0;j<10;j++){const angle=j*Math.PI/5-Math.PI/2,r=j%2?radius*.5:radius;const x=p.x+Math.cos(angle)*r,y=p.y+Math.sin(angle)*r;if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();}else ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
        if(renderer.overlays.labels!==false){const fs=city.capital?11:10;ctx.font=`${city.capital?'600 ':''}${fs}px system-ui,sans-serif`;const width=ctx.measureText(city.name).width,tx=p.x+radius+4,ty=p.y-3,box=[tx-2,ty-fs,tx+width+2,ty+4];if(!collide(box,occupied)){ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.lineWidth=3;ctx.strokeStyle='rgba(246,239,215,.93)';ctx.strokeText(city.name,tx,ty);ctx.fillStyle='#203b43';ctx.fillText(city.name,tx,ty);occupied.push(box);}}
      }
    }
  }
  if(!['sprites','bridges'].includes(pass)&&(renderer.overlays.provinceNames||renderer.provinceBreakdown!=='none'&&renderer.provinceBreakdown)){
    const provinces=(c.provinces||[]).filter(p=>!renderer.selectedNation||p.nation===renderer.selectedNation),kind=renderer.provinceBreakdown||'none',numeric=['population','density','urbanization','technology','trade'].includes(kind),metricMax=Math.max(1e-6,...provinces.map(p=>provinceMetricValue(p,kind)));
    for(const province of provinces){if(!province.label||zoom<.5&&!renderer.selectedNation)continue;for(let copy=from;copy<=to;copy++){
      const p=screen(province.label.x+copy*world.width,province.label.y);if(p.x<-30||p.y<-30||p.x>camera.width+30||p.y>camera.height+30)continue;
      if(renderer.overlays.provinceNames){ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillStyle='#233f3d';ctx.strokeStyle='#f6edd8';ctx.lineWidth=3;ctx.strokeText(province.name,p.x,p.y+24);ctx.fillText(province.name,p.x,p.y+24);}
      if(numeric&&renderer.selectedNation){const value=provinceMetricValue(province,kind),relative=['urbanization','technology','trade'].includes(kind)?clamp(value,0,1):Math.sqrt(value/metricMax),radius=10+relative*8,text=provinceMetricText(value,kind),color=atlasMetricColor(relative);ctx.save();ctx.fillStyle='rgba(250,246,224,.97)';ctx.beginPath();ctx.arc(p.x,p.y,radius+2,0,Math.PI*2);ctx.fill();ctx.fillStyle=`rgb(${color.join(',')})`;ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();ctx.font='600 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeStyle='#fcf4db';ctx.lineWidth=3;ctx.strokeText(text,p.x,p.y+radius+10);ctx.fillStyle='#213c3d';ctx.fillText(text,p.x,p.y+radius+10);ctx.restore();continue;}
      if(kind!=='none'&&renderer.selectedNation){const entries=kind==='economy'?[{id:1,population:province.economicOutput||0},{id:0,population:Math.max(0,(d.nations.get(province.nation)?.economicOutput||0)-(province.economicOutput||0))}]:(province[kind]||[]),total=entries.reduce((s,e)=>s+(e.population||e.share||0),0)||1,radius=13;let angle=-Math.PI/2;
        ctx.save();ctx.shadowColor='rgba(0,0,0,.25)';ctx.shadowBlur=3;ctx.fillStyle='#fff6df';ctx.beginPath();ctx.arc(p.x,p.y,radius+2,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
        for(const entry of entries.slice(0,8)){const next=angle+(entry.population||entry.share||0)/total*Math.PI*2,entity=kind==='cultures'?d.cultures.get(entry.id):kind==='languages'?d.languages.get(entry.id):d.religions.get(entry.id);ctx.fillStyle=kind==='economy'?(entry.id?'#d6a257':'#c4c7b8'):entity?.color||'#9dafa5';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.arc(p.x,p.y,radius,angle,next);ctx.closePath();ctx.fill();angle=next;}ctx.restore();
      }
    }}
  }
  ctx.restore();
}

