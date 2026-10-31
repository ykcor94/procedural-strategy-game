import {clamp,wrapX} from '../core/geo.js';
import {naturalSoilMoisture} from './soil.js';

export const bankWidthKm=q=>clamp(1.7+Math.sqrt(Math.max(0,q))*.075,2,26);
export const deltaRadiusKm=q=>clamp(12+Math.sqrt(Math.max(0,q))*.7,16,100);
export const riverWetness=q=>clamp(Math.log2(1+Math.max(0,q)/600)/4,.15,.95);

/** Irrigation is downstream of runoff. It changes surface vegetation, never
 * rainfall, Köppen class or river discharge; coarse fields are area fractions.
 */
export function deriveSurfaceWater(world) {
  const {width:w,height:h,layers:l,settings:s}=world,n=w*h,fertility=s.riverFertility??.65;
  const natural=world.meta.climateSoilVersion>=2?l.soilMoisture.slice():naturalSoilMoisture(world);
  const riparian=new Float32Array(n),alluvium=new Float32Array(n),fraction=new Float32Array(n),surface=natural.slice();
  const northKm=20015/h;
  if(fertility>0)for(let i=0;i<n;i++) {
    if(l.elevation[i]<=0||l.lake[i]||l.flow[i]<800||l.flowTo[i]<0)continue;
    const q=l.flow[i],x=i%w,y=Math.floor(i/w),eastKm=40075/w*Math.max(.1,Math.cos((.5-(y+.5)/h)*Math.PI));
    const width=bankWidthKm(q),wet=riverWetness(q)*fertility,sea=l.elevation[l.flowTo[i]]<=0;
    const delta=sea&&l.elevation[i]<120?deltaRadiusKm(q):0,radius=Math.max(width,delta),ry=Math.min(6,Math.max(1,Math.ceil(radius/northKm))),rx=Math.min(8,Math.max(1,Math.ceil(radius/eastKm)));
    for(let dy=-ry;dy<=ry;dy++)for(let dx=-rx;dx<=rx;dx++) {
      const yy=y+dy;if(yy<0||yy>=h)continue;const j=yy*w+wrapX(x+dx,w);
      if(l.elevation[j]<=0||l.lake[j])continue;
      const d=Math.hypot(dx*eastKm,dy*northKm),same=l.basin[j]===l.basin[i];
      if(same&&l.elevation[j]<l.filledElevation[i]+100) {
        const strength=wet*Math.exp(-d/Math.max(1,width));
        riparian[j]=Math.max(riparian[j],strength);
        fraction[j]=Math.max(fraction[j],clamp(width*2/Math.sqrt(eastKm*northKm),0,1)*Math.exp(-d/Math.max(1,width)));
      }
      if(delta&&l.elevation[j]<80&&d<delta*1.4)alluvium[j]=Math.max(alluvium[j],wet*Math.exp(-d*d/(delta*delta*.8)));
    }
  }
  for(let i=0;i<n;i++)if(l.elevation[i]>0)surface[i]=clamp(natural[i]+(1-natural[i])*(riparian[i]*fraction[i]+alluvium[i]*.75),0,1);
  Object.assign(l,{naturalMoisture:natural,riparianMoisture:riparian,alluvium,floodplainFraction:fraction,surfaceMoisture:surface});
  world.meta.surfaceModelVersion=1;
}
