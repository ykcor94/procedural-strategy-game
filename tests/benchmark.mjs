// Optional manual performance/maximum-resolution check (not part of npm test).
import {runPipeline} from '../src/generation/pipeline.js';
import {worldToBlob} from '../src/persistence/binary-world.js';
const width=Number(process.argv[2]||2048),height=Number(process.argv[3]||1024),start=performance.now(),cpu=process.cpuUsage();
let last='';
const world=await runPipeline({settings:{width,height,seed:'Resolution-check-v2'}},stage=>{if(stage!==last){console.log(stage,((performance.now()-start)/1000).toFixed(2)+'s');last=stage;}});
for(const [name,a]of Object.entries(world.layers))for(const value of a)if(!Number.isFinite(value))throw new Error(`Non-finite ${name}`);
const blob=worldToBlob(world);
console.log(JSON.stringify({width,height,seconds:(performance.now()-start)/1000,cpu:process.cpuUsage(cpu),rasterBytes:Object.values(world.layers).reduce((sum,a)=>sum+a.byteLength,0),saveBytes:blob.size,landShare:world.meta.statistics.landShare,climateGrid:world.meta.climateGrid,tectonicGrid:world.meta.terrain.tectonicGrid}));
