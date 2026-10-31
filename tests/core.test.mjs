import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,validateSettings} from '../src/core/settings.js';
import {createWorld,regionAt,registerLayer,LAYER_REGISTRY} from '../src/core/world.js';
import {rowArea,wrapX,wrappedDelta} from '../src/core/geo.js';
import {affectedBy,stagesForSettings} from '../src/core/invalidation.js';
import {TerrainEditor} from '../src/editor/brushes.js';
import {runPipeline} from '../src/generation/pipeline.js';
import {serializeWorld,deserializeWorld} from '../src/persistence/world-file.js';

test('validation rejects invalid settings and preserves supported custom dimensions',()=>{
  for(const change of [{width:12},{height:NaN},{seed:''},{wetness:0},{style:'bogus'},{maxElevation:Infinity}])assert.throws(()=>validateSettings({...DEFAULTS,...change}));
  assert.equal(validateSettings({...DEFAULTS,width:321,height:171}).width,321);
});
test('spherical row areas integrate to the whole globe and wrap handles negative coordinates',()=>{
  let a=0;for(let y=0;y<320;y++)a+=rowArea(y,320);assert.ok(Math.abs(a-2)<1e-12);
  assert.ok(rowArea(160,320)>rowArea(0,320)*100);assert.equal(wrapX(-1,128),127);assert.equal(wrappedDelta(127,1,128),-2);
});
test('dependency graph skips upstream stages and supports future registered layers',()=>{
  const hydro=affectedBy(['hydrology']);assert.ok(hydro.has('biomes'));assert.ok(!hydro.has('climate'));assert.ok(!hydro.has('elevation'));
  assert.deepEqual([...stagesForSettings(DEFAULTS,{...DEFAULTS,wetness:1.5})],['climate']);
  registerLayer('ownershipTest',{type:'Uint32Array',domain:'simulation'});assert.equal(LAYER_REGISTRY.get('ownershipTest').domain,'simulation');assert.throws(()=>registerLayer('ownershipTest',{}));
  assert.equal(regionAt(createWorld({...DEFAULTS,width:128,height:64}),16+128*16),9);
});
test('all brushes wrap without polar wrap, undo/redo restores exact Float32 terrain',()=>{
  const world=createWorld({...DEFAULTS,width:128,height:64});world.layers.elevation=new Float32Array(128*64);const editor=new TerrainEditor(),original=world.layers.elevation.slice();
  for(const tool of ['raise','lower','land','ocean','smooth']){editor.begin(world);editor.dab(0,0,8,400,tool);assert.ok(editor.end());}
  const edited=world.layers.elevation.slice();assert.notDeepEqual(edited,original);assert.equal(world.layers.elevation[63*128],0);
  for(let k=0;k<5;k++)assert.ok(editor.undo(world));assert.deepEqual(world.layers.elevation,original);for(let k=0;k<5;k++)assert.ok(editor.redo(world));assert.deepEqual(world.layers.elevation,edited);
  editor.begin(world);editor.dab(127,30,4,600,'raise');assert.ok(world.layers.elevation[30*128]>0);editor.rollback();assert.deepEqual(world.layers.elevation,edited);
});
test('world file rejects malformed, partial, incompatible, and nonfinite saves',async()=>{
  const world=await runPipeline({settings:{...DEFAULTS,width:128,height:64}}),text=serializeWorld(world),doc=JSON.parse(text);
  assert.throws(()=>deserializeWorld('{bad'),/JSON/);assert.throws(()=>deserializeWorld(JSON.stringify({...doc,version:100})),/version/);
  const missing=structuredClone(doc);delete missing.layers.soilMoisture;assert.throws(()=>deserializeWorld(JSON.stringify(missing)),/soilMoisture/);
  const shape=structuredClone(doc);shape.layers.flow.data=btoa('1234');assert.throws(()=>deserializeWorld(JSON.stringify(shape)),/size/);
  const wrong=structuredClone(doc);wrong.width++;assert.throws(()=>deserializeWorld(JSON.stringify(wrong)),/dimensions/);
  const original=world.layers.elevation[0];world.layers.elevation[0]=NaN;assert.throws(()=>deserializeWorld(serializeWorld(world)),/Non-finite/);world.layers.elevation[0]=original;
});
