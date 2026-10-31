import {clamp} from '../core/geo.js';
import {hashSeed} from '../core/random.js';

// Seasonal pack ice is a surface layer, never land or a Köppen class. A small
// degree-day heat reservoir adds freezing/melting hysteresis over two spin-ups.
export function generateIce(world) {
  const {width:w,height:h,layers:l}=world,n=w*h;
  const seaIce=new Uint8Array(n*12),annualIce=new Uint8Array(n),permanentIce=new Uint8Array(n),warmestTemperature=new Float32Array(n);
  const phase=hashSeed(world.seed,'ocean-heat')/4294967296*Math.PI*2;
  for(let i=0;i<n;i++) {
    let hot=-Infinity;for(let m=0;m<12;m++)hot=Math.max(hot,l.temperature[m*n+i]);warmestTemperature[i]=hot;
    if(l.elevation[i]>0)continue;
    const lon=(i%w+.5)/w*Math.PI*2,lat=(.5-(Math.floor(i/w)+.5)/h)*Math.PI;
    const current=(Math.sin(lon*2+phase)+.55*Math.sin(lon*5-lat*3+phase))*2.6*Math.sin(lat)**4;
    let pack=0,sum=0,min=255;
    for(let m=0;m<36;m++) {
      const t=l.temperature[(m%12)*n+i]+current;
      pack=clamp(pack+Math.max(0,-1.8-t)*.065-Math.max(0,t+1.8)*.11,0,1);
      if(m>=24){const cover=Math.round(pack*255);seaIce[(m%12)*n+i]=cover;sum+=cover;min=Math.min(min,cover);}
    }
    annualIce[i]=Math.round(sum/12);permanentIce[i]=min;
  }
  Object.assign(l,{seaIce,annualIce,permanentIce,warmestTemperature});
}
