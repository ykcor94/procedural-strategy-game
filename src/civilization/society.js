/** Starting society products. No clock advances and no historical simulation runs here. */
import {seededRandom,clamp,generateName,generateToponym,generatePersonName,languageAt,featureWords} from './society-utils.js';
import {regenerateProvinces,repairProvinces,createProvince,transferProvinceCells} from './provinces.js';
import {generateEconomy,recomputeEconomy,initializeEconomicProfiles,generateTradeRoutes,deriveUrbanization,applyReligiousTechnology,repairTradeRoutes} from './economy.js';
import {generateReligions,reconcileReligions,renameReligionIdentities,applyNoReligion,NO_RELIGION_ID} from './religions.js';
import {deriveCityDemographics,censusSociety} from './demographics.js';
import {ensureDistinctIdentityNames} from './identity.js';
export {regenerateProvinces,repairProvinces,createProvince,transferProvinceCells,generateEconomy,generateTradeRoutes,generateReligions,applyNoReligion,NO_RELIGION_ID};
export const SOCIETY_LAYERS=['province','religion','religionMinority','religionMinorityShare','economicOutput','productivity','tradeAccess'];
export function generateStartDate(seed,era='modern'){const r=seededRandom(seed,'starting-calendar'),year=era==='ancient'?120+Math.floor(r()*1200):era==='medieval'?900+Math.floor(r()*700):era==='future'?2100+Math.floor(r()*900):1940+Math.floor(r()*360),month=1+Math.floor(r()*12),day=1+Math.floor(r()*28);return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
function calendar(civ){const candidate=String(civ.settings.startDate||civ.startDate||'2000-01-01'),match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(candidate);let year=match?+match[1]:2000,month=match?+match[2]:1,day=match?+match[3]:1;if(year<1||year>9999||month<1||month>12)year=2000,month=1,day=1;const days=[31,(year%4===0&&year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];day=clamp(day,1,days[month-1]);civ.startDate=`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;civ.calendar={version:1,year,month,day,date:civ.startDate,era:'Common Era',monthsPerYear:12,label:`${day} ${['January','February','March','April','May','June','July','August','September','October','November','December'][month-1]} ${year}`};civ.settings.startDate=civ.startDate;}
function renameDependentIdentities(world){const civ=world.meta.civilization;for(const p of civ.provinces){const language=languageAt(world,p.center??0),name=generateToponym(language,civ.seed,`province:${p.id}`,{features:featureWords(world,p.center??0),kind:'province'});if(!p.manual?.name){p.name=name.name;p.nameMeaning=p.meaning=name.meaning;}if(!p.manual?.governor)p.governor={...p.governor,name:generatePersonName(language,civ.seed,`governor:${p.id}`)};}
  renameReligionIdentities(world);
}
export function generateSociety(world,scope='all',report=()=>{},hooks={}){
  const civ=world.meta.civilization;if(!civ)return world;const fresh=!civ.societyVersion;civ.societyVersion=1;calendar(civ);
  if(civ.provincesPrepared){delete civ.provincesPrepared;repairProvinces(world);}else if(fresh||scope==='all'||scope==='provinces'){report('provinces',.84,'Organizing geographic provinces and regional governors');regenerateProvinces(world);}else repairProvinces(world);
  const economic=fresh||['all','economy','cities','population','nations','cultures'].includes(scope),rebuildProfiles=fresh||['all','nations','economy'].includes(scope);
  if(economic){report('economy',.88,'Connecting ports, river corridors and commercial centers');generateEconomy(world,{routes:true,urbanization:false,preserveProfiles:!rebuildProfiles});}
  if(['all','cultures','economy'].includes(scope))hooks.refreshLanguageContact?.(world);
  if(fresh||scope==='all'||scope==='religions'){report('religions',.93,'Spreading traditions from sacred homelands and trading ports');generateReligions(world,{applySecular:false});}else reconcileReligions(world);
  if(scope==='cultures')renameDependentIdentities(world);
  if(economic){
    if(['all','cities','population'].includes(scope)){deriveUrbanization(world);reconcileReligions(world);}
  }
  applyNoReligion(world,{refresh:economic||scope==='religions'});
  // A stored material baseline prevents faith bonuses accumulating on unrelated rerolls.
  if(rebuildProfiles)applyReligiousTechnology(world);
  recomputeEconomy(world);deriveCityDemographics(world);censusSociety(world);ensureDistinctIdentityNames(world);civ.revision=(civ.revision||0)+1;report('society',.98,'Measuring regional economies, faiths, languages and urban populations');return world;
}
export function recomputeSociety(world,options={}){
  const civ=world.meta.civilization;if(!civ?.societyVersion)return world;calendar(civ);if(options.repairProvinces!==false)repairProvinces(world);reconcileReligions(world);
  const cityIds=new Set(civ.cities.map(c=>c.id)),oldRouteCount=civ.tradeRoutes?.length||0;civ.tradeRoutes=(civ.tradeRoutes||[]).filter(r=>cityIds.has(r.from)&&cityIds.has(r.to));if(!world.layers.tradeAccess)generateTradeRoutes(world);else repairTradeRoutes(world,{networkChanged:oldRouteCount!==civ.tradeRoutes.length});
  if(civ.nations.some(n=>!Number.isFinite(n.baseProductivity)||n.economicProfile?.government!==n.government))initializeEconomicProfiles(world,{onlyChanged:true});recomputeEconomy(world);applyNoReligion(world);deriveCityDemographics(world);censusSociety(world);ensureDistinctIdentityNames(world);return world;
}
export function migrateSociety(world){const civ=world.meta?.civilization;if(!civ)return world;if(!civ.societyVersion||SOCIETY_LAYERS.some(key=>!world.layers[key]))return generateSociety(world,'migrate');const revision=civ.provinceRevision,province=world.layers.province.slice(),parents=new Map(civ.provinces.map(p=>[p.id,p.nation]));recomputeSociety(world);if(civ.provinces.length===parents.size&&civ.provinces.every(p=>parents.get(p.id)===p.nation)&&province.every((id,i)=>world.layers.province[i]===id))civ.provinceRevision=revision;return world;}
export function validateSociety(world){
  const civ=world.meta?.civilization;if(!civ?.societyVersion)return true;if(civ.societyVersion!==1)throw new Error('Unsupported society version.');const l=world.layers,n=world.width*world.height;
  for(const [key,Type]of [['province',Uint16Array],['religion',Uint16Array],['religionMinority',Uint16Array],['religionMinorityShare',Float32Array],['economicOutput',Float64Array],['productivity',Float32Array],['tradeAccess',Float32Array]])if(!(l[key] instanceof Type)||l[key].length!==n)throw new Error(`Invalid society ${key} layer.`);
  const ids=(key,max)=>{if(!Array.isArray(civ[key])||civ[key].length>max)throw new Error(`Invalid society ${key}.`);const ids=new Set();for(const e of civ[key]){if(!Number.isInteger(e.id)||e.id<1||e.id>65534||ids.has(e.id))throw new Error(`Invalid or duplicate ${key} ID.`);ids.add(e.id);}return ids;};
  const provinceIds=ids('provinces',65534),religionIds=ids('religions',151),familyIds=ids('religionFamilies',41),nationIds=new Set(civ.nations.map(n=>n.id)),cityIds=new Set(civ.cities.map(c=>c.id)),byProvince=new Map(civ.provinces.map(p=>[p.id,p]));
  for(const p of civ.provinces)if(!nationIds.has(p.nation)||!p.governor||!Number.isFinite(p.governor.age)||p.governor.age<18||p.governor.age>110||!Number.isFinite(p.population)||p.population<0||!Number.isFinite(p.area)||p.area<0)throw new Error('Invalid province identity, governor or census.');
  for(const religion of civ.religions)if(!familyIds.has(religion.family)||!Array.isArray(religion.holyCities)||religion.holyCities.some(id=>!cityIds.has(id))||(religion.secular?religion.id!==NO_RELIGION_ID||religion.family!==NO_RELIGION_ID||religion.holyCities.length!==0:!Number.isInteger(religion.homeland)||religion.homeland<0||religion.homeland>=n))throw new Error('Invalid religion homeland, family or holy site.');
  for(const nation of civ.nations)if(!Number.isFinite(nation.technology)||nation.technology<0||nation.technology>1||!Number.isFinite(nation.gdp)||nation.gdp<0||!nation.currency||!Number.isFinite(nation.currency.rate)||nation.currency.rate<=0)throw new Error('Invalid national technology, economy or currency.');
  if(!Array.isArray(civ.tradeRoutes)||civ.tradeRoutes.length>2000)throw new Error('Invalid trade routes.');for(const route of civ.tradeRoutes)if(!cityIds.has(route.from)||!cityIds.has(route.to)||route.from===route.to||!Array.isArray(route.points)||route.points.length<4||route.points.length>50000||route.points.some(v=>!Number.isFinite(v))||!Number.isFinite(route.volume)||route.volume<0||!Number.isFinite(route.distanceKm)||route.distanceKm<0)throw new Error('Invalid trade route.');
  for(let i=0;i<n;i++){if(l.province[i]&&(!provinceIds.has(l.province[i])||byProvince.get(l.province[i]).nation!==l.ownership[i]))throw new Error('A province crosses a national boundary.');if(l.ownership[i]&&!l.province[i])throw new Error('Claimed land needs a province.');if(l.religion[i]&&!religionIds.has(l.religion[i])||l.religionMinority[i]&&!religionIds.has(l.religionMinority[i]))throw new Error('Invalid religion reference.');if(!Number.isFinite(l.religionMinorityShare[i])||l.religionMinorityShare[i]<0||l.religionMinorityShare[i]>.5||!Number.isFinite(l.tradeAccess[i])||l.tradeAccess[i]<0||l.tradeAccess[i]>1)throw new Error('Invalid society fraction.');if(!Number.isFinite(l.productivity[i])||l.productivity[i]<0||!Number.isFinite(l.economicOutput[i])||l.economicOutput[i]<0)throw new Error('Invalid economic value.');if(l.elevation[i]<=0&&(l.province[i]||l.religion[i]||l.economicOutput[i]))throw new Error('Society cannot occupy ocean cells.');}
  return true;
}
