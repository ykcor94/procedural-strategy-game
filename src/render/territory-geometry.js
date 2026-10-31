// Display geometry for categorical territories (nations, cultures, languages,
// religions, provinces). The authoritative cell grid is never modified.
//
// Every boundary between two regions is traced once as a shared chain between
// junction vertices (degree != 2, diagonal pinches and the wrap seam). Each
// chain is smoothed once with endpoints pinned, and both the fills on either
// side and the border stroke reuse the same points. Neighbouring fills
// therefore meet exactly: no slivers, no holes at diagonal pinches and no
// stroke/fill drift, at every zoom level.

const OUT=-2147483648;
const empty=v=>v===0||v===OUT;

/** Bounded corner cutting. `cut` is an absolute cap in cells and `ratio` a cap
 * relative to the segment, so long straight runs keep their alignment while
 * one-cell staircases become clean diagonals. Endpoints of open chains stay. */
function cornerCut(p,closed,cut,ratio){
  const n=p.length/2;if(n<3&&!closed)return p;
  const out=[],segments=closed?n:n-1;
  if(!closed)out.push(p[0],p[1]);
  for(let i=0;i<segments;i++){
    const j=(i+1)%n,ax=p[i*2],ay=p[i*2+1],bx=p[j*2],by=p[j*2+1],dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy)||1,c=Math.min(ratio,cut/length);
    if(closed||i>0)out.push(ax+dx*c,ay+dy*c);
    if(closed||i<segments-1)out.push(bx-dx*c,by-dy*c);
  }
  if(!closed)out.push(p[n*2-2],p[n*2-1]);
  return out;
}

/** Remove collinear lattice vertices (endpoints of open chains are kept). */
function corners(xy,closed){
  const n=xy.length/2,out=[];
  for(let i=0;i<n;i++){
    if(!closed&&(i===0||i===n-1)){out.push(xy[i*2],xy[i*2+1]);continue;}
    const a=(i-1+n)%n,b=(i+1)%n;
    if((xy[i*2]-xy[a*2])*(xy[b*2+1]-xy[i*2+1])!==(xy[i*2+1]-xy[a*2+1])*(xy[b*2]-xy[i*2]))out.push(xy[i*2],xy[i*2+1]);
  }
  return out;
}

function smoothChain(xy,closed,iterations){
  let p=corners(xy,closed);
  if(closed&&p.length<6)p=xy.slice(0,-2);
  if(iterations>0)p=cornerCut(p,closed,.45,.5);
  if(iterations>1)p=cornerCut(p,closed,.22,.25);
  if(iterations>2)p=cornerCut(p,closed,.11,.25);
  if(closed)p.push(p[0],p[1]);
  return Float32Array.from(p);
}

/** Douglas-Peucker keeping both endpoints. */
export function simplifyPoints(points,tolerance){
  if(points.length<=4||tolerance<=0)return points;
  const n=points.length/2,keep=new Uint8Array(n),stack=[[0,n-1]],limit=tolerance*tolerance;keep[0]=keep[n-1]=1;
  while(stack.length){
    const [a,b]=stack.pop(),ax=points[a*2],ay=points[a*2+1],dx=points[b*2]-ax,dy=points[b*2+1]-ay,length=dx*dx+dy*dy;let max=limit,index=-1;
    for(let i=a+1;i<b;i++){const px=points[i*2]-ax,py=points[i*2+1]-ay,t=length?Math.min(1,Math.max(0,(px*dx+py*dy)/length)):0,d=(px-t*dx)**2+(py-t*dy)**2;if(d>max){max=d;index=i;}}
    if(index>=0){keep[index]=1;stack.push([a,index],[index,b]);}
  }
  let count=0;for(let i=0;i<n;i++)count+=keep[i];
  const result=new Float32Array(count*2);let k=0;for(let i=0;i<n;i++)if(keep[i]){result[k++]=points[i*2];result[k++]=points[i*2+1];}
  return result;
}

/** Half-octave zoom bands; tolerance stays below ~.35 screen pixel. */
export function lodBand(scale){return Math.round(Math.log2(Math.max(1e-3,scale))*2);}
/* Border detail: past DETAIL_BAND (about 6 px per cell) each chain is refined by deterministic midpoint
 * displacement. Every segment's offset depends only on its own endpoints, so a finer band keeps the shapes
 * of the coarser one and adds new ones; junctions stay pinned and displacement is capped (and tapered near
 * the ends) so neighbouring chains never cross. A roughness field lets mountains read rugged and plains
 * calm. Both fills and strokes read the same refined chain, so fills still meet exactly. */
export const DETAIL_BAND=5;
let detailAmplitude=.2,roughness=null;
export function setBorderDetail(amplitude=.2,field=null){detailAmplitude=Math.max(0,amplitude);roughness=field;detailEpoch++;}
let detailEpoch=0;
const hash=(a,b,c,d)=>{let h=Math.imul(a|0,374761393)^Math.imul(b|0,668265263)^Math.imul(c|0,2147483647)^Math.imul(d|0,1274126177);h=Math.imul(h^(h>>>13),1103515245);return ((h^(h>>>16))>>>0)/4294967296*2-1;};
function refine(points,band){
  const scale=2**(band/2),minLen=2.6/scale,maxDisp=.32,n=points.length/2;if(n<2)return points;
  let total=0;for(let i=1;i<n;i++)total+=Math.hypot(points[i*2]-points[i*2-2],points[i*2+1]-points[i*2-1]);
  const out=[points[0],points[1]];let walked=0;
  const sub=(ax,ay,bx,by,depth,budget,t0,t1)=>{
    const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);if(len<=minLen||depth>8||budget<=1e-4){out.push(bx,by);return;}
    const mx=(ax+bx)/2,my=(ay+by)/2,q=v=>Math.round(v*512),r=hash(q(ax)+q(bx),q(ay)+q(by),q(ax)*q(by)-q(bx)*q(ay),depth),rough=roughness?roughness(mx,my):1,tm=(t0+t1)/2,taper=Math.min(1,Math.min(tm,total-tm)/.9);
    const off=Math.max(-budget,Math.min(budget,len*detailAmplitude*rough*r))*taper,nx=-dy/len,ny=dx/len,px=mx+nx*off,py=my+ny*off;
    sub(ax,ay,px,py,depth+1,budget-Math.abs(off)*.5,t0,tm);sub(px,py,bx,by,depth+1,budget-Math.abs(off)*.5,tm,t1);
  };
  for(let i=1;i<n;i++){
    const ax=points[i*2-2],ay=points[i*2-1],bx=points[i*2],by=points[i*2+1],len=Math.hypot(bx-ax,by-ay),pieces=Math.max(1,Math.ceil(len/.75));
    for(let k=0;k<pieces;k++){const x0=ax+(bx-ax)*k/pieces,y0=ay+(by-ay)*k/pieces,x1=ax+(bx-ax)*(k+1)/pieces,y1=ay+(by-ay)*(k+1)/pieces,l=len/pieces;sub(x0,y0,x1,y1,0,maxDisp,walked,walked+l);walked+=l;}
  }
  return Float32Array.from(out);
}
export function chainPoints(chain,band){
  if(band>DETAIL_BAND&&detailAmplitude>0){
    const key=`d${Math.min(band,DETAIL_BAND+12)}:${detailEpoch}`;let points=chain.lod.get(key);
    if(!points){points=refine(chain.points,Math.min(band,DETAIL_BAND+12));if(chain.lod.size>24)for(const k of chain.lod.keys())if(typeof k==='string'&&!k.endsWith(`:${detailEpoch}`))chain.lod.delete(k);chain.lod.set(key,points);}
    return points;
  }
  let points=chain.lod.get(band);
  if(!points){const tolerance=Math.min(.3,.35/2**(band/2));points=tolerance<.004?chain.points:simplifyPoints(chain.points,tolerance);chain.lod.set(band,points);}
  return points;
}

/**
 * Build shared smoothed chains, fill rings and border chains for an integer grid.
 * `grid` values: 0 = nothing (ocean when not extended), anything else is a region.
 * `border(a,b)` decides which shared chains are drawn as borders.
 */
export function buildTerritoryGeometry(grid,width,height,{border=(a,b)=>a!==0&&b!==0,smoothing=2}={}){
  const S=width+1,V=S*(height+1),ea=[],eb=[],pa=[],pb=[];
  const at=(x,y)=>grid[y*width+x];
  const push=(a,b,l,r)=>{ea.push(a);eb.push(b);pa.push(l);pb.push(r);};
  for(let y=0;y<=height;y++)for(let x=0;x<width;x++){
    const up=y>0?at(x,y-1):OUT,down=y<height?at(x,y):OUT;
    if(up===down||empty(up)&&empty(down))continue;
    push(y*S+x,y*S+x+1,up,down);
  }
  for(let x=0;x<=width;x++)for(let y=0;y<height;y++){
    const left=x>0?at(x-1,y):OUT,right=x<width?at(x,y):OUT;
    if(left===right||empty(left)&&empty(right))continue;
    // The seam closes rings on both copies. Only the x=width edge carries the
    // real wrapped neighbour, so each international seam border appears once.
    push(y*S+x,(y+1)*S+x,x===0?OUT:left,x===width?at(0,y):x===0?OUT:right);
  }
  const E=ea.length,degree=new Int32Array(V+1);
  for(let e=0;e<E;e++){degree[ea[e]+1]++;degree[eb[e]+1]++;}
  const offset=new Int32Array(V+1);for(let v=0;v<V;v++)offset[v+1]=offset[v]+degree[v+1];
  const fill=offset.slice(0,V),adjacent=new Int32Array(E*2);
  for(let e=0;e<E;e++){adjacent[fill[ea[e]]++]=e;adjacent[fill[eb[e]]++]=e;}
  const deg=v=>offset[v+1]-offset[v],junction=v=>{const x=v%S;return deg(v)!==2||x===0||x===width;};
  const used=new Uint8Array(E),chains=[],lookup=new Map(),loopOf=new Map();
  function trace(e,v,loop){
    const verts=[v],first=v;
    while(true){
      used[e]=1;const other=ea[e]===v?eb[e]:ea[e];verts.push(other);
      if(other===first||!loop&&junction(other))break;
      let next=-1;for(let k=offset[other];k<offset[other+1];k++)if(!used[adjacent[k]]){next=adjacent[k];break;}
      if(next<0)break;e=next;v=other;
    }
    const closed=loop&&verts.at(-1)===first,xy=new Array(verts.length*2);
    for(let k=0;k<verts.length;k++){xy[k*2]=verts[k]%S;xy[k*2+1]=Math.floor(verts[k]/S);}
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(let k=0;k<xy.length;k+=2){if(xy[k]<x0)x0=xy[k];if(xy[k]>x1)x1=xy[k];if(xy[k+1]<y0)y0=xy[k+1];if(xy[k+1]>y1)y1=xy[k+1];}
    const a=pa[e],b=pb[e],index=chains.length;
    const chain={verts,closed,a,b,points:smoothChain(xy,closed,smoothing),bounds:[x0,y0,x1,y1],lod:new Map()};
    chain.border=a!==OUT&&b!==OUT&&a!==b&&border(a,b);
    if(chain.border)chain.pair=a<b?`${a}:${b}`:`${b}:${a}`;
    chains.push(chain);
    if(closed)for(const vertex of verts)loopOf.set(vertex,index);
    else{lookup.set(verts[0]*V+verts[1],index*2);lookup.set(verts.at(-1)*V+verts.at(-2),index*2+1);}
  }
  for(let v=0;v<V;v++)if(deg(v)&&junction(v))for(let k=offset[v];k<offset[v+1];k++)if(!used[adjacent[k]])trace(adjacent[k],v,false);
  for(let e=0;e<E;e++)if(!used[e])trace(e,ea[e],true);

  // Rings per region from directed cell edges, then mapped onto shared chains.
  const groups=new Map();
  const edge=(id,a,b,dir)=>{let list=groups.get(id);if(!list)groups.set(id,list=[]);list.push(a,b,dir);};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,id=grid[i];if(!id)continue;
    if(y===0||grid[i-width]!==id)edge(id,y*S+x,y*S+x+1,0);
    if(x===width-1||grid[i+1]!==id)edge(id,y*S+x+1,(y+1)*S+x+1,1);
    if(y===height-1||grid[i+width]!==id)edge(id,(y+1)*S+x+1,(y+1)*S+x,2);
    if(x===0||grid[i-1]!==id)edge(id,(y+1)*S+x,y*S+x,3);
  }
  const polygons=new Map(),priority=[1,0,3,2];
  for(const [id,list]of groups){
    const count=list.length/3,outgoing=new Map(),visited=new Uint8Array(count),rings=[];
    for(let k=0;k<count;k++){const a=list[k*3];let l=outgoing.get(a);if(!l)outgoing.set(a,l=[]);l.push(k);}
    for(let start=0;start<count;start++)if(!visited[start]){
      const verts=[],first=list[start*3];let k=start,guard=0;
      while(k!==undefined&&!visited[k]&&guard++<=count){
        visited[k]=1;verts.push(list[k*3]);const b=list[k*3+1],dir=list[k*3+2];if(b===first)break;
        const next=(outgoing.get(b)||[]).filter(j=>!visited[j]);
        if(next.length>1)next.sort((p,q)=>priority.indexOf((list[p*3+2]-dir+4)%4)-priority.indexOf((list[q*3+2]-dir+4)%4));
        k=next[0];
      }
      if(verts.length<4)continue;
      const ring=ringFromVerts(verts,id);if(ring)rings.push(ring);
    }
    polygons.set(id,rings);
  }
  function ringFromVerts(verts,id){
    const m=verts.length,xy=new Array(m*2);for(let k=0;k<m;k++){xy[k*2]=verts[k]%S;xy[k*2+1]=Math.floor(verts[k]/S);}
    const reduced=corners(xy,true);if(reduced.length<6)return null;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(let k=0;k<reduced.length;k+=2){if(reduced[k]<x0)x0=reduced[k];if(reduced[k]>x1)x1=reduced[k];if(reduced[k+1]<y0)y0=reduced[k+1];if(reduced[k+1]>y1)y1=reduced[k+1];}
    const refs=[];let start=-1;for(let k=0;k<m;k++)if(junction(verts[k])){start=k;break;}
    if(start<0){
      const index=loopOf.get(verts[0]);
      if(index!==undefined){const chain=chains[index],at=chain.verts.indexOf(verts[0]),forward=chain.verts[at+1]===verts[1%m];refs.push(index*2+(forward?0:1));}
    }else for(let i=start;i<start+m;){
      const a=verts[i%m],b=verts[(i+1)%m],code=lookup.get(a*V+b);
      if(code===undefined){refs.length=0;break;}
      refs.push(code);i+=chains[code>>1].verts.length-1;
    }
    if(!refs.length){
      // Defensive fallback: an unsmoothed private chain (never expected).
      const index=chains.length;chains.push({verts,closed:true,points:Float32Array.from([...xy,xy[0],xy[1]]),bounds:[x0,y0,x1,y1],lod:new Map(),border:false});refs.push(index*2);
    }
    return {id,refs:Int32Array.from(refs),points:reduced,bounds:[x0,y0,x1,y1]};
  }
  const borders=chains.filter(chain=>chain.border);
  return {chains,polygons,borders};
}

/** Append one fill ring (moveTo … closePath) built from shared chains. */
export function traceRing(ctx,geometry,ring,band,shift=0){
  let first=true;
  for(const code of ring.refs){
    const points=chainPoints(geometry.chains[code>>1],band),forward=!(code&1),n=points.length/2;
    for(let k=0;k<n-1;k++){const j=forward?k:n-1-k,x=points[j*2]+shift,y=points[j*2+1];if(first){ctx.moveTo(x,y);first=false;}else ctx.lineTo(x,y);}
  }
  if(!first)ctx.closePath();
}

/** Append one border chain as an open (or closed) polyline. */
export function traceChain(ctx,chain,band,shift=0){
  const points=chainPoints(chain,band),n=points.length/2;if(n<2)return;
  ctx.moveTo(points[0]+shift,points[1]);for(let k=1;k<n;k++)ctx.lineTo(points[k*2]+shift,points[k*2+1]);
}
