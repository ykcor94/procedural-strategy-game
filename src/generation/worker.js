import {runPipeline} from './pipeline.js';
import {transferables} from '../core/world.js';
self.onmessage=async({data})=>{
  try {
    const world=await runPipeline(data,(stage,progress,message)=>self.postMessage({type:'progress',stage,progress,message}));
    self.postMessage({type:'complete',world},transferables(world));
  }catch(error){self.postMessage({type:'error',message:error.message,stack:error.stack});}
};
