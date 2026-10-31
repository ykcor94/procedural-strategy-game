import {clamp,seededRandom,seededColor,generateName,languageAt,xy,neighbors,Queue,pointDistance} from './society-utils.js';
import {fractalNoise} from '../generation/noise.js';
import {hashSeed} from '../core/random.js';
import {stateFaithFactor} from './faith.js';
export const NO_RELIGION_ID=65534;
const TYPES=['Monotheistic','Polytheistic','Animist','Ancestor tradition','Philosophical','Dualist','Pantheistic'];
const VALUES=['hospitality','scholarship','stewardship','pilgrimage','ritual arts','ancestral memory','communal service','craftsmanship','contemplation','charitable works','sacred law','seasonal festivals','restraint','maritime fellowship'];
const TERMS=['Covenant','Way','Communion','Tradition','Fellowship','Order','Teaching','Faith'];
const SECT_MODIFIERS=['Orthodox','Reformed','Renewed','Old','New','Contemplative','Monastic','Scholastic','Mystic','Ascetic','Popular','Universal','Syncretic','Pilgrim','Ritualist','Reconciled','Folk','Classical','Restorationist','Reformist','Communal','Evangelical','Traditional','Revivalist'];
function traditionName(world,family,attempt=0){const language=languageAt(world,family.homeland),r=seededRandom(world.meta.civilization.seed,`tradition-name:${family.id}:${attempt}`),stem=generateName(language,world.meta.civilization.seed,`tradition:${family.id}:${attempt}`,'religion'),suffix=r()<.64?'ism':language.phonology.suffixes[Math.floor(r()*language.phonology.suffixes.length)];return stem+(stem.toLowerCase().endsWith(suffix.toLowerCase())?'':suffix);}
function sectColor(color,index){const base=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),offset=((index*7)%11-5)*1.05;return '#'+base.map((v,k)=>Math.round(clamp(v+offset+(k===0?1:k===2?-1:0),0,255)).toString(16).padStart(2,'0')).join('');}
/** Keep a tradition's names and near-identical branch colors coherent after language or family edits. */
const religionKey=name=>String(name||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z]/g,'').replace(/(.)\1+/g,'$1');
/** `reserved` holds identity keys (peoples, languages, nations) that no tradition may take. */
export function renameReligionIdentities(world,reserved=new Set()){
 const civ=world.meta?.civilization;if(!civ?.religionFamilies||!civ.religions)return world;const usedKeys=new Set(reserved),used={has:name=>usedKeys.has(religionKey(name)),add:name=>usedKeys.add(religionKey(name))};
 for(const family of civ.religionFamilies){if(family.secular){family.name='Unaffiliated';continue;}if(!family.manual?.name){let attempt=0,name;do{name=traditionName(world,family,attempt++);}while(used.has(name)&&attempt<100);family.name=name;}used.add(family.name);const branches=civ.religions.filter(religion=>!religion.secular&&religion.family===family.id),primary=branches[0];family.primaryReligion=primary?.id||0;family.type=primary?.type||family.type;let ordinal=0;
  for(const religion of branches){religion.isSect=religion!==primary;religion.parentReligion=religion.isSect?primary?.id||0:0;religion.traditionName=family.name;if(religion.isSect)ordinal++;if(!religion.manual?.color)religion.color=religion.isSect?sectColor(family.color,ordinal):family.color;
   if(!religion.manual?.name){if(!religion.isSect){religion.name=family.name;religion.sectName='';}else{const r=seededRandom(civ.seed,`sect-name:${religion.id}`),origin=xy(religion.homeland,world.width),home=xy(family.homeland,world.width),dx=origin.x-home.x-Math.round((origin.x-home.x)/world.width)*world.width,dy=origin.y-home.y,directions=[Math.abs(dx)>Math.abs(dy)?dx>0?'Eastern':'Western':dy>0?'Southern':'Northern','High','Coastal','River','Mountain'],doctrine=SECT_MODIFIERS[Math.floor(r()*SECT_MODIFIERS.length)];let modifier=ordinal===1&&r()<.45?directions[0]:doctrine,name=`${modifier} ${family.name}`,attempt=0;while(used.has(name)&&attempt<150){modifier=`${directions[attempt%directions.length]} ${SECT_MODIFIERS[(Math.floor(r()*SECT_MODIFIERS.length)+attempt)%SECT_MODIFIERS.length]}`;name=`${modifier} ${family.name}`;attempt++;}religion.name=name;religion.sectName=modifier;}}
   used.add(religion.name);const origin=civ.cities.find(city=>city.id===religion.originCity),traits=religion.traits||[];religion.description=`A ${String(religion.type).toLowerCase()} ${religion.isSect?'branch of '+family.name:'tradition'} rooted in ${origin?.name||'a sacred homeland'}. Its followers emphasize ${traits.join(', ')}. ${religion.spread==='ethnic'?'Its sacred customs are closely tied to a cultural homeland.':'Pilgrimage and merchant communities carry its teachings across languages and seas.'}`;
  }
 }
 return world;
}
function closestCity(world,cell){const origin=xy(cell,world.width);let best=null,distance=Infinity;for(const city of world.meta.civilization.cities){const d=pointDistance(origin,city,world.width);if(d<distance){distance=d;best=city;}}return best;}
function origins(world,count,r){const civ=world.meta.civilization,l=world.layers,w=world.width,h=world.height,candidates=civ.cities.filter(c=>l.ownership[c.cell]&&l.culture[c.cell]).map(c=>({cell:c.cell,score:(l.habitability[c.cell]||0)+.06*Math.log1p(c.population)}));if(candidates.length<count)for(let i=0;i<l.ownership.length;i++)if(l.ownership[i]&&l.culture[i]&&!l.lake?.[i]&&l.habitability[i]>.03)candidates.push({cell:i,score:l.habitability[i]});
  const out=[],used=new Set(),sample=candidates.length>2400?candidates.filter((_,k)=>k%Math.ceil(candidates.length/2400)===0):candidates;
  if(sample.length){const first=sample[Math.floor(r()*sample.length)].cell;out.push(first);used.add(first);}
  const nearest=new Float32Array(sample.length);nearest.fill(Infinity);let processed=0;while(out.length<Math.min(count,sample.length)){while(processed<out.length){const center=xy(out[processed++],w);for(let k=0;k<sample.length;k++){const distance=pointDistance(center,xy(sample[k].cell,w),w);if(distance<nearest[k])nearest[k]=distance;}}
    let best=-1,score=-1;for(let k=0;k<sample.length;k++){if(used.has(sample[k].cell))continue;const value=nearest[k]*(.65+Math.min(1,sample[k].score)*.35)*(.9+((sample[k].cell*29)%23)/115);if(value>score){score=value;best=k;}}if(best<0)break;out.push(sample[best].cell);used.add(sample[best].cell);}
  return out;
}

export function generateReligions(world,{applySecular=true}={}){
  const civ=world.meta.civilization,l=world.layers,n=l.ownership.length,w=world.width,h=world.height,s=civ.settings,r=seededRandom(`${world.seed}:${civ.seed}`,'religious-homelands'),count=clamp(Math.round(+s.religionCount||18),1,150),centers=origins(world,count,r),familyCount=Math.min(centers.length,clamp(Math.round(+s.religionFamilyCount||6),1,40));
  civ.religionFamilies=centers.slice(0,familyCount).map((cell,k)=>({id:k+1,name:`${generateName(languageAt(world,cell),civ.seed,`religion-family:${k}`,'religion')} tradition`,color:seededColor(k+1,civ.seed+'religion-families'),homeland:cell}));
  civ.religions=centers.map((cell,k)=>{const family=civ.religionFamilies[k<familyCount?k:Math.floor(r()*familyCount)],language=languageAt(world,cell),origin=closestCity(world,cell),type=TYPES[Math.floor(r()*TYPES.length)],ethnic=/Animist|Ancestor/.test(type)||r()<.24,shuffled=[...VALUES];for(let j=shuffled.length-1;j>0;j--){const at=Math.floor(r()*(j+1));[shuffled[j],shuffled[at]]=[shuffled[at],shuffled[j]];}const traits=shuffled.slice(0,3),name=`${generateName(language,civ.seed,`religion:${k}`,'religion')} ${TERMS[Math.floor(r()*TERMS.length)]}`,religion={id:k+1,name,family:family.id,color:seededColor(k+1,civ.seed+'faith'),type,spread:ethnic?'ethnic':'universalizing',homeland:cell,sacredOrigin:cell,originCulture:l.culture[cell],originLanguage:l.language?.[cell]||l.culture[cell],originCity:origin?.id||0,traits,values:[...traits],description:`A ${type.toLowerCase()} ${k>=familyCount?'denomination of the '+family.name:'tradition'} rooted in ${origin?.name||'a sacred homeland'}. Its followers emphasize ${traits.slice(0,-1).join(', ')} and ${traits.at(-1)}. ${ethnic?'Its sacred customs are closely tied to a cultural homeland.':'Pilgrimage and merchant communities carry its teachings across languages and seas.'}`,holyCities:origin?[origin.id]:[],population:0,countries:[],cultures:[],manual:{}};return religion;});
  // Most denominations retain their tradition's fundamental theology, even when customs diverge.
  for(const family of civ.religionFamilies){const branches=civ.religions.filter(religion=>religion.family===family.id),primary=branches[0];family.type=primary?.type;for(const religion of branches.slice(1)){const doctrine=seededRandom(`${world.seed}:${civ.seed}`,`religious-doctrine:${religion.id}`),divergence=doctrine()<.12;religion.doctrinalDivergence=divergence&&religion.type!==primary.type;if(!divergence)religion.type=primary.type;if(/Animist|Ancestor/.test(religion.type))religion.spread='ethnic';}}
  renameReligionIdentities(world);
  const grid=new Uint16Array(n),distance=new Float64Array(n),seedId=new Uint16Array(n),queue=new Queue(),byId=new Map(civ.religions.map(r=>[r.id,r]));distance.fill(Infinity);
  function seed(cell,id,cost){if(cell<0||cell>=n||!l.ownership[cell]||!l.culture[cell])return;if(cost<distance[cell]&&!seedId[cell]){grid[cell]=id;distance[cell]=cost;queue.push(cell,id,cost);}}
  for(const religion of civ.religions){grid[religion.homeland]=religion.id;distance[religion.homeland]=0;seedId[religion.homeland]=religion.id;queue.push(religion.homeland,religion.id,0);}
  // Universalizing faiths establish distant port communities before the land front arrives.
  const cities=new Map(civ.cities.map(c=>[c.id,c]));for(const religion of civ.religions)if(religion.spread==='universalizing'&&religion.originCity){const links=(civ.tradeRoutes||[]).filter(route=>route.from===religion.originCity||route.to===religion.originCity).sort((a,b)=>b.volume-a.volume).slice(0,3);for(const link of links){const other=cities.get(link.from===religion.originCity?link.to:link.from);if(other)seed(other.cell,religion.id,Math.max(2,Math.log1p(link.cost)*.65));}}
  while(queue.size){const {cell:i,id,cost}=queue.pop();if(grid[i]!==id||distance[i]!==cost)continue;const religion=byId.get(id);neighbors(i,w,h,j=>{if(seedId[j]&&seedId[j]!==id)return;const landI=l.elevation[i]>0&&!l.lake?.[i],landJ=l.elevation[j]>0&&!l.lake?.[j];let step;if(!landI||!landJ)step=religion.spread==='ethnic'?22:10;else{const slope=Math.abs(l.elevation[i]-l.elevation[j]),high=Math.max(0,(l.elevation[i]+l.elevation[j])*.5-1200),desert=1-Math.min(l.habitability[i]||0,l.habitability[j]||0);step=1+slope/1150+high/3200+desert*1.3;if(l.river?.[i]&&l.river?.[j])step*=.57;step*=1-.3*Math.min(l.tradeAccess?.[i]||0,l.tradeAccess?.[j]||0);if(l.culture[i]!==l.culture[j])step*=religion.spread==='ethnic'?4.5:1.06;if(religion.spread==='ethnic'&&l.culture[j]!==religion.originCulture)step*=1.35;}const next=cost+step;if(next<distance[j]){distance[j]=next;grid[j]=id;queue.push(j,id,next);}});}
  const minority=new Uint16Array(n),shares=new Float32Array(n);for(let i=0;i<n;i++){if(!l.ownership[i]||!l.culture[i]||l.elevation[i]<=0){grid[i]=0;continue;}let other=0;neighbors(i,w,h,j=>{if(grid[j]&&grid[j]!==grid[i]&&l.ownership[j])other=grid[j];});if(other){minority[i]=other;shares[i]=.06+r()*.22;}}
  for(const route of civ.tradeRoutes||[]){const from=cities.get(route.from),to=cities.get(route.to);if(!from||!to)continue;for(const [source,target]of [[from,to],[to,from]]){const faith=byId.get(grid[source.cell]);if(faith?.spread!=='universalizing'||grid[target.cell]===faith.id)continue;minority[target.cell]=faith.id;shares[target.cell]=Math.max(shares[target.cell],.1+Math.min(.15,(target.tradeAccess||0)*.15));}}
  l.religion=grid;l.religionMinority=minority;l.religionMinorityShare=shares;
  for(const religion of civ.religions){const candidates=civ.cities.filter(c=>grid[c.cell]===religion.id).sort((a,b)=>b.population-a.population);for(const city of candidates)if(religion.holyCities.length<4&&!religion.holyCities.includes(city.id))religion.holyCities.push(city.id);if(!religion.holyCities.length){const city=closestCity(world,religion.homeland);if(city)religion.holyCities=[city.id];}}
  delete civ.secularSettingsSignature;if(applySecular)applyNoReligion(world);civ.religionRevision=(civ.religionRevision||0)+1;return world;
}

/** Remove the optional category while retaining the locally displaced religious homeland. */
function removeSecularAffiliation(world){const civ=world.meta.civilization,l=world.layers,faiths=civ.religions.filter(r=>!r.secular&&r.id!==NO_RELIGION_ID),valid=new Set(faiths.map(r=>r.id));for(let i=0;i<l.religion.length;i++){if(l.religion[i]===NO_RELIGION_ID){const previous=l.religionMinority[i];l.religion[i]=valid.has(previous)?previous:0;l.religionMinority[i]=0;l.religionMinorityShare[i]=0;}if(l.religionMinority[i]===NO_RELIGION_ID){l.religionMinority[i]=0;l.religionMinorityShare[i]=0;}}civ.religions=faiths;civ.religionFamilies=civ.religionFamilies.filter(f=>!f.secular&&f.id!==NO_RELIGION_ID);}

/** Non-affiliation is geography plus a contingent social pattern, rather than a technology switch. */
export function applyNoReligion(world,{refresh=false}={}){
  const civ=world.meta?.civilization,l=world.layers;if(!civ||!l.religion||!civ.religions?.length)return world;const enabled=civ.settings.noReligionEnabled!==false,rate=clamp(Number.isFinite(+civ.settings.noReligionRate)?+civ.settings.noReligionRate:.15,0,1),signature=`1:${enabled}:${rate}`,exists=civ.religions.some(r=>r.secular);
  if(!refresh&&civ.secularSettingsSignature===signature&&exists===enabled)return world;
  if(exists||l.religion.includes(NO_RELIGION_ID)||l.religionMinority.includes(NO_RELIGION_ID))removeSecularAffiliation(world);
  if(!enabled){civ.secularSettingsSignature=signature;civ.religionRevision=(civ.religionRevision||0)+1;return world;}
  civ.religionFamilies.push({id:NO_RELIGION_ID,name:'Unaffiliated',type:'Unaffiliated',color:'#c9c0a8',homeland:null,primaryReligion:NO_RELIGION_ID,secular:true,manual:{}});
  civ.religions.push({id:NO_RELIGION_ID,name:'No Religion',family:NO_RELIGION_ID,color:'#c9c0a8',type:'Unaffiliated',spread:'secular',secular:true,isSect:false,parentReligion:0,traditionName:'Unaffiliated',homeland:null,sacredOrigin:null,originCulture:0,originLanguage:0,originCity:0,holyCities:[],traits:['unaffiliated','personal belief'],values:[],description:'Residents without an organized religious affiliation, including secular, agnostic, atheist and unaffiliated personal beliefs.',population:0,countries:[],cultures:[],manual:{}});
  const profiles=new Map(),urban=new Map(),seed=hashSeed(`${world.seed}:${civ.seed}`,'secular-geography'),w=world.width,h=world.height,n=w*h;for(const city of civ.cities)urban.set(city.cell,(urban.get(city.cell)||0)+city.population);
  for(const nation of civ.nations){const r=seededRandom(`${world.seed}:${civ.seed}`,`secular-history:${nation.id}`),legacy=.3+Math.pow(r(),1.3)*1.7,wealth=clamp(Math.log10(1+Math.max(0,nation.gdpPerCapita||nation.baseProductivity||0))/5,0,1),technology=nation.technology??civ.settings.technologyLevel??.6;profiles.set(nation.id,{legacy,development:.3+technology*.5+wealth*.3,technology});nation.secularHistory=legacy;}
  // National propensities are blended across borders into transition zones, then
  // shaped by cities, trade and a broad regional pattern. The field is smooth, so
  // non-affiliation forms coherent regions instead of a speckle of single cells.
  const field=new Float32Array(n),developed=new Float32Array(n),mask=new Float32Array(n);
  for(let i=0;i<n;i++){if(!l.ownership[i]||l.elevation[i]<=0||l.lake?.[i])continue;const p=profiles.get(l.ownership[i]);if(!p)continue;field[i]=p.legacy;developed[i]=p.development;mask[i]=1;}
  const radius=Math.max(2,Math.round(w/110)),blurred=boxBlur(field,w,h,radius,2),blurredDevelopment=boxBlur(developed,w,h,radius,2),weight=boxBlur(mask,w,h,radius,2),REFERENCE=.82;
  const raw=new Float32Array(n),faith=new Map(civ.nations.map(nation=>[nation.id,stateFaithFactor(nation)]));let people=0,secular=0;
  for(let i=0;i<n;i++){if(!l.ownership[i]||!l.culture[i]||l.elevation[i]<=0||l.lake?.[i]||!l.religion[i]||!mask[i])continue;
    const x=i%w,y=Math.floor(i/w),urbanShare=clamp((urban.get(i)||0)/Math.max(1,l.population[i]),0,1),regional=fractalNoise((x+.5)/w,(y+.5)/h,4,2,seed,.5),base=weight[i]>0?blurred[i]/weight[i]:field[i];
    // Calibrated at a reference development level without urban effects, so the
    // setting is the typical unaffiliated share while development, cities and
    // trade still raise it (and their absence lowers it) where they occur.
    const development=weight[i]>0?blurredDevelopment[i]/weight[i]:REFERENCE;raw[i]=base*Math.exp(.55*regional)*(1+.12*(l.tradeAccess?.[i]||0))*(faith.get(l.ownership[i])??1);developed[i]=Math.pow(development/REFERENCE,1.6)*(1+.6*urbanShare);people+=l.population[i];secular+=l.population[i]*Math.min(.86,raw[i]);}
  let scale=secular>0?rate*people/secular:0;for(let pass=0;pass<4&&secular>0;pass++){let s=0;for(let i=0;i<n;i++)if(raw[i])s+=l.population[i]*Math.min(.86,raw[i]*scale);if(!s)break;scale*=rate*people/s;}
  for(let i=0;i<n;i++){if(!raw[i])continue;
    const factor=faith.get(l.ownership[i])??1;let share=rate>=1?.96*Math.min(1,factor):clamp(raw[i]*scale*developed[i],0,factor<1?.86*factor:.86);if(share<.01)continue;
    if(share>=.5){l.religionMinority[i]=l.religion[i];l.religion[i]=NO_RELIGION_ID;l.religionMinorityShare[i]=1-share;}
    // Secular residents are recorded as the minority unless a faith minority is larger.
    else if(!l.religionMinority[i]||l.religionMinorityShare[i]<share){l.religionMinority[i]=NO_RELIGION_ID;l.religionMinorityShare[i]=share;}
  }
  civ.secularSettingsSignature=signature;civ.religionRevision=(civ.religionRevision||0)+1;return world;
}
/** Separable wrapped box blur, repeated for an approximately Gaussian kernel. */
function boxBlur(source,w,h,radius,passes=2){
  let a=Float32Array.from(source),b=new Float32Array(a.length);const size=radius*2+1;
  for(let pass=0;pass<passes;pass++){
    for(let y=0;y<h;y++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=a[y*w+((k%w)+w)%w];for(let x=0;x<w;x++){b[y*w+x]=sum/size;sum+=a[y*w+(x+radius+1)%w]-a[y*w+((x-radius)%w+w)%w];}}
    for(let x=0;x<w;x++){let sum=0,count=0;for(let k=0;k<=radius&&k<h;k++){sum+=b[k*w+x];count++;}for(let y=0;y<h;y++){a[y*w+x]=sum/count;const add=y+radius+1,remove=y-radius;if(add<h){sum+=b[add*w+x];count++;}if(remove>=0){sum-=b[remove*w+x];count--;}}}
  }
  return a;
}
export function reconcileReligions(world){const civ=world.meta.civilization,l=world.layers;if(!l.religion||!civ.religions?.length)return generateReligions(world);const byId=new Map(civ.religions.map(r=>[r.id,r])),validCities=new Set(civ.cities.map(c=>c.id)),fallback=civ.religions.find(r=>!r.secular)?.id||0;for(let i=0;i<l.religion.length;i++){if(!l.ownership[i]||!l.culture[i]||l.elevation[i]<=0){l.religion[i]=0;l.religionMinority[i]=0;l.religionMinorityShare[i]=0;}else if(!byId.has(l.religion[i])){let replacement=0;neighbors(i,world.width,world.height,j=>{if(byId.has(l.religion[j]))replacement=l.religion[j];});l.religion[i]=replacement||fallback;}}
  for(const religion of civ.religions){if(religion.secular){religion.holyCities=[];continue;}religion.holyCities=religion.holyCities.filter(id=>validCities.has(id));if(!religion.holyCities.length){const city=closestCity(world,religion.homeland);if(city)religion.holyCities.push(city.id);}}return world;}
