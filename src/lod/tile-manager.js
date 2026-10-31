import {TileCache} from './cache.js';
import {createTileSource} from './terrain-sampler.js';
import {parentTile,tileKey,tileBounds,affectsDetailTile,TILE_SIZE} from './quadtree.js';
import {tileAppearance} from './tile-appearance.js';

const FADE_MS=200;
/** Device-pixel aligned rectangle under the current axis-aligned transform. */
export function snapRect(ctx,x0,y0,x1,y1){
  const t=ctx.getTransform?.();if(!t||t.b||t.c||!t.a||!t.d)return {x:x0,y:y0,w:x1-x0,h:y1-y0};
  const X0=Math.round(t.a*x0+t.e),X1=Math.round(t.a*x1+t.e),Y0=Math.round(t.d*y0+t.f),Y1=Math.round(t.d*y1+t.f);
  return {x:(X0-t.e)/t.a,y:(Y0-t.f)/t.d,w:(X1-X0)/t.a,h:(Y1-Y0)/t.d};
}

export class TileManager {
  constructor(onChange,{memoryMiB=(typeof navigator!=='undefined'&&navigator.deviceMemory>=8?128:80),workerCount=(typeof navigator!=='undefined'&&navigator.hardwareConcurrency>=8?3:2)}={}) {
    this.cache=new TileCache(memoryMiB*1024*1024);this.onChange=onChange;this.workerCount=workerCount;
    this.generation=0;this.editRevision=0;this.workers=[];this.queue=[];this.inflight=new Map();this.invalidations=[];this.failed=false;
  }
  setWorld(world) {
    this.dispose();this.failed=false;this.generation++;this.editRevision=0;this.invalidations=[];
    this.source=createTileSource(world);
    this.completed=0;this.geometryHits=0;this.computeMs=0;this.visibleSignature='';
    for(let i=0;i<this.workerCount;i++) {
      const worker=new Worker(new URL('./tile-worker.js',import.meta.url),{type:'module'}),slot={worker,ready:false,busy:false};this.workers.push(slot);
      worker.onmessage=({data})=>{
        if(data.generation!==this.generation){for(const image of Object.values(data.result?.images||{}))image?.close?.();return;}
        if(data.type==='ready'){slot.ready=true;this.dispatch();}
        else if(data.type==='tile') {
          slot.busy=false;this.inflight.delete(data.key);
          const obsolete=this.invalidations.some(change=>change.revision>data.editRevision&&affectsDetailTile(data.tile,change.bounds));
          if(!obsolete) {
            const {size,pixels,landMask,spritePixels,shadePixels,images,coastLines}=data.result;
            const make=p=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=size;canvas.getContext('2d').putImageData(new ImageData(p,size,size),0,0);return canvas;};
            let planes=images;
            if(!planes){const maskPixels=new Uint8ClampedArray(size*size*4);for(let i=0;i<landMask.length;i++){maskPixels[i*4]=maskPixels[i*4+1]=maskPixels[i*4+2]=255;maskPixels[i*4+3]=landMask[i];}planes={bitmap:make(pixels),mask:make(maskPixels),shade:make(shadePixels),sprites:spritePixels?make(spritePixels):null};}
            const paths=new Map();for(let i=0;i<coastLines.length;i+=5){const alpha=Math.round(coastLines[i+4]*32)/32;if(!paths.has(alpha))paths.set(alpha,new Path2D());const p=paths.get(alpha);p.moveTo(coastLines[i],coastLines[i+1]);p.lineTo(coastLines[i+2],coastLines[i+3]);}
            // Reserve the lazily composed lit surface in the cache budget.
            this.cache.set(data.key,{...planes,paths,size,preview:data.preview,bytes:size**2*(planes.sprites?20:16)+coastLines.byteLength*2,tile:data.tile,variant:data.variant,loadedAt:performance.now()});
            this.completed++;this.geometryHits+=data.metrics?.geometryHit?1:0;this.computeMs+=data.metrics?.computeMs||0;
          }else if(data.result.images)for(const image of Object.values(data.result.images))image?.close?.();
          this.pruneInvalidations();this.dispatch();this.onChange();
        } else if(data.type==='error')this.error(data.message);
      };
      worker.onerror=event=>this.error(event.message||'Terrain detail worker failed.');
      worker.postMessage({type:'init',generation:this.generation,source:this.source});
    }
  }
  error(message) {
    if(this.failed)return;this.dispose();this.failed=true;
    window.dispatchEvent(new CustomEvent('atlas-render-error',{detail:message}));this.onChange();
  }
  variant(options){return [options.mode,options.ice?options.month:-1,options.valleys?1:0,options.ice?1:0].join(':');}
  key(tile,variant,preview=false){return `${variant}/${tileKey(tile)}${preview?'/preview':''}`;}
  request(tiles,options) {
    if(this.failed||!this.workers.length)return;
    const variant=this.variant(options),wanted=new Map(),pins=new Set(tiles.map(tile=>this.key(tile,variant)));
    const level=tiles[0]?.level??0;if(this.visibleLevel!==level||this.visibleVariant!==variant){this.levelTransition={from:this.visibleVariant===variant?this.visibleLevel:level,to:level,started:performance.now()};this.visibleLevel=level;this.visibleVariant=variant;}
    // Keep visible exact tiles, cached parents and previously visible finer
    // children alive while the viewport crosses an LOD threshold. Offscreen
    // worker completions must not evict the scene the player is looking at.
    for(const [key,item]of this.cache.entries)if(item.variant===variant&&tiles.some(tile=>this.overlaps(item.tile,tile)))pins.add(key);
    this.cache.pin(pins);
    const cols=2**((tiles[0]?.level||0)+1),cx=tiles.reduce((sum,t)=>sum+t.x+(t.copy||0)*cols,0)/(tiles.length||1),cy=tiles.reduce((sum,t)=>sum+t.y,0)/(tiles.length||1);
    for(const tile of tiles) {
      const key=this.key(tile,variant);if(this.cache.entries.has(key))continue;
      const priority=(tile.x+(tile.copy||0)*cols-cx)**2+(tile.y-cy)**2;
      if(!this.inflight.has(key))wanted.set(key,{key,tile,options:{...options,size:TILE_SIZE},variant,priority,preview:false});
      const parent=parentTile(tile);
      if(parent&&!this.cache.entries.has(this.key(parent,variant))){const key=this.key(parent,variant,true);if(!this.cache.entries.has(key)&&!this.inflight.has(key))wanted.set(key,{key,tile:parent,options:{...options,size:96,includeSprites:false},variant,priority,preview:true});}
    }
    this.queue=[...wanted.values()].sort((a,b)=>Number(b.preview)-Number(a.preview)||a.priority-b.priority);
    this.dispatch();
  }
  overlaps(a,b){if(!a||!b)return false;const level=Math.min(a.level,b.level),ar=2**(a.level-level),br=2**(b.level-level);return Math.floor(a.x/ar)===Math.floor(b.x/br)&&Math.floor(a.y/ar)===Math.floor(b.y/br);}
  dispatch() {
    for(const slot of this.workers)if(slot.ready&&!slot.busy&&this.queue.length) {
      const task=this.queue.shift();if(this.cache.entries.has(task.key)||this.inflight.has(task.key))continue;
      slot.busy=true;task.editRevision=this.editRevision;this.inflight.set(task.key,task);
      slot.worker.postMessage({type:'tile',generation:this.generation,editRevision:this.editRevision,...task});
    }
  }
  beginFrame(now=performance.now()){this.frameTime=now;}
  cachedTile(tile,variant){let candidate=tile;while(candidate){const item=this.cache.get(this.key(candidate,variant))||this.cache.get(this.key(candidate,variant,true));if(item)return {candidate,item};candidate=parentTile(candidate);}return null;}
  drawRegion(ctx,tile,item,options,w,h,plane,opacity=1){
    const ratio=2**(tile.level-item.tile.level),cols=2**(tile.level+1),rows=2**tile.level,copy=tile.copy||0,sx=(tile.x%ratio)/ratio*item.size,sy=(tile.y%ratio)/ratio*item.size,alpha=ctx.globalAlpha,image=plane==='bitmap'?tileAppearance(item,options):item[plane];
    // Edges snap to device pixels from the same lattice formula on both sides
    // of a seam. Fractional edges antialias into a partial-alpha grid in the
    // land mask, which clipping and coast detection then reveal as flashing
    // lines whenever the zoom crosses an LOD level.
    const {x:dx,y:dy,w:dw,h:dh}=snapRect(ctx,(tile.x/cols+copy)*w,tile.y/rows*h,((tile.x+1)/cols+copy)*w,(tile.y+1)/rows*h);
    // Transparent planes need replacement, not source-over accumulation. This
    // is a premultiplied crossfade, including pixels which become water/empty.
    if(plane==='mask'||plane==='sprites'){
      if(opacity===1)ctx.clearRect(dx,dy,dw,dh);
      else if(opacity>0){ctx.save();ctx.globalCompositeOperation='destination-out';ctx.globalAlpha=opacity;ctx.fillRect(dx,dy,dw,dh);ctx.restore();}
    }
    if(!image||opacity<=0)return;
    const operation=ctx.globalCompositeOperation;
    if((plane==='mask'||plane==='sprites')&&opacity<1)ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=alpha*opacity;ctx.drawImage(image,sx,sy,item.size/ratio,item.size/ratio,dx,dy,dw,dh);ctx.globalAlpha=alpha;ctx.globalCompositeOperation=operation;
    if(plane==='bitmap'&&options.coasts&&item.paths?.size){const cb=tileBounds(item.tile);ctx.save();ctx.globalAlpha*=opacity;ctx.beginPath();ctx.rect(dx,dy,dw,dh);ctx.clip();ctx.translate((cb.u+(tile.copy||0))*w,cb.v*h);ctx.scale(cb.du*w/item.size,cb.dv*h/item.size);ctx.lineWidth=.75;for(const [a,path]of item.paths){ctx.strokeStyle=`rgba(60,65,57,${a})`;ctx.stroke(path);}ctx.restore();}
  }
  draw(ctx,tiles,options,w,h,plane='bitmap') {
    const variant=this.variant(options),now=this.frameTime??performance.now();let ready=0,transitioning=false;
    for(const tile of tiles){
      const found=this.cachedTile(tile,variant);if(!found)continue;const {candidate,item}=found;
      if(candidate.level===tile.level&&!item.preview)ready++;
      const fraction=Math.min(1,Math.max(0,(now-(item.loadedAt??now-FADE_MS))/FADE_MS)),fade=fraction*fraction*(3-2*fraction);
      if(fade<1){const fallback=this.cachedTile(parentTile(candidate),variant);if(fallback)this.drawRegion(ctx,tile,fallback.item,options,w,h,plane);transitioning=true;}
      this.drawRegion(ctx,tile,item,options,w,h,plane,fade);
    }
    // Already visible children remain available while a coarser level streams.
    // Their complete lit appearances fade once over the coarser appearance.
    const level=tiles[0]?.level??0,drawn=new Set();
    for(const item of [...this.cache.entries.values()].filter(item=>item.variant===variant&&!item.preview&&item.tile.level>level).sort((a,b)=>a.tile.level-b.tile.level))for(const tile of tiles){
      if(!this.overlaps(item.tile,tile))continue;const coarse=this.cache.entries.get(this.key(tile,variant)),transition=this.levelTransition,progress=transition?.from>level?Math.min(1,(now-transition.started)/FADE_MS):1,fade=coarse?1-progress*progress*(3-2*progress):1;if(fade<=0)continue;if(fade<1)transitioning=true;
      const copy=tile.copy||0,key=`${item.tile.level}/${item.tile.x}/${item.tile.y}/${copy}`;if(drawn.has(key))continue;drawn.add(key);this.drawRegion(ctx,{...item.tile,copy},item,options,w,h,plane,fade);
    }
    if(transitioning)this.onChange();return ready;
  }
  updateEdits(detail,bounds) {
    if(!this.source)return;this.source.detail=structuredClone(detail);this.editRevision++;
    this.invalidations.push({revision:this.editRevision,bounds});
    for(const [key,item]of this.cache.entries)if(affectsDetailTile(item.tile,bounds))this.cache.delete(key);
    this.queue=[];this.pruneInvalidations();
    for(const slot of this.workers)slot.worker.postMessage({type:'edits',detail:this.source.detail,bounds});
    this.onChange();
  }
  pruneInvalidations(){let oldest=this.editRevision;for(const task of this.inflight.values())oldest=Math.min(oldest,task.editRevision);this.invalidations=this.invalidations.filter(change=>change.revision>oldest);}
  get stats(){return {tiles:this.cache.entries.size,bytes:this.cache.bytes,queued:this.queue.length,working:this.inflight.size,generation:this.generation,completed:this.completed||0,geometryHits:this.geometryHits||0,meanTileMs:this.completed?this.computeMs/this.completed:0};}
  dispose(){for(const slot of this.workers)slot.worker.terminate();this.workers=[];this.inflight.clear();this.queue=[];this.cache.clear();this.visibleLevel=null;this.visibleVariant=null;this.levelTransition=null;}
}
