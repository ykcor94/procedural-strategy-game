import {clamp} from '../../core/geo.js';
import {seededRandom} from '../../core/random.js';
import {BIOME_BY_CODE} from '../../data/biomes.js';
import {INDUSTRIES,INDUSTRY_COUNT} from '../../data/industries.js';
import {cityFootprint} from '../../civilization/society-utils.js';
import {provinceResources,worldTypical,RESOURCE_INDEX} from '../resources.js';
/** Starting industries are a deterministic partition of the generated output: climate, soil, rivers,
 * coasts, mountains, holy sites, size and national development decide the weights. Nothing here is
 * saved; only the player's later changes are. */
const FOREST=['rainforest','seasonal-forest','temperate-forest','temperate-rainforest','taiga','montane','riparian'].map(c=>BIOME_BY_CODE[c].id);
const GRASS=['savanna','steppe','grassland','mediterranean'].map(c=>BIOME_BY_CODE[c].id);
const DESERT=['hot-desert','cold-desert'].map(c=>BIOME_BY_CODE[c].id);
const WET=['wetland','delta','coast'].map(c=>BIOME_BY_CODE[c].id);
const IDS=Object.fromEntries(INDUSTRIES.map(i=>[i.id,i.index]));
// What a good site for each industry scores before national tilt; used to turn weights into "site fit".
const REFERENCE=[1.1,.9,.9,.9,1,.8,.8,.8,.55,.65,.9,1.4,.6,1.1];

/** Average physical setting of a set of cells. */
export function sampleEnvironment(world,cells){
  const l=world.layers,cellKm=40075/world.width,e={arable:0,grass:0,forest:0,desert:0,wet:0,mountain:0,coast:0,river:0,hydro:0,warm:0,count:0};
  for(const i of cells){
    if(!(l.elevation[i]>0)||l.lake?.[i])continue;
    const t=l.annualTemperature?.[i]??12,m=l.surfaceMoisture?.[i]??l.soilMoisture?.[i]??.4,a=l.alluvium?.[i]??0,biome=l.biome?.[i],elev=l.elevation[i],tempFit=t<2?.1:t<8?.5:t<28?1:.6;
    e.arable+=clamp((.3+.7*m)*(.7+.6*a),0,1)*tempFit*(elev>1800?.3:1)*(DESERT.includes(biome)?.25:1);
    e.grass+=GRASS.includes(biome)?1:0;e.forest+=FOREST.includes(biome)?1:0;e.desert+=DESERT.includes(biome)?1:0;e.wet+=WET.includes(biome)?1:0;
    e.mountain+=clamp(Math.max(elev/4500,(l.mountainUplift?.[i]||0)/3000),0,1);
    e.coast+=Math.exp(-(l.coastDistance?.[i]??6)*cellKm/180);
    e.river+=(l.river?.[i]?1:Math.exp(-(l.riverDistance?.[i]??8)*cellKm/70));
    e.hydro+=clamp(Math.log10(1+(l.flow?.[i]||0))/5,0,1)*(elev>150?1:.4);
    e.warm+=clamp((t-8)/18,0,1);e.count++;
  }
  if(e.count)for(const k of Object.keys(e))if(k!=='count')e[k]/=e.count;
  return e;
}
/** Ore and fuel richness (0–1) of a province, from its geological resources (see game/resources.js). */
export function deposits(world,provinceId){
  const rec=provinceResources(world).get(provinceId);if(!rec?.cells){const r=seededRandom(`${world.seed}:${world.meta.civilization.seed}`,`deposit:${provinceId}`);return {ore:Math.pow(r(),1.5),fuel:Math.pow(r(),1.7)};}
  const t=worldTypical(world),rel=ids=>ids.reduce((s,id)=>s+rec.score[RESOURCE_INDEX[id]],0)/Math.max(1e-6,ids.reduce((s,id)=>s+t[RESOURCE_INDEX[id]],0));
  return {ore:clamp(1-Math.exp(-.6*rel(['iron','copper','precious','gems'])),0,1),fuel:clamp(1-Math.exp(-.55*rel(['coal','oil'])),0,1)};
}

/** Raw site weights (before national tilt) for one place; `u` is 0 for rural land, up to 1 for a megacity. */
function siteWeights(a){
  const {env:e,u,ore,fuel,port,capital,access,degree,holy,tech}=a,w=new Float64Array(INDUSTRY_COUNT);
  w[IDS.farming]=(.12+1.5*e.arable)*(1-.92*u);
  w[IDS.herding]=(.1+1.3*e.grass+.4*e.desert*(1-e.arable))*(1-.92*u);
  w[IDS.fishing]=(.04+1.4*e.coast*(.55+.45*e.wet)+.5*e.river+.3*e.wet)*(1-.5*u);
  w[IDS.forestry]=(.05+1.5*e.forest)*(1-.92*u);
  w[IDS.mining]=(.06+1.5*e.mountain)*(.35+1.3*ore);
  w[IDS.energy]=.08+.8*e.hydro+1.1*fuel*(.4+.6*e.mountain)+.3*e.desert*e.warm+.15*e.coast;
  w[IDS.heavy]=(.1+.7*ore*e.mountain+.6*fuel+.9*port+.3*e.river)*(.2+1.4*u);
  w[IDS.light]=(.25+.6*access+.2*e.coast)*(.25+1.3*u);
  w[IDS.food]=(.2+.5*(e.arable+e.grass+.5*e.coast))*(.3+.9*u);
  w[IDS.construction]=.55+.35*u;
  w[IDS.trade]=(.15+1.3*port+.9*access+.6*e.river+.5*Math.min(1,degree/4)+.4*capital)*(.25+1.2*u);
  w[IDS.finance]=capital*1.1+2.2*Math.pow(u,1.5)+.05;
  w[IDS.tourism]=(.12+.6*e.coast*e.warm+.7*Math.min(1,holy)+.5*e.mountain*(1-e.desert)+.4*Math.sqrt(u))*(.4+.6*tech);
  w[IDS.knowledge]=(2*u*u)*(capital?1.3:1)+.05;
  return w;
}
const tilt=(industry,tech,resources)=>{
  const sector=industry.sector,t=tech;
  const base=sector==='agriculture'?1.55-1.25*t:sector==='services'?.5+1.1*t:.7+1.2*2*t*(1-t);
  return base*(industry.id==='mining'||industry.id==='energy'?.7+.8*resources:1);
};

/** Industry shares and site fit for a place. */
export function industryProfile(world,attrs,key){
  const r=seededRandom(`${world.seed}:${world.meta.civilization.seed}`,`industry:${key}`),site=siteWeights(attrs),share=new Float64Array(INDUSTRY_COUNT),fit=new Float64Array(INDUSTRY_COUNT);let sum=0;
  for(const industry of INDUSTRIES){const k=industry.index,noise=Math.exp((r()-.5)*.6);share[k]=site[k]*tilt(industry,attrs.tech,attrs.resources)*noise;sum+=share[k];fit[k]=clamp(site[k]/REFERENCE[k],0,1.5);}
  for(let k=0;k<INDUSTRY_COUNT;k++)share[k]/=sum||1;
  return {share,fit};
}

/** Attributes of a settlement, from the geography under its footprint. */
export function cityAttributes(world,city,nation,context={}){
  const civ=world.meta.civilization,cells=new Set(),footprint=cityFootprint(city),w=world.width,h=world.height;
  for(let k=0;k<footprint.length;k+=2){const c=footprint[k],x=c%w,y=Math.floor(c/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const yy=y+dy;if(yy>=0&&yy<h)cells.add(yy*w+(x+dx+w)%w);}}
  const env=sampleEnvironment(world,cells),province=world.layers.province?.[city.cell]||city.province||0,dep=context.deposits?.(province)||deposits(world,province),holy=(civ.religions||[]).filter(rel=>rel.holyCities?.includes(city.id)).length;
  return {env,u:clamp(Math.log10(Math.max(500,city.population)/2000)/3.2,0,1),ore:dep.ore+(context.survey?.[province]||0),fuel:dep.fuel+(context.survey?.[province]||0),port:city.port?1:0,capital:city.capital?1:0,access:city.tradeAccess??.3,degree:city.tradeRoutes?.length||0,holy,tech:nation.technology??.5,resources:nation.economicProfile?.resources??.5};
}
export function ruralAttributes(world,env,province,nation,access,context={}){
  const dep=context.deposits?.(province.id)||deposits(world,province.id);
  return {env,u:0,ore:dep.ore+(context.survey?.[province.id]||0),fuel:dep.fuel+(context.survey?.[province.id]||0),port:0,capital:0,access,degree:0,holy:0,tech:nation.technology??.5,resources:nation.economicProfile?.resources??.5};
}

/** Share-weighted economic identity: the industries a nation is unusually strong in. */
const TYPICAL=[.11,.04,.02,.02,.03,.03,.07,.1,.06,.06,.12,.1,.04,.05];
const FLAVOUR={farming:'Grain-belt',herding:'Pastoral',fishing:'Fishing',forestry:'Timber',mining:'Mining',energy:'Energy',heavy:'Heavy-industry',light:'Manufacturing',food:'Food-processing',construction:'Builder',trade:'Trading',finance:'Financial',tourism:'Pilgrim & tourism',knowledge:'Knowledge'};
export function economicIdentity(shares){
  const total=TYPICAL.reduce((s,v)=>s+v,0),ranked=INDUSTRIES.map(i=>({id:i.id,quotient:shares[i.index]/(TYPICAL[i.index]/total),share:shares[i.index]})).sort((a,b)=>b.quotient-a.quotient),strengths=ranked.filter(r=>r.quotient>=1.25&&r.share>.025).slice(0,3);
  const lead=strengths.length?strengths.slice(0,2).map(s=>FLAVOUR[s.id]):['Diversified'];
  return {title:`${lead.join(' & ')} economy`,strengths:strengths.map(s=>s.id),ranked:ranked.map(r=>({id:r.id,quotient:+r.quotient.toFixed(2)}))};
}
