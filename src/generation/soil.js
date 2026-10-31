import {clamp} from '../core/geo.js';

// Re-evaluate the rain-fed bucket on the final grid. Interpolating an ocean's
// moisture=1 into coastal land creates false green shorelines in dry climates.
export function naturalSoilMoisture(world,out=new Float32Array(world.width*world.height)) {
  const {layers:l}=world,n=world.width*world.height;
  for(let i=0;i<n;i++) {
    if(l.elevation[i]<=0){out[i]=1;continue;}
    let bucket=90,moisture=0;
    for(let m=0;m<36;m++) {
      const j=(m%12)*n+i,evaporation=clamp(11+3.5*Math.max(0,l.temperature[j]),8,180);
      bucket=clamp(bucket+l.precipitation[j]*.85-evaporation,0,180);if(m>=24)moisture+=bucket/180/12;
    }
    const ratio=l.annualPrecipitation[i]/Math.max(150,420+l.annualTemperature[i]*38);
    out[i]=clamp(moisture*.65+clamp(ratio/2,0,1)*.35,0,1);
  }
  return out;
}
