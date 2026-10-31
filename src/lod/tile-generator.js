import {TILE_SIZE,tileBounds,affectsDetailTile} from './quadtree.js';
import {editBounds} from './detail-edits.js';
import {clamp,lerp,wrapX} from '../core/geo.js';
import {physicalColor,elevationColor,biomeColor} from '../render/modes.js';
import {sampleSpriteBiome,sampleSeaIce} from '../render/surface-sampling.js';
import {generateSpritePlane,spriteHash} from '../render/biome-sprites.js';
import {createSurfaceSampler} from './surface-sampler.js';
import {reliefTone} from '../render/relief.js';

const surfaces=new WeakMap();

// A one-pixel halo supplies identical cross-tile normals. No tile-local seeds,
// random origins, edge clamps or local normalization are permitted here.
export function generateElevationTile(source,sampler,tile,options={}) {
  const size=options.size||TILE_SIZE,stride=size+2,b=tileBounds(tile),height=new Float32Array(stride*stride);
  const edits=(source.detail.edits||[]).filter(edit=>affectsDetailTile(tile,editBounds(edit)));
  const sampleOptions={valleys:options.valleys,edits,samplingResolution:size/b.du,noiseContext:sampler.prepareTile?.(b,size)};
  for(let y=-1;y<=size;y++)for(let x=-1;x<=size;x++)height[(y+1)*stride+x+1]=sampler(b.u+(x+.5)/size*b.du,b.v+(y+.5)/size*b.dv,sampleOptions);
  return {height,stride,size,bounds:b,edits};
}
export function generateVisualTile(source,sampler,tile,options={}) {
  const geo=options.geometry||generateElevationTile(source,sampler,tile,options),{height,stride,size,bounds:b}=geo,{width:w,height:h,layers:l}=source;
  const pixels=new Uint8ClampedArray(size*size*4),landMask=new Uint8Array(size*size),coasts=[];
  const shadePixels=geo.shadePixels||new Uint8ClampedArray(size*size*4),buildShade=!geo.shadePixels;
  if(!surfaces.has(source))surfaces.set(source,createSurfaceSampler(source));
  const surface=surfaces.get(source),out={},month=options.ice?(options.month??-1):-2;
  let vegetation=false;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=b.u+(x+.5)/size*b.du,v=b.v+(y+.5)/size*b.dv,i=(y+1)*stride+x+1,e=height[i];
    const vertical=(e>0)!==(height[i+1]>0),horizontal=(e>0)!==(height[i+stride]>0);
    if(e<=0){
      const coverage=options.ice?sampleSeaIce(l,u,v,w,h,month):0,color=elevationColor(e),j=(y*size+x)*4;
      pixels[j]=lerp(color[0],228,coverage);pixels[j+1]=lerp(color[1],235,coverage);pixels[j+2]=lerp(color[2],235,coverage);pixels[j+3]=255;
      const alpha=.3*(1-coverage*.98);if(vertical)coasts.push(x+1,y,x+1,y+1,alpha);if(horizontal)coasts.push(x,y+1,x+1,y+1,alpha);continue;
    }
    const {temp,moisture,biome,lake,warmest,ice:coverage,macro}=surface(u,v,e,vertical||horizontal?month:-2,out);
    if(!lake&&e>2&&e<3800&&warmest>1)vegetation=true;
    landMask[y*size+x]=e>0&&!lake?255:0;
    let color=options.mode==='elevation'?elevationColor(e):options.mode==='biome'?biomeColor(e,biome):physicalColor(e,moisture,temp,biome,warmest);
    if(lake&&options.mode!=='elevation')color=[49,115,137];
    if(buildShade&&e>0&&!lake) {
      const step=b.du/size*40075; // km, same horizontal/vertical angular pixel step
      const dx=(height[i+1]-height[i-1])/Math.max(.3,step*2),dy=(height[i+stride]-height[i-stride])/Math.max(.3,step*2);
      const shade=reliefTone(macro,clamp((-dx*.65-dy*.65)/180,-.38,.23)),j=(y*size+x)*4;
      shadePixels[j]=shadePixels[j+1]=shadePixels[j+2]=shade>0?255:0;shadePixels[j+3]=Math.abs(shade)*255;
    }
    const snow=options.mode==='elevation'?0:clamp((2-warmest)/5,0,1);
    if(!lake) {
      const alpha=.3*(1-Math.max(coverage,snow)*.98);
      if(vertical)coasts.push(x+1,y,x+1,y+1,alpha);
      if(horizontal)coasts.push(x,y+1,x+1,y+1,alpha);
    }
    const j=(y*size+x)*4;pixels[j]=color[0];pixels[j+1]=color[1];pixels[j+2]=color[2];pixels[j+3]=255;
  }
  geo.shadePixels=shadePixels;
  let spritePixels=null;
  if(vegetation&&options.includeSprites!==false&&['physical','biome'].includes(options.mode)) {
    if(!Object.hasOwn(geo,'spritePixels'))geo.spritePixels=generateSpritePlane(source,tile,b,size,(u,v)=>{
      const s=surface(u,v,sampler(u,v,{valleys:options.valleys,edits:geo.edits}),-2);
      s.biome=sampleSpriteBiome(l,u,v,w,h,spriteHash(wrapX(Math.floor(u*8192),8192),Math.floor(v*4096),17));return s;
    });spritePixels=geo.spritePixels;
  }
  return {pixels,landMask,shadePixels,coastLines:Float32Array.from(coasts),spritePixels,size};
}
