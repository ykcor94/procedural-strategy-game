/** Civilization is authoritative global data. No value here comes from disposable visual LOD. */
import {seededRandom,hashSeed} from '../core/random.js';
import {clamp,rowArea,wrappedDelta} from '../core/geo.js';
import {createLanguage,generateName,generatePersonName,generateToponym,normalizeLanguagePhonology,exonym} from './names.js';
import {generateFlag} from './flags.js';
import {fractalNoise} from '../generation/noise.js';
import {generateSociety,recomputeSociety,migrateSociety,validateSociety} from './society.js';
import {regenerateProvinces} from './provinces.js';
import {deriveUrbanization} from './economy.js';
import {cityFootprint} from './society-utils.js';
import {separateNeighbourColors} from './identity.js';

export const DEFAULT_CIV_SETTINGS=Object.freeze({seed:'Founding-1',nationCount:72,cultureCount:64,familyCount:14,totalPopulation:5000000000,distribution:'realistic',populationConcentration:.55,populationInequality:.55,urbanization:.62,sizeInequality:.72,geographyInfluence:.75,culturalAffinity:.65,unclaimedPolar:true,unclaimedHarsh:false,cityCount:1200,provinceAverage:8,provinceVariability:.65,religionCount:18,religionFamilyCount:6,noReligionEnabled:true,noReligionRate:.15,accentedLetters:true,urbanizationVariation:.5,technologyLevel:.6,developmentInequality:.6,tradeRoutes:160,palette:'atlas',paletteSaturation:1,startDate:'2000-01-01'});
export const CIV_PRESETS=Object.freeze({
  'Modern atlas':{...DEFAULT_CIV_SETTINGS},
  'A thousand banners':{nationCount:180,cultureCount:48,familyCount:12,totalPopulation:2800000000,urbanization:.47,sizeInequality:.55,cityCount:1600},
  'Age of empires':{nationCount:24,cultureCount:85,familyCount:17,totalPopulation:1200000000,urbanization:.27,sizeInequality:.94,cityCount:900},
  'Island commonwealths':{nationCount:110,cultureCount:80,familyCount:20,totalPopulation:2000000000,urbanization:.66,sizeInequality:.8,cityCount:1300},
  'Early kingdoms':{nationCount:90,cultureCount:110,familyCount:22,totalPopulation:250000000,urbanization:.16,sizeInequality:.65,cityCount:800},
  'Ten billion lives':{nationCount:96,cultureCount:96,familyCount:20,totalPopulation:10000000000,urbanization:.78,distribution:'concentrated',cityCount:2000},
});
export function normalizeCivSettings(settings={}) {
  const s={...DEFAULT_CIV_SETTINGS,...settings};
  for(const [k,a,b]of [['nationCount',1,500],['cultureCount',1,250],['familyCount',1,40],['totalPopulation',1000000,20000000000],['cityCount',1,3000],['provinceAverage',1,40],['religionCount',1,80],['religionFamilyCount',1,20],['tradeRoutes',0,300]])s[k]=Math.round(clamp(Number.isFinite(+s[k])?+s[k]:DEFAULT_CIV_SETTINGS[k],a,b));
  for(const k of ['urbanization','sizeInequality','geographyInfluence','culturalAffinity'])s[k]=clamp(Number.isFinite(+s[k])?+s[k]:DEFAULT_CIV_SETTINGS[k],k==='urbanization'?.01:0,k==='urbanization'?.98:1);
  s.familyCount=Math.min(s.familyCount,s.cultureCount);s.cityCount=Math.max(s.cityCount,s.nationCount);s.seed=String(s.seed||DEFAULT_CIV_SETTINGS.seed).slice(0,100);s.unclaimedPolar=!!s.unclaimedPolar;s.unclaimedHarsh=!!s.unclaimedHarsh;s.noReligionEnabled=!!s.noReligionEnabled;s.accentedLetters=s.accentedLetters!==false&&s.accentedLetters!=='false';
  for(const k of ['provinceVariability','technologyLevel','developmentInequality','populationConcentration','populationInequality','noReligionRate','urbanizationVariation'])s[k]=clamp(Number.isFinite(+s[k])?+s[k]:DEFAULT_CIV_SETTINGS[k],0,1);s.religionFamilyCount=Math.min(s.religionFamilyCount,s.religionCount);s.palette=PALETTES[s.palette]?s.palette:'atlas';s.paletteSaturation=clamp(Number.isFinite(+s.paletteSaturation)?+s.paletteSaturation:1,.1,1.6);if(!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate)||!Number.isFinite(Date.parse(s.startDate)))s.startDate='2000-01-01';
  if(!['realistic','balanced','concentrated'].includes(s.distribution))s.distribution='realistic';return s;
}
const AREA=4*Math.PI*6371*6371;
export const PALETTES=Object.freeze({
  atlas:{name:'Muted atlas',colors:['#9d7775','#78939b','#a5a17c','#8e87a0','#7d9b86','#b49173','#8395b0','#b28c9b','#a7ad8e','#7e9d9a','#b3a073','#9690ae','#8ba47e','#bb9c91','#8294a5','#aba29d']},
  antique:{name:'Antique parchment',colors:['#ae8270','#8a9a87','#b8a46f','#a58e9c','#7f979e','#b69a89','#9a9b72','#9b8a78','#8a8caa','#a2ac95','#b38b7c','#9caaa7']},
  earth:{name:'Earth pigments',colors:['#9d7461','#6d9282','#a99b63','#8b829d','#7c9a9c','#ad837c','#8d986f','#9e8e7e','#768b9b','#a8a48a','#a98092','#88a394']},
  pastel:{name:'Soft watercolor',colors:['#c49c9a','#9fb7c0','#c4c0a0','#b2abc5','#a7bda9','#ccb29a','#a4b4ce','#c6a6b6','#bec5a8','#a3c0bb','#ccbd98','#bab0c9']},
});
function paletteColor(id,seed,palette='atlas',saturation=1){const colors=(PALETTES[palette]||PALETTES.atlas).colors,index=(id*7+hashSeed(seed)%colors.length)%colors.length,hex=colors[index],rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),gray=rgb[0]*.3+rgb[1]*.59+rgb[2]*.11,cycle=Math.floor((id-1)/colors.length),offset=((cycle*13)%21)-10;return '#'+rgb.map(v=>Math.round(clamp(gray+(v-gray)*saturation+offset,40,230)).toString(16).padStart(2,'0')).join('');}
export function applyCivilizationPalette(world,palette='atlas',saturation=1){const civ=world.meta?.civilization;if(!civ)return world;palette=PALETTES[palette]?palette:'atlas';saturation=clamp(Number(saturation)||1,.1,1.6);civ.settings.palette=palette;civ.settings.paletteSaturation=saturation;for(const group of ['nations','cultures','languages','families'])for(const entity of civ[group]||[])if(!entity.manual?.color)entity.color=paletteColor(entity.id,`${civ.seed}:${group}`,palette,saturation);separateNeighbourColors(world,paletteColor);civ.revision=(civ.revision||0)+1;return world;}
const BIOME_CAPACITY=[0,.66,.8,.67,.025,.045,.45,.96,.91,.8,.86,.19,.035,.002,.07,.63,0,.85,.8,.51,.83,.87];
export const GOVERNMENTS=Object.freeze([
  ['Constitutional Republic','President','Civic liberalism','Republic of'],['Parliamentary Republic','Prime Minister','Parliamentary democracy','Republic of'],['Democratic Federation','Federal Chancellor','Federal democracy','Federation of'],['Constitutional Monarchy','Sovereign','Constitutionalism','Kingdom of'],['Absolute Monarchy','Monarch','Royal absolutism','Kingdom of'],['Social Democracy','Prime Minister','Social democracy',''],['Military Regime','General','Military authoritarianism','State of'],['Authoritarian Republic','President','Authoritarian nationalism','Republic of'],['Communist Party State','General Secretary','Authoritarian communism',"People’s Republic of"],['Fascist Dictatorship','First Marshal','Fascist nationalism','National State of'],['Theocracy','High Hierophant','Religious traditionalism','Holy Commonwealth of'],['Confederation','Council Speaker','Regional autonomy','Confederation of'],['Elective Monarchy','High Sovereign','Elective traditionalism','Crown of'],['Merchant Republic','First Consul','Commercial republicanism','Free Republic of'],['Direct Democracy','Council Speaker','Direct democracy','Commonwealth of'],['Socialist Federation','Chairperson','Democratic socialism','Union of'],['Presidential Dictatorship','Supreme President','Personalist authoritarianism','State of'],['Council Republic','First Councillor','Council democracy',''],['Dual Monarchy','Regent','Dynastic traditionalism','United Kingdoms of'],['Technocratic Republic','Chief Administrator','Technocracy','Republic of'],
]);
const color=(id,seed,saturation=48,lightness=62)=>{const h=(id*137.508+(hashSeed(seed)%360))%360;return hsl(h,saturation,lightness);};
function hsl(h,s,l){s/=100;l/=100;const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');};return '#'+f(0)+f(8)+f(4);}
const xy=(i,w)=>({x:i%w+.5,y:Math.floor(i/w)+.5});
const neighbors=(i,w,h,fn)=>{const x=i%w,y=Math.floor(i/w);fn(y*w+(x+w-1)%w);fn(y*w+(x+1)%w);if(y)fn(i-w);if(y<h-1)fn(i+w);};
const travelNeighbors=(i,w,h,fn)=>{const x=i%w,y=Math.floor(i/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy||y+dy<0||y+dy>=h)continue;fn((y+dy)*w+(x+dx+w)%w,dx,dy);}};

/** Entries carry immutable priorities: no decrease-key heap corruption during competing expansion. */
class Queue {
  constructor(){this.items=[];}
  push(cell,id,cost){const v={cell,id,cost};let p=this.items.length;this.items.push(v);while(p){const q=(p-1)>>1;if(this.items[q].cost<=cost)break;this.items[p]=this.items[q];p=q;}this.items[p]=v;}
  pop(){const a=this.items,r=a[0],v=a.pop();if(a.length){let p=0;while(p*2+1<a.length){let k=p*2+1;if(k+1<a.length&&a[k+1].cost<a[k].cost)k++;if(a[k].cost>=v.cost)break;a[p]=a[k];p=k;}a[p]=v;}return r;}
  get size(){return this.items.length;}
}

const geographicCache=new WeakMap();
function suitability(world){
  const {width:w,height:h,layers:l}=world,n=w*h,H=new Float32Array(n),S=new Float32Array(n),coast=new Uint8Array(n),rough=new Float32Array(n),inflow=new Uint8Array(n),frontier=new Float32Array(n),polar=new Uint8Array(n),seed=hashSeed(world.seed,'civilization-accessibility');
  for(let i=0;i<n;i++){const j=l.flowTo?.[i];if(j>=0&&l.river?.[i])inflow[j]++;}
  for(let i=0;i<n;i++){
    if(l.elevation[i]<=0)continue;let difference=0,water=0,lakes=0;neighbors(i,w,h,j=>{difference+=Math.abs(l.elevation[j]-l.elevation[i]);if(l.elevation[j]<=0)water++;if(l.lake?.[j])lakes++;});
    coast[i]=water?1:0;rough[i]=difference/4;
    const t=l.annualTemperature?.[i]??15,rain=l.annualPrecipitation?.[i]??1000,e=l.elevation[i],moist=(l.surfaceMoisture||l.soilMoisture)?.[i]??.5;
    const thermal=Math.exp(-(((t-16)/25)**2)),waterSupply=clamp(rain/750,.055,1.1)*Math.exp(-Math.max(0,rain-3400)/6000),river=Math.exp(-(l.riverDistance?.[i]??(l.river?.[i]?0:8))/2.8),fertile=clamp((l.alluvium?.[i]||0)*1.8+(l.floodplainFraction?.[i]||0),0,1),cover=BIOME_CAPACITY[l.biome?.[i]]??.6;
    const elevation=Math.exp(-e/5000),slope=Math.exp(-rough[i]/2400),freshwater=clamp(.65*waterSupply+.2*moist+.34*river+.18*(lakes>0),.06,1.2);
    let score=thermal*elevation*slope*(.37+.63*cover)*freshwater;
    score*=1+.18*coast[i]+.4*fertile;score+=.08*river*thermal*Math.exp(-e/2200);
    if(l.lake?.[i])score=0;
    H[i]=clamp(score,.00001,1);
    const u=(i%w+.5)/w,v=(Math.floor(i/w)+.5)/h,texture=fractalNoise(u,v,18,3,seed,.56),broad=fractalNoise(u,v,5,2,seed+177,.6);frontier[i]=clamp(1+texture*1.35+broad*.72,.34,1.9);
    const warmest=l.warmestTemperature?.[i]??t+12,latitude=Math.abs(v*180-90),fine=fractalNoise(u,v,48,2,seed+311,.5),envelope=clamp(68+broad*11+texture*5+fine*2+(coast[i]?-1:0)+Math.min(1.5,e/3000),65,77),coldEdge=Math.max(t+12,warmest-1.5)+texture*8+broad*12+fine*3-Math.min(3,e/1800)+(coast[i]?2:0);
    polar[i]=(latitude>envelope&&t<-8&&warmest<6&&H[i]<.11&&coldEdge<0)?1:0;
    const mouth=coast[i]&&river>.45?.32:0,confluence=inflow[i]>1?.2:0,harbor=water===1||water===2?.16:0,pass=e>700&&e<2300&&rough[i]<500?.06:0;
    S[i]=l.lake?.[i]?0:clamp(H[i]*(1+mouth+confluence+harbor+.12*(lakes>0)+pass)+.04*river,0,1.5);
  }
  // A claim must reach a warmer mainland or a genuinely habitable polar shore. This removes
  // isolated inland pockets created by a local temperature/noise fluctuation inside an ice cap.
  const reachable=new Uint8Array(n),queue=new Int32Array(n),harsh=!!world.meta.civilization?.settings.unclaimedHarsh;let head=0,tail=0;
  for(let i=0;i<n;i++){if(l.elevation[i]<=0||polar[i]||harsh&&l.elevation[i]>4500&&H[i]<.018)continue;const latitude=Math.abs((Math.floor(i/w)+.5)/h*180-90),t=l.annualTemperature?.[i]??15,warmest=l.warmestTemperature?.[i]??t+12,coastalRefuge=coast[i]&&t>-9&&warmest>6&&H[i]>.045;if(latitude<=64||coastalRefuge){reachable[i]=1;queue[tail++]=i;}}
  while(head<tail){const i=queue[head++];neighbors(i,w,h,j=>{if(reachable[j]||l.elevation[j]<=0||polar[j]||harsh&&l.elevation[j]>4500&&H[j]<.018)return;reachable[j]=1;queue[tail++]=j;});}
  for(let i=0;i<n;i++)if(l.elevation[i]>0&&!reachable[i]&&Math.abs((Math.floor(i/w)+.5)/h*180-90)>64)polar[i]=1;
  l.habitability=H;l.settlementPotential=S;const result={coast,rough,inflow,frontier,polar,polarReach:reachable,...naturalBarriers(world)};geographicCache.set(world,result);return result;
}

/** Natural frontier lines: ridge crests, divides between large drainage basins and
 * large rivers. Political and cultural fronts pay to cross them and later settle on
 * them, so borders follow mountains and rivers instead of wherever fronts collide. */
function naturalBarriers(world){
  const {width:w,height:h,layers:l}=world,n=w*h,crest=new Float32Array(n),river=new Float32Array(n),divide=new Float32Array(n),basinSize=new Map();
  const e=(x,y)=>y<0||y>=h?NaN:l.elevation[y*w+(x+w)%w];
  for(let i=0;i<n;i++)if(l.elevation[i]>0)basinSize.set(l.basin?.[i]||0,(basinSize.get(l.basin?.[i]||0)||0)+1);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,z=l.elevation[i];if(z<=0)continue;
    // A crest is a local maximum across some axis, at one or two cells' spacing.
    let best=0;for(const [dx,dy]of [[1,0],[0,1],[1,1],[1,-1]])for(const d of [1,2]){const a=e(x-dx*d,y-dy*d),b=e(x+dx*d,y+dy*d);if(!(a>0)||!(b>0))continue;best=Math.max(best,Math.min(z-a,z-b)/(d===1?1:1.7));}
    crest[i]=clamp(best/420,0,1)*clamp((z-220)/1100,0,1);
    const flow=l.river?.[i]?l.flow?.[i]||0:0;river[i]=flow>60?clamp(Math.log2(1+flow/110)/5,0,1.25):0;
    const size=basinSize.get(l.basin?.[i]||0)||0;divide[i]=clamp(Math.sqrt(size/90),0,1)*(.45+clamp(z/1600,0,1.1));
  }
  return {crest,riverBarrier:river,divide};
}
/** Barrier strength (≈0–2.5) of moving between neighbouring land cells i→j. */
export function naturalBarrier(world,geo,i,j,dx,dy){
  const l=world.layers,w=world.width;let b=Math.max(geo.crest[i],geo.crest[j]);
  const bi=l.basin?.[i],bj=l.basin?.[j];if(bi!==bj&&bi>0&&bj>0)b+=.5*Math.min(geo.divide[i],geo.divide[j]);
  const ri=geo.riverBarrier[i],rj=geo.riverBarrier[j];
  if(ri||rj){const c=ri>=rj?i:j,to=l.flowTo?.[c];let along=0;if(to>=0){const fx=wrappedDelta(to%w,c%w,w),fy=Math.floor(to/w)-Math.floor(c/w);along=Math.abs(dx*fx+dy*fy)/(Math.hypot(dx,dy)*Math.max(.01,Math.hypot(fx,fy)));}b+=Math.max(ri,rj)*(1-along)**1.5;}
  return b;
}
export function naturalBarrierField(world){return geographicCache.get(world)||suitability(world);}

function eligible(world,s,i){const l=world.layers;return l.elevation[i]>0&&!(s.unclaimedPolar&&geographicCache.get(world)?.polar[i])&&!(s.unclaimedHarsh&&l.elevation[i]>4500&&l.habitability[i]<.018);}
function landList(world,s){const out=[];for(let i=0;i<world.width*world.height;i++)if(eligible(world,s,i))out.push(i);return out;}
function chooseCenters(world,s,count,r,existingCities,kind='political'){
  const {width:w,height:h,layers:l}=world,land=landList(world,s),centers=[],used=new Set(),componentBest=new Map();count=Math.min(count,land.length);
  // Reserve a few plausible independent island and isolated mountain centers.
  for(const i of land){const id=l.landmass?.[i]||1,entry=componentBest.get(id);if(!entry)componentBest.set(id,{cell:i,count:1,score:l.settlementPotential[i]});else{entry.count++;if(l.settlementPotential[i]>entry.score){entry.cell=i;entry.score=l.settlementPotential[i];}}}
  const components=[...componentBest.values()].sort((a,b)=>b.count-a.count),small=components.filter(c=>c.count>2&&c.count<land.length/Math.max(10,count*.7)&&c.score>.08).sort((a,b)=>b.score-a.score);
  const add=i=>{if(!used.has(i)){used.add(i);centers.push(i);}};
  if(land.length) add(components[0]?.cell||land[0]);
  for(const c of small.slice(0,Math.min(Math.floor(count*.13),18)))add(c.cell);
  // Stochastic farthest-point sampling balances settlement value and geographic coverage.
  const attempts=Math.min(100,24+Math.floor(count/4)),minDistance=new Float32Array(land.length);minDistance.fill(Infinity);let processed=0;
  while(centers.length<count){
    while(processed<centers.length){const c=centers[processed++],cx=c%w,cy=Math.floor(c/w);for(let z=0;z<land.length;z++){const i=land[z],y=Math.floor(i/w),dx=wrappedDelta(i%w,cx,w)*Math.max(.2,Math.cos((y/h-.5)*Math.PI)),dy=y-cy,d=dx*dx+dy*dy;if(d<minDistance[z])minDistance[z]=d;}}
    let best=-1,bestScore=-1;
    for(let k=0;k<attempts;k++){const z=Math.floor(r()*land.length),i=land[z];if(used.has(i)||l.lake?.[i])continue;const suitability=.12+Math.pow(l.settlementPotential[i],.55),score=minDistance[z]*suitability*(.75+r()*.5);if(score>bestScore){best=i;bestScore=score;}}
    if(best<0){best=land.find(i=>!used.has(i));if(best===undefined)break;}add(best);
  }
  return centers;
}

function expand(world,s,centers,kind,geo,r){
  const {width:w,height:h,layers:l}=world,n=w*h,owner=new Uint16Array(n),dist=new Float64Array(n),seedOwner=new Uint16Array(n),q=new Queue(),area=new Float64Array(centers.length+1),strength=new Float64Array(centers.length+1),target=new Float64Array(centers.length+1),rows=Array.from({length:h},(_,y)=>rowArea(y,h)*AREA/(2*w));dist.fill(Infinity);
  let totalArea=0;for(let i=0;i<n;i++)if(eligible(world,s,i))totalArea+=rows[Math.floor(i/w)];
  let sumWeights=0;for(let k=1;k<=centers.length;k++){let weight=kind==='culture'?.65+r()*.8:Math.pow(.1+r(),-1.6*s.sizeInequality);target[k]=weight;sumWeights+=weight;}
  for(let k=1;k<=centers.length;k++){target[k]=totalArea*target[k]/sumWeights;strength[k]=kind==='culture'?1:clamp(Math.pow(target[k]/(totalArea/centers.length),.23),.42,3.4);const i=centers[k-1];seedOwner[i]=k;dist[i]=0;owner[i]=k;q.push(i,k,0);}
  while(q.size){const {cell:i,id,cost}=q.pop();if(cost!==dist[i]||owner[i]!==id)continue;const y=Math.floor(i/w),land=l.elevation[i]>0&&!l.lake?.[i];if(land)area[id]+=rows[y];
    travelNeighbors(i,w,h,(j,dx,dy)=>{
      if(seedOwner[j]&&seedOwner[j]!==id)return;
      const landJ=l.elevation[j]>0&&!l.lake?.[j],waterCross=!land||!landJ;
      let step;
      if(waterCross){step=(kind==='culture'?16:11)*(land!==landJ?2.5:1);}
      else {const e=(l.elevation[i]+l.elevation[j])/2,slope=Math.abs(l.elevation[i]-l.elevation[j]),arid=1-Math.min(l.habitability[i],l.habitability[j]),g=s.geographyInfluence;
        // Terrain friction (plateaus, deserts, slopes) keeps an irregular frontier texture;
        // crossing a crest, a major divide or a large river is a separate, much larger cost.
        step=(1+g*(slope/650+Math.max(0,e-900)/2300+arid*.85))*((geo.frontier[i]+geo.frontier[j])*.5);
        const barrier=naturalBarrier(world,geo,i,j,dx,dy);step+=barrier*g*g*(kind==='culture'?10:17);
        // Travel along a navigable river is cheaper, so river valleys unify.
        const channel=geo.riverBarrier[i]>=geo.riverBarrier[j]?i:j,to=l.flowTo?.[channel];
        if(geo.riverBarrier[channel]>.25&&l.river?.[i]&&l.river?.[j]&&to>=0)step*=1-.3*g;
        if(s.unclaimedPolar&&(geo.polar[i]||geo.polar[j]))step*=7;
        if(kind==='political'&&l.culture[i]!==l.culture[j])step*=1+s.culturalAffinity*1.65;
      }
      step*=Math.hypot(dx*Math.max(.25,Math.cos((y/h-.5)*Math.PI)),dy);
      // Overextended states slow down. Weighted fronts compete while every center remains protected.
      const over=kind==='political'?1+Math.max(0,area[id]/target[id]-1)*.18:1;
      const next=cost+step*over/strength[id];
      if(next<dist[j]){dist[j]=next;owner[j]=id;q.push(j,id,next);}
    });
  }
  relaxBorders(world,geo,owner,centers,area,rows,s.geographyInfluence);
  for(let i=0;i<n;i++)if(!eligible(world,s,i))owner[i]=0;
  return {owner,targets:target,strengths:strength};
}

/** Bounded border relaxation: a frontier cell changes side only when that moves
 * the boundary onto stronger natural barriers (or shortens it), never removing a
 * centre, never disconnecting a territory locally and never changing a region's
 * area by more than a small fraction. */
function relaxBorders(world,geo,owner,centers,area,rows,influence){
  if(influence<=0)return;
  const {width:w,height:h,layers:l}=world,n=w*h,fixed=new Set(centers),min=Float64Array.from(area,a=>a*.9),max=Float64Array.from(area,a=>a*1.1),ring=[[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]];
  const weight=(i,j,dx,dy)=>1-.92*clamp(naturalBarrier(world,geo,i,j,dx,dy)*influence,0,1);
  const at=(x,y)=>y<0||y>=h?-1:(y*w+(x+w)%w);
  for(let pass=0;pass<6;pass++){let changed=0;
    for(let i=0;i<n;i++){
      const a=owner[i];if(!a||fixed.has(i)||l.elevation[i]<=0)continue;const x=i%w,y=Math.floor(i/w);
      let bestB=0,bestDelta=-.12;
      for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const j=at(x+dx,y+dy);if(j<0)continue;const b=owner[j];if(!b||b===a||l.elevation[j]<=0)continue;
        let delta=0;for(const [ex,ey]of [[1,0],[-1,0],[0,1],[0,-1]]){const k=at(x+ex,y+ey);if(k<0||!owner[k]||l.elevation[k]<=0)continue;const wgt=weight(i,k,ex,ey);delta+=wgt*((owner[k]!==b)-(owner[k]!==a));}
        if(delta<bestDelta){bestDelta=delta;bestB=b;}}
      if(!bestB)continue;const cellArea=rows[y];if(area[a]-cellArea<min[a]||area[bestB]+cellArea>max[bestB])continue;
      // Simple-point test: the losing side stays one connected run around this cell.
      let runs=0,orth=0;for(let k=0;k<8;k++){const p=at(x+ring[k][0],y+ring[k][1]),q=at(x+ring[(k+7)%8][0],y+ring[(k+7)%8][1]),inP=p>=0&&owner[p]===a,inQ=q>=0&&owner[q]===a;if(inP&&!inQ)runs++;if(inP&&k%2)orth++;}
      if(runs!==1||!orth)continue;
      owner[i]=bestB;area[a]-=cellArea;area[bestB]+=cellArea;changed++;
    }
    if(!changed)break;
  }
}

function cultures(world,s,geo){
  const civ=world.meta.civilization,r=seededRandom(`${world.seed}:${s.seed}`,'homelands'),centers=chooseCenters(world,s,s.cultureCount,r,null,'culture');
  const familyCenters=centers.slice(0,Math.min(s.familyCount,centers.length));
  civ.families=familyCenters.map((cell,k)=>{const language=createLanguage(`${world.seed}:${s.seed}:family`,k+1,k+1,null,{accents:s.accentedLetters});return {id:k+1,name:exonym(generateName(language,s.seed,`family:${k}`,'culture')),color:color(k+1,s.seed,39,56),homeland:cell,language};});
  civ.cultures=centers.map((cell,k)=>{const x=cell%world.width,y=Math.floor(cell/world.width);let best=0,bd=Infinity;for(let f=0;f<familyCenters.length;f++){const i=familyCenters[f],d=wrappedDelta(x,i%world.width,world.width)**2+(y-Math.floor(i/world.width))**2;if(d<bd){bd=d;best=f;}}const family=civ.families[best],language=createLanguage(`${world.seed}:${s.seed}`,family.id,k+1,family.language,{accents:s.accentedLetters});return {id:k+1,name:generateName(language,s.seed,`culture:${k}`,'culture'),language,family:family.id,color:color(k+1,s.seed+'culture',47,62),homeland:cell,manual:{}};});
  world.layers.culture=expand(world,s,centers,'culture',geo,r).owner;
  // Border minorities and small maritime settlement diasporas coexist with the dominant homeland.
  const l=world.layers,n=world.width*world.height,minority=new Uint16Array(n),share=new Float32Array(n);for(let i=0;i<n;i++)if(l.culture[i]){let other=0;neighbors(i,world.width,world.height,j=>{if(l.culture[j]&&l.culture[j]!==l.culture[i])other=l.culture[j];});if(other){minority[i]=other;share[i]=.08+r()*.19;}else if(geo.coast[i]&&r()<.035){const candidate=1+Math.floor(r()*civ.cultures.length);if(candidate!==l.culture[i]){minority[i]=candidate;share[i]=.04+r()*.11;}}}l.cultureMinority=minority;l.minorityShare=share;
  generateLanguageGeography(world,s,geo);
}

export function ensureCivilizationLanguages(world){
  const civ=world.meta?.civilization;if(!civ)return world;const l=world.layers,n=world.width*world.height,byId=new Map((civ.languages||[]).map(language=>[language.id,language]));
  for(const culture of civ.cultures){const original=culture.language||createLanguage(civ.seed,culture.family,culture.id),id=original.id||culture.id;original.id=id;if(!original.family||!civ.families.some(f=>f.id===original.family))original.family=culture.family;let language=byId.get(id);if(!language){language=original;byId.set(id,language);}if(!language.lexicon){const generated=createLanguage(`${civ.seed}:lexicon`,language.family,id);language.lexicon=generated.lexicon;language.soundChanges||=[];}language.color||=paletteColor(id,civ.seed+'languages',civ.settings?.palette,civ.settings?.paletteSaturation||1);language.manual||={};culture.language=language;}
  civ.languages=[...byId.values()].sort((a,b)=>a.id-b.id);for(const language of civ.languages)normalizeLanguagePhonology(language);for(const family of civ.families||[])if(family.language)normalizeLanguagePhonology(family.language);const preferred=new Map(civ.cultures.map(c=>[c.id,c.language.id]));
  if(!(l.language instanceof Uint16Array)||l.language.length!==n){l.language=new Uint16Array(n);for(let i=0;i<n;i++)l.language[i]=preferred.get(l.culture[i])||0;}
  if(!(l.languageMinority instanceof Uint16Array)||l.languageMinority.length!==n){l.languageMinority=new Uint16Array(n);for(let i=0;i<n;i++)l.languageMinority[i]=preferred.get(l.cultureMinority?.[i])||0;}
  if(!(l.languageMinorityShare instanceof Float32Array)||l.languageMinorityShare.length!==n){l.languageMinorityShare=new Float32Array(n);for(let i=0;i<n;i++)l.languageMinorityShare[i]=l.languageMinority[i]?(l.minorityShare?.[i]||.12):0;}
  for(let i=0;i<n;i++){if(l.elevation[i]<=0||!l.culture[i]){l.language[i]=0;l.languageMinority[i]=0;l.languageMinorityShare[i]=0;}else if(!byId.has(l.language[i]))l.language[i]=preferred.get(l.culture[i])||0;if(l.languageMinority[i]&&(!byId.has(l.languageMinority[i])||l.languageMinority[i]===l.language[i])){l.languageMinority[i]=0;l.languageMinorityShare[i]=0;}}
  return world;
}
function generateLanguageGeography(world,s,geo){
  const civ=world.meta.civilization,l=world.layers,n=world.width*world.height,w=world.width,h=world.height,r=seededRandom(`${world.seed}:${s.seed}`,'language-contact');civ.languages=civ.cultures.map(c=>({...c.language,color:paletteColor(c.id,s.seed+'languages',s.palette,s.paletteSaturation),role:'vernacular'}));
  const byId=new Map(civ.languages.map(a=>[a.id,a]));for(const culture of civ.cultures)culture.language=byId.get(culture.language.id);
  const familyTrade=new Map();for(const family of civ.families){const id=civ.languages.length+1,language=createLanguage(`${world.seed}:${s.seed}:trade`,family.id,id,family.language,{accents:s.accentedLetters});language.role='trade language';language.color=paletteColor(id,s.seed+'languages',s.palette,s.paletteSaturation);language.homeland=family.homeland;language.homelands=[];civ.languages.push(language);byId.set(id,language);familyTrade.set(family.id,id);}
  const culturesById=new Map(civ.cultures.map(c=>[c.id,c])),majority=new Uint16Array(n),minority=new Uint16Array(n),share=new Float32Array(n),regional=new Float32Array(n),families=new Map(),ports=[],seed=hashSeed(`${world.seed}:${s.seed}`,'language-adoption');
  for(let i=0;i<n;i++){const culture=culturesById.get(l.culture[i]);if(!culture)continue;majority[i]=culture.language.id;const other=culturesById.get(l.cultureMinority?.[i]);minority[i]=other?.language.id||0;share[i]=minority[i]?(l.minorityShare?.[i]||.12):0;
    const u=(i%w+.5)/w,v=(Math.floor(i/w)+.5)/h;regional[i]=fractalNoise(u,v,9,2,seed,.58);if(!families.has(culture.family))families.set(culture.family,{count:0,candidates:[]});const family=families.get(culture.family);family.count++;
    if(!l.lake?.[i]&&l.habitability[i]>.025){const coast=!!geo.coast[i],river=(l.riverDistance?.[i]??99)<3,score=(l.settlementPotential[i]+.12)*(coast?1.35:river?1.1:.72)*(.82+r()*.36),candidate={cell:i,score,coast,river,family:culture.family};family.candidates.push(candidate);if(coast)ports.push(candidate);}
  }
  const distance=new Float64Array(n),contactLanguage=new Uint16Array(n),ranges=new Map(),queue=new Queue(),protectedSeeds=new Uint8Array(n);distance.fill(Infinity);const pointDistance=(a,b)=>Math.hypot(wrappedDelta(a%w,b%w,w),Math.floor(a/w)-Math.floor(b/w));
  function anchor(cell,id,cost=0){if(!l.culture[cell]||l.lake?.[cell]||cost>=distance[cell])return;distance[cell]=cost;contactLanguage[cell]=id;protectedSeeds[cell]=1;queue.push(cell,id,cost);byId.get(id).homelands.push(cell);}
  // Ports establish a few regional speech communities, rather than recoloring every shoreline cell.
  for(const [familyId,family]of families){const id=familyTrade.get(familyId),range=clamp(Math.sqrt(family.count)*(.30+r()*.09),5,w*.13);ranges.set(id,range);family.candidates.sort((a,b)=>b.score-a.score);const origin=family.candidates.find(a=>a.coast||a.river)||family.candidates[0];if(!origin)continue;anchor(origin.cell,id);byId.get(id).homeland=origin.cell;
    const distant=family.candidates.find(a=>a.coast&&pointDistance(a.cell,origin.cell)>range*3.2&&(l.landmass?.[a.cell]!==l.landmass?.[origin.cell]||family.count>n*.035));if(distant&&r()<.7)anchor(distant.cell,id,.12);
    if(r()<.34){const migrant=ports.filter(a=>a.family!==familyId&&pointDistance(a.cell,origin.cell)>range*2&&pointDistance(a.cell,origin.cell)<w*.42).sort((a,b)=>b.score-a.score)[0];if(migrant)anchor(migrant.cell,id,.32);}
  }
  while(queue.size){const {cell:i,id,cost}=queue.pop();if(distance[i]!==cost||contactLanguage[i]!==id||cost>1.35)continue;const language=byId.get(id),range=ranges.get(id)||5;
    travelNeighbors(i,w,h,(j,dx,dy)=>{if(!l.culture[j]||l.lake?.[j]||protectedSeeds[j]&&contactLanguage[j]!==id)return;const culture=culturesById.get(l.culture[j]),slope=Math.abs(l.elevation[i]-l.elevation[j]),elevation=(l.elevation[i]+l.elevation[j])*.5;let step=.64+Math.max(0,elevation-500)/4300+slope/1400+(1-l.habitability[j])*.36;step*=culture.family===language.family?1:1.28;if((l.riverDistance?.[i]??99)<3&&(l.riverDistance?.[j]??99)<3)step*=.78;step*=.82+(geo.frontier?.[j]||1)*.18;const next=cost+step*Math.hypot(dx,dy)/range;if(next<1.35&&next<distance[j]){distance[j]=next;contactLanguage[j]=id;queue.push(j,id,next);}});
  }
  for(let i=0;i<n;i++){if(!l.culture[i]||!contactLanguage[i])continue;const id=contactLanguage[i],native=majority[i],limit=.94+regional[i]*.42;if(distance[i]<limit){majority[i]=id;minority[i]=native;share[i]=.18+r()*.18;}else if(distance[i]<limit+.24){minority[i]=id;share[i]=.05+.19*Math.max(0,1-(distance[i]-limit)/.24);}if(minority[i]===majority[i]){minority[i]=0;share[i]=0;}}
  // A small majority filter removes isolated stair-step specks without repainting a coastline band.
  for(let pass=0;pass<2;pass++){const next=majority.slice();for(let i=0;i<n;i++){if(!l.culture[i]||protectedSeeds[i])continue;const counts=new Map();neighbors(i,w,h,j=>{if(l.culture[j])counts.set(majority[j],(counts.get(majority[j])||0)+1);});for(const [id,count]of counts)if(count>=3&&id!==majority[i]){next[i]=id;minority[i]=majority[i];share[i]=Math.max(.14,share[i]);break;}}majority.set(next);}
  l.language=majority;l.languageMinority=minority;l.languageMinorityShare=share;ensureCivilizationLanguages(world);
}

/** Founding-era contact: material prosperity chooses hubs; geography limits their hinterlands.
 * Called explicitly after profiles/routes for all/culture generation, never on ordinary edits. */
export function refreshLanguageContact(world){
  const civ=world.meta?.civilization;if(!civ?.cultures?.length)return world;ensureCivilizationLanguages(world);const l=world.layers,w=world.width,h=world.height,n=w*h,s=civ.settings,geo=geographicCache.get(world)||suitability(world),seed=hashSeed(`${world.seed}:${civ.seed}`,'economic-language-contact'),r=seededRandom(`${world.seed}:${civ.seed}`,'economic-language-contact'),culturesById=new Map(civ.cultures.map(c=>[c.id,c])),languagesById=new Map(civ.languages.map(a=>[a.id,a])),nationsById=new Map(civ.nations.map(a=>[a.id,a])),citiesById=new Map(civ.cities.map(a=>[a.id,a])),native=new Uint16Array(n),majority=new Uint16Array(n),minority=new Uint16Array(n),shares=new Float32Array(n),regional=new Float32Array(n),stats=new Map(),familyStats=new Map(),tradeLanguages=new Map();
  const empty=()=>({cells:0,population:0,development:0,developmentWeight:0,cities:[],tradeVolume:0});
  for(const language of civ.languages){language.contactOrigins=[];if(language.role==='trade language'){language.homelands=[];tradeLanguages.set(language.family,language);}}
  for(let i=0;i<n;i++){const culture=culturesById.get(l.culture[i]);if(!culture||l.elevation[i]<=0)continue;const language=culture.language,id=language.id,family=language.family||culture.family;if(!stats.has(id))stats.set(id,empty());if(!familyStats.has(family))familyStats.set(family,empty());for(const a of [stats.get(id),familyStats.get(family)]){a.cells++;a.population+=l.population?.[i]||0;}native[i]=majority[i]=id;const other=culturesById.get(l.cultureMinority?.[i]);minority[i]=other?.language.id||0;shares[i]=minority[i]!==id?(l.minorityShare?.[i]||.12):0;if(minority[i]===id)minority[i]=0;regional[i]=fractalNoise((i%w+.5)/w,(Math.floor(i/w)+.5)/h,10,2,seed,.6);}
  const traffic=new Map();for(const route of civ.tradeRoutes||[])for(const id of [route.from,route.to])traffic.set(id,(traffic.get(id)||0)+Math.max(0,route.volume||0));
  for(const city of civ.cities){const culture=culturesById.get(l.culture[city.cell]),language=culture?.language;if(!language||!native[city.cell])continue;const nation=nationsById.get(l.ownership[city.cell]||city.nation),profile=nation?.economicProfile||{},technology=clamp(nation?.technology??s.technologyLevel??.6,0,1),productivity=Math.max(500,nation?.baseProductivity||city.productivity||10000),education=clamp(profile.education??.5,0,1),infrastructure=clamp(profile.infrastructure??.5,0,1),development=clamp(technology*.38+Math.log1p(productivity/1000)/Math.log(81)*.32+education*.2+infrastructure*.1,.05,1.15),access=clamp(l.tradeAccess?.[city.cell]??city.tradeAccess??.25,0,1),volume=traffic.get(city.id)||0,commercial=(city.port?1.2:1)*(.6+access*.7)*(1+Math.log1p(volume)/45),score=Math.sqrt(Math.max(1,city.population))*(.3+development)*commercial,entry={city,id:language.id,family:language.family||culture.family,development,access,volume,score,commercial};
    for(const a of [stats.get(language.id),familyStats.get(entry.family)])if(a){const weight=Math.sqrt(Math.max(1,city.population));a.cities.push(entry);a.development+=development*weight;a.developmentWeight+=weight;a.tradeVolume+=volume;}
  }
  for(const a of [...stats.values(),...familyStats.values()]){a.development=a.developmentWeight?a.development/a.developmentWeight:.25;a.cities.sort((a,b)=>b.score-a.score||a.city.id-b.city.id);}
  const ranges=new Map(),originFamily=new Map(),distance=new Float64Array(n),contact=new Uint16Array(n),protectedSeeds=new Uint8Array(n),queue=new Queue(),sources=[],occupiedCities=new Set();distance.fill(Infinity);const cellDistance=(a,b)=>Math.hypot(wrappedDelta(a%w,b%w,w),Math.floor(a/w)-Math.floor(b/w));
  function source(cell,id,cost,city,kind,protect=true){if(!native[cell]||l.lake?.[cell]||cost>=distance[cell]||protectedSeeds[cell]&&contact[cell]!==id)return false;distance[cell]=cost;contact[cell]=id;protectedSeeds[cell]=protect?1:0;queue.push(cell,id,cost);const entry={cell,city:city?.id||0,kind};sources.push({...entry,language:id});const language=languagesById.get(id);language?.contactOrigins.push(entry);if(language?.role==='trade language')language.homelands.push(cell);return true;}
  // Commercial common tongues have one strong heartland per family, not one seed per coast cell.
  for(const [family,a]of familyStats){const language=tradeLanguages.get(family);if(!language)continue;const candidates=a.cities.filter(c=>c.volume>0||c.city.port||(l.riverDistance?.[c.city.cell]??99)<4),hub=candidates[0]||a.cities[0],development=a.development,range=clamp(Math.sqrt(a.cells)*(.16+development*.29)*(hub?.access!==undefined?.85+hub.access*.35:1),Math.max(2,w/160),w*.19);ranges.set(language.id,range);originFamily.set(language.id,family);language.contactDevelopment=development;language.contactRange=range;language.contactTradeVolume=a.tradeVolume;
    if(hub){source(hub.city.cell,language.id,-.04*development,hub.city,'commercial heartland');occupiedCities.add(hub.city.id);language.homeland=hub.city.cell;}else{const familyHome=civ.families.find(f=>f.id===family)?.homeland;if(familyHome!==undefined)source(familyHome,language.id,.12,null,'regional homeland');}
  }
  // Prosperous vernacular hubs can also attract neighboring populations across cultural borders.
  for(const [id,a]of stats){const language=languagesById.get(id),development=a.development,range=clamp(Math.sqrt(a.cells)*(.11+development*.17),Math.max(2,w/220),w*.14);ranges.set(id,range);originFamily.set(id,language.family);language.contactDevelopment=development;language.contactRange=range;language.contactTradeVolume=a.tradeVolume;const hub=a.cities.find(c=>!occupiedCities.has(c.city.id));if(hub){source(hub.city.cell,id,.06,hub.city,'vernacular hub');occupiedCities.add(hub.city.id);}else{const homeland=civ.cultures.find(c=>c.language.id===id)?.homeland;if(homeland!==undefined&&!protectedSeeds[homeland])source(homeland,id,.08,null,'vernacular homeland');}}
  // Only real links establish overseas communities. Higher-development exporters gain larger
  // receiving hinterlands; weaker partners usually retain a bilingual trading minority.
  const migrations=[],perLanguage=new Map(),migrationBudget=Math.min(36,Math.max(4,Math.round(Math.sqrt(civ.cities.length)*1.3)));
  for(const route of civ.tradeRoutes||[]){const from=citiesById.get(route.from),to=citiesById.get(route.to);if(!from||!to)continue;for(const [origin,destination]of [[from,to],[to,from]]){const culture=culturesById.get(l.culture[origin.cell]),other=culturesById.get(l.culture[destination.cell]);if(!culture||!other||culture.language.id===other.language.id)continue;const family=culture.language.family||culture.family,base=familyStats.get(family),own=stats.get(culture.language.id),destinationPower=stats.get(other.language.id)?.development??.4,language=tradeLanguages.get(family)||culture.language,power=base?.development??own?.development??.25,score=Math.log1p(Math.max(0,route.volume||0))*(.4+power)*((route.kind==='maritime'||origin.port||destination.port)?1.15:1);migrations.push({language:language.id,origin,destination,power,destinationPower,route,score});}}
  migrations.sort((a,b)=>b.score-a.score||a.route.id-b.route.id||a.language-b.language);let migrationCount=0;const receivers=new Set();for(const m of migrations){if(migrationCount>=migrationBudget)break;const used=perLanguage.get(m.language)||0;if(used>=1+Math.round(m.power*2)||receivers.has(m.destination.id))continue;const range=ranges.get(m.language)||3;if(cellDistance(m.origin.cell,m.destination.cell)<range*1.5)continue;let cell=m.destination.cell;if(protectedSeeds[cell]){const nearby=[];for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const y=Math.floor(cell/w)+dy;if(y<0||y>=h)continue;const i=y*w+(cell%w+dx+w)%w;if(native[i]&&!l.lake?.[i]&&!protectedSeeds[i])nearby.push(i);}nearby.sort((a,b)=>(l.settlementPotential?.[b]||0)-(l.settlementPotential?.[a]||0)||a-b);cell=nearby[0]??cell;}
    const weaker=m.power<m.destinationPower*.72,cost=weaker?1.03:clamp(.34+(m.destinationPower-m.power)*.45+(m.route.cost||0)/50000,.12,.85);if(source(cell,m.language,cost,m.destination,weaker?'trading minority':'trade diaspora',false)){perLanguage.set(m.language,used+1);receivers.add(m.destination.id);migrationCount++;}}
  while(queue.size){const {cell:i,id,cost}=queue.pop();if(distance[i]!==cost||contact[i]!==id||cost>1.4)continue;const family=originFamily.get(id),range=ranges.get(id)||3;travelNeighbors(i,w,h,(j,dx,dy)=>{if(!native[j]||l.lake?.[j]||protectedSeeds[j]&&contact[j]!==id)return;const culture=culturesById.get(l.culture[j]),slope=Math.abs(l.elevation[i]-l.elevation[j]),height=(l.elevation[i]+l.elevation[j])*.5;let step=.65+Math.max(0,height-600)/4400+slope/1250+(1-l.habitability[j])*.32;step*=culture.language.family===family?1:1.22;if((l.riverDistance?.[i]??99)<4&&(l.riverDistance?.[j]??99)<4)step*=.8;step*=.84+(geo.frontier?.[j]||1)*.16;const next=cost+step*Math.hypot(dx,dy)/range;if(next<1.4&&next<distance[j]){distance[j]=next;contact[j]=id;queue.push(j,id,next);}});}
  for(let i=0;i<n;i++){if(!native[i]||!contact[i])continue;const id=contact[i],limit=.94+regional[i]*.4;if(id!==native[i]&&distance[i]<limit){majority[i]=id;minority[i]=native[i];shares[i]=.19+r()*.17;}else if(id!==native[i]&&distance[i]<limit+.26){minority[i]=id;shares[i]=.05+.19*Math.max(0,1-(distance[i]-limit)/.26);}}
  for(let pass=0;pass<2;pass++){const next=majority.slice();for(let i=0;i<n;i++){if(!native[i]||protectedSeeds[i])continue;const counts=new Map();neighbors(i,w,h,j=>{if(native[j])counts.set(majority[j],(counts.get(majority[j])||0)+1);});for(const [id,count]of counts)if(count>=3&&id!==majority[i]){next[i]=id;minority[i]=majority[i];shares[i]=Math.max(.14,shares[i]);break;}}majority.set(next);}
  l.language=majority;l.languageMinority=minority;l.languageMinorityShare=shares;ensureCivilizationLanguages(world);
  for(const city of civ.cities){city.language=majority[city.cell]||city.language;if(!city.manual?.name){const toponym=settlementToponym(world,city.cell,city.id);city.name=toponym.name;city.nameMeaning=toponym.meaning;city.nameRoots=toponym.roots;}}
  ensureUniqueCivilizationNames(world);civ.languageContact={version:2,seed:civ.seed,source:'economic hubs and trade routes',sources,migrations:migrationCount};return world;
}

export function migrateCivilization(world){const civ=world.meta?.civilization;if(!civ)return world;civ.settings=normalizeCivSettings(civ.settings);ensureCivilizationLanguages(world);const ids=new Set(civ.languages.map(language=>language.id));for(const nation of civ.nations)if(!ids.has(nation.officialLanguage))nation.officialLanguage=world.layers.language[nation.center]||civ.cultures.find(c=>c.id===nation.cultures?.[0]?.id)?.language.id||civ.languages[0]?.id||0;ensureUniqueCivilizationNames(world);migrateSociety(world);return world;}

/** Potential rural density (people/km² at an average level of development).
 * Growing season, water, heat, terrain and soil multiply, so tundra, ice caps,
 * deserts away from rivers and high mountains stay sparse at any world population,
 * while river floodplains, deltas and temperate/tropical lowlands support millions. */
export function carryingDensity(world,i){
  const l=world.layers;if(l.elevation[i]<=0||l.lake?.[i])return 0;
  const biome=l.biome?.[i],t=l.annualTemperature?.[i]??15,warm=l.warmestTemperature?.[i]??t+10,rain=l.annualPrecipitation?.[i]??900,e=l.elevation[i];
  if(biome===13)return .02;
  const smooth=(a,b,x)=>{const k=clamp((x-a)/(b-a),0,1);return k*k*(3-2*k);};
  const growing=.004+smooth(5,19,warm)**1.35*(1-.35*smooth(4,-14,t)),heat=Math.exp(-Math.max(0,t-27)/7);
  const river=Math.exp(-(l.riverDistance?.[i]??(l.river?.[i]?0:9))/2.2),fertile=clamp((l.alluvium?.[i]||0)*1.8+(l.floodplainFraction?.[i]||0),0,1);
  // Large rivers irrigate otherwise arid valleys (Nile/Indus-like corridors).
  const water=Math.max(.02+.98*smooth(120,900,rain)*Math.exp(-Math.max(0,rain-3600)/5000),river*(.25+.7*fertile));
  const terrain=Math.exp(-Math.max(0,e-1500)/1300)*Math.exp(-(geographicCache.get(world)?.rough[i]||0)/2300),cover=.3+.7*(BIOME_CAPACITY[biome]??.6),coast=geographicCache.get(world)?.coast[i]?1.25:1;
  return .25+420*growing*heat*water*terrain*cover*coast*(1+1.1*fertile);
}

/** Smooth, low-frequency regional history shared by neighbouring nations. */
function regionalHistory(world,s,cell){const u=(cell%world.width+.5)/world.width,v=(Math.floor(cell/world.width)+.5)/world.height;return clamp(fractalNoise(u,v,3,2,hashSeed(`${world.seed}:${s.seed}`,'population-regions'),.55)*2.2,-1.6,1.6);}
function normal(random){return Math.sqrt(-2*Math.log(Math.max(1e-9,random())))*Math.cos(Math.PI*2*random());}

function distributePopulation(world,s){
  const {width:w,height:h,layers:l}=world,n=w*h,civ=world.meta.civilization,pop=new Float64Array(n),capacity=new Float64Array(n),rows=Array.from({length:h},(_,y)=>rowArea(y,h)*AREA/(2*w));
  const nationalCapacity=new Map(),inequality=s.populationInequality,density=s.totalPopulation/(world.meta.statistics?.landArea||AREA*(world.meta.statistics?.landShare??.31)),pressure=clamp(Math.log10(1+density)/5,0,.8);
  // Concentration shapes how strongly people gather on the best land inside a country.
  const exponent=clamp((s.distribution==='balanced'?.78:s.distribution==='concentrated'?1.28:1)+(s.populationConcentration-.55)*.7-pressure*.18,.45,1.7),local=new Float64Array(n),localSum=new Map();
  for(let i=0;i<n;i++){const owner=l.ownership?.[i];if(!owner||!eligible(world,s,i)||l.lake?.[i])continue;const k=rows[Math.floor(i/w)]*carryingDensity(world,i);capacity[i]=k;nationalCapacity.set(owner,(nationalCapacity.get(owner)||0)+k);const texture=.9+.2*Math.sin(i%w/w*23+Math.floor(i/w)/h*17+hashSeed(s.seed)%13)**2;local[i]=Math.pow(k/rows[Math.floor(i/w)],exponent)*rows[Math.floor(i/w)]*texture;localSum.set(owner,(localSum.get(owner)||0)+local[i]);}
  const nations=civ.nations.filter(nation=>nationalCapacity.get(nation.id)>0),totalCapacity=nations.reduce((sum,nation)=>sum+nationalCapacity.get(nation.id),0);
  if(!totalCapacity)throw new Error('No habitable land is available for civilization. Try another geography or allow polar ownership.');
  // National histories: a bounded multiplier that is regionally correlated and leans
  // toward large, fertile countries. Capacity always dominates; tiny or frozen states
  // cannot outgrow their land, and similar neighbours stay within a few times each other.
  const logs=nations.map(nation=>Math.log(nationalCapacity.get(nation.id))),mean=logs.reduce((a,b)=>a+b,0)/logs.length,spread=Math.sqrt(logs.reduce((a,b)=>a+(b-mean)**2,0)/logs.length)||1,sigma=1.05*inequality;
  const weights=new Map(),average=s.totalPopulation/totalCapacity;
  nations.forEach((nation,k)=>{const random=seededRandom(`${world.seed}:${s.seed}`,`population-history:${nation.id}`),zeta=clamp((.3+.5*inequality)*(logs[k]-mean)/spread+.5*regionalHistory(world,s,nation.center??0)+.72*normal(random),-1.7,1.7);nation.populationHistory=+zeta.toFixed(3);weights.set(nation.id,nationalCapacity.get(nation.id)*Math.exp(sigma*zeta));});
  // Water-filling between a floor and a ceiling of the national carrying capacity.
  const ceiling=2.1+2.6*inequality,floor=Math.max(.06,.42-.34*inequality),budget=new Map(),fixed=new Set();let remaining=s.totalPopulation;
  for(let pass=0;pass<40;pass++){
    const free=nations.filter(nation=>!fixed.has(nation.id)),sum=free.reduce((a,nation)=>a+weights.get(nation.id),0);if(!free.length||sum<=0)break;let changed=false;
    for(const nation of free){const k=nationalCapacity.get(nation.id),value=remaining*weights.get(nation.id)/sum,lo=k*average*floor,hi=k*average*ceiling;if(value>hi||value<lo){budget.set(nation.id,value>hi?hi:lo);fixed.add(nation.id);changed=true;}}
    if(!changed){for(const nation of free)budget.set(nation.id,remaining*weights.get(nation.id)/sum);break;}
    remaining=s.totalPopulation-[...fixed].reduce((a,id)=>a+budget.get(id),0);
    if(remaining<0){const scale=s.totalPopulation/[...fixed].reduce((a,id)=>a+budget.get(id),0);for(const id of fixed)budget.set(id,budget.get(id)*scale);remaining=0;break;}
  }
  // Integer residents, totals conserved exactly.
  let assigned=0;const used=new Map(),best=new Map();
  for(const nation of nations){nation.carryingCapacity=Math.round(nationalCapacity.get(nation.id)*average);budget.set(nation.id,Math.floor(budget.get(nation.id)||0));assigned+=budget.get(nation.id);}
  const largest=nations.reduce((a,b)=>budget.get(b.id)>budget.get(a.id)?b:a,nations[0]);budget.set(largest.id,budget.get(largest.id)+s.totalPopulation-assigned);
  for(let i=0;i<n;i++)if(local[i]){const id=l.ownership[i],amount=Math.floor(budget.get(id)*local[i]/localSum.get(id));pop[i]=amount;used.set(id,(used.get(id)||0)+amount);if(!best.has(id)||local[i]>local[best.get(id)])best.set(id,i);}
  for(const [id,value]of budget)if(best.has(id))pop[best.get(id)]+=value-(used.get(id)||0);
  l.population=pop;
}

function identity(world,s,id,cell,r){
  const civ=world.meta.civilization,local=civ.cultures.find(c=>c.id===world.layers.culture[cell])||civ.cultures[0],language=local.language,gov=GOVERNMENTS[Math.floor(r()*GOVERNMENTS.length)],name=generateName(language,`${world.seed}:${s.seed}`,`nation:${id}`,'nation'),long=r()<.7&&gov[3]?`${gov[3]} ${name}`:name;
  return {id,name,officialName:long,code:`N${String(id).padStart(3,'0')}`,color:paletteColor(id,s.seed+'nations',s.palette,s.paletteSaturation),government:gov[0],ideology:gov[2],leader:{name:generatePersonName(language,`${world.seed}:${s.seed}`,`leader:${id}`),title:gov[1],age:32+Math.floor(r()*45)},flag:generateFlag(`${world.seed}:${s.seed}:nation:${id}`),capital:0,center:cell,officialLanguage:language.id,population:0,area:0,density:0,urbanization:0,cultures:[],languages:[],settlements:[],label:xy(cell,world.width),manual:{}};
}

function nations(world,s,geo){
  const civ=world.meta.civilization,r=seededRandom(`${world.seed}:${s.seed}`,'political-centers'),centers=chooseCenters(world,s,s.nationCount,r,civ.cities),result=expand(world,s,centers,'political',geo,r);world.layers.ownership=result.owner;
  repairPolarSettlements(world,centers,geo);
  civ.nations=centers.map((cell,k)=>identity(world,s,k+1,cell,r));
}

function repairPolarSettlements(world,centers,geo){
  const civ=world.meta.civilization,l=world.layers,w=world.width,h=world.height,n=w*h,displaced=civ.cities.filter(c=>l.elevation[c.cell]>0&&!l.ownership[c.cell]),orphaned=l.population?.some((pop,i)=>pop>0&&l.elevation[i]>0&&!l.ownership[i]);if(!displaced.length&&!orphaned)return;if(!centers.length)throw new Error('No accessible land remains under these claim settings. Allow polar claims or regenerate civilization.');
  const toward=new Int32Array(n),origin=new Int32Array(n),queue=new Int32Array(n),claimed=[];toward.fill(-1);origin.fill(-1);let head=0,tail=0;
  for(let i=0;i<n;i++)if(l.ownership[i]&&!l.lake?.[i]){origin[i]=i;queue[tail++]=i;claimed.push(i);}
  while(head<tail){const i=queue[head++];neighbors(i,w,h,j=>{if(l.elevation[j]<=0||origin[j]>=0)return;origin[j]=origin[i];toward[j]=i;queue[tail++]=j;});}
  const closest=cell=>{if(origin[cell]>=0)return origin[cell];let best=claimed[0],distance=Infinity;for(const i of claimed){const d=wrappedDelta(i%w,cell%w,w)**2+(Math.floor(i/w)-Math.floor(cell/w))**2;if(d<distance){distance=d;best=i;}}return best;},occupied=new Set(civ.cities.filter(c=>l.ownership[c.cell]).map(c=>c.cell));
  const paint=(cell,owner,culture,language)=>{l.ownership[cell]=owner;if(!l.culture[cell])l.culture[cell]=culture;if(l.language&&!l.language[cell])l.language[cell]=language;};
  for(const city of displaced){const source=closest(city.cell),owner=l.ownership[source],culture=l.culture[source]||city.culture||civ.cultures[0]?.id||0,language=l.language?.[source]||city.language||civ.cultures.find(c=>c.id===culture)?.language.id||0,custom=Object.values(city.manual||{}).some(Boolean);
    if(custom){let i=city.cell,path=[];if(origin[i]>=0){for(let guard=0;guard<n&&!l.ownership[i];guard++){path.push(i);i=toward[i];if(i<0)break;}}
      else{const previous=new Int32Array(n),seen=new Uint8Array(n),search=new Int32Array(n);previous.fill(-1);let a=0,b=0,coast=-1;search[b++]=i;seen[i]=1;while(a<b&&coast<0){const cell=search[a++];if(geo.coast[cell]){coast=cell;break;}neighbors(cell,w,h,j=>{if(l.elevation[j]<=0||seen[j])return;seen[j]=1;previous[j]=cell;search[b++]=j;});}for(let cell=coast;cell>=0;cell=previous[cell]){path.push(cell);if(cell===city.cell)break;}}
      for(const cell of path){paint(cell,owner,culture,language);neighbors(cell,w,h,j=>{if(l.elevation[j]>0&&(!l.ownership[j]||l.ownership[j]===owner))paint(j,owner,culture,language);});}if(!path.length)paint(city.cell,owner,culture,language);city.manual.claimAccess=true;
    }else{let target=source,best=-Infinity;for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){const y=Math.floor(source/w)+dy;if(y<0||y>=h)continue;const i=y*w+(source%w+dx+w)%w;if(!l.ownership[i]||l.lake?.[i]||occupied.has(i))continue;const score=(l.settlementPotential[i]||0)*2+(l.habitability[i]||0)-Math.hypot(dx,dy)*.006;if(score>best){best=score;target=i;}}
      let residents=0;if(l.population){const f=cityFootprint(city);for(let k=0;k<f.length;k+=2){const amount=Math.min(l.population[f[k]]||0,f[k+1]);l.population[f[k]]-=amount;residents+=amount;}l.population[target]+=residents;}city.footprint=[target,residents];city.cell=target;Object.assign(city,xy(target,w));city.nation=l.ownership[target];city.culture=l.culture[target]||culture;city.language=l.language?.[target]||language;const toponym=settlementToponym(world,target,city.id);city.name=toponym.name;city.nameMeaning=toponym.meaning;city.nameRoots=toponym.roots;occupied.add(target);
    }
  }
  // Rerolling a stricter polar policy relocates residual rural residents too, conserving totals.
  if(l.population)for(let i=0;i<n;i++)if(l.elevation[i]>0&&!l.ownership[i]&&l.population[i]>0){const destination=closest(i);l.population[destination]+=l.population[i];l.population[i]=0;}
}

function settlementToponym(world,cell,id){
 const civ=world.meta.civilization,l=world.layers,language=civ.languages?.find(a=>a.id===l.language?.[cell])||civ.cultures.find(c=>c.id===l.culture[cell])?.language,features=[];
 if(geoCoast(world,cell))features.push('sea','harbor','mouth');if((l.riverDistance?.[cell]??99)<3||l.river?.[cell])features.push('river','ford','bridge');if(l.elevation[cell]>1500)features.push('mountain','high','valley');else if(l.elevation[cell]>400)features.push('hill','valley');else features.push('plain');if([1,2,8,9,11,19].includes(l.biome?.[cell]))features.push('forest');let lakes=false;neighbors(cell,world.width,world.height,j=>{lakes||=!!l.lake?.[j];});if(lakes)features.push('lake');
 return generateToponym(language,`${world.seed}:${civ.settings.seed}`,`city:${id}`,{features});
}
function settlementName(world,cell,id){return settlementToponym(world,cell,id).name;}
const nameKey=name=>String(name||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z]/g,'');
/** Reserve custom names first; generated identities use deterministic linguistic alternatives. */
export function ensureUniqueCivilizationNames(world){
 const civ=world.meta.civilization;if(!civ)return world;const seed=`${world.seed}:${civ.seed}`,used=new Set();
 const unique=(entity,set,language,kind)=>{let key=nameKey(entity.name);if(!set.has(key)){set.add(key);return;}const old=entity.name,custom=entity.manual?.name;if(custom)entity.manual.nameBase||=old;for(let attempt=1;attempt<=1000;attempt++){const toponym=kind==='city'?generateToponym(language,seed,`city:${entity.id}:unique:${attempt}`,{features:['river','hill','plain','new','fort']}):null,generated=toponym?.name||generateName(language,seed,`${kind}:${entity.id}:unique:${attempt}`,kind),qualified=custom?`${entity.manual.nameBase} ${generated}`:generated,name=attempt<40?qualified:`${qualified}${generateName(language,seed,`disambiguator:${entity.id}:${attempt}`,'root').toLowerCase()}`;key=nameKey(name);if(key&&!set.has(key)){entity.name=name;if(toponym){entity.nameMeaning=custom?`${entity.manual.nameBase} · ${toponym.meaning}`:toponym.meaning;entity.nameRoots=toponym.roots;}if(kind==='nation'&&entity.officialName)entity.officialName=entity.officialName.endsWith(old)?entity.officialName.slice(0,-old.length)+name:name;set.add(key);return;}}};
 for(const nation of [...civ.nations].sort((a,b)=>Number(!!b.manual?.name)-Number(!!a.manual?.name)||a.id-b.id))unique(nation,used,civ.cultures.find(c=>c.id===world.layers.culture[nation.center])?.language,'nation');
 const nationalNames=new Map();for(const city of [...civ.cities].sort((a,b)=>Number(!!b.manual?.name)-Number(!!a.manual?.name)||a.id-b.id)){const owner=world.layers.ownership[city.cell]||city.nation;if(!nationalNames.has(owner))nationalNames.set(owner,new Set());unique(city,nationalNames.get(owner),civ.languages?.find(l=>l.id===world.layers.language?.[city.cell])||civ.cultures.find(c=>c.id===city.culture)?.language,'city');}return world;
}
export const settlementKind=population=>population>=20000000?'megalopolis':population>=2000000?'metropolis':population>=100000?'city':population>=10000?'town':'village';
function removeUrbanConcentrations(world){
 const civ=world.meta.civilization,l=world.layers,pools=new Map(),weights=new Map(),rows=Array.from({length:world.height},(_,y)=>rowArea(y,world.height));
 for(const city of civ.cities){const f=cityFootprint(city),owner=l.ownership[city.cell];for(let k=0;k<f.length;k+=2){const amount=Math.min(l.population[f[k]]||0,f[k+1]);l.population[f[k]]-=amount;pools.set(owner,(pools.get(owner)||0)+amount);}delete city.footprint;}
 for(let i=0;i<l.population.length;i++){const owner=l.ownership[i];if(owner&&!l.lake?.[i])weights.set(owner,(weights.get(owner)||0)+Math.pow(l.habitability[i]+.008,1.1)*rows[Math.floor(i/world.width)]);}
 const allocated=new Map(),first=new Map();for(let i=0;i<l.population.length;i++){const owner=l.ownership[i];if(!pools.has(owner)||l.lake?.[i])continue;const amount=Math.floor(pools.get(owner)*Math.pow(l.habitability[i]+.008,1.1)*rows[Math.floor(i/world.width)]/(weights.get(owner)||1));l.population[i]+=amount;allocated.set(owner,(allocated.get(owner)||0)+amount);if(!first.has(owner))first.set(owner,i);}
 for(const [owner,pool]of pools){const cell=first.get(owner);if(cell!==undefined)l.population[cell]+=pool-(allocated.get(owner)||0);}
}
function makeSettlements(world,s,{preserveManual=false}={}){
 const {width:w,height:h,layers:l}=world,civ=world.meta.civilization,r=seededRandom(`${world.seed}:${s.seed}`,'cities'),candidates=[],used=new Uint8Array(w*h),occupied=new Set(),cities=[],preserved=preserveManual?civ.cities.filter(c=>Object.values(c.manual||{}).some(Boolean)&&l.ownership[c.cell]&&!l.lake?.[c.cell]).map(c=>structuredClone(c)):[];
 const count=Math.max(s.cityCount,preserved.length),eligibleCount=l.ownership.reduce((sum,id)=>sum+(id?1:0),0),binSize=Math.max(3,Math.round(Math.sqrt(eligibleCount/Math.max(1,count))*1.7)),bins=new Map();let nextId=preserved.reduce((max,c)=>Math.max(max,c.id),0)+1;
 for(let i=0;i<w*h;i++)if(l.ownership[i]&&l.settlementPotential[i]>.0008&&!l.lake?.[i]){const score=(.025+Math.pow(l.settlementPotential[i],.8))*Math.log2(10+l.population[i])*(.78+r()*.44),candidate={cell:i,score};candidates.push(candidate);const key=Math.floor(i%w/binSize)+Math.floor(Math.floor(i/w)/binSize)*Math.ceil(w/binSize);if(!bins.has(key))bins.set(key,[]);bins.get(key).push(candidate);}
 candidates.sort((a,b)=>b.score-a.score);for(const list of bins.values())list.sort((a,b)=>b.score-a.score);
 const byNation=new Map();for(const c of candidates){const id=l.ownership[c.cell];if(!byNation.has(id))byNation.set(id,[]);byNation.get(id).push(c);}
 const reserve=i=>{occupied.add(i);const radius=Math.max(1,Math.round(w/700)),x=i%w,y=Math.floor(i/w);for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const yy=y+dy;if(yy>=0&&yy<h)used[yy*w+(x+dx+w)%w]=1;}};
 for(const city of preserved){cities.push(city);reserve(city.cell);}
 const add=(i,capital=false)=>{if(occupied.has(i))return cities.find(c=>c.cell===i);const id=nextId++,toponym=settlementToponym(world,i,id),city={id,name:toponym.name,nameMeaning:toponym.meaning,nameRoots:toponym.roots,...xy(i,w),cell:i,nation:l.ownership[i],culture:l.culture[i],language:l.language?.[i]||0,population:0,capital,kind:'town',port:geoCoast(world,i),manual:{}};cities.push(city);reserve(i);return city;};
 for(const nation of civ.nations){let capital=cities.find(c=>c.id===nation.capital&&l.ownership[c.cell]===nation.id);if(!capital){const list=byNation.get(nation.id)||[],cx=nation.center%w,cy=Math.floor(nation.center/w);let cell=nation.center,best=-Infinity;for(const candidate of list.slice(0,160)){const i=candidate.cell,d=Math.hypot(wrappedDelta(i%w,cx,w),Math.floor(i/w)-cy),score=candidate.score/(1+d/(w*.07));if(score>best){best=score;cell=i;}}capital=add(cell,true);}if(capital){capital.capital=true;nation.capital=capital.id;}}
 // Reserve provincial seats before extra metropolitan sites, so rural regions have real towns.
 const provincial=new Map(),provinceById=new Map((civ.provinces||[]).map(p=>[p.id,p]));for(const candidate of candidates){const id=l.province?.[candidate.cell],p=provinceById.get(id);if(!p||p.nation!==l.ownership[candidate.cell])continue;if(!provincial.has(id))provincial.set(id,{candidate,population:0});provincial.get(id).population+=l.population[candidate.cell];}
 const occupiedProvinces=new Set(cities.map(c=>l.province?.[c.cell]));for(const [id,entry]of [...provincial].sort((a,b)=>b[1].population-a[1].population)){if(cities.length>=count)break;if(entry.population>=12000&&!occupiedProvinces.has(id)){add(entry.candidate.cell);occupiedProvinces.add(id);}}
 // Round-robin geographic bins provide towns on marginal frontiers as well as dense coastal belts.
 const queues=[...bins.values()].sort((a,b)=>b[0].score-a[0].score).map(list=>({list,index:0}));let changed=true;while(cities.length<count&&changed){changed=false;for(const queue of queues){while(queue.index<queue.list.length&&used[queue.list[queue.index].cell])queue.index++;if(queue.index<queue.list.length){add(queue.list[queue.index++].cell);changed=true;}if(cities.length>=count)break;}}
 civ.cities=cities;ensureUniqueCivilizationNames(world);allocateUrbanPopulation(world,s);
}
function geoCoast(world,i){let sea=false;neighbors(i,world.width,world.height,j=>{sea||=world.layers.elevation[j]<=0;});return sea;}
function allocateUrbanPopulation(world,s){
 const civ=world.meta.civilization,l=world.layers;for(const city of civ.cities){city.nation=l.ownership[city.cell];if(!city.manual?.culture||!civ.cultures.some(c=>c.id===city.culture))city.culture=l.culture[city.cell];city.language=l.language?.[city.cell]||civ.cultures.find(c=>c.id===city.culture)?.language.id||0;}
 deriveUrbanization(world,{initial:true});
}
export function recomputeCivilization(world,{skipSociety=false}={}){
  const civ=world.meta.civilization;if(!civ)return world;ensureCivilizationLanguages(world);const {width:w,height:h,layers:l}=world,n=w*h,nationsById=new Map(civ.nations.map(a=>[a.id,a])),culturesById=new Map(civ.cultures.map(a=>[a.id,a])),languagesById=new Map(civ.languages.map(a=>[a.id,a])),acc=new Map(),rows=Array.from({length:h},(_,y)=>rowArea(y,h)*AREA/(2*w));
  for(const nation of civ.nations){nation.population=0;nation.area=0;nation.settlements=[];nation.cultures=[];nation.languages=[];nation.terrain=[];acc.set(nation.id,{cultures:new Map(),languages:new Map(),terrain:new Map(),x:0,cx:0,y:0,weight:0,best:-1,bestScore:-1,cells:0});}
  for(const culture of civ.cultures){culture.population=0;culture.area=0;culture.countries=[];}
  for(const language of civ.languages){language.population=0;language.area=0;language.countries=[];}
  let total=0,claimed=0;
  for(let i=0;i<n;i++){
    if(l.elevation[i]<=0){l.ownership[i]=0;l.culture[i]=0;l.population[i]=0;continue;}
    const y=Math.floor(i/w),area=rows[y],pop=l.population[i]||0,owner=nationsById.get(l.ownership[i]),culture=culturesById.get(l.culture[i]);total+=pop;
    const other=culturesById.get(l.cultureMinority?.[i]),share=other?clamp(l.minorityShare?.[i]||0,0,.49):0;
    if(culture){culture.population+=pop*(1-share);culture.area+=area;}if(other)other.population+=pop*share;
    const language=languagesById.get(l.language[i]),languageOther=languagesById.get(l.languageMinority[i]),languageShare=languageOther?clamp(l.languageMinorityShare[i],0,.49):0;if(language){language.population+=pop*(1-languageShare);language.area+=area;}if(languageOther)languageOther.population+=pop*languageShare;
    if(!owner)continue;claimed+=area;owner.population+=pop;owner.area+=area;const a=acc.get(owner.id),weight=area*(.2+(l.habitability?.[i]||0));a.x+=Math.sin((i%w+.5)/w*Math.PI*2)*weight;a.cx+=Math.cos((i%w+.5)/w*Math.PI*2)*weight;a.y+=(y+.5)*weight;a.weight+=weight;a.cells++;
    if(culture)a.cultures.set(culture.id,(a.cultures.get(culture.id)||0)+pop*(1-share));if(other)a.cultures.set(other.id,(a.cultures.get(other.id)||0)+pop*share);
    if(language)a.languages.set(language.id,(a.languages.get(language.id)||0)+pop*(1-languageShare));if(languageOther)a.languages.set(languageOther.id,(a.languages.get(languageOther.id)||0)+pop*languageShare);
    const e=l.elevation[i],terrain=e>2500?'Mountains':e>1200?'Highlands':e>400?'Hills':(l.surfaceMoisture?.[i]||0)<.14?'Arid lowlands':'Plains';a.terrain.set(terrain,(a.terrain.get(terrain)||0)+area);
    const best=(l.habitability?.[i]||0)+.001*Math.sqrt(pop);if(best>a.bestScore){a.bestScore=best;a.best=i;}
  }
  const capitals=new Map(),urbanBudget=new Map();for(const city of civ.cities){city.x=((Number(city.x)%w)+w)%w;city.y=clamp(Number(city.y),.001,h-.001);city.cell=Math.floor(city.y)*w+Math.floor(city.x);city.nation=l.ownership[city.cell]||0;if(!city.manual?.culture||!culturesById.has(city.culture))city.culture=l.culture[city.cell]||0;const nation=nationsById.get(city.nation);city.capital=false;if(nation){nation.settlements.push(city.id);if(nation.capital===city.id)capitals.set(nation.id,city);
      // A manually selected urban culture represents a local diaspora, not a repaint of rural land.
      if(city.manual?.culture&&city.culture!==l.culture[city.cell]&&culturesById.has(city.culture)){const cell=city.cell,available=urbanBudget.has(cell)?urbanBudget.get(cell):l.population[cell],count=Math.min(available,city.population),minor=l.cultureMinority?.[cell],share=culturesById.has(minor)?clamp(l.minorityShare?.[cell]||0,0,.49):0,a=acc.get(nation.id);urbanBudget.set(cell,available-count);for(const [id,pop]of [[l.culture[cell],count*(1-share)],[minor,count*share]])if(culturesById.has(id)){culturesById.get(id).population-=pop;a.cultures.set(id,(a.cultures.get(id)||0)-pop);}culturesById.get(city.culture).population+=count;a.cultures.set(city.culture,(a.cultures.get(city.culture)||0)+count);}
    }city.kind=settlementKind(city.population);}
  // Ownership painting may move capitals across a border. Repair only affected countries.
  for(const city of civ.cities)city.port=geoCoast(world,city.cell);
  for(const nation of civ.nations){const a=acc.get(nation.id);if(!a.cells){nation.capital=0;nation.density=0;nation.urbanization=0;continue;}let capital=capitals.get(nation.id);if(!capital){capital=civ.cities.filter(c=>c.nation===nation.id).sort((a,b)=>b.population-a.population)[0];if(!capital){const id=civ.cities.reduce((max,c)=>Math.max(max,c.id),0)+1,cell=a.best;capital={id,name:settlementName(world,cell,id),...xy(cell,w),cell,nation:nation.id,culture:l.culture[cell],population:Math.min(Math.floor(nation.population*.035),Math.max(0,l.population[cell])),capital:true,kind:'town',port:geoCoast(world,cell),manual:{}};civ.cities.push(capital);nation.settlements.push(id);}nation.capital=capital.id;}capital.capital=true;
    nation.density=nation.area?nation.population/nation.area:0;const cities=civ.cities.filter(c=>c.nation===nation.id);nation.urbanization=nation.population?Math.min(1,cities.reduce((s,c)=>s+c.population,0)/nation.population):0;nation.cultures=[...a.cultures].filter(([,population])=>population>.001).map(([id,population])=>({id,population,share:nation.population?population/nation.population:0})).sort((a,b)=>b.population-a.population);nation.languages=[...a.languages].filter(([,population])=>population>.001).map(([id,population])=>({id,population,share:nation.population?population/nation.population:0})).sort((a,b)=>b.population-a.population);nation.officialLanguage=nation.manual?.officialLanguage&&languagesById.has(nation.officialLanguage)?nation.officialLanguage:(nation.languages[0]?.id||l.language[a.best]);nation.terrain=[...a.terrain].map(([name,area])=>({name,area,share:area/nation.area}));
    const xx=((Math.atan2(a.x,a.cx)/(2*Math.PI)*w)+w)%w,yy=a.y/a.weight;let best=a.best,bd=Infinity;for(let y=Math.max(0,Math.floor(yy)-20);y<Math.min(h,Math.ceil(yy)+20);y++)for(let x=-20;x<=20;x++){const xxx=(Math.floor(xx)+x+w)%w,i=y*w+xxx;if(l.ownership[i]===nation.id){const d=x*x+(y-yy)**2;if(d<bd){bd=d;best=i;}}}nation.label=xy(best,w);nation.cells=a.cells;nation.largestCities=cities.sort((a,b)=>b.population-a.population).slice(0,10).map(c=>c.id);for(const c of nation.cultures)if(c.population>0)culturesById.get(c.id)?.countries.push(nation.id);
  }
  for(const city of civ.cities){city.kind=settlementKind(city.population);if(!city.manual?.language||!languagesById.has(city.language))city.language=l.language[city.cell]||culturesById.get(city.culture)?.language.id||0;}for(const nation of civ.nations)for(const entry of nation.languages)languagesById.get(entry.id)?.countries.push(nation.id);
  civ.population=total;civ.claimedArea=claimed;civ.urbanization=total?civ.cities.reduce((s,c)=>s+c.population,0)/total:0;civ.revision=(civ.revision||0)+1;ensureUniqueCivilizationNames(world);if(civ.societyVersion&&!skipSociety)recomputeSociety(world,{repairProvinces:true});return world;
}

export function generateCivilization(world,settings={},scope='all',report=()=>{}){
  if(!world?.layers?.elevation||!world.layers.biome)throw new Error('Generate physical geography before adding civilization.');
  const old=world.meta.civilization,s=normalizeCivSettings({...old?.settings,...settings}),paletteChanged=!!old&&(old.settings?.palette!==s.palette||old.settings?.paletteSaturation!==s.paletteSaturation);if(!old)scope='all';if(!['all','nations','cultures','population','cities','provinces','religions','economy'].includes(scope))throw new Error('Unknown civilization generation scope.');
  const civ=scope==='all'?{version:1,seed:s.seed,settings:s,revision:old?.revision||0,nations:[],cultures:[],families:[],cities:[]}:old;world.meta.civilization=civ;civ.settings=s;civ.seed=s.seed;
  report('habitability',.1,'Mapping fertile plains, river corridors, harbors and mountain passes');const geo=['all','nations','cultures','population','cities'].includes(scope)?suitability(world):null;
  if(scope==='all'||scope==='cultures'){report('cultures',.24,'Establishing language families and cultural homelands');cultures(world,s,geo);}
  if(scope==='all'||scope==='nations'){report('nations',.62,'Growing competing states across geographic and cultural barriers');nations(world,s,geo);}
  if(scope==='all'||scope==='population'){report('population',.7,'Distributing population by capacity and settlement geography');distributePopulation(world,s);}
  if(scope==='all'){regenerateProvinces(world);civ.provincesPrepared=true;}
  if(scope==='all'||scope==='cities'){report('cities',.82,'Founding capitals, ports, towns and national identities');if(scope==='cities')removeUrbanConcentrations(world);makeSettlements(world,s,{preserveManual:scope==='cities'});}
  else if(scope==='population')allocateUrbanPopulation(world,s);
  else if(scope==='cultures'){
    for(const c of civ.cities){if(!c.manual?.culture||!civ.cultures.some(culture=>culture.id===c.culture))c.culture=world.layers.culture[c.cell];if(!c.manual?.name){const toponym=settlementToponym(world,c.cell,c.id);c.name=c.manual?.culture?generateCityName(world,c.culture,`city:${c.id}`):toponym.name;c.nameMeaning=toponym.meaning;c.nameRoots=toponym.roots;}}
    const r=seededRandom(`${world.seed}:${s.seed}`,'new-identities');for(const nation of civ.nations){const replacement=identity(world,s,nation.id,nation.center??civ.cities.find(c=>c.nation===nation.id)?.cell??0,r);if(!nation.manual?.name){nation.name=replacement.name;nation.officialName=replacement.officialName;}if(!nation.manual?.leader)nation.leader=replacement.leader;}
  }
  if(scope==='nations')for(const nation of civ.nations){const atCenter=civ.cities.find(c=>c.cell===nation.center);nation.capital=atCenter?.id||0;}
  ensureCivilizationLanguages(world);recomputeCivilization(world,{skipSociety:true});if(['all','cultures'].includes(scope))ensureUniqueCivilizationNames(world);if(scope==='all'||paletteChanged)applyCivilizationPalette(world,s.palette,s.paletteSaturation);else for(const group of scope==='nations'?['nations']:scope==='cultures'?['cultures','languages','families']:[])for(const entity of civ[group])if(!entity.manual?.color)entity.color=paletteColor(entity.id,`${civ.seed}:${group}`,s.palette,s.paletteSaturation);if(['nations','cultures'].includes(scope))separateNeighbourColors(world,paletteColor);generateSociety(world,scope,report,{refreshLanguageContact});report('complete',1,'Civilization ready');return world;
}

export function createNation(world,cellIndex){
  const civ=world.meta.civilization;if(!civ||world.layers.elevation[cellIndex]<=0||world.layers.lake?.[cellIndex])throw new Error('Choose a dry land location for the new country.');const id=civ.nations.reduce((m,c)=>Math.max(m,c.id),0)+1;if(id>65534)throw new Error('Country ID capacity reached.');const nation=identity(world,civ.settings,id,cellIndex,seededRandom(civ.seed,`created:${id}`));nation.manual.created=true;civ.nations.push(nation);world.layers.ownership[cellIndex]=id;recomputeCivilization(world);return nation;
}
export function deleteNation(world,id,transferTo){
  const civ=world.meta.civilization;if(!civ||civ.nations.length<2)throw new Error('Keep at least one country in the world.');const replacement=civ.nations.find(n=>n.id===+transferTo&&n.id!==id)||civ.nations.find(n=>n.id!==id);if(!replacement)throw new Error('Choose a destination for this country’s territory.');for(let i=0;i<world.layers.ownership.length;i++)if(world.layers.ownership[i]===id)world.layers.ownership[i]=replacement.id;civ.nations=civ.nations.filter(n=>n.id!==id);recomputeCivilization(world);return replacement;
}
export function rerollFlag(world,id){const civ=world.meta.civilization,nation=civ?.nations.find(n=>n.id===id);if(!nation)return;const count=(nation.flagRevision||0)+1;nation.flagRevision=count;nation.flag=generateFlag(`${world.seed}:${civ.seed}:nation:${id}:reroll:${count}`);nation.manual.flag=true;civ.revision++;return nation.flag;}

export function generateCityName(world,cultureId,seed='new-city') {const culture=world.meta.civilization?.cultures.find(c=>c.id===cultureId);return generateName(culture?.language,world.meta.civilization?.seed||world.seed,String(seed),'city');}

export function moveSettlement(world,cityId,cell){
  const civ=world.meta.civilization,city=civ?.cities.find(c=>c.id===cityId),l=world.layers;if(!city)throw new Error('Settlement not found.');if(!Number.isInteger(cell)||cell<0||cell>=world.width*world.height||l.elevation[cell]<=0||l.lake?.[cell]||!l.ownership[cell])throw new Error('Move settlements onto claimed dry land.');
  if(city.cell!==cell){let remaining=city.population,transferred=0;const take=(i,limit=Infinity)=>{const count=Math.min(remaining,l.population[i],limit);l.population[i]-=count;remaining-=count;transferred+=count;},f=cityFootprint(city);for(let k=0;k<f.length;k+=2)take(f[k],f[k+1]);
    // A city manually enlarged in an older save may draw some residents from nearby rural cells.
    if(remaining>0)for(let i=0;i<l.population.length&&remaining>0;i++)if(i!==cell&&l.ownership[i]===city.nation)take(i);
    l.population[cell]+=transferred;city.cell=cell;city.footprint=[cell,city.population];Object.assign(city,xy(cell,world.width));city.manual={...city.manual,location:true};
  }
  recomputeCivilization(world);return city;
}

/** Geography edits invalidate only dependent civilization cells; surviving hand edits are retained. */
export function reconcileGeography(world){
  const civ=world.meta.civilization;if(!civ)return world;const l=world.layers,{width:w,height:h}=world,n=w*h;suitability(world);
  const queue=new Int32Array(n);let a=0,b=0;for(let i=0;i<n;i++)if(l.elevation[i]<=0){l.ownership[i]=0;l.culture[i]=0;l.population[i]=0;if(l.cultureMinority)l.cultureMinority[i]=0;if(l.minorityShare)l.minorityShare[i]=0;}else if(l.ownership[i]&&l.culture[i])queue[b++]=i;
  while(a<b){const i=queue[a++];neighbors(i,w,h,j=>{if(l.elevation[j]<=0||l.ownership[j]||!eligible(world,civ.settings,j))return;l.ownership[j]=l.ownership[i];l.culture[j]=l.culture[i];queue[b++]=j;});}
  // Entirely new islands have no adjacent country. Assign their nearest geographic center.
  for(let i=0;i<n;i++)if(eligible(world,civ.settings,i)&&!l.ownership[i]){let nearest=civ.nations[0],best=Infinity;for(const nation of civ.nations){const c=nation.center??0,d=wrappedDelta(i%w,c%w,w)**2+(Math.floor(i/w)-Math.floor(c/w))**2;if(d<best){best=d;nearest=nation;}}if(nearest){l.ownership[i]=nearest.id;const reference=nearest.center??0;l.culture[i]=l.culture[reference]||civ.cultures[0]?.id||0;}}
  civ.cities=civ.cities.filter(c=>l.elevation[c.cell]>0&&!l.lake?.[c.cell]);return recomputeCivilization(world);
}

export function validateCivilization(world){
  const civ=world.meta?.civilization;if(!civ)return true;const n=world.width*world.height,l=world.layers;
  if(civ.version!==1)throw new Error('Unsupported civilization version.');
  for(const [key,type]of [['ownership',Uint16Array],['culture',Uint16Array],['population',Float64Array],['habitability',Float32Array]])if(!(l[key] instanceof type)||l[key].length!==n)throw new Error(`Invalid civilization ${key} layer.`);
  for(const key of ['nations','cultures','families','cities'])if(!Array.isArray(civ[key])||civ[key].length>(key==='cities'?100000:10000))throw new Error(`Invalid civilization ${key}.`);
  const ids=key=>{const seen=new Set();for(const entity of civ[key]){if(!Number.isInteger(entity.id)||entity.id<1||entity.id>65534||seen.has(entity.id))throw new Error(`Invalid or duplicate ${key} ID.`);seen.add(entity.id);}return seen;};
  const nationIds=ids('nations'),cultureIds=ids('cultures'),familyIds=ids('families'),cityIds=ids('cities');
  for(const culture of civ.cultures){if(!familyIds.has(culture.family)||!culture.language?.phonology)throw new Error('Invalid culture language or family.');const p=culture.language.phonology;for(const key of ['consonants','vowels','suffixes','roots'])if(!Array.isArray(p[key])||!p[key].length||p[key].length>100||p[key].some(x=>typeof x!=='string'||x.length>40||!/^\p{Script=Latin}+$/u.test(x.normalize('NFC'))))throw new Error('Invalid language phonology.');if(!Array.isArray(p.patterns)||!p.patterns.length||p.patterns.some(x=>typeof x!=='string'||!/^[CV]{1,5}$/.test(x))||!Number.isInteger(p.minSyllables)||p.minSyllables<1||p.minSyllables>6||!Number.isInteger(p.maxSyllables)||p.maxSyllables<p.minSyllables||p.maxSyllables>8)throw new Error('Invalid language word-building rules.');}
  for(const nation of civ.nations){if(!/^#[0-9a-f]{6}$/i.test(nation.color)||!nation.flag||!Array.isArray(nation.flag.colors)||nation.flag.colors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw new Error('Invalid national colors or flag.');if(nation.capital&&!cityIds.has(nation.capital))throw new Error('Invalid national capital reference.');}
  for(const city of civ.cities){if(!Number.isFinite(city.x)||!Number.isFinite(city.y)||city.x<0||city.x>=world.width||city.y<0||city.y>=world.height||!Number.isInteger(city.cell)||city.cell<0||city.cell>=n||!Number.isFinite(city.population)||city.population<0||!nationIds.has(city.nation)||!cultureIds.has(city.culture))throw new Error('Invalid settlement location, population or reference.');}
  for(let i=0;i<n;i++){if(l.ownership[i]&&!nationIds.has(l.ownership[i])||l.culture[i]&&!cultureIds.has(l.culture[i]))throw new Error('Invalid civilization ownership or culture ID.');if(!Number.isFinite(l.population[i])||l.population[i]<0||!Number.isFinite(l.habitability[i])||l.habitability[i]<0||l.habitability[i]>1)throw new Error('Invalid civilization population or habitability.');if(l.elevation[i]<=0&&(l.ownership[i]||l.culture[i]||l.population[i]))throw new Error('Civilization cannot occupy ocean cells.');}
  if(civ.languages){if(!Array.isArray(civ.languages)||civ.languages.length>10000)throw new Error('Invalid civilization languages.');const languageIds=ids('languages');for(const [key,type]of [['language',Uint16Array],['languageMinority',Uint16Array],['languageMinorityShare',Float32Array]])if(!(l[key] instanceof type)||l[key].length!==n)throw new Error(`Invalid civilization ${key} layer.`);for(const language of civ.languages)if(!familyIds.has(language.family)||!language.phonology||typeof language.name!=='string')throw new Error('Invalid language family or definition.');for(const nation of civ.nations)if(nation.officialLanguage&&!languageIds.has(nation.officialLanguage))throw new Error('Invalid official language reference.');for(let i=0;i<n;i++){if(l.language[i]&&!languageIds.has(l.language[i])||l.languageMinority[i]&&!languageIds.has(l.languageMinority[i]))throw new Error('Invalid language ownership ID.');if(!Number.isFinite(l.languageMinorityShare[i])||l.languageMinorityShare[i]<0||l.languageMinorityShare[i]>.5)throw new Error('Invalid language minority share.');if(l.elevation[i]<=0&&(l.language[i]||l.languageMinority[i]))throw new Error('Languages cannot occupy oceans.');}}
  if(civ.societyVersion)validateSociety(world);return true;
}
