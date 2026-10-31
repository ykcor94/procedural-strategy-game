import test from 'node:test';
import assert from 'node:assert/strict';
import {TileManager} from '../src/lod/tile-manager.js';
import {tileAppearance} from '../src/lod/tile-appearance.js';

// A single-pixel premultiplied canvas exercises real source-over/additive alpha
// math without requiring a DOM or mirroring the terrain generation algorithm.
class PixelCanvas{
  constructor(width=1,height=1){this.width=width;this.height=height;this.pixel=[0,0,0,0];this.context=new PixelContext(this);}
  getContext(){return this.context;}
}
class PixelContext{
  constructor(canvas){this.canvas=canvas;this.globalAlpha=1;this.globalCompositeOperation='source-over';this.stack=[];}
  save(){this.stack.push([this.globalAlpha,this.globalCompositeOperation]);}
  restore(){[this.globalAlpha,this.globalCompositeOperation]=this.stack.pop();}
  clearRect(){this.canvas.pixel=[0,0,0,0];}
  fillRect(){this.drawImage({pixel:[0,0,0,1]});}
  drawImage(source){const s=source.pixel,d=this.canvas.pixel,sa=s[3]*this.globalAlpha,da=d[3],op=this.globalCompositeOperation;if(op==='destination-out'){this.canvas.pixel=[d[0],d[1],d[2],da*(1-sa)];return;}const a=op==='lighter'?Math.min(1,sa+da):sa+da*(1-sa),color=[0,1,2].map(k=>a?(s[k]*sa+d[k]*da*(op==='lighter'?1:1-sa))/a:0);this.canvas.pixel=[...color,a];}
}
const image=(r,g,b,a=1)=>({pixel:[r,g,b,a]}),item=(tile,variant,shade)=>({tile,variant,size:1,bytes:16,bitmap:image(180,180,180),shade:image(shade,shade,shade,.5),mask:image(255,255,255),sprites:image(120,80,40,.5),loadedAt:-1000});
const withCanvas=fn=>{const original=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=PixelCanvas;try{return fn();}finally{if(original===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=original;}};

test('new tile lighting remains invariant throughout refinement for dark and light relief',()=>withCanvas(()=>{
  for(const shade of [0,255])for(const boldRelief of [false,true]){
    const options={mode:'physical',shading:true,boldRelief},manager=new TileManager(()=>{}),variant=manager.variant(options),parent={level:0,x:0,y:0},child={level:1,x:0,y:0},a=item(parent,variant,shade),b=item(child,variant,shade);manager.cache.set(manager.key(parent,variant),a);manager.cache.set(manager.key(child,variant),b);const expected=tileAppearance(a,options).pixel;
    for(const time of [0,30,60,90,120,150,180]){b.loadedAt=0;manager.beginFrame(time);const canvas=new PixelCanvas();canvas.pixel=[...expected];manager.draw(canvas.getContext(),[child],options,4,2);assert.ok(canvas.pixel.every((v,k)=>Math.abs(v-expected[k])<1e-7),`${shade}/${boldRelief}/${time}: no lighting square may appear`);}
  }
}));
test('retained finer tiles blend their complete lit appearance without doubling relief',()=>withCanvas(()=>{
  const manager=new TileManager(()=>{}),options={mode:'physical',shading:true},variant=manager.variant(options),coarse={level:1,x:0,y:0},fine={level:2,x:0,y:0},a=item(coarse,variant,0),b=item(fine,variant,0);manager.cache.set(manager.key(coarse,variant),a);manager.cache.set(manager.key(fine,variant),b);manager.levelTransition={from:2,to:1,started:0};const expected=tileAppearance(a,options).pixel;
  for(const time of [0,40,110,180,220]){manager.beginFrame(time);const canvas=new PixelCanvas();canvas.pixel=[...expected];manager.draw(canvas.getContext(),[coarse],options,4,2);assert.ok(canvas.pixel.every((v,k)=>Math.abs(v-expected[k])<1e-7));}
}));
test('a land-to-land mask transition remains fully opaque at every fade fraction',()=>{
  const options={mode:'physical'},manager=new TileManager(()=>{}),variant=manager.variant(options),parent={level:0,x:0,y:0},child={level:1,x:0,y:0};manager.cache.set(manager.key(parent,variant),item(parent,variant,0));const b=item(child,variant,0);b.loadedAt=0;manager.cache.set(manager.key(child,variant),b);
  for(const time of [0,30,90,150,180]){manager.beginFrame(time);const canvas=new PixelCanvas();manager.draw(canvas.getContext(),[child],options,4,2,'mask');assert.ok(Math.abs(canvas.pixel[3]-1)<1e-7,`mask opacity at ${time}ms`);}
});
test('transparent sprite crossfades preserve alpha instead of accumulating or thinning symbols',()=>{
  const options={mode:'physical'},manager=new TileManager(()=>{}),variant=manager.variant(options),parent={level:0,x:0,y:0},child={level:1,x:0,y:0};manager.cache.set(manager.key(parent,variant),item(parent,variant,0));const b=item(child,variant,0);b.loadedAt=0;manager.cache.set(manager.key(child,variant),b);
  for(const time of [0,45,90,135,180]){manager.beginFrame(time);const canvas=new PixelCanvas(),ctx=canvas.getContext();ctx.globalAlpha=.4;manager.draw(ctx,[child],options,4,2,'sprites');assert.ok(Math.abs(canvas.pixel[3]-.2)<1e-7,`sprite alpha at ${time}ms`);assert.equal(ctx.globalAlpha,.4);assert.equal(ctx.globalCompositeOperation,'source-over');}
});
test('lighting toggles reuse one composed surface and leave raw tile planes unchanged',()=>withCanvas(()=>{
  const a=item({level:1,x:0,y:0},'test',0),raw=[...a.bitmap.pixel],normal=tileAppearance(a,{mode:'physical',shading:true}),same=tileAppearance(a,{mode:'physical',shading:true}),bold=tileAppearance(a,{mode:'physical',shading:true,boldRelief:true});assert.equal(normal,same);assert.equal(normal,bold);assert.deepEqual(a.bitmap.pixel,raw);assert.equal(tileAppearance(a,{mode:'biome',shading:true}),a.bitmap);
}));
