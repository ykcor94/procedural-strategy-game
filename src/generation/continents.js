import {wrapX,rowArea,neighbors8} from '../core/geo.js';
import {RasterHeap} from './heap.js';
import {periodicNoise} from './noise.js';

export function continentAnchors(random,count) {
  const anchors=[];
  for(let k=0;k<count;k++) {
    let best=null,score=-1;const minimum=Math.sqrt(.5/count)*(.58+random()*.15);
    for(let j=0;j<100;j++) {
      // Spherical latitude sampling and a minimum distance, rather than
      // repeatedly choosing the farthest corner of a rectangular domain.
      const candidate={u:random(),v:.5-Math.asin((random()*2-1)*.91)/Math.PI,weight:.65+random()*.8,aspect:.65+random()*.9,angle:random()*Math.PI*2};let distance=Infinity;
      for(const a of anchors){let dx=candidate.u-a.u;dx-=Math.round(dx);distance=Math.min(distance,dx*dx+(candidate.v-a.v)**2*.25);}
      if(!anchors.length||distance>minimum*minimum){best=candidate;break;}
      const value=distance*(.8+random()*.4);
      if(value>score){score=value;best=candidate;}
    }
    anchors.push(best);
  }
  return anchors;
}

/** Grow compact, connected continental cores behind broad, warped marine
 * buffers. Connectivity chooses land identity, never elevation or bathymetry.
 * Unlike a hard Voronoi cut, coastlines normally form before growth reaches
 * the ownership boundary; a finite coastal falloff handles crowded layouts.
 */
export function constrainContinents(raw,w,h,anchors,coverage,rawSeaLevel) {
  const n=w*h,k=anchors.length,owner=new Uint8Array(n),boundary=new Uint8Array(n),area=new Float64Array(h),clearance=new Float32Array(n),local=new Float32Array(n),buffer=new Float32Array(n);
  const available=new Float64Array(k),seeds=new Int32Array(k).fill(-1),maxima=new Float64Array(k).fill(-Infinity);
  const seed=Math.floor(anchors[0].u*4294967295),desired=w*2*coverage,weights=anchors.map(a=>a.weight),weightSum=weights.reduce((a,b)=>a+b,0);
  const baseBuffer=.018*Math.min(1,(1-coverage)/.65)/Math.sqrt(Math.max(1,k/3));
  for(let y=0;y<h;y++){area[y]=rowArea(y,h);for(let x=0;x<w;x++) {
    const i=y*w+x,u=(x+.5)/w,v=(y+.5)/h;
    const pu=u+periodicNoise(u,v*.5,3,seed)*.11+periodicNoise(u,v*.5,11,seed+41)*.024;
    const pv=v*.5+periodicNoise(u,v*.5,3,seed+97)*.09+periodicNoise(u,v*.5,17,seed+151)*.009;
    let best=Infinity,second=Infinity,id=0,other=0;
    for(let a=0;a<k;a++){let dx=pu-anchors[a].u;dx-=Math.round(dx);const d=dx*dx+(pv-anchors[a].v*.5)**2;if(d<best){second=best;other=id;best=d;id=a;}else if(d<second){second=d;other=a;}}
    owner[i]=id;
    let dx=anchors[id].u-anchors[other].u;dx-=Math.round(dx);const separation=Math.hypot(dx,(anchors[id].v-anchors[other].v)*.5);
    clearance[i]=k===1?1:(second-best)/Math.max(.001,2*separation);
    buffer[i]=baseBuffer*(.8+periodicNoise(u,v*.5,9,seed+263)*.65+periodicNoise(u,v*.5,27,seed+307)*.2);
    const radius=Math.sqrt(coverage*.5*weights[id]/weightSum/Math.PI);
    let ux=pu-anchors[id].u;ux-=Math.round(ux);const vy=pv-anchors[id].v*.5,ca=Math.cos(anchors[id].angle||0),sa=Math.sin(anchors[id].angle||0),aspect=anchors[id].aspect||1;
    const radial=Math.hypot((ux*ca+vy*sa)/aspect,(-ux*sa+vy*ca)*aspect)/Math.max(.025,radius);
    local[i]=raw[i]*.68-Math.pow(radial,1.25)*.45-.2*Math.exp(-clearance[i]/Math.max(.0001,buffer[i]))-24*Math.abs(v*2-1)**20;
  }}
  // Only the higher-ID side needs a one-cell safety margin. Reserving both
  // sides consumed too much area at small grids/high continental targets.
  for(let i=0;i<n;i++) {
    if(k>1)neighbors8(i,w,h,j=>{if(owner[j]<owner[i])boundary[i]=1;});
  }
  let bufferScale=1;
  for(let pass=0;pass<10;pass++){available.fill(0);for(let i=0;i<n;i++)if(!boundary[i]&&clearance[i]>buffer[i]*bufferScale)available[owner[i]]+=area[Math.floor(i/w)];if(available.reduce((a,b)=>a+b,0)>desired*1.015)break;bufferScale*=.65;}
  for(let i=0;i<n;i++)if(!boundary[i]&&clearance[i]>buffer[i]*bufferScale){const a=owner[i];if(local[i]>maxima[a]){maxima[a]=local[i];seeds[a]=i;}}
  const priority=new Float32Array(n);priority.fill(Infinity);const visited=new Uint8Array(n),heap=new RasterHeap(n,priority,7103);
  for(let a=0;a<k;a++)if(seeds[a]>=0){const i=seeds[a];priority[i]=-maxima[a]-.25;visited[i]=1;heap.push(i);}
  while(heap.size) {
    const i=heap.pop();neighbors8(i,w,h,j=>{
      if(visited[j]||boundary[j]||owner[j]!==owner[i]||clearance[j]<=buffer[j]*bufferScale)return;
      visited[j]=1;const jitter=((Math.imul(j+1,2654435761)>>>0)/4294967296)*.5;
      const diagonal=(j%w)!==(i%w)&&Math.floor(j/w)!==Math.floor(i/w)?Math.SQRT2:1;
      priority[j]=Math.max(-local[j],priority[i]+(1+jitter)*.00012*256/w*diagonal);heap.push(j);
    });
  }
  available.fill(0);for(let i=0;i<n;i++)if(visited[i])available[owner[i]]+=area[Math.floor(i/w)];
  const budgets=new Float64Array(k);
  for(let a=0;a<k;a++)budgets[a]=Math.min(available[a]*.995,desired*weights[a]/weightSum);
  for(let pass=0;pass<8;pass++) {
    const remaining=desired-budgets.reduce((a,b)=>a+b,0);if(remaining<1e-9)break;
    let spare=0;for(let a=0;a<k;a++)spare+=Math.max(0,available[a]*.999-budgets[a]);if(!spare)break;
    for(let a=0;a<k;a++)budgets[a]+=remaining*Math.max(0,available[a]*.999-budgets[a])/spare;
  }
  const lo=new Float64Array(k).fill(Infinity),hi=new Float64Array(k).fill(-Infinity);
  for(let i=0;i<n;i++)if(visited[i]){const a=owner[i],value=-priority[i];lo[a]=Math.min(lo[a],value);hi[a]=Math.max(hi[a],value);}
  const mid=new Float64Array(k),counts=new Float64Array(k);
  for(let pass=0;pass<28;pass++) {
    counts.fill(0);for(let a=0;a<k;a++)mid[a]=(lo[a]+hi[a])*.5;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,a=owner[i];if(visited[i]&&-priority[i]>mid[a])counts[a]+=area[y];}
    for(let a=0;a<k;a++)if(counts[a]>budgets[a])lo[a]=mid[a];else hi[a]=mid[a];
  }
  const scores=new Float32Array(n);for(let i=0;i<n;i++)scores[i]=visited[i]?-priority[i]-mid[owner[i]]:-.15-.6*Math.max(0,1-clearance[i]/Math.max(.00001,buffer[i]*bufferScale));
  // Retain truly small detached islands; they cannot become additional major
  // continents, and the final common sea quantile still balances total area.
  const seen=new Uint8Array(n),queue=new Int32Array(n),maxIslandArea=desired*.012;
  for(let start=0;start<n;start++)if(!seen[start]&&raw[start]>rawSeaLevel&&!boundary[start]&&clearance[start]>buffer[start]*bufferScale) {
    let head=0,tail=1,size=0;queue[0]=start;seen[start]=1;
    while(head<tail){const i=queue[head++];size+=area[Math.floor(i/w)];neighbors8(i,w,h,j=>{if(!seen[j]&&!boundary[j]&&clearance[j]>buffer[j]*bufferScale&&raw[j]>rawSeaLevel){seen[j]=1;queue[tail++]=j;}});}
    if(size<maxIslandArea)for(let j=0;j<tail;j++){const i=queue[j];scores[i]=Math.max(scores[i],raw[i]-rawSeaLevel);}
  }
  return scores;
}

export function labelLandmasses(world) {
  const {width:w,height:h,layers:l}=world,n=w*h,labels=new Int32Array(n),queue=new Int32Array(n),areas=new Float64Array(h),bodies=[];
  let landArea=0;for(let y=0;y<h;y++)areas[y]=rowArea(y,h);
  for(let start=0;start<n;start++)if(l.elevation[start]>0&&!labels[start]) {
    const id=bodies.length+1;let head=0,tail=1,area=0;queue[0]=start;labels[start]=id;
    while(head<tail){const i=queue[head++];area+=areas[Math.floor(i/w)];neighbors8(i,w,h,j=>{if(l.elevation[j]>0&&!labels[j]){labels[j]=id;queue[tail++]=j;}});}
    landArea+=area;bodies.push({id,area,cells:tail});
  }
  const threshold=landArea*.025;for(const b of bodies){b.major=b.area>=threshold;b.landShare=b.area/Math.max(landArea,1e-10);}
  const majorCount=bodies.filter(b=>b.major).length;
  l.landmass=labels;world.meta.continents={majorCount,islandCount:bodies.length-majorCount,target:world.settings.continentCount||0,bodies};
  return world.meta.continents;
}
