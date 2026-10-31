import {sampleBilinear} from '../core/sampling.js';
import {clamp,wrapX} from '../core/geo.js';
import {periodicNoise} from './noise.js';

/** Height magnitudes cannot determine interpolated coastlines: one 20m-deep
 * channel between 1000m coastal ranges would disappear when upsampled. A
 * signed distance contour retains it, while same-surface interpolation and
 * a smooth coastal taper keep the resulting elevations continuous.
 */
export function resampleCoastalTerrain(elevation,distance,sw,sh,w,h,coverage,thresholdFor,seed) {
  const signed=Float32Array.from(elevation,(e,i)=>(e>0?1:-1)*(distance[i]+.5)),contour=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const u=(x+.5)/w,v=(y+.5)/h,i=y*w+x;contour[i]=sampleBilinear(signed,u,v,sw,sh)+periodicNoise(u,v*.5,83,seed)*.005;}
  const threshold=thresholdFor(contour,w,h,coverage),result=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x,u=(x+.5)/w,v=(y+.5)/h,xx=wrapX(u*sw-.5,sw),yy=clamp(v*sh-.5,0,sh-1),ix=Math.floor(xx),iy=Math.floor(yy),fx=xx-ix,fy=yy-iy,land=contour[i]>threshold;
    let sum=0,total=0;
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const j=Math.min(sh-1,iy+dy)*sw+(ix+dx)%sw;if((elevation[j]>0)!==land)continue;const weight=(dx?fx:1-fx)*(dy?fy:1-fy);sum+=Math.abs(elevation[j])*weight;total+=weight;}
    const magnitude=total>1e-9?sum/total:land?.25:12,t=clamp(Math.abs(contour[i]-threshold)*2,0,1),shore=t*t*(3-2*t);
    result[i]=(land?1:-1)*Math.max(.000001,magnitude*shore);
  }
  return {elevation:result,threshold};
}
