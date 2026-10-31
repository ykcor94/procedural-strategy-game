import {clamp,wrapX} from '../core/geo.js';

const fields=new WeakMap();
export function invalidateRelief(world){fields.delete(world);}
export function reliefField(world) {
  const cached=fields.get(world);
  if(cached&&cached.elevation===world.layers.elevation&&cached.lake===world.layers.lake&&cached.width===world.width&&cached.height===world.height)return cached.field;
  const {width:w,height:h,layers:l}=world,out=new Float32Array(w*h),e=l.elevation;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x;if(e[i]<=0||l.lake?.[i])continue;
    const dx=(e[y*w+wrapX(x+1,w)]-e[y*w+wrapX(x-1,w)])*w/640;
    const dy=(e[Math.min(h-1,y+1)*w+x]-e[Math.max(0,y-1)*w+x])*h/320;
    out[i]=clamp((-dx*.7-dy*.7)/2200,-.48,.35);
  }
  fields.set(world,{field:out,elevation:e,lake:l.lake,width:w,height:h});return out;
}
// One signed lighting model for the global atlas and refined tiles. The stored
// plane encodes the bold setting; normal relief uses lower compositing alpha.
export function reliefTone(macro,micro=0){return clamp(macro*1.65+micro*.55,-.72,.48);}
export const reliefOpacity=bold=>bold?1:1/1.65;
