import {generateCivilization} from './generator.js';
import {CIVILIZATION_LAYER_NAMES as CIV_LAYERS} from '../core/world.js';
self.onmessage=async({data})=>{
  try {
    await generateCivilization(data.world,data.settings,data.scope,(stage,progress,message)=>self.postMessage({type:'progress',stage,progress,message}));
    const layers=Object.fromEntries(CIV_LAYERS.filter(k=>data.world.layers[k]).map(k=>[k,data.world.layers[k]]));
    self.postMessage({type:'complete',layers,civilization:data.world.meta.civilization},[...new Set(Object.values(layers).map(a=>a.buffer))]);
  }catch(error){self.postMessage({type:'error',message:error.message,stack:error.stack});}
};
