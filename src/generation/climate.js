import {clamp,distanceToMask} from '../core/geo.js';
import {seededRandom} from '../core/random.js';
import {classifyClimate} from './koppen.js';
import {sampleBilinear,resampleRaster} from '../core/sampling.js';
import {naturalSoilMoisture} from './soil.js';

const TAU=Math.PI*2, RAD=Math.PI/180;

// A deterministic, deliberately simplified atmosphere. Semi-Lagrangian vapor
// transport carries marine moisture along latitude-dependent winds, losing it
// over distance and rising terrain. It is a pattern model, not a climate GCM.
function simulateClimate(world,ctx={}) {
  const {width:w,height:h,settings:s,layers:l}=world,n=w*h,z=l.elevation;
  const ocean=new Uint8Array(n),landIndices=new Int32Array(n);let landCount=0;
  for(let i=0;i<n;i++){ocean[i]=z[i]<=0?1:0;if(!ocean[i])landIndices[landCount++]=i;}
  const coastDistance=distanceToMask(ocean,w,h,1),continentality=new Float32Array(n);
  // An edited all-land world has no marine source, but must remain finite.
  for(let i=0;i<n;i++)if(!Number.isFinite(coastDistance[i]))coastDistance[i]=w+h;
  const annualTemperature=new Float32Array(n),annualPrecipitation=new Float32Array(n),soilMoisture=new Float32Array(n);
  const temperature=new Float32Array(n*12),precipitation=new Float32Array(n*12);
  const windX=new Float32Array(n),windY=new Float32Array(n),baseRain=new Float32Array(n),lift=new Float32Array(n),vaporRetention=new Float32Array(n),recycling=new Float32Array(n);
  // Winds are fixed within a month. Cache their four upstream sample indices
  // once, rather than recomputing modulo/floor in every transport iteration.
  const topLeft=new Int32Array(n),topRight=new Int32Array(n),bottomLeft=new Int32Array(n),bottomRight=new Int32Array(n);
  const fractionX=new Float32Array(n),fractionY=new Float32Array(n);
  const random=seededRandom(world.seed,'climate'),phase=random()*TAU,phase2=random()*TAU;
  const tilt=s.axialTilt/23.4,stepX=w/144,stepY=h/144;
  const latitude=new Float32Array(h);
  for(let y=0;y<h;y++)latitude[y]=90-(y+.5)*180/h;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x,lat=latitude[y]*RAD;
    const km=coastDistance[i]*20015/h;
    continentality[i]=ocean[i]?0:1-Math.exp(-km/1200);
  }
  let vapor=new Float32Array(n),nextVapor=new Float32Array(n);
  for(let month=0;month<12;month++) {
    const sun=Math.cos((month-6)*TAU/12),itcz=s.axialTilt*.48*sun;
    for(let y=0;y<h;y++) {
      const lat=latitude[y],a=Math.abs(lat),sin=Math.sin(a*RAD),hemisphere=lat>=0?1:-1,summer=sun*hemisphere*Math.min(tilt,2);
      const shifted=Math.abs(lat-itcz*.4);
      const zonal=Math.tanh((shifted-30)/4)-Math.tanh((shifted-65)/4)-1;
      const convection=Math.exp(-(((lat-itcz)/10.8)**2));
      const storm=Math.exp(-(((a-(48+summer*8))/13.5)**2));
      const descent=1-.64*Math.exp(-(((Math.abs(lat-itcz)-28)/10.5)**2));
      const polar=clamp((90-a)/15,.23,1);
      for(let x=0;x<w;x++) {
        const i=y*w+x,c=continentality[i],land=!ocean[i],lon=x/w*TAU;
        const current=(Math.sin(lon*2+phase)+.45*Math.sin(lon*3-lat*RAD+phase2))*1.25*(1-c)*Math.sin(2*a*RAD);
        const mean=29-43*Math.pow(sin,2.4)-9*Math.pow(sin,10)+(s.temperatureOffset||0)-Math.max(0,z[i])*.0061+current;
        const amplitude=(land?7+22*c:3+8*sin)*sin*tilt;
        // Ocean heat capacity delays the seasonal cycle by roughly a month.
        const season=Math.cos((month-(land?6.5:7))*TAU/12)*hemisphere;
        temperature[month*n+i]=mean+amplitude*season;
        const dx=coastDistance[y*w+(x+2)%w]-coastDistance[y*w+(x-2+w)%w];
        const dy=coastDistance[Math.min(h-1,y+2)*w+x]-coastDistance[Math.max(0,y-2)*w+x];
        const length=Math.hypot(dx,dy)||1;
        const monsoon=land?Math.min(.9,Math.max(0,summer)*Math.exp(-(((a-20)/17)**2))*(.25+.55*c)):0;
        windX[i]=zonal*(1-monsoon)+dx/length*monsoon*1.6;
        windY[i]=Math.sign(lat-itcz)*(.22+.28*convection)*(1-monsoon)+dy/length*monsoon*1.2;
        const monsoonRain=90*monsoon*c;
        const wave=1+.1*Math.sin(lon*2+phase+lat*.08)+.07*Math.cos(lon*3+phase2-lat*.04);
        baseRain[i]=((8+192*convection+88*storm)*descent*polar+monsoonRain)*wave;
        vapor[i]=ocean[i]?1:Math.exp(-coastDistance[i]*20015/h/1800)*.78;
        const upstreamX=((x-windX[i]*stepX)%w+w)%w,upstreamY=clamp(y-windY[i]*stepY,0,h-1);
        const x0=Math.floor(upstreamX),y0=Math.floor(upstreamY),x1=(x0+1)%w,y1=Math.min(h-1,y0+1);
        const fx=upstreamX-x0,fy=upstreamY-y0;
        topLeft[i]=y0*w+x0;topRight[i]=y0*w+x1;bottomLeft[i]=y1*w+x0;bottomRight[i]=y1*w+x1;
        fractionX[i]=fx;fractionY[i]=fy;
        const upstream=(z[topLeft[i]]*(1-fx)+z[topRight[i]]*fx)*(1-fy)+(z[bottomLeft[i]]*(1-fx)+z[bottomRight[i]]*fx)*fy;
        lift[i]=land?Math.max(0,z[i]-Math.max(0,upstream)):0;
        const kmX=40030/w*Math.max(.12,Math.cos(lat*RAD));
        const travel=Math.hypot(windX[i]*stepX*kmX,windY[i]*stepY*20015/h);
        vaporRetention[i]=Math.exp(-travel/3100)*(1-clamp(lift[i]/4400,0,.67));
        // Vegetated warm belts return some moisture through evapotranspiration.
        // Recycling is bounded and weak in the descending dry/polar belts.
        recycling[i]=(.004+.018*convection+.008*storm)*clamp((mean+15)/40,.12,1);
      }
    }
    // A fixed angular travel length keeps patterns stable across resolutions.
    // Each iteration uses the previous field, so transport is scan-order free
    // and the x seam behaves exactly like every other longitude.
    nextVapor.fill(1);
    for(let iteration=0;iteration<28;iteration++) {
      for(let k=0;k<landCount;k++) {
        const i=landIndices[k];
        const fx=fractionX[i],fy=fractionY[i];
        const incoming=(vapor[topLeft[i]]*(1-fx)+vapor[topRight[i]]*fx)*(1-fy)+
          (vapor[bottomLeft[i]]*(1-fx)+vapor[bottomRight[i]]*fx)*fy;
        nextVapor[i]=Math.min(1,incoming*vaporRetention[i]+recycling[i]);
      }
      [vapor,nextVapor]=[nextVapor,vapor];
    }
    for(let i=0;i<n;i++) {
      const temp=temperature[month*n+i];
      const capacity=clamp((temp+27)/48,.22,1.25);
      const water=ocean[i]?1:.035+vapor[i]*1.1;
      const orographic=1+clamp(lift[i]/500,0,2.7);
      const rain=clamp(baseRain[i]*water*orographic*capacity*s.wetness*1.35,.05,1000);
      precipitation[month*n+i]=rain;
      annualTemperature[i]+=temp/12;annualPrecipitation[i]+=rain;
    }
    ctx.report?.('climate',(month+1)/12,`Climate · month ${month+1} of 12`);
  }
  Object.assign(l,{temperature,precipitation,annualTemperature,annualPrecipitation,soilMoisture,continentality,coastDistance});
  naturalSoilMoisture(world,soilMoisture);world.meta.climateSoilVersion=2;
  world.meta.climateModel='monthly-vapor-transport-v2';world.meta.climateGrid=[w,h];
  if(!ctx.skipClassification)classifyClimate(world);
}

export function generateClimate(world,ctx={}) {
  if(world.width<=512&&world.height<=256)return simulateClimate(world,ctx);
  const {width:w,height:h,layers:l}=world,n=w*h;
  const sw=Math.min(512,w),sh=Math.min(256,Math.max(64,Math.round(h*sw/w)));
  const elevation=resampleRaster(l.elevation,w,h,sw,sh);
  const coarse={...world,width:sw,height:sh,settings:{...world.settings,width:sw,height:sh},layers:{elevation},meta:{}};
  simulateClimate(coarse,{...ctx,skipClassification:true});
  const c=coarse.layers;
  const temperature=new Float32Array(n*12),precipitation=new Float32Array(n*12);
  const annualTemperature=new Float32Array(n),annualPrecipitation=new Float32Array(n);
  const x0=new Int32Array(w),x1=new Int32Array(w),fx=new Float64Array(w),y0=new Int32Array(h),y1=new Int32Array(h),fy=new Float64Array(h),lapse=new Float32Array(n);
  for(let x=0;x<w;x++){const xx=(((x+.5)/w*sw-.5)%sw+sw)%sw;x0[x]=Math.floor(xx);x1[x]=(x0[x]+1)%sw;fx[x]=xx-x0[x];}
  for(let y=0;y<h;y++){const yy=clamp((y+.5)/h*sh-.5,0,sh-1),row=Math.floor(yy);y0[y]=row*sw;y1[y]=Math.min(sh-1,row+1)*sw;fy[y]=yy-row;}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x,a=y0[y]+x0[x],b=y0[y]+x1[x],d=y1[y]+x0[x],e=y1[y]+x1[x],f=fx[x],g=fy[y];
    const ground=(elevation[a]*(1-f)+elevation[b]*f)*(1-g)+(elevation[d]*(1-f)+elevation[e]*f)*g;
    lapse[i]=(Math.max(0,l.elevation[i])-Math.max(0,ground))*.0061;
  }
  for(let m=0;m<12;m++)for(let y=0;y<h;y++) {
    const top=m*sw*sh+y0[y],bottom=m*sw*sh+y1[y],g=fy[y];
    for(let x=0;x<w;x++) {
      const i=y*w+x,a=top+x0[x],b=top+x1[x],d=bottom+x0[x],e=bottom+x1[x],f=fx[x];
      const t=(c.temperature[a]*(1-f)+c.temperature[b]*f)*(1-g)+(c.temperature[d]*(1-f)+c.temperature[e]*f)*g-lapse[i];
      const p=(c.precipitation[a]*(1-f)+c.precipitation[b]*f)*(1-g)+(c.precipitation[d]*(1-f)+c.precipitation[e]*f)*g;
      temperature[m*n+i]=t;precipitation[m*n+i]=p;annualTemperature[i]+=t/12;annualPrecipitation[i]+=p;
    }
  }
  Object.assign(l,{temperature,precipitation,annualTemperature,annualPrecipitation});
  for(const name of ['continentality','coastDistance'])l[name]=resampleRaster(c[name],sw,sh,w,h);
  l.soilMoisture=naturalSoilMoisture(world);world.meta.climateSoilVersion=2;
  for(let i=0;i<n;i++)l.coastDistance[i]*=h/sh;
  world.meta.climateModel='monthly-vapor-transport-v2';world.meta.climateGrid=[sw,sh];
  if(!ctx.skipClassification)classifyClimate(world);
}
