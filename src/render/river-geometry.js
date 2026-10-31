import {hashSeed} from '../core/random.js';
import {clamp,wrapX} from '../core/geo.js';
import {fractalNoise} from '../generation/noise.js';

/** Maximal reaches share exact junctions. Curves are constrained to the original
 * cell corridor and basin, so visual meanders cannot connect unrelated rivers.
 * Simulation continues to use the strictly downhill flowTo graph.
 */
export function buildRiverGeometry(world) {
  const {width:w,height:h,layers:l}=world,n=w*h,incoming=new Uint8Array(n),paths=[];
  const seed=hashSeed(world.seed,'river-curves-v1');
  for(let i=0;i<n;i++)if(l.river[i]&&l.flowTo[i]>=0&&l.river[l.flowTo[i]])incoming[l.flowTo[i]]++;
  for(let start=0;start<n;start++) {
    if(!l.river[start]||incoming[start]===1)continue;
    const cells=[start];let i=start;
    for(let steps=0;steps<n;steps++) {
      const j=l.flowTo[i];if(j<0)break;cells.push(j);
      if(!l.river[j]||incoming[j]!==1||l.lake[j]||l.elevation[j]<=0)break;
      i=j;
    }
    if(cells.length<2)continue;
    const centers=[];let previous=start%w+.5;
    for(const cell of cells){let x=cell%w+.5;x+=Math.round((previous-x)/w)*w;centers.push([x,Math.floor(cell/w)+.5]);previous=x;}
    const points=[];
    for(let k=0;k<centers.length-1;k++) {
      const p0=centers[Math.max(0,k-1)],p1=centers[k],p2=centers[k+1],p3=centers[Math.min(centers.length-1,k+2)];
      const dx=p2[0]-p1[0],dy=p2[1]-p1[1],len=Math.hypot(dx,dy)||1;
      for(let s=0;s<4;s++) {
        const t=s/4,t2=t*t,t3=t2*t;
        let x=.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3);
        let y=.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3);
        const fade=Math.min(1,(k+t)/1.2,(centers.length-1-k-t)/1.2);
        const slope=Math.abs(l.elevation[cells[k]]-l.elevation[cells[k+1]]);
        const meander=fractalNoise(x/w,y/h*.5,Math.max(64,Math.round(w/2)),3,seed)*(.6/(1+slope/120))*fade;
        const xx=x-dy/len*meander,yy=y+dx/len*meander;
        const cell=clamp(Math.floor(yy),0,h-1)*w+wrapX(Math.floor(xx),w);
        if(l.elevation[cell]>0&&!l.lake[cell]&&l.basin[cell]===l.basin[start]){x=xx;y=yy;}
        else {x=p1[0]+dx*t;y=p1[1]+dy*t;}
        points.push(x,y);
      }
    }
    points.push(...centers.at(-1));
    // Retain the terminal drainage cell. The renderer clips the last reach to
    // the same refined shoreline used by terrain tiles; cutting against a
    // separate bicubic coast here caused visible gaps at river mouths.
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(let k=0;k<points.length;k+=2){minX=Math.min(minX,points[k]);maxX=Math.max(maxX,points[k]);minY=Math.min(minY,points[k+1]);maxY=Math.max(maxY,points[k+1]);}
    let flow=0;for(const cell of cells)flow=Math.max(flow,l.flow[cell]);
    paths.push({points:Float32Array.from(points),bounds:[minX,minY,maxX,maxY],flow,start,end:cells.at(-1)});
  }
  return paths;
}
