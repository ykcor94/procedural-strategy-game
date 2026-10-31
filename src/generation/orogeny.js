import {seededRandom,hashSeed} from '../core/random.js';
import {clamp,wrapX} from '../core/geo.js';
import {periodicNoise} from './noise.js';

const TAU=Math.PI*2,smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const delta=x=>x-Math.round(x);
const KINDS=['cordillera','folded','massif','broken'];

/** Seeded rock provinces and curved orogens, anchored to actual convergent
 * terrain but progressively freed from it by Terrain chaos. The generator
 * samples these envelopes, never copies a fixed mountain template per world.
 */
export function createOrogeny(world,land,distance,uplift) {
  const {width:w,height:h,settings:s}=world,random=seededRandom(world.seed,'orogen-families-v5'),seed=hashSeed(world.seed,'rock-provinces-v5');
  const spread=s.mountainSpread??.5,chaos=s.terrainChaos??.28,extent=s.highlandExtent??.4,ranges=[],provinces=[];
  function anchor(interior=false,rng=random) {
    let best=0,score=-Infinity;
    for(let attempt=0;attempt<100;attempt++) {
      const i=Math.floor(rng()*h)*w+Math.floor(rng()*w);if(!land[i])continue;
      const u=(i%w+.5)/w,v=(Math.floor(i/w)+.5)/h*.5,coast=distance[i]/w;
      let separation=.1;for(const f of interior?provinces:ranges)separation=Math.min(separation,Math.hypot(delta(u-f.u),v-f.v));
      const value=uplift[i]*(1-chaos)*1.5+rng()*(.3+chaos)+Math.min(separation,.07)*5+(interior?Math.min(.6,coast*10):Math.exp(-coast/.025)*.22);
      if(value>score){score=value;best=i;}
    }
    if(score===-Infinity)best=land.findIndex(Boolean);
    return Math.max(0,best);
  }
  const count=Math.round(5+spread*17);
  for(let j=0;j<count;j++) {
    const i=anchor(),x=i%w,y=Math.floor(i/w),u=(x+.5)/w,v=(y+.5)/h*.5;
    const gradX=uplift[y*w+wrapX(x+1,w)]-uplift[y*w+wrapX(x-1,w)],gradY=uplift[Math.min(h-1,y+1)*w+x]-uplift[Math.max(0,y-1)*w+x];
    const coastX=distance[y*w+wrapX(x+1,w)]-distance[y*w+wrapX(x-1,w)],coastY=distance[Math.min(h-1,y+1)*w+x]-distance[Math.max(0,y-1)*w+x];
    const coastal=distance[i]/w<.025&&j%3===0;
    let angle=coastal?Math.atan2(coastX,-coastY):Math.atan2(gradX,-gradY);
    if(Math.hypot(gradX,gradY)<.002&&!coastal)angle=random()*TAU;
    angle+=(random()-.5)*(.4+chaos*2.4);
    let kind=s.mountainStyle||'mixed';
    if(kind==='mixed'){const weights= s.landformProfile==='plateaus'||s.landformProfile==='highlands'?['folded','massif','folded','broken']:coastal?['cordillera','cordillera','folded','massif']:KINDS;kind=weights[Math.floor(random()*weights.length)];}
    const type=KINDS.indexOf(kind),length=(.055+random()**.6*.19)*(kind==='cordillera'?1.45:kind==='massif'?.42:1);
    const width=(kind==='cordillera'?.0025+random()*.006:kind==='folded'?.009+random()*.017:.008+random()*.019)*(.35+(s.rangeWidth??.5)*1.35)*(.65+spread*.6);
    const phase=random()*TAU,phase2=random()*TAU,bend=(random()-.5)*(.35+chaos*.6),dx=Math.cos(angle),dy=Math.sin(angle),steps=5+Math.floor(random()*5),points=[];
    for(let p=0;p<=steps;p++) {
      const t=p/steps-.5,across=(Math.sin(t*4+phase)-Math.sin(phase))*length*bend+Math.sin(t*11+phase2)*length*.025;
      points.push({u:u+dx*t*length-dy*across,v:clamp(v+dy*t*length+dx*across,.009,.491),width:width*(.6+random()*.85)*(1-Math.abs(t)*.55),height:(.5+random()*.85)*(1-Math.abs(t)*.65)});
    }
    ranges.push({u,v,kind,type,width,length,phase,frequency:35+random()*115,sharpness:.8+random()*2.7,points});
  }
  const highlandRandom=seededRandom(world.seed,'highland-provinces-v5');
  if(extent>0)for(let j=0;j<Math.round(2+extent*7);j++) {
    const i=anchor(true,highlandRandom),u=(i%w+.5)/w,v=(Math.floor(i/w)+.5)/h*.5;
    const radius=(.022+extent*.105)*(.65+highlandRandom()*.7),angle=highlandRandom()*TAU;
    provinces.push({u,v,rx:radius,ry:radius*(.45+highlandRandom()*.7),ca:Math.cos(angle),sa:Math.sin(angle),height:.7+highlandRandom()*.6,phase:highlandRandom()*TAU});
  }
  // Spatial bins keep broad feature generation linear in raster size, with
  // only a few local segments/provinces examined at each geographic sample.
  const cols=48,rows=24,bins=new Map();
  function add(x0,y0,x1,y1,item){for(let y=Math.max(0,Math.floor(y0*2*rows));y<=Math.min(rows-1,Math.floor(y1*2*rows));y++)for(let x=Math.floor(x0*cols);x<=Math.floor(x1*cols);x++){const key=y*cols+wrapX(x,cols);let b=bins.get(key);if(!b)bins.set(key,b=[]);b.push(item);}}
  ranges.forEach((f,id)=>{for(let p=1;p<f.points.length;p++){const a=f.points[p-1],b=f.points[p],pad=Math.max(a.width,b.width)*3;add(Math.min(a.u,b.u)-pad,Math.min(a.v,b.v)-pad,Math.max(a.u,b.u)+pad,Math.max(a.v,b.v)+pad,{id,a,b,f,mid:(a.u+b.u)*.5});}});
  provinces.forEach((f,id)=>{const pad=Math.max(f.rx,f.ry)*1.5;add(f.u-pad,f.v-pad,f.u+pad,f.v+pad,{province:f,id});});
  const stamps=new Uint32Array(count),values=new Float64Array(count),touched=new Int32Array(count);let stamp=0;
  const result={mountain:0,highland:0};
  function sample(u,v) {
    const vv=v*.5,peak=periodicNoise(u,vv,53,seed),grain=periodicNoise(u,vv,131,seed+127),broad=periodicNoise(u,vv,7,seed+331);
    const bucket=bins.get(clamp(Math.floor(v*rows),0,rows-1)*cols+wrapX(Math.floor(u*cols),cols))||[];
    stamp=(stamp+1)>>>0;if(!stamp){stamps.fill(0);stamp=1;}let n=0,highland=0;
    for(const item of bucket) {
      if(item.province){const f=item.province,dx=delta(u-f.u),dy=vv-f.v,a=(dx*f.ca+dy*f.sa)/f.rx,b=(-dx*f.sa+dy*f.ca)/f.ry;
        const radius=Math.hypot(a,b)+(broad*Math.cos(f.phase)+peak*.1)*.2;
        highland=Math.max(highland,smooth((1.22-radius)/.54)*f.height);continue;}
      const {a,b,f,id}=item,px=u+Math.round(item.mid-u)-a.u,py=vv-a.v,dx=b.u-a.u,dy=b.v-a.v,len2=dx*dx+dy*dy,t=clamp((px*dx+py*dy)/(len2||1),0,1),qx=px-dx*t,qy=py-dy*t,width=a.width+(b.width-a.width)*t;
      const d2=(qx*qx+qy*qy)/(width*width),cross=(qx*-dy+qy*dx)/Math.sqrt(len2||1)/width;
      let envelope=Math.exp(-d2*(f.type===3?.85:1.7));if(envelope<.00001)continue;
      const wave=Math.sin((px*dx+py*dy)/Math.sqrt(len2||1)*f.frequency*TAU+f.phase+peak*3);
      const ridge=Math.pow(clamp(1-Math.abs(peak*.95+grain*.35+wave*.18)*1.7,0,1),f.sharpness);
      let texture=.28+ridge*.72;
      if(f.type===1)texture=.3+.7*(.4+.6*Math.cos(cross*8+peak*3)**2)*(.5+ridge*.5);
      else if(f.type===2){envelope=Math.exp(-Math.pow(d2,.65)*1.2);texture=.5+ridge*.5;}
      else if(f.type===3)texture=.2+.8*clamp(.6+peak*1.1+grain*.45+wave*.15,0,1);
      const value=envelope*texture*(a.height+(b.height-a.height)*t);
      if(stamps[id]!==stamp){stamps[id]=stamp;values[id]=0;touched[n++]=id;}values[id]=Math.max(values[id],value);
    }
    let power=0;for(let j=0;j<n;j++)power+=values[touched[j]]**4;
    result.mountain=Math.sqrt(Math.sqrt(power));result.highland=highland;return result;
  }
  return {sample,ranges,provinces,seed};
}
