import {sampleBilinear,sampleNearest,sampleBicubic} from '../core/sampling.js';
import {clamp,wrapX} from '../core/geo.js';
import {hashSeed} from '../core/random.js';
import {periodicNoise} from '../generation/noise.js';
import {applyDetailEdits} from './detail-edits.js';
import {createWaterFeatures} from '../render/water-features.js';
import {cachedPeriodicNoise,preparePeriodicNoise} from './cached-noise.js';
import {reliefField} from '../render/relief.js';

export const DETAIL_ALGORITHM='anchored-fbm-v1';
export function createTileSource(world,{includeWater=true}={}) {
  const layers={};
  for(const name of ['elevation','tectonicUplift','mountainUplift','annualTemperature','annualPrecipitation','warmestTemperature','soilMoisture','naturalMoisture','biome','lake','lakeSurface','riverDistance','annualIce','seaIce'])if(world.layers[name])layers[name]=world.layers[name];
  layers.relief=reliefField(world);
  return {width:world.width,height:world.height,seed:world.seed,settings:world.settings,layers,waterFeatures:includeWater&&world.layers.flow?createWaterFeatures(world):[],detail:world.meta.detail||{version:1,algorithm:DETAIL_ALGORITHM,edits:[]}};
}

export function createTerrainSampler(source) {
  const {width:w,height:h,layers:l,settings:s}=source,seed=hashSeed(source.seed,DETAIL_ALGORITHM);
  // Anchors are populated lazily, only where requested tiles sample geography.
  const anchors=new Float32Array(w*h);anchors.fill(NaN);
  const wxNoise=cachedPeriodicNoise(32,seed+79),wyNoise=cachedPeriodicNoise(32,seed+137),octaves=Array.from({length:7},(_,i)=>cachedPeriodicNoise(256*2**i,seed+i*1013));
  const noise=(u,v,anchor=false,resolution=Infinity)=>{
    const vv=v*.5,wx=(anchor?periodicNoise(u,vv,32,seed+79):wxNoise(u,vv))*.0015,wy=(anchor?periodicNoise(u,vv,32,seed+137):wyNoise(u,vv))*.0015;
    let sum=0,total=0,weight=1,frequency=256;
    for(let octave=0;octave<7;octave++) {
      const n=anchor||frequency>resolution?periodicNoise(u+wx,vv+wy,frequency,seed+octave*1013):octaves[octave](u+wx,vv+wy),ridge=1-Math.abs(n)*1.7;
      sum+=(n*.55+(ridge*ridge-.55)*.45)*weight;total+=weight;weight*=.52;frequency*=2;
    }
    return sum/total;
  };
  function anchor(i){if(Number.isNaN(anchors[i]))anchors[i]=noise((i%w+.5)/w,(Math.floor(i/w)+.5)/h,true);return anchors[i];}
  function noiseBase(u,v) {
    const x=wrapX(u*w-.5,w),y=clamp(v*h-.5,0,h-1),x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,x1=(x0+1)%w,y1=Math.min(h-1,y0+1);
    return (anchor(y0*w+x0)*(1-fx)+anchor(y0*w+x1)*fx)*(1-fy)+(anchor(y1*w+x0)*(1-fx)+anchor(y1*w+x1)*fx)*fy;
  }
  const sampleTerrain=function(u,v,{valleys=true,edits=source.detail.edits,samplingResolution=Infinity,noiseContext}={}) {
    u=wrapX(u,1);v=clamp(v,0,1);
    const base=sampleBicubic(l.elevation,u,v,w,h),nearest=sampleNearest(l.elevation,u,v,w,h);
    const lake=l.lake?sampleBilinear(l.lake,u,v,w,h):0;
    const riverDistance=l.riverDistance?sampleBilinear(l.riverDistance,u,v,w,h):10;
    const uplift=l.mountainUplift?sampleBilinear(l.mountainUplift,u,v,w,h)/6500:l.tectonicUplift?sampleBilinear(l.tectonicUplift,u,v,w,h):0;
    const featureGuard=clamp((.5-lake)/.5,0,1)*clamp((riverDistance-.7)/.8,0,1);
    const coast=Math.exp(-Math.abs(base)/230),polar=Math.max(.03,Math.cos((v-.5)*Math.PI));
    const amplitude=(base>0?35+(s.ruggedness??.5)*200+uplift*900:25)*(1-coast)+coast*(30+(s.coastDetail??.7)*140);
    const residual=featureGuard?((noiseContext?noiseContext(u,v):noise(u,v,false,samplingResolution))-noiseBase(u,v))*amplitude*featureGuard*polar:0;
    let height=base+residual;
    if(valleys&&base>0)height-=Math.min(65,base*.18)*Math.exp(-riverDistance*riverDistance/1.4);
    if(base>0&&edits?.length)height=applyDetailEdits(height,residual,u,v,edits,featureGuard);
    // Deep ocean, continental interiors and major water bodies retain identity.
    if(Math.abs(base)>250)height=base>0?Math.max(1,height):Math.min(-1,height);
    if(lake>.5&&nearest>0)height=Math.max(.25,height);
    return clamp(height,s.minElevation,s.maxElevation);
  };
  sampleTerrain.prepareTile=(bounds,size)=>{
    const resolution=size/bounds.du,halo=Math.max(bounds.du,bounds.dv*.5)/size*2;
    const expanded={u:bounds.u-halo,v:bounds.v-halo*2,du:bounds.du+halo*2,dv:bounds.dv+halo*4};
    const wx=preparePeriodicNoise(32,seed+79,expanded),wy=preparePeriodicNoise(32,seed+137,expanded);
    const bands=Array.from({length:7},(_,i)=>{const f=256*2**i,k=seed+i*1013;return f<=resolution?preparePeriodicNoise(f,k,expanded,.0031):(u,v)=>periodicNoise(u,v,f,k);});
    return (u,v)=>{
      const vv=v*.5,x=u+wx(u,vv)*.0015,y=vv+wy(u,vv)*.0015;let sum=0,total=0,weight=1;
      for(let i=0;i<7;i++){const n=bands[i](x,y),ridge=1-Math.abs(n)*1.7;sum+=(n*.55+(ridge*ridge-.55)*.45)*weight;total+=weight;weight*=.52;}
      return sum/total;
    };
  };
  return sampleTerrain;
}
