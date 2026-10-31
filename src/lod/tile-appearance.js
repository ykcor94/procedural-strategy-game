import {reliefOpacity} from '../render/relief.js';

const surface=size=>{
  if(typeof OffscreenCanvas==='function')return new OffscreenCanvas(size,size);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;return canvas;
};

/** Blend complete appearances during LOD transitions. Fading albedo and its
 * transparent lighting plane separately temporarily removes or doubles relief.
 * One reusable surface per tile also makes normal/bold lighting toggles cheap. */
export function tileAppearance(item,options,createSurface=surface){
  if(!options.shading||options.mode==='biome'||!item.shade)return item.bitmap;
  const key=options.boldRelief?'bold':'normal';
  if(item.appearance?.key===key)return item.appearance.canvas;
  const canvas=item.appearance?.canvas||createSurface(item.size),ctx=canvas.getContext('2d');
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,item.size,item.size);ctx.drawImage(item.bitmap,0,0);
  ctx.globalAlpha=reliefOpacity(options.boldRelief);ctx.drawImage(item.shade,0,0);ctx.globalAlpha=1;
  item.appearance={key,canvas};return canvas;
}
