import {clamp,wrapX} from '../core/geo.js';
import {sampleBilinear} from '../core/sampling.js';

function masked(a,elevation,u,v,w,h,land,offset,fallback) {
  const x=wrapX(u*w-.5,w),y=clamp(v*h-.5,0,h-1),xx=Math.floor(x),yy=Math.floor(y),fx=x-xx,fy=y-yy;
  let sum=0,weight=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++) {
    const i=Math.min(h-1,yy+dy)*w+(xx+dx)%w;
    if((elevation[i]>0)!==land)continue;const k=(dx?fx:1-fx)*(dy?fy:1-fy);sum+=a[offset+i]*k;weight+=k;
  }
  return weight>1e-8?sum/weight:fallback;
}
export function sampleLandMoisture(l,u,v,w,h) {
  const t=sampleBilinear(l.annualTemperature,u,v,w,h),p=l.annualPrecipitation?sampleBilinear(l.annualPrecipitation,u,v,w,h):500;
  const fallback=clamp(p/Math.max(300,500+t*38)*.3,0,.8);
  return masked(l.naturalMoisture||l.soilMoisture,l.elevation,u,v,w,h,true,0,fallback);
}
// Vegetation stands can mix across an ecotone even though the climate raster
// keeps categorical IDs. Weighted selection feathers symbol types without
// inventing a second biome simulation or magnifying square cell boundaries.
export function sampleSpriteBiome(l,u,v,w,h,selector) {
  const x=wrapX(u*w-.5,w),y=clamp(v*h-.5,0,h-1),xx=Math.floor(x),yy=Math.floor(y),fx=x-xx,fy=y-yy,candidates=[];let total=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++) {
    const i=Math.min(h-1,yy+dy)*w+(xx+dx)%w;if(l.elevation[i]<=0)continue;
    const weight=(dx?fx:1-fx)*(dy?fy:1-fy);total+=weight;candidates.push([l.biome[i],weight]);
  }
  let chosen=selector*total;for(const [biome,weight]of candidates){chosen-=weight;if(chosen<=0)return biome;}
  return candidates.at(-1)?.[0]??0;
}
export function sampleSeaIce(l,u,v,w,h,month=-1) {
  const a=month<0?l.annualIce:l.seaIce;if(!a)return 0;
  const marine=masked(a,l.elevation,u,v,w,h,false,month<0?0:month*w*h,NaN);
  if(Number.isFinite(marine))return clamp(marine/255,0,1);
  // A refined cove may lie entirely between coarse land samples. Give that
  // sub-grid water the local thermal state instead of an unfrozen blue hole.
  const mean=sampleBilinear(l.annualTemperature,u,v,w,h),warm=l.warmestTemperature?sampleBilinear(l.warmestTemperature,u,v,w,h):mean;
  const t=month<0?mean:mean+Math.max(0,warm-mean)*Math.cos((month-6.5)*Math.PI/6)*(v<.5?1:-1);
  const fallback=warm<-1.8?255:clamp((-1.8-t)/9,0,1)*255;
  return fallback/255;
}
