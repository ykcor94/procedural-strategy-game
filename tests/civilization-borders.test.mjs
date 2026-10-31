import test from 'node:test';
import assert from 'node:assert/strict';
import {extractTerritories,buildBorderPaths,simplifyBorder,ideologyGroup,civilizationColor} from '../src/render/civilization-renderer.js';

const area=points=>{let a=0;for(let i=0;i<points.length;i+=2){const j=(i+2)%points.length;a+=points[i]*points[j+1]-points[j]*points[i+1];}return a/2;};
test('cell territory polygons preserve exact ownership area including enclave holes',()=>{
  const grid=Uint16Array.from([1,1,1,1,2,1,1,1,1]),polygons=extractTerritories(grid,3,3);
  assert.equal(polygons.get(1).length,2);
  assert.equal(polygons.get(1).reduce((a,p)=>a+area(p.points),0),8);
  assert.equal(polygons.get(2).reduce((a,p)=>a+area(p.points),0),1);
  assert.deepEqual(polygons.get(2)[0].bounds,[1,1,2,2]);
});
test('islands and diagonal point contacts remain separate territories',()=>{
  const polygons=extractTerritories(Uint16Array.from([1,0,1,0,1,0,1,0,1]),3,3);
  assert.equal(polygons.get(1).length,5);
  assert.equal(polygons.get(1).reduce((a,p)=>a+area(p.points),0),5);
});
test('border extraction emits each international edge once and excludes coastlines',()=>{
  const grid=Uint16Array.from([1,1,2,1,0,2]),land=Float32Array.from([1,1,1,1,-1,1]);
  const borders=buildBorderPaths(grid,land,3,2);
  let length=0;for(const b of borders)for(let j=2;j<b.points.length;j+=2)length+=Math.hypot(b.points[j]-b.points[j-2],b.points[j+1]-b.points[j-1]);
  // One interior edge at x=2, plus two edges on the wrapped international seam.
  assert.equal(length,3);
  assert.ok(borders.every(b=>b.pair==='1:2'));
});
test('ownership updates immediately change extracted borders without terrain changes',()=>{
  const grid=Uint16Array.from([1,1,2,2]),land=Float32Array.from([1,1,1,1]);
  const before=buildBorderPaths(grid,land,4,1);grid[1]=2;
  const after=buildBorderPaths(grid,land,4,1);
  assert.notDeepEqual(after,before);assert.deepEqual(land,Float32Array.from([1,1,1,1]));
});
test('identity map safely renders worlds without civilization data',()=>{
  assert.deepEqual(civilizationColor('political',{elevation:[1],lake:[0]},0,{meta:{}}),[154,157,135]);
  assert.equal(ideologyGroup({government:'Constitutional Monarchy'}),'monarchist');
  assert.equal(ideologyGroup({government:'Military Dictatorship'}),'authoritarian');
  assert.equal(ideologyGroup({government:'Social Democracy'}),'socialist');
});
test('border LOD removes redundant points and reveals detail within bounded cell tolerance',()=>{
  const path=[0,0,1,0,2,0,3,.2,4,0,5,0],coarse=simplifyBorder(path,.3),fine=simplifyBorder(path,.01);
  assert.deepEqual(coarse,[0,0,5,0]);
  assert.ok(fine.length>coarse.length);
  assert.ok(fine.includes(.2));
});
test('coastlines follow physical land across longitude wrap without artificial meridian cuts',()=>{
  const land=Float32Array.from([1,1,1,1,1,1]),mask=Uint8Array.from(land,()=>1);
  assert.deepEqual(buildBorderPaths(mask,land,3,2,true),[]);
  mask[1]=0;land[1]=-1;
  const paths=buildBorderPaths(mask,land,3,2,true);
  assert.ok(paths.length>0);
  for(const path of paths)for(let k=0;k<path.points.length;k+=2)assert.notEqual(path.points[k],3,'ocean cell away from seam must not draw seam coast');
});
