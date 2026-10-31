import {performance} from 'node:perf_hooks';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {worldToBlob,readWorld} from '../src/persistence/binary-world.js';
import {runPipeline} from '../src/generation/pipeline.js';
import {DEFAULTS} from '../src/core/settings.js';
import {createTileSource,createTerrainSampler} from '../src/lod/terrain-sampler.js';
import {generateElevationTile,generateVisualTile} from '../src/lod/tile-generator.js';

await mkdir('test-output',{recursive:true});
let world;try{world=await readWorld(await readFile('test-output/lod-benchmark-world.atlas'));}catch{world=await runPipeline({settings:{...DEFAULTS,width:256,height:128,seed:'Thalassa-314'}});await writeFile('test-output/lod-benchmark-world.atlas',new Uint8Array(await worldToBlob(world).arrayBuffer()));}
const source=createTileSource(world),sample=createTerrainSampler(source),results=[];
for(const [name,level,predicate]of [['coast',5,(e,i)=>e>0&&e<70],['forest',7,(e,i)=>e>200&&e<1800&&world.layers.soilMoisture[i]>.5],['mountains',8,(e,i)=>e>3000],['ocean',7,e=>e< -3500]]) {
  let i=world.layers.elevation.findIndex(predicate);if(i<0)i=100;
  const u=(i%world.width+.5)/world.width,v=(Math.floor(i/world.width)+.5)/world.height,tile={level,x:Math.floor(u*2**(level+1)),y:Math.floor(v*2**level)};
  const options={mode:'physical',shading:true,coasts:true,ice:true,month:-1};
  const cpu=process.cpuUsage(),start=performance.now();generateElevationTile(source,sample,tile,options);const elevationMs=performance.now()-start;
  const t=performance.now(),result=generateVisualTile(source,sample,tile,options),elapsed=performance.now()-t,used=process.cpuUsage(cpu);
  results.push({name,tile,elevationMs:+elevationMs.toFixed(1),visualMs:+elapsed.toFixed(1),cpuMs:+((used.user+used.system)/1000).toFixed(1),sprites:!!result.spritePixels});
}
await mkdir('test-output',{recursive:true});console.log(JSON.stringify(results,null,2));
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(results,null,2));
