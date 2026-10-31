import {hashSeed,seededRandom} from '../core/random.js';
import {clamp,wrapX} from '../core/geo.js';
import {sampleBilinear} from '../core/sampling.js';

const STYLES=['organic','radial','old-town','planned','terraced','garden'];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const segmentDistance=(x,y,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-a.x-dx*t,y-a.y-dy*t);};
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

// Roof and wall palettes follow climate; a culture shifts within its palette.
const PALETTES={
  arid:['#dccaa5','#e8dfc8','#c9a77c','#c2a684','#e3d5b8','#b98f66'],
  warm:['#b8674a','#c97f5a','#d9a27a','#a95d45','#e2c6a1','#9b6b54'],
  temperate:['#a77c61','#8c9b98','#b19d88','#7f8a8c','#c6ac83','#9a6f5c'],
  cold:['#6f7b80','#8a8f8e','#5f6a70','#9b8f7d','#7d8580','#a49a88'],
  tropical:['#c4704f','#d9b48a','#a8846a','#cf9a68','#e6d3b3','#8e7a63'],
};

/** A connected street graph with a density gradient, land use and outskirts.
 * Coordinates are normalized to a local footprint; geography is sampled in
 * world space and no city geometry is stored in terrain LOD products. */
export function createCityScene(world,city,{footprint=.5,position=city,landAt}={}){
  const seed=hashSeed(`${world.seed}:${city.id}:${city.cell}`,'urban-layout-4'),r=seededRandom(seed,'streets'),l=world.layers,w=world.width,h=world.height;
  const population=Math.max(1,city.population),complexity=clamp(Math.pow(population/60000000,.38),0,1.25),target=Math.round(18+230*complexity),spacing=clamp(.105-.077*complexity,.022,.105),outskirts=population>=25000;
  const at=(name,x,y,fallback=0)=>l[name]?sampleBilinear(l[name],wrapX(x/w,1),clamp(y/h,0,1),w,h):fallback;
  const elevation=at('elevation',position.x,position.y),roughness=Math.max(...[[-1,0],[1,0],[0,-1],[0,1]].map(([x,y])=>Math.abs(at('elevation',position.x+x*.4,position.y+y*.4)-elevation)));
  const river=Boolean(l.river?.[city.cell]),port=Boolean(city.port),style=port?'port':roughness>550?'terraced':river&&r()<.6?'river':STYLES[Math.floor(r()*STYLES.length)];
  const downstream=l.flowTo?.[city.cell],riverDx=downstream>=0?downstream%w-city.cell%w:1,riverDy=downstream>=0?Math.floor(downstream/w)-Math.floor(city.cell/w):0,riverAngle=Math.atan2(riverDy,riverDx-Math.round(riverDx/w)*w),riverNormal={x:-Math.sin(riverAngle),y:Math.cos(riverAngle)};
  const rotation=r()*Math.PI*2,stretch=.74+r()*.35,lobes=3+Math.floor(r()*5),phase=r()*Math.PI*2,asymmetry=.12+r()*.2;
  const toWorld=(x,y)=>({x:position.x+x*footprint*.48,y:position.y+y*footprint*.48});
  const ground=(x,y)=>{const p=toWorld(x,y);if(landAt)return landAt(p.x,p.y);return at('elevation',p.x,p.y)>0&&at('lake',p.x,p.y)<.5;};
  let shoreAngle=rotation;
  if(port){let low=Infinity;for(let a=0;a<16;a++){const angle=a*Math.PI/8,p=toWorld(Math.cos(angle)*.85,Math.sin(angle)*.85),e=at('elevation',p.x,p.y);if(e<low){low=e;shoreAngle=angle;}}}
  // Industry gathers downstream or on the working waterfront, otherwise on one flank.
  const industrialAngle=port?shoreAngle+(r()-.5)*.9:river?riverAngle:rotation+Math.PI*(.6+r()*.8),industrial=population>=400000;
  const t=at('annualTemperature',position.x,position.y,14),rain=at('annualPrecipitation',position.x,position.y,800),climate=t>20&&rain<650?'arid':t>22&&rain>1400?'tropical':t>15?'warm':t<4?'cold':'temperate',base=PALETTES[climate],shift=Math.abs(city.culture||0)%base.length,palette=base.map((_,k)=>base[(k+shift)%base.length]);
  const radius=angle=>clamp(.78+Math.sin(angle*lobes+phase)*asymmetry+Math.cos(angle*(lobes+2)-phase)*.07,.48,1);
  const inside=(x,y)=>{const angle=Math.atan2(y/stretch,x),d=Math.hypot(x,y/stretch);return d<radius(angle)&&ground(x,y);};
  const nodes=[{x:0,y:0,arterial:true}],edges=[],edgeSet=new Set(),curvy=['organic','old-town','terraced','river'].includes(style);
  const addEdge=(a,b,major=false,extra={})=>{if(a===b)return;const key=a<b?`${a}:${b}`:`${b}:${a}`;if(edgeSet.has(key))return;edgeSet.add(key);edges.push({a,b,major,bend:curvy&&!major?(r()-.5)*.36:major&&curvy?(r()-.5)*.12:0,...extra});};
  const addNode=(x,y,arterial=false)=>{if(!inside(x,y))return -1;if(nodes.some(n=>Math.hypot(n.x-x,n.y-y)<spacing*.75))return -1;nodes.push({x,y,arterial});return nodes.length-1;};
  const spokes=Math.round(3+complexity*(style==='radial'?4:3)),steps=Math.round(2+complexity*4);
  // Every arterial begins at the civic center; curved segments adapt to terrain.
  for(let s=0;s<spokes;s++){
    const angle=rotation+s*Math.PI*2/spokes+(r()-.5)*.22;let last=0;
    for(let step=1;step<=steps;step++){const d=step/steps*.84,a=angle+(curvy?Math.sin(step*.7+phase)*.13:0),x=Math.cos(a)*d,y=Math.sin(a)*d*stretch;
      const id=addNode(x,y,true);if(id>=0){addEdge(last,id,true);last=id;}}
  }
  for(let k=0;k<target*15&&nodes.length<target;k++){
    let x,y;
    if(style==='radial'){const angle=r()*Math.PI*2,band=(1+Math.floor(r()*5))*.145;x=Math.cos(angle)*band+(r()-.5)*.035;y=Math.sin(angle)*band*stretch+(r()-.5)*.035;}
    else if(style==='planned'||style==='port'){const spacing=.13;let gx=(Math.floor(r()*15)-7)*spacing,gy=(Math.floor(r()*15)-7)*spacing;if(style==='port'){const a=shoreAngle-Math.PI/2;x=gx*Math.cos(a)-gy*Math.sin(a);y=gx*Math.sin(a)+gy*Math.cos(a);}else{x=gx*Math.cos(rotation)-gy*Math.sin(rotation);y=gx*Math.sin(rotation)+gy*Math.cos(rotation);}x+=(r()-.5)*.028;y+=(r()-.5)*.028;}
    else if(style==='terraced'){const row=(Math.floor(r()*11)-5)*.15,x0=r()*1.8-.9;x=x0*Math.cos(rotation)-row*Math.sin(rotation);y=x0*Math.sin(rotation)+row*Math.cos(rotation)+Math.sin(x0*5+phase)*.06;}
    else{
      // Denser street grain toward the core.
      const d=Math.pow(r(),.8)*.95,a=r()*Math.PI*2;x=Math.cos(a)*d;y=Math.sin(a)*d*stretch;
    }
    addNode(x,y);
  }
  // Prim's tree guarantees connectivity even for irregular mountain/harbor
  // layouts. Extra short links create blocks without disconnected streets.
  const connected=new Uint8Array(nodes.length);connected[0]=1;const best=new Float64Array(nodes.length);best.fill(Infinity);const parent=new Int32Array(nodes.length);
  for(let added=1,current=0;added<nodes.length;added++){
    for(let k=0;k<nodes.length;k++)if(!connected[k]){const a=nodes[current],b=nodes[k],p=toWorld(b.x,b.y),slope=Math.abs(at('elevation',p.x,p.y)-elevation)/1800,cost=distance(a,b)*(1+(style==='terraced'?slope:.2*slope));if(cost<best[k]){best[k]=cost;parent[k]=current;}}
    let next=-1,value=Infinity;for(let k=0;k<nodes.length;k++)if(!connected[k]&&best[k]<value){next=k;value=best[k];}if(next<0)break;addEdge(parent[next],next);connected[next]=1;current=next;
  }
  for(let a=0;a<nodes.length;a++){
    const nearby=nodes.map((n,b)=>({b,d:b===a?Infinity:distance(nodes[a],n)})).sort((x,y)=>x.d-y.d);
    const links=style==='planned'||style==='port'?3:style==='old-town'?2:2+(r()<.25?1:0);
    for(const {b,d}of nearby.slice(0,links))if(d<Math.max(.26,spacing*3)&&r()>.15)addEdge(a,b,nodes[a].arterial&&nodes[b].arterial);
  }
  // Large cities carry a ring road joining the outer arterial nodes in angular order.
  let ring=null;
  if(population>=1500000){const around=nodes.map((n,k)=>({k,a:Math.atan2(n.y/stretch,n.x),d:Math.hypot(n.x,n.y/stretch)})).filter(n=>n.k&&n.d>.48&&n.d<.74).sort((p,q)=>p.a-q.a),picked=[];for(const n of around)if(!picked.length||n.a-picked.at(-1).a>.32)picked.push(n);if(picked.length>=5&&picked.every((p,k)=>distance(nodes[p.k],nodes[picked[(k+1)%picked.length].k])<.6)){ring=picked.map(p=>p.k);for(let k=0;k<ring.length;k++)addEdge(ring[k],ring[(k+1)%ring.length],true,{ring:true});}}
  // Outskirts: low-density fingers along arterials, connected to the network.
  const outskirtsPatches=[],fields=[],houses=[];
  if(outskirts){const count=Math.round(2+complexity*7);for(let k=0;k<count;k++){
    const angle=rotation+k*Math.PI*2/count+(r()-.5)*.35,d=.82+r()*.22,x=Math.cos(angle)*d,y=Math.sin(angle)*d*stretch;
    if(!ground(x,y))continue;let nearest=0,near=Infinity;for(let j=0;j<nodes.length;j++){const dist=Math.hypot(nodes[j].x-x,nodes[j].y-y);if(dist<near){near=dist;nearest=j;}}
    if(near>.4)continue;const id=nodes.length;nodes.push({x,y,arterial:false,outskirts:true});addEdge(nearest,id);outskirtsPatches.push({x,y,rx:.09+r()*.08,ry:.06+r()*.06,angle});
    // Scattered houses along the approach road.
    const a=nodes[nearest],len=Math.hypot(x-a.x,y-a.y)||1,nx=-(y-a.y)/len,ny=(x-a.x)/len;for(let j=0;j<6+complexity*10;j++){const s=r(),side=r()<.5?-1:1,off=.03+r()*.05,hx=a.x+(x-a.x)*s+nx*off*side,hy=a.y+(y-a.y)*s+ny*off*side;if(ground(hx,hy))houses.push({x:hx,y:hy,size:.012+r()*.01,angle:Math.atan2(y-a.y,x-a.x),roof:Math.floor(r()*6)});}
  }
  // Fields and woodlots in a ring beyond the built-up edge.
  const fieldCount=Math.round(6+complexity*18);for(let k=0;k<fieldCount*3&&fields.length<fieldCount;k++){const angle=r()*Math.PI*2,d=.95+r()*.4,x=Math.cos(angle)*d,y=Math.sin(angle)*d*stretch;if(!ground(x,y))continue;fields.push({x,y,w:.07+r()*.09,h:.045+r()*.06,angle:rotation+(r()<.5?0:Math.PI/2)+(r()-.5)*.25,tone:Math.floor(r()*4)});}}
  let buildings=[];const occupied=new Map(),grid=.035,buildingSpacing=clamp(.09-.067*complexity,.018,.09),buildingSize=clamp(.044-.024*complexity,.017,.044);
  function vacant(x,y,size){const cx=Math.floor(x/grid),cy=Math.floor(y/grid);for(let yy=cy-2;yy<=cy+2;yy++)for(let xx=cx-2;xx<=cx+2;xx++)for(const b of occupied.get(`${xx}:${yy}`)||[])if(Math.hypot(b.x-x,b.y-y)<(b.size+size)*.52)return false;return true;}
  for(const edge of edges){const a=nodes[edge.a],b=nodes[edge.b],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.02)continue;const nx=-dy/len,ny=dx/len,angle=Math.atan2(dy,dx),outer=Boolean(a.outskirts||b.outskirts),mid=Math.hypot((a.x+b.x)/2,(a.y+b.y)/2),density=1-smooth(.15,.95,mid),count=Math.max(1,Math.floor(len/(buildingSpacing*(outer?2.2:1+.9*(1-density)))));
    for(let j=0;j<count;j++)for(const side of [-1,1]){
      const tt=(j+.5)/count,core=density,size=buildingSize*(.7+r()*.55+core*.45)*(outer?.75:1),offset=(edge.major?.033:.024)+size*.55,x=a.x+dx*tt+nx*offset*side,y=a.y+dy*tt+ny*offset*side;
      if(!(outer?ground(x,y):inside(x,y))||Math.hypot(x,y)<.09||!vacant(x,y,size))continue;
      if(!outer&&r()>.55+.45*density)continue;
      if(river&&Math.abs(x*riverNormal.x+y*riverNormal.y)<.047)continue;
      if(edges.some(other=>other!==edge&&segmentDistance(x,y,nodes[other.a],nodes[other.b])<.017))continue;
      const p=toWorld(x,y),hill=Math.abs(at('elevation',p.x,p.y)-elevation);if(hill>550&&r()<.8)continue;
      const d=Math.hypot(x,y),toward=Math.cos(Math.atan2(y,x)-industrialAngle),use=outer?'outskirts':d<.34?'center':port&&Math.cos(Math.atan2(y,x)-shoreAngle)>.7&&d>.3?'harbor':industrial&&toward>.82&&d>.36&&d<.9?'industrial':style==='garden'?'garden':'residential';
      const big=use==='industrial'||use==='harbor',shape=use==='center'&&r()<.3?'court':use==='residential'&&r()<.22?'L':'rect';
      const building={x,y,size:size*(big?1.35:1),width:size*(big?1.6:.75+r()*.65),height:size*(big?1.1:.7+r()*.8),angle:angle+(style==='old-town'?(r()-.5)*.2:0),roof:Math.floor(r()*6),district:use,shape,tall:clamp(core*(.4+r()*.8)+(use==='center'?.25:0),0,1.2),tower:use==='center'&&population>1000000&&r()<.06+.14*complexity};
      buildings.push(building);const key=`${Math.floor(x/grid)}:${Math.floor(y/grid)}`;if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push(building);
    }
  }
  const buildingBudget=Math.round(12+1300*Math.pow(Math.min(population,300000000)/60000000,.55));
  if(buildings.length>buildingBudget){const count=buildings.length;buildings=buildings.filter((building,k)=>Math.floor((k+1)*buildingBudget/count)>Math.floor(k*buildingBudget/count));}
  const parks=nodes.filter((n,k)=>k>0&&!n.arterial&&!n.outskirts&&Math.hypot(n.x,n.y)>.25&&((k*37+seed)%31===0)).slice(0,style==='garden'?10:4).map((n,k)=>({x:n.x,y:n.y,rx:.045+((seed>>k)&7)*.004,ry:.035+((seed>>(k+3))&7)*.003}));
  // The footprint hugs the shore: each ray retreats until it reaches land.
  const footprintPoints=[];for(let j=0;j<64;j++){const a=j*Math.PI/32;let d=radius(a);while(d>.12&&!ground(Math.cos(a)*d,Math.sin(a)*d*stretch))d-=.06;footprintPoints.push(Math.cos(a)*d,Math.sin(a)*d*stretch);}
  if(river)for(const edge of edges){const a=nodes[edge.a],b=nodes[edge.b],sa=a.x*riverNormal.x+a.y*riverNormal.y,sb=b.x*riverNormal.x+b.y*riverNormal.y;edge.bridge=sa*sb<0&&Math.min(Math.abs(sa),Math.abs(sb))<.08;if(edge.bridge)edge.bend=0;}
  // Waterfront piers for ports.
  const piers=[];if(port)for(let k=0;k<Math.round(2+complexity*5);k++){const a=shoreAngle+(k-(1+complexity*2.5))*.11,d=.62+r()*.2,x=Math.cos(a)*d,y=Math.sin(a)*d*stretch;if(!ground(x,y)&&ground(x*.85,y*.85))piers.push({x,y,angle:a,length:.07+r()*.06});}
  const landmark=city.capital?'dome':port?'lighthouse':population>=5000000?'towers':population>=300000?'spire':'square';
  return {version:4,seed,style,climate,palette,nodes,edges,ring,buildings,houses,fields,parks,piers,footprintPoints,outskirtsPatches,shoreAngle,industrialAngle,port,river,riverAngle,roughness,rotation,population,landmark};
}

function edgePath(ctx,scene,e){const a=scene.nodes[e.a],b=scene.nodes[e.b];ctx.moveTo(a.x,a.y);if(e.bend){const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,len=Math.hypot(b.x-a.x,b.y-a.y);ctx.quadraticCurveTo(mx-(b.y-a.y)/len*e.bend*len,my+(b.x-a.x)/len*e.bend*len,b.x,b.y);}else ctx.lineTo(b.x,b.y);}

export function paintCityScene(ctx,scene,x,y,size,{bridgesOnly=false}={}){
  ctx.save();ctx.translate(x,y);ctx.scale(size*.48,size*.48);
  if(bridgesOnly){if(scene.river){ctx.lineCap='butt';for(const edge of scene.edges)if(edge.bridge){const a=scene.nodes[edge.a],b=scene.nodes[edge.b];ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle='#6f7169';ctx.lineWidth=.027;ctx.stroke();ctx.strokeStyle='#e1d7b9';ctx.lineWidth=.015;ctx.stroke();}}ctx.restore();return;}
  const palette=scene.palette||PALETTES.temperate;
  // Farmland and woodlots fade outward from the built edge.
  for(const f of scene.fields||[]){ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.angle);ctx.fillStyle=['rgba(158,166,104,.42)','rgba(186,170,112,.4)','rgba(122,146,96,.42)','rgba(171,158,120,.36)'][f.tone];ctx.fillRect(-f.w/2,-f.h/2,f.w,f.h);ctx.strokeStyle='rgba(88,110,74,.32)';ctx.lineWidth=.004;ctx.strokeRect(-f.w/2,-f.h/2,f.w,f.h);ctx.restore();}
  // Soft built-up area: dense core, thinning suburbs and outskirts sprawl.
  const sprawl=ctx.createRadialGradient(0,0,.05,0,0,1.05);sprawl.addColorStop(0,'rgba(196,186,160,.78)');sprawl.addColorStop(.55,'rgba(192,183,156,.6)');sprawl.addColorStop(1,'rgba(188,180,150,.16)');
  ctx.beginPath();scene.footprintPoints.forEach((v,k,a)=>{if(k%2===0){if(!k)ctx.moveTo(v,a[k+1]);else ctx.lineTo(v,a[k+1]);}});ctx.closePath();ctx.fillStyle=sprawl;ctx.fill();
  for(const patch of scene.outskirtsPatches||[]){const g=ctx.createRadialGradient(patch.x,patch.y,0,patch.x,patch.y,Math.max(patch.rx,patch.ry));g.addColorStop(0,'rgba(187,179,148,.42)');g.addColorStop(1,'rgba(187,179,148,0)');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(patch.x,patch.y,patch.rx*1.3,patch.ry*1.3,patch.angle,0,Math.PI*2);ctx.fill();}
  for(const park of scene.parks){ctx.fillStyle='#78936e';ctx.beginPath();ctx.ellipse(park.x,park.y,park.rx||.055,park.ry||.042,scene.rotation,0,Math.PI*2);ctx.fill();for(let j=0;j<5;j++){ctx.fillStyle=j%2?'#587b58':'#63865e';ctx.beginPath();ctx.arc(park.x+Math.cos(j*2.4)*.024,park.y+Math.sin(j*2.4)*.019,.009,0,Math.PI*2);ctx.fill();}}
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const tier of ['minor','major','ring']){
    ctx.beginPath();
    if(tier==='ring'&&scene.ring){
      // A smooth closed beltway through the midpoints of its ring segments.
      const p=scene.ring.map(k=>scene.nodes[k]),n=p.length,mid=k=>({x:(p[k].x+p[(k+1)%n].x)/2,y:(p[k].y+p[(k+1)%n].y)/2});ctx.moveTo(mid(n-1).x,mid(n-1).y);for(let k=0;k<n;k++){const m=mid(k);ctx.quadraticCurveTo(p[k].x,p[k].y,m.x,m.y);}ctx.closePath();
    }else for(const e of scene.edges)if((e.ring?'ring':e.major?'major':'minor')===tier)edgePath(ctx,scene,e);
    const [casing,fill,cw,fw]=tier==='ring'?['#867b64','#f0dca6',.03,.019]:tier==='major'?['#8d826d','#eee0bd',.027,.017]:['#8f8c7d','#d7ccac',.017,.0095];
    ctx.strokeStyle=casing;ctx.lineWidth=cw;ctx.stroke();ctx.strokeStyle=fill;ctx.lineWidth=fw;ctx.stroke();
  }
  for(const p of scene.piers||[]){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.fillStyle='#8c8775';ctx.fillRect(-.01,-.006,p.length,.012);ctx.restore();}
  for(const hs of scene.houses||[]){ctx.save();ctx.translate(hs.x,hs.y);ctx.rotate(hs.angle);ctx.fillStyle='rgba(33,43,41,.22)';ctx.fillRect(-hs.size/2+.003,-hs.size/2+.004,hs.size,hs.size*.8);ctx.fillStyle=palette[hs.roof];ctx.fillRect(-hs.size/2,-hs.size/2,hs.size,hs.size*.8);ctx.restore();}
  for(const b of scene.buildings){
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);const bw=b.width,bh=b.height,lift=.004+(b.tall||0)*.008+(b.tower?.012:0);
    const color=b.tower?'#8a9a9b':b.district==='industrial'?'#9aa1a3':b.district==='harbor'?'#a59a83':palette[b.roof];
    ctx.fillStyle='rgba(33,43,41,.3)';
    if(b.shape==='L'){ctx.fillRect(-bw/2+lift,-bh/2+lift,bw,bh*.45);ctx.fillRect(-bw/2+lift,-bh/2+lift,bw*.45,bh);ctx.fillStyle=color;ctx.fillRect(-bw/2,-bh/2,bw,bh*.45);ctx.fillRect(-bw/2,-bh/2,bw*.45,bh);}
    else if(b.shape==='court'){ctx.fillRect(-bw/2+lift,-bh/2+lift,bw,bh);ctx.fillStyle=color;ctx.fillRect(-bw/2,-bh/2,bw,bh);ctx.fillStyle='rgba(120,128,104,.85)';ctx.fillRect(-bw*.22,-bh*.22,bw*.44,bh*.44);}
    else{ctx.fillRect(-bw/2+lift,-bh/2+lift,bw,bh);ctx.fillStyle=color;ctx.fillRect(-bw/2,-bh/2,bw,bh);}
    if(b.district==='industrial'){ctx.strokeStyle='rgba(70,78,82,.4)';ctx.lineWidth=.002;ctx.beginPath();for(let k=1;k<4;k++){ctx.moveTo(-bw/2+bw*k/4,-bh/2);ctx.lineTo(-bw/2+bw*k/4,bh/2);}ctx.stroke();}
    else{ctx.fillStyle='rgba(251,239,211,.35)';ctx.fillRect(-bw/2,-bh/2,bw,.003);ctx.strokeStyle='rgba(64,63,53,.22)';ctx.lineWidth=.0015;ctx.beginPath();ctx.moveTo(-bw/2,0);ctx.lineTo(bw/2,0);ctx.stroke();}
    ctx.restore();
  }
  // Civic square and a landmark that reflects the city's role.
  ctx.fillStyle='#dacead';ctx.beginPath();ctx.arc(0,0,.067,0,Math.PI*2);ctx.fill();
  const mark=scene.landmark||'square';
  if(mark==='dome'){ctx.fillStyle='rgba(33,43,41,.3)';ctx.beginPath();ctx.arc(.008,.01,.034,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e7dcc0';ctx.beginPath();ctx.arc(0,0,.034,0,Math.PI*2);ctx.fill();ctx.fillStyle='#7f9c98';ctx.beginPath();ctx.arc(0,0,.02,0,Math.PI*2);ctx.fill();}
  else if(mark==='towers'){for(const [dx,dy]of [[-.03,-.02],[.025,-.03],[.01,.028]]){ctx.fillStyle='rgba(33,43,41,.35)';ctx.fillRect(dx-.011+.016,dy-.011+.02,.022,.022);ctx.fillStyle='#8fa2a6';ctx.fillRect(dx-.011,dy-.011,.022,.022);ctx.fillStyle='rgba(255,255,255,.35)';ctx.fillRect(dx-.011,dy-.011,.022,.004);}}
  else if(mark==='spire'){ctx.fillStyle='#e9ddbd';ctx.fillRect(.027,-.057,.056,.029);ctx.fillStyle='#a59a83';ctx.fillRect(.029,-.054,.052,.023);ctx.fillStyle='#859d9a';ctx.beginPath();ctx.arc(0,0,.017,0,Math.PI*2);ctx.fill();}
  else{ctx.fillStyle='#859d9a';ctx.beginPath();ctx.arc(0,0,.017,0,Math.PI*2);ctx.fill();}
  if(mark==='lighthouse'||scene.port&&scene.piers?.length){const p=scene.piers?.[0];if(p){const lx=p.x+Math.cos(p.angle)*p.length,ly=p.y+Math.sin(p.angle)*p.length;ctx.fillStyle='#f2ead2';ctx.beginPath();ctx.arc(lx,ly,.011,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b5523b';ctx.beginPath();ctx.arc(lx,ly,.006,0,Math.PI*2);ctx.fill();}}
  ctx.restore();
}
