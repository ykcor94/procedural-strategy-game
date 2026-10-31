import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldRenderer} from '../src/render/world-renderer.js';
import {cityVisibility,civilizationColor,civilizationSampleIndices,visibleTradeRoutes,tradeRouteSegments,provinceMetricValue,provinceMetricText,drawCivilizationTerritories} from '../src/render/civilization-renderer.js';
import {TileCache} from '../src/lod/cache.js';
import {TileManager} from '../src/lod/tile-manager.js';

test('terrain reveal interpolates zoom and setting changes over time and settles exactly',()=>{
  let redraws=0;const view={overlays:{terrainReveal:true},draw(){redraws++;}},reveal=(enabled,zoom,time)=>WorldRenderer.prototype.updateTerrainReveal.call(view,enabled,zoom,time);
  assert.equal(reveal(false,4,0),0);assert.equal(reveal(true,4,10),0);assert.ok(reveal(true,4,110)>.45&&view.terrainRevealAmount<.55);assert.equal(reveal(true,4,220),1);
  view.overlays.terrainReveal=false;assert.equal(reveal(true,4,230),1);assert.ok(reveal(true,4,330)>.45&&view.terrainRevealAmount<.55);assert.equal(reveal(true,4,440),0);assert.ok(redraws>=4);
});
test('national economic colors are uniform inside each nation and compare total output',()=>{
  const world={width:4,height:2,seed:'economy',layers:{elevation:new Float32Array(8).fill(50),ownership:Uint16Array.of(1,1,2,2,1,1,2,2)},meta:{civilization:{revision:1,nations:[{id:1,economicOutput:1e10},{id:2,economicOutput:1e13}],cultures:[],families:[],cities:[]}}};
  assert.deepEqual(civilizationColor('economy-nations',world.layers,0,world),civilizationColor('economy-nations',world.layers,5,world));assert.notDeepEqual(civilizationColor('economy-nations',world.layers,0,world),civilizationColor('economy-nations',world.layers,2,world));
});
test('religion colors support the sparse no-religion identifier without index remapping',()=>{
  const world={width:2,height:1,seed:'secular-map',layers:{elevation:Float32Array.of(100,100),religion:Uint16Array.of(65534,2)},meta:{civilization:{revision:1,nations:[],cultures:[],families:[],cities:[],religions:[{id:65534,name:'No Religion',secular:true,color:'#8b949e'},{id:2,name:'River tradition',color:'#aabbcc'}]}}};assert.deepEqual(civilizationColor('religion',world.layers,0,world),[139,148,158]);assert.deepEqual(civilizationColor('religion',world.layers,1,world),[170,187,204]);
});
test('refined island attribution reaches remote ocean cells and wraps longitude',()=>{
  const width=16,height=8,elevation=new Float32Array(width*height).fill(-100);elevation[4*width]=50;const world={width,height,layers:{elevation,lake:new Uint8Array(width*height)}};
  const indices=civilizationSampleIndices(world);assert.equal(indices[4*width+15],4*width);assert.equal(indices[width+8],4*width);assert.ok(indices.every(i=>i>=0));assert.equal(elevation[width+8],-100);
});
test('trade visibility reserves meaningful inland and river connections',()=>{
  const routes=Array.from({length:40},(_,id)=>({id,kind:'maritime',volume:10000-id,points:[0,0,1,1]}));routes.push({id:41,kind:'overland',volume:10,points:[0,0,1,1]},{id:42,kind:'river',volume:1,points:[0,0,1,1]});const visible=visibleTradeRoutes(routes,12);assert.equal(visible.length,12);assert.ok(visible.some(r=>r.kind==='river'));assert.ok(visible.some(r=>r.kind==='overland'));
});
test('a mixed maritime journey shows distinct sea, inland and river legs',()=>{
  const width=12,height=4,elevation=new Float32Array(width*height).fill(100),river=new Uint8Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<4;x++)elevation[y*width+x]=-100;river[2*width+7]=river[2*width+8]=1;const world={width,height,layers:{elevation,river}},route={kind:'maritime',points:[.5,2.5,10.5,2.5]},segments=tradeRouteSegments(world,route);assert.ok(segments.some(s=>s.kind==='maritime'));assert.ok(segments.some(s=>s.kind==='overland'));assert.ok(segments.some(s=>s.kind==='river'));for(let k=1;k<segments.length;k++)assert.deepEqual(segments[k-1].points.slice(-2),segments[k].points.slice(0,2));
});
test('province atlas numeric values have useful compact units',()=>{
  const p={population:1200000,area:2000,urbanization:.64,technology:.72,tradeAccess:.82};assert.equal(provinceMetricValue(p,'density'),600);assert.equal(provinceMetricText(provinceMetricValue(p,'urbanization'),'urbanization'),'64%');assert.equal(provinceMetricText(provinceMetricValue(p,'population'),'population'),'1.2M');assert.equal(provinceMetricText(provinceMetricValue(p,'density'),'density'),'600/km²');
});
test('pinned visible terrain survives unrelated arrivals within a bounded cache allowance',()=>{
  const cache=new TileCache(30),closed=[];cache.set('visible',{bytes:16,bitmap:{close(){closed.push('visible');}}});cache.pin(['visible']);cache.set('offscreen',{bytes:16,bitmap:{close(){closed.push('offscreen');}}});assert.ok(cache.get('visible'));assert.equal(cache.get('offscreen'),null);assert.deepEqual(closed,['offscreen']);cache.pin([]);cache.set('next',{bytes:16});assert.equal(cache.get('visible'),null);
});
test('zooming out draws already cached finer tiles without generating them again',()=>{
  const manager=new TileManager(()=>{}),options={mode:'physical',ice:false,valleys:false},variant=manager.variant(options),coarse={level:1,x:0,y:0},fine={level:2,x:1,y:0},image={name:'fine'},calls=[];
  manager.cache.set(manager.key(fine,variant),{bytes:16,tile:fine,variant,size:256,bitmap:image,loadedAt:0});const ctx={globalAlpha:1,drawImage(...args){calls.push(args);},clearRect(){}};manager.draw(ctx,[coarse],options,128,64);assert.ok(calls.some(args=>args[0]===image));assert.equal(manager.cache.entries.size,1);
});
test('province border rendering never strokes an artificial meridian closure',()=>{
  const width=8,height=4,world={width,height,seed:'seam',layers:{elevation:new Float32Array(32).fill(100),province:new Uint16Array(32).fill(1),ownership:new Uint16Array(32).fill(1)},meta:{civilization:{revision:1,nations:[{id:1}],provinces:[{id:1,nation:1}],cultures:[],families:[],cities:[]}}},lines=[];
  const ctx={save(){},restore(){},beginPath(){},setLineDash(){},moveTo(x,y){lines.push([x,y]);},lineTo(x,y){lines.push([x,y]);},quadraticCurveTo(){},stroke(){},fill(){},closePath(){}};
  drawCivilizationTerritories(ctx,{world,mode:'political',overlays:{provinces:true},camera:{scale:10,x:4,y:2,width:80,height:40}},0,0,undefined,{pass:'provinces',extended:false});assert.equal(lines.length,0);
});
test('invisible distant settlements cannot intercept political map clicks',()=>{
  const city={id:1,x:64.5,y:32.5,cell:32*128+64,population:1000000},world={width:128,height:64,seed:'visibility',layers:{elevation:new Float32Array(8192).fill(100),lake:new Uint8Array(8192)},meta:{civilization:{revision:1,nations:[],cultures:[],families:[],cities:[city]}}};
  const renderer={world,mode:'political',overlays:{cities:true},camera:{scale:2,width:1000,height:500,minScale:1},visualCityPosition(){throw new Error('invisible cities do not need a fine-terrain sample');}};
  assert.equal(cityVisibility(renderer,city).selectable,false);renderer.camera.scale=40;renderer.visualCityPosition=()=>({x:64.4,y:32.4});const visible=cityVisibility(renderer,city);assert.equal(visible.selectable,true);assert.equal(visible.x,64.4);assert.equal(visible.y,32.4);
});
