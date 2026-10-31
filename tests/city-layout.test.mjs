import test from 'node:test';
import assert from 'node:assert/strict';
import {createCityScene} from '../src/render/procedural-city.js';
import {cityFootprintCells} from '../src/render/civilization-renderer.js';
const width=128,height=64,elevation=new Float32Array(width*height).fill(150),world={seed:'urban-patterns',width,height,layers:{elevation,lake:new Uint8Array(width*height),river:new Uint8Array(width*height)}};
const city={id:7,cell:32*width+64,x:64.5,y:32.5,population:2000000};
test('city street graphs are deterministic and every neighborhood is connected',()=>{
  const a=createCityScene(world,city),b=createCityScene(world,city);assert.deepEqual(a,b);assert.ok(a.nodes.length>80);assert.ok(a.buildings.length>80);
  const seen=new Set([0]),queue=[0];for(let k=0;k<queue.length;k++)for(const edge of a.edges){const next=edge.a===queue[k]?edge.b:edge.b===queue[k]?edge.a:-1;if(next>=0&&!seen.has(next)){seen.add(next);queue.push(next);}}
  assert.equal(seen.size,a.nodes.length);
});
test('distinct settlements receive different structures and ports respond to geography',()=>{
  const a=createCityScene(world,city),b=createCityScene(world,{...city,id:8}),port=createCityScene(world,{...city,id:9,port:true});assert.notDeepEqual(a.nodes,b.nodes);assert.equal(port.style,'port');assert.ok(port.edges.length>port.nodes.length);
});
test('urban districts and buildings respect the supplied land and terrain constraint',()=>{
  const position={x:64.5,y:32.5},landAt=(x,y)=>x>=64.25&&y>32.15,scene=createCityScene(world,{...city,port:true},{position,footprint:1,landAt});
  for(const node of scene.nodes)assert.ok(landAt(position.x+node.x*.48,position.y+node.y*.48));
  for(const building of scene.buildings)assert.ok(landAt(position.x+building.x*.48,position.y+building.y*.48));
});
test('population changes physical footprint and building count by substantial amounts',()=>{
  const scenes=[6000,1000000,60000000].map(population=>createCityScene(world,{...city,population})),footprints=[6000,1000000,60000000].map(population=>cityFootprintCells(population,width));
  assert.ok(footprints[1]>footprints[0]*10);assert.ok(footprints[2]>footprints[1]*7);assert.ok(scenes[1].buildings.length>scenes[0].buildings.length*4);assert.ok(scenes[2].buildings.length>scenes[1].buildings.length*3);
  assert.equal(scenes[0].outskirtsPatches.length,0);assert.ok(scenes[1].outskirtsPatches.length>0);assert.ok(scenes[2].outskirtsPatches.length>scenes[1].outskirtsPatches.length);
  assert.ok(cityFootprintCells(60000000,width,.3)<=.3*.78);
});
test('large settlement outskirts stay on land and connect to the existing street graph',()=>{
  const position={x:64.5,y:32.5},footprint=1,landAt=(x,y)=>x>64.2&&y>32.1,scene=createCityScene(world,{...city,population:60000000},{position,footprint,landAt});
  for(const patch of scene.outskirtsPatches)assert.ok(landAt(position.x+patch.x*.48,position.y+patch.y*.48));
  for(const node of scene.nodes.filter(n=>n.outskirts))assert.ok(scene.edges.some(e=>scene.nodes[e.a]===node||scene.nodes[e.b]===node));
});
