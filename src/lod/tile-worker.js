import {createTerrainSampler} from './terrain-sampler.js';
import {generateVisualTile,generateElevationTile} from './tile-generator.js';
import {TileCache} from './cache.js';
import {tileKey,affectsDetailTile} from './quadtree.js';
let source,sampler,generation;const geometryCache=new TileCache(16*1024*1024);
function bitmap(pixels,size){const canvas=new OffscreenCanvas(size,size);canvas.getContext('2d').putImageData(new ImageData(pixels,size,size),0,0);return canvas.transferToImageBitmap();}
self.onmessage=({data})=>{
  try {
    if(data.type==='init'){source=data.source;generation=data.generation;geometryCache.clear();sampler=createTerrainSampler(source);self.postMessage({type:'ready',generation});}
    else if(data.type==='edits'){source.detail=data.detail;for(const [key,item]of geometryCache.entries)if(!data.bounds||affectsDetailTile(item.tile,data.bounds))geometryCache.delete(key);}
    else if(data.type==='tile'&&data.generation===generation){
      const start=performance.now(),key=`${tileKey(data.tile)}/${data.options.size||256}/${!!data.options.valleys}`,cached=geometryCache.get(key),geometry=cached?.geometry||generateElevationTile(source,sampler,data.tile,data.options);
      const result=generateVisualTile(source,sampler,data.tile,{...data.options,geometry});
      geometryCache.set(key,{geometry,tile:data.tile,bytes:geometry.height.byteLength+(geometry.shadePixels?.byteLength||0)+(geometry.spritePixels?.byteLength||0)});
      const metrics={geometryHit:!!cached,computeMs:performance.now()-start};
      if(typeof OffscreenCanvas==='function') {
        const mask=new Uint8ClampedArray(result.size**2*4);for(let i=0;i<result.landMask.length;i++){mask[i*4]=mask[i*4+1]=mask[i*4+2]=255;mask[i*4+3]=result.landMask[i];}
        const images={bitmap:bitmap(result.pixels,result.size),mask:bitmap(mask,result.size),shade:bitmap(result.shadePixels,result.size),sprites:result.spritePixels?bitmap(result.spritePixels,result.size):null};
        self.postMessage({type:'tile',...data,metrics,result:{images,size:result.size,coastLines:result.coastLines}},[...Object.values(images).filter(Boolean),result.coastLines.buffer]);
      }else {
        result.shadePixels=result.shadePixels.slice();if(result.spritePixels)result.spritePixels=result.spritePixels.slice();
        self.postMessage({type:'tile',...data,metrics,result},[result.pixels.buffer,result.landMask.buffer,result.shadePixels.buffer,result.coastLines.buffer,...(result.spritePixels?[result.spritePixels.buffer]:[])]);
      }
    }
  }catch(error){self.postMessage({type:'error',message:error.message,generation,key:data.key});}
};
