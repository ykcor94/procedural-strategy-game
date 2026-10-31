import {seededRandom} from '../core/random.js';
import {clamp} from '../core/geo.js';

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalized=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};

/** Spherical plates with tangent motion, crust age and oceanic/continental crust.
 * Boundary contributions use a soft Voronoi partition. Unlike a nearest-plate
 * switch, the field and its fault belts remain continuous at triple junctions.
 */
export function createTectonics(seed,count=22) {
  const random=seededRandom(seed,'tectonic-plates-v3'),plates=[];
  for(let i=0;i<count;i++) {
    let position,score=-1;
    for(let attempt=0;attempt<5;attempt++) {
      const z=1-2*random(),r=Math.sqrt(1-z*z),angle=random()*Math.PI*2,candidate=[Math.cos(angle)*r,Math.sin(angle)*r,z];let distance=4;
      for(const plate of plates)distance=Math.min(distance,candidate.reduce((sum,v,k)=>sum+(v-plate.position[k])**2,0));
      // Unequal spacing leaves large plates and occasional microplate clusters.
      const value=i%7===0?-distance:distance;if(!position||value>score){position=candidate;score=value;}
    }
    const rotation=normalized([random()-.5,random()-.5,random()-.5]);
    const speed=.3+random()*.7+(random()+random()-1)*.08;
    const velocity=cross(rotation,position).map(v=>v*speed);
    plates.push({position,velocity,continental:random()<.42,age:random(),buoyancy:random()*.4-.2});
  }
  const pairs=new Float32Array(count*count*3);
  for(let i=0;i<count;i++)for(let j=i+1;j<count;j++) {
    const a=plates[i],b=plates[j],direction=normalized(b.position.map((v,k)=>v-a.position[k]));
    const relative=a.velocity.map((v,k)=>v-b.velocity[k]);
    const convergence=dot(relative,direction),shear=Math.sqrt(Math.max(0,dot(relative,relative)-convergence**2));
    const distance=Math.hypot(...a.position.map((v,k)=>v-b.position[k]));
    for(const [p,q]of [[i,j],[j,i]]) {
      const k=(p*count+q)*3;pairs[k]=convergence;pairs[k+1]=shear;pairs[k+2]=1/Math.max(.1,distance);
    }
  }
  return {plates,pairs,ids:new Int32Array(count),ds:new Float64Array(count),result:{}};
}

export function sampleTectonics(model,u,v,activity=.65,rangeWidth=.5) {
  const lon=u*Math.PI*2,lat=(.5-v)*Math.PI,cos=Math.cos(lat);
  const px=cos*Math.cos(lon),py=cos*Math.sin(lon),pz=Math.sin(lat);
  const {ids,ds,plates,pairs,result}=model,n=plates.length;let nearest=0,best=-Infinity;
  for(let i=0;i<n;i++) {
    const p=plates[i].position,d=px*p[0]+py*p[1]+pz*p[2];
    ds[i]=d;if(d>best){best=d;nearest=i;}
  }
  let uplift=0,rift=0,arc=0,transform=0,age=0,crust=0,weight=0;
  let active=0;
  for(let i=0;i<n;i++){const s=Math.exp((ds[i]-best)/.08);weight+=s;age+=plates[i].age*s;crust+=(plates[i].continental?1:0)*s;if(ds[i]>best-.28)ids[active++]=i;}
  for(let k=0;k<active;k++) {
    for(let j=k+1;j<active;j++) {
      const a=ids[k],b=ids[j],pair=(a*n+b)*3;
      const signed=(ds[a]-ds[b])*pairs[pair+2];
      let fa=clamp((ds[a]-best+.28)/.1,0,1),fb=clamp((ds[b]-best+.28)/.1,0,1);fa=fa*fa*(3-2*fa);fb=fb*fb*(3-2*fb);
      const proximity=Math.exp(((ds[a]+ds[b])*.5-best)/.035)*fa*fb;
      const baseWidth=.018+.012*activity,width=baseWidth*(.4+rangeWidth*1.2),belt=Math.exp(-((signed/width)**2))*proximity;
      const coastBelt=Math.exp(-((signed/baseWidth)**2))*proximity;
      const shoulder=Math.exp(-((signed/(width*3.5))**2))*proximity;
      const converge=Math.max(0,pairs[pair]),diverge=Math.max(0,-pairs[pair]);
      uplift+=(belt*.76+shoulder*.24)*converge;
      rift+=coastBelt*diverge;
      transform+=coastBelt*pairs[pair+1];
      if(plates[a].continental!==plates[b].continental)arc+=coastBelt*converge;
    }
  }
  result.plate=nearest;result.uplift=uplift*activity;result.rift=rift*activity;result.arc=arc*activity;result.transform=transform*activity;result.age=age/weight;result.crust=crust/weight;
  return result;
}
