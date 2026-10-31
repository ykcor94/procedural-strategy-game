import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTerritoryGeometry,traceRing,traceChain,lodBand} from '../src/render/territory-geometry.js';

// Collect ring polylines through a minimal path recorder.
function ringsOf(g,id,band=8){
  const rings=[];for(const ring of g.polygons.get(id)||[]){const pts=[];traceRing({moveTo:(x,y)=>pts.push([x,y]),lineTo:(x,y)=>pts.push([x,y]),closePath(){}},g,ring,band);rings.push(pts);}return rings;
}
function inside(rings,x,y){let c=false;for(const r of rings)for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;}

function check(grid,width,height){
  const g=buildTerritoryGeometry(grid,width,height),ids=[...new Set(grid)].filter(Boolean),rings=new Map(ids.map(id=>[id,ringsOf(g,id)]));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const id=grid[y*width+x];
    for(const other of ids)assert.equal(inside(rings.get(other),x+.5,y+.5),other===id,`cell ${x},${y} id ${id} vs ${other}`);
  }
  return g;
}

test('smoothed fills keep every cell centre on its own side, including diagonal pinches',()=>{
  const W=8,H=6,grid=new Int32Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)grid[y*W+x]=((x>>1)+(y>>1))%2?1:2; // 2x2 checkerboard: many pinches
  check(grid,W,H);
  const single=new Int32Array(9*9);for(let y=0;y<9;y++)for(let x=0;x<9;x++)single[y*9+x]=(x+y)%2?3:4; // 1-cell checkerboard
  check(single,9,9);
});

test('neighbouring fills share identical chain points and borders follow the same curve',()=>{
  const W=24,H=16,grid=new Int32Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)grid[y*W+x]=x+Math.round(Math.sin(y*.7)*3)<12?5:y<8?6:7;
  const g=check(grid,W,H);
  // Every border chain is also referenced by fill rings on both sides.
  const referenced=new Map();for(const rings of g.polygons.values())for(const ring of rings)for(const code of ring.refs)referenced.set(code>>1,(referenced.get(code>>1)||0)+1);
  for(const chain of g.borders)assert.equal(referenced.get(g.chains.indexOf(chain)),chain.bounds[0]===W?1:2); // the wrapped seam copy closes one ring
  // Junction endpoints remain exact lattice vertices; smoothing stays near its lattice.
  for(const chain of g.chains){if(chain.closed)continue;const p=chain.points;for(const k of [0,p.length-2]){assert.equal(p[k]%1,0);assert.equal(p[k+1]%1,0);}}
  const pts=[];for(const chain of g.borders)traceChain({moveTo:(x,y)=>pts.push([x,y]),lineTo:(x,y)=>pts.push([x,y])},chain,lodBand(1));
  assert.ok(pts.length>4);
});

test('wrapped seam borders are emitted once and seam ring closures are never borders',()=>{
  const W=10,H=4,grid=new Int32Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++)grid[y*W+x]=x<5?1:2;
  const g=buildTerritoryGeometry(grid,W,H),pairs=g.borders.map(b=>b.pair);
  assert.ok(pairs.every(p=>p==='1:2'));
  // One interior border at x=5 and one wrapped border at x=10, each a straight vertical chain.
  const xs=new Set(g.borders.flatMap(b=>[...b.points].filter((_,k)=>k%2===0)));assert.deepEqual([...xs].sort((a,b)=>a-b),[5,10]);
});
