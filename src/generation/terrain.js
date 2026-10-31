import {hashSeed,seededRandom} from '../core/random.js';
import {clamp,rowArea} from '../core/geo.js';
import {periodicNoise,fractalNoise} from './noise.js';
import {createTectonics,sampleTectonics} from './tectonics.js';
import {resampleRaster,sampleBilinear,sampleNearest} from '../core/sampling.js';
import {continentAnchors,constrainContinents,labelLandmasses} from './continents.js';
import {LANDFORMS} from '../data/landforms.js';
import {createOrogeny} from './orogeny.js';
import {resampleCoastalTerrain} from './coastal-resampling.js';

const TAU=Math.PI*2;
const smooth = t => {t=clamp(t,0,1);return t*t*(3-2*t);};
const delta = x => x-Math.round(x);

function makeContinents(settings,random) {
  const lobes=[],islands=[],bays=[],style=settings.style,fragmentation=settings.fragmentation;
  const requested=settings.continentCount||0,anchors=requested?continentAnchors(random,requested):null;
  const groups=requested||(style==='supercontinent'?1:style==='archipelago'?10:style==='fragmented'?6:3);
  const origin=random(),direction=random()<.5?-1:1,centers=[];
  // Unevenly clustered major landmasses leave a deliberately broad ocean.
  // Other styles use rejection sampling, without evenly spaced longitudes.
  for(let g=0;g<groups;g++) {
    let x;
    if(anchors)x=anchors[g].u;
    else if(style==='earthlike')x=origin+direction*(g===0?0:g===1?.22+random()*.1:.48+random()*.1);
    else if(style==='supercontinent')x=origin;
    else {
      for(let attempt=0;attempt<24;attempt++) {
        x=random();
        if(centers.every(c=>Math.abs(delta(c-x))>(style==='archipelago'?.035:.09)))break;
      }
    }
    centers.push(x);
  }
  for(let g=0;g<groups;g++) {
    // Several related lobes form each continent. Unequal sizes and irregular
    // group spacing leave broad ocean basins, rather than a uniform noise field.
    const gx=centers[g];
    const gy=anchors?anchors[g].v*.5:.1+random()*.29;
    const styleScale=style==='supercontinent'?1.36:style==='archipelago'?.42:style==='fragmented'?.68:1;
    const scale=styleScale*(requested?clamp(Math.sqrt(3/requested),.55,1.65):1);
    const rx=(.085+random()*.085)*scale*(g===0?1.2:1);
    const ry=(.075+random()*.115)*scale;
    const angle=anchors?anchors[g].angle:(random()-.5)*2.2;
    lobes.push([gx,gy,rx,ry,angle,.92+random()*.13]);
    const branches=style==='supercontinent'?7:style==='archipelago'?2:3+Math.floor(random()*3);
    for(let b=0;b<branches;b++) {
      const a=random()*TAU,r=.58+random()*.68;
      lobes.push([gx+Math.cos(a)*rx*r,clamp(gy+Math.sin(a)*ry*r,.025,.475),
        rx*(.38+random()*.34),ry*(.36+random()*.36),angle+(random()-.5)*1.4,.84+random()*.13]);
    }
    // Long, open gulf cuts complement the positive continental skeleton.
    // Their mouths face offshore, avoiding a field of random inland holes.
    const gulfs=style==='archipelago'?1:2+Math.floor(random()*2);
    for(let b=0;b<gulfs;b++) {
      const a=random()*TAU,dx=Math.cos(a)*rx*.92,dy=Math.sin(a)*ry*.92;
      const ca=Math.cos(angle),sa=Math.sin(angle),ox=dx*ca-dy*sa,oy=dx*sa+dy*ca;
      const axis=Math.atan2(oy,ox),length=Math.hypot(ox,oy)*(.42+random()*.28);
      const breadth=(.011+random()*.016)*scale;
      bays.push([gx+ox,gy+oy,length,breadth,Math.cos(axis),Math.sin(axis),1.2+random()*.7]);
    }
  }
  // Island arcs are clustered along curved chains, not sprinkled uniformly.
  const abundance=settings.islandAbundance??.6;
  const arcs=Math.round((style==='archipelago'?13:style==='fragmented'?9:6)*(0.35+abundance));
  for(let a=0;a<arcs;a++) {
    const cx=random(),cy=.065+random()*.37,angle=random()*TAU;
    const count=4+Math.floor(random()*(5+abundance*12)),length=.045+random()*.12;
    for(let j=0;j<count;j++) {
      const t=(j/(count-1)-.5),bend=t*t*(random()<.5?-.12:.12);
      const radius=(.0016+Math.pow(random(),1.8)*.008)*(style==='archipelago'?1.4:1)*(1+fragmentation*.25);
      islands.push([cx+Math.cos(angle)*t*length-Math.sin(angle)*bend,
        cy+Math.sin(angle)*t*length+Math.cos(angle)*bend,radius,radius*(.6+random()),random()*TAU,.7+random()*.16]);
    }
  }
  // Precompute rotations: these are used once per lobe for every raster cell.
  const all=lobes.concat(islands);
  for(const l of all){const angle=l[4];l[4]=Math.cos(angle);l.push(Math.sin(angle),Math.max(l[2],l[3]));}
  return {lobes:all,bays,anchors,polarSouth:!requested&&random()<.78,polarNorth:!requested&&random()<.22};
}

// Fast two-pass chamfer distance with wrapped longitudinal seams. The extra
// directional passes propagate across the seam without choosing a special meridian.
function coastDistance(land,w,h) {
  const distance=new Float32Array(w*h);distance.fill(1e5);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const i=y*w+x,left=y*w+(x+w-1)%w,right=y*w+(x+1)%w;
    if(land[i]!==land[left]||land[i]!==land[right]||(y&&land[i]!==land[i-w])||(y<h-1&&land[i]!==land[i+w])) distance[i]=0;
  }
  for(let pass=0;pass<2;pass++) {
    for(let y=0;y<h;y++) for(let xx=0;xx<w*2;xx++) {
      const x=xx%w,i=y*w+x,l=y*w+(x+w-1)%w;
      let d=Math.min(distance[i],distance[l]+1);
      if(y)d=Math.min(d,distance[i-w]+1,distance[(y-1)*w+(x+w-1)%w]+1.4142,distance[(y-1)*w+(x+1)%w]+1.4142);
      distance[i]=d;
    }
    for(let y=h-1;y>=0;y--) for(let xx=w*2-1;xx>=0;xx--) {
      const x=xx%w,i=y*w+x,r=y*w+(x+1)%w;
      let d=Math.min(distance[i],distance[r]+1);
      if(y<h-1)d=Math.min(d,distance[i+w]+1,distance[(y+1)*w+(x+w-1)%w]+1.4142,distance[(y+1)*w+(x+1)%w]+1.4142);
      distance[i]=d;
    }
  }
  return distance;
}

// Choose a display meridian through a broad ocean corridor. The model still
// wraps, but the initial full-map view need not cut its largest continent in two.
function oceanMeridian(land,w,h) {
  const columns=new Float64Array(w);
  for(let y=0;y<h;y++){const area=rowArea(y,h);for(let x=0;x<w;x++)columns[x]+=land[y*w+x]*area;}
  const radius=Math.max(1,Math.round(w*.055));let score=0;
  for(let x=-radius;x<=radius;x++)score+=columns[(x+w)%w];
  let best=score,seam=0;
  for(let x=1;x<w;x++) {
    score+=columns[(x+radius)%w]-columns[(x-radius-1+w)%w];
    if(score<best-1e-12){best=score;seam=x;}
  }
  return seam;
}
function rotateRaster(raster,w,h,shift) {
  if(!shift)return raster;
  const result=new raster.constructor(raster.length);
  for(let y=0;y<h;y++) {
    const row=y*w;
    result.set(raster.subarray(row+shift,row+w),row);
    result.set(raster.subarray(row,row+shift),row+w-shift);
  }
  return result;
}

// Weighted quantiles account for the true spherical area of equirectangular cells.
// Binary search works directly on stored Float32 scores, avoiding a costly index sort.
export function seaLevelThreshold(scores,w,h,target) {
  let low=Infinity,high=-Infinity;
  for(let i=0;i<scores.length;i++){low=Math.min(low,scores[i]);high=Math.max(high,scores[i]);}
  const weights=new Float64Array(h);let total=0;
  for(let y=0;y<h;y++){weights[y]=rowArea(y,h);total+=weights[y]*w;}
  let best=(low+high)/2,error=Infinity;
  for(let step=0;step<52;step++) {
    const mid=(low+high)/2;let area=0;
    for(let y=0;y<h;y++){let n=0;for(let x=0;x<w;x++)if(scores[y*w+x]>mid)n++;area+=n*weights[y];}
    const share=area/total,diff=Math.abs(share-target);
    if(diff<error){error=diff;best=mid;}
    if(share>target)low=mid;else high=mid;
  }
  return best;
}

function buildTerrain(world,ctx={}) {
  const report=(f,message)=>ctx.report?.('terrain',f,message);
  const {width:w,height:h,settings:s}=world,n=w*h;
  const seed=hashSeed(world.seed,'terrain'),random=seededRandom(seed);
  const profile=LANDFORMS[s.landformProfile]||LANDFORMS.balanced;
  const plateRandom=seededRandom(world.seed,'plate-count-v5'),plateCount=(s.style==='archipelago'?24:17)+Math.floor(plateRandom()*12);
  const continents=makeContinents(s,random),tectonics=createTectonics(world.seed,plateCount);
  // Tectonics and long-wavelength warps are planetary drivers, not pixel noise.
  // Evaluate them once on a bounded field and interpolate continuously. Fine
  // coastal/erosional bands below are still evaluated at the requested grid.
  const fw=Math.min(w,256),fh=Math.min(h,128),fields={};
  for(const key of ['wx','wy','coastalX','coastalY','uplift','rift','arc','age','crust','plate'])fields[key]=new Float32Array(fw*fh);
  for(let y=0;y<fh;y++)for(let x=0;x<fw;x++) {
    const u=(x+.5)/fw,v=(y+.5)/fh*.5,i=y*fw+x;
    const wx=fractalNoise(u,v,3,3,seed+17),wy=fractalNoise(u,v,3,3,seed+139);
    fields.wx[i]=wx;fields.wy[i]=wy;fields.coastalX[i]=periodicNoise(u,v,13,seed+227);fields.coastalY[i]=periodicNoise(u,v,13,seed+313);
    const t=sampleTectonics(tectonics,u+wx*.045,clamp(v*2+wy*.06,0,1),s.tectonicActivity??.65,s.rangeWidth??.5);
    for(const key of ['uplift','rift','arc','age','crust','plate'])fields[key][i]=t[key];
  }
  let scores=new Float32Array(n);const relief=new Float32Array(n),plate=new Uint16Array(n),uplift=new Float32Array(n);
  const rift=new Float32Array(n),crustAge=new Float32Array(n);
  const volcanoes=[],volcanic=new Float32Array(n),volcanoRandom=seededRandom(world.seed,'volcanic-hotspots');
  for(let j=0;j<Math.round((s.volcanism??.25)*18);j++) {
    let best=null,bestScore=-1;
    for(let a=0;a<12;a++){const u=volcanoRandom(),v=.1+volcanoRandom()*.8,activity=sampleBilinear(fields.rift,u,v,fw,fh)+sampleBilinear(fields.arc,u,v,fw,fh);const score=activity+(j%4===0?volcanoRandom()*.7:0);if(score>bestScore){bestScore=score;best={u,v};}}
    volcanoes.push({...best,radius:.004+volcanoRandom()*.009,height:(2200+volcanoRandom()*4300)*(s.volcanism??.25)*profile.volcanoes,caldera:volcanoRandom()<.55});
  }
  const ruggedness=s.ruggedness,fragmentation=s.fragmentation;
  report(.02,'Shaping continental crust');
  let lowScore=Infinity,highScore=-Infinity;
  for(let y=0;y<h;y++) {
    const v=(y+.5)/h*.5,polar=Math.pow(Math.abs((y+.5)/h*2-1),12);
    for(let x=0;x<w;x++) {
      const u=(x+.5)/w,i=y*w+x;
      let volcanicHeight=0;
      for(const cone of volcanoes){const dx=delta(u-cone.u),dy=v-cone.v*.5;if(Math.abs(dx)>cone.radius||Math.abs(dy)>cone.radius)continue;const d=Math.hypot(dx,dy)/cone.radius;if(d<1){let shape=(1-d)**1.6;if(cone.caldera&&d<.24)shape-=.48*(1-d/.24)**2;volcanicHeight+=cone.height*shape;}}
      volcanic[i]=volcanicHeight;
      const wx=sampleBilinear(fields.wx,u,v*2,fw,fh),wy=sampleBilinear(fields.wy,u,v*2,fw,fh);
      const warp=.13+fragmentation*.075;
      const coastalX=sampleBilinear(fields.coastalX,u,v*2,fw,fh),coastalY=sampleBilinear(fields.coastalY,u,v*2,fw,fh);
      const detail=s.coastDetail??.72;
      const px=u+wx*warp+coastalX*.018+periodicNoise(u,v,47,seed+327)*.008*detail;
      const py=v+wy*warp+coastalY*.018+periodicNoise(u,v,47,seed+347)*.008*detail;
      let shape=-4;
      for(let j=0;j<continents.lobes.length;j++) {
        const l=continents.lobes[j],dx=delta(px-l[0]),dy=py-l[1],ca=l[4],sa=l[6];
        const reach=l[7]*(l[5]-shape+.13);
        if(reach<=0||dx*dx+dy*dy>reach*reach)continue;
        const a=(dx*ca+dy*sa)/l[2],b=(-dx*sa+dy*ca)/l[3];
        const candidate=l[5]-Math.sqrt(a*a+b*b);
        // Smooth maximum makes adjoining lobes continuous without puffing them up.
        const k=.13,t=Math.max(k-Math.abs(shape-candidate),0)/k;
        shape=Math.max(shape,candidate)+t*t*k*.25;
      }
      const broad=periodicNoise(u+.13,v-.07,4,seed+401);
      const middle=fractalNoise(px,py,9,3,seed+701,.58);
      const fine=fractalNoise(px,py,32,3,seed+919);
      const styleDetail=s.style==='archipelago'?.47:s.style==='fragmented'?.16:0;
      const tuplift=sampleBilinear(fields.uplift,u,v*2,fw,fh),trift=sampleBilinear(fields.rift,u,v*2,fw,fh),tarc=sampleBilinear(fields.arc,u,v*2,fw,fh),tcrust=sampleBilinear(fields.crust,u,v*2,fw,fh);
      let score=shape+broad*.65+middle*(.43+fragmentation*.6+styleDetail)+fine*(.07+detail*.4)+
        fractalNoise(px,py,85,2,seed+1119)*detail*.12+tarc*.65-trift*.12+(tcrust-.45)*.2;
      if(volcanicHeight>0)score=Math.max(score,volcanicHeight/2500-.55);
      for(const b of continents.bays) {
        const dx=delta(px-b[0]),dy=py-b[1];
        if(Math.abs(dx)>b[2]*1.6&&Math.abs(dy)>b[2]*1.6)continue;
        const along=(dx*b[4]+dy*b[5])/b[2],across=(-dx*b[5]+dy*b[4])/b[3]+(coastalX+coastalY)*.6,q=along*along+across*across;
        if(q<4)score-=b[6]*Math.exp(-q*1.6);
      }
      // Both poles converge to a single value; no comb-like polar coastlines.
      const polarValue=y<h/2?(continents.polarNorth?.85:-.8):(continents.polarSouth?1:-.8);
      score=score*(1-polar)+polarValue*polar;
      scores[i]=score;lowScore=Math.min(lowScore,score);highScore=Math.max(highScore,score);
      relief[i]=fractalNoise(px,py,14,4,seed+1777,.48);

      // A soft saturation avoids the flat-topped cap produced by min(1,uplift).
      uplift[i]=(1-Math.exp(-tuplift*1.5))*(1-polar*.45);
      rift[i]=trift;crustAge[i]=sampleBilinear(fields.age,u,v*2,fw,fh);plate[i]=sampleNearest(fields.plate,u,v*2,fw,fh);
    }
    if(y%24===0)report(.04+.52*y/h,'Warping coastlines and plate boundaries');
  }
  report(.58,'Balancing land and ocean area');
  const basinScores=scores,basinLow=lowScore,basinHigh=highScore;
  const rawThreshold=seaLevelThreshold(scores,w,h,s.landCoverage);
  if(continents.anchors)scores=constrainContinents(scores,w,h,continents.anchors,s.landCoverage,rawThreshold);
  const threshold=continents.anchors?seaLevelThreshold(scores,w,h,s.landCoverage):rawThreshold,land=new Uint8Array(n);
  for(let i=0;i<n;i++)land[i]=scores[i]>threshold?1:0;
  const distance=coastDistance(land,w,h),elevation=new Float32Array(n),mountainUplift=new Float32Array(n),highlandUplift=new Float32Array(n);
  const orogeny=createOrogeny(world,land,distance,uplift);
  let minimum=0;
  report(.71,'Raising ranges and carving continental shelves');
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x,u=(x+.5)/w,v=(y+.5)/h*.5,coast=distance[i]/w;
    if(land[i]) {
      const crustInterior=clamp((basinScores[i]-rawThreshold)/Math.max(.001,basinHigh-rawThreshold),0,1);
      const continental=clamp(crustInterior*.55+(1-Math.exp(-coast/.035))*.45,0,1);
      const inland=smooth(coast/.009),lowlands=((s.plainsElevation??180)+150*Math.pow(continental,.65)+500*Math.pow(continental,1.9))*profile.plains;
      const plateaus=smooth((periodicNoise(u,v,6,seed+3301)+.12)*1.7)*(s.plateauStrength??.45)*1450*profile.plateaus*Math.pow(continental,.55);
      const hills=(relief[i]+.55)*(.1+ruggedness*.9)*460;
      const valleys=Math.pow(Math.abs(fractalNoise(u,v,37,3,seed+3391)),1.3)*800*ruggedness*(s.erosion??.55)*(s.valleyStrength??.45)+rift[i]*700*profile.rift*(s.valleyStrength??.45);
      const rock=orogeny.sample(u,v*2);
      const mountains=(rock.mountain*10500+uplift[i]*2400)*s.mountainIntensity*profile.mountains;
      const highland=rock.highland*(s.highlandUplift??1800)*Math.sqrt(profile.plateaus)*(.2+(s.plateauStrength??.45)*.8)*inland;
      mountainUplift[i]=mountains;highlandUplift[i]=highland;
      // Coastal plains remain low; collision belts can still reach the shore.
      const coastRise=.2+inland*.8;
      const shore=smooth(coast/.004);
      const base=lowlands*coastRise+plateaus*inland+highland+hills*(.15+inland*.85),cut=Math.min(base*.72,valleys*inland);
      const meters=Math.max(.25,(base-cut+mountains*(.62+inland*.38)+volcanic[i])*(.08+.92*shore));
      elevation[i]=meters;
    }else {
      // Connectivity constraints choose which crust emerges. Their artificial
      // separating seams must never become angular trenches in ocean depth.
      const abyss=clamp((rawThreshold-basinScores[i])/(rawThreshold-basinLow),0,1);
      const shelfWidth=(.003+.003*(periodicNoise(u,v,5,seed+3947)+.6))*(.3+(s.shelfWidth??.5)*1.4);
      const shelf=-12-170*smooth(coast/shelfWidth);
      const slope=smooth((coast-shelfWidth)/.012);
      const oceanFloor=-(2700+3300*Math.pow(abyss,.6)+crustAge[i]*900+relief[i]*650);
      // Divergent and less active boundaries create broad submarine ridges.
      const ridge=600*(.5+.5*periodicNoise(u,v,9,seed+4051))+rift[i]*1500;
      const meters=shelf*(1-slope)+(oceanFloor+ridge)*slope+volcanic[i];
      elevation[i]=Math.min(-1,meters);minimum=Math.min(minimum,meters);
    }
  }
  // User bounds define the available relief range, rather than changing coastlines.
  const landScale=s.maxElevation/6500,oceanScale=s.minElevation/Math.min(-1,minimum);
  for(let i=0;i<n;i++)elevation[i]=land[i]?s.maxElevation*Math.tanh(elevation[i]*landScale/s.maxElevation):Math.max(s.minElevation,elevation[i]*oceanScale);
  const meridian=oceanMeridian(land,w,h);
  world.layers.elevation=rotateRaster(elevation,w,h,meridian);
  world.layers.baseElevation=world.layers.elevation.slice();
  world.layers.plate=rotateRaster(plate,w,h,meridian);
  world.layers.tectonicUplift=rotateRaster(uplift,w,h,meridian);
  world.layers.tectonicRift=rotateRaster(rift,w,h,meridian);
  world.layers.crustAge=rotateRaster(crustAge,w,h,meridian);
  world.layers.volcanicUplift=rotateRaster(volcanic,w,h,meridian);
  world.layers.mountainUplift=rotateRaster(mountainUplift,w,h,meridian);world.layers.highlandUplift=rotateRaster(highlandUplift,w,h,meridian);
  const longitude=u=>((u-meridian/w)%1+1)%1;
  world.meta.terrain={algorithm:'variable-orogens-v5',seed,seaThreshold:threshold,plateCount:tectonics.plates.length,longitudeRotation:meridian/w*360,plates:tectonics.plates,tectonicGrid:[fw,fh],volcanoes:volcanoes.map(v=>({...v,u:longitude(v.u)})),profile:s.landformProfile,mountainStyle:s.mountainStyle,orogens:orogeny.ranges.map(f=>({...f,u:longitude(f.u),v:f.v*2,points:f.points.map(p=>({...p,u:longitude(p.u),v:p.v*2}))})),highlands:orogeny.provinces.map(f=>({...f,u:longitude(f.u),v:f.v*2})),featureCoordinates:'normalized-world; widths in world circumferences'};
  report(1,'Terrain complete');
  return world;
}

export function generateTerrain(world,ctx={}) {
  if(world.width<=1024&&world.height<=512){buildTerrain(world,ctx);labelLandmasses(world);return world;}
  const factor=Math.min(1,1024/world.width,512/world.height);
  const w=Math.max(16,Math.round(world.width*factor)),h=Math.max(16,Math.round(world.height*factor));
  const coarse={...world,width:w,height:h,settings:{...world.settings,width:w,height:h},layers:{},meta:{...world.meta}};
  buildTerrain(coarse,ctx);
  for(const [name,array]of Object.entries(coarse.layers))if(!['baseElevation','elevation'].includes(name))world.layers[name]=resampleRaster(array,w,h,world.width,world.height,name==='plate');
  const land=Uint8Array.from(coarse.layers.elevation,e=>e>0),distance=coastDistance(land,w,h);
  const refined=resampleCoastalTerrain(coarse.layers.elevation,distance,w,h,world.width,world.height,world.settings.landCoverage,seaLevelThreshold,hashSeed(world.seed,'coast-refinement'));
  const e=world.layers.elevation=refined.elevation;let floor=-1;for(const value of e)floor=Math.min(floor,value);const depthScale=world.settings.minElevation/floor;
  for(let i=0;i<e.length;i++)e[i]=e[i]>0?Math.min(world.settings.maxElevation,e[i]):Math.max(world.settings.minElevation,e[i]*depthScale);
  world.layers.baseElevation=e.slice();world.meta.terrain={...coarse.meta.terrain,structuralGrid:[w,h],refinedCoastThreshold:refined.threshold};
  labelLandmasses(world);
  return world;
}
