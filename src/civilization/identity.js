/** Identity polish: globally distinct names and colours that neighbours can tell apart.
 * Runs after society generation and on import; it never moves borders or people. */
import {generateName,generateToponym,languageAt,featureWords} from './society-utils.js';
import {renameReligionIdentities} from './religions.js';

/** Comparison key: case, accents, punctuation and doubled letters never make two names distinct. */
export const identityKey=name=>String(name||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z]/g,'').replace(/(.)\1+/g,'$1');

function languageOf(civ,id){return (civ.languages||[]).find(l=>l.id===id)||civ.cultures.find(c=>c.language?.id===id)?.language||civ.cultures[0]?.language;}

/** Rename until a key is free. `make(attempt)` returns a candidate name; the last resort adds a qualifier. */
function claim(entity,taken,make,qualifiers=['New','Upper','Lower','Greater','Little']){
  if(entity.manual?.name){taken.add(identityKey(entity.name));return false;}
  const key=identityKey(entity.name);if(key&&!taken.has(key)){taken.add(key);return false;}
  for(let attempt=1;attempt<=60;attempt++){const name=make(attempt);const k=identityKey(name);if(k&&!taken.has(k)){entity.name=name;taken.add(k);return true;}}
  for(const q of qualifiers){const name=`${q} ${entity.name}`,k=identityKey(name);if(!taken.has(k)){entity.name=name;taken.add(k);return true;}}
  return false;
}

/** Provinces, cities, cultures, languages, families and religions each get distinct names across the
 * whole world. A province may share its seat city's name (as in "X City, X Province"); religions may not
 * reuse a people's or language's name. Returns the number of renamed entities. */
export function ensureDistinctIdentityNames(world){
  const civ=world.meta?.civilization;if(!civ)return 0;const seed=civ.seed;let renamed=0;
  const nationKeys=new Set((civ.nations||[]).map(n=>identityKey(n.name)));
  // Peoples: cultures, languages and families are separate registries (a language may be named for its people).
  for(const [list,kind] of [[civ.cultures,'culture'],[civ.languages||[],'language'],[civ.families||[],'family']]){
    const taken=new Set();
    for(const e of [...list].sort((a,b)=>(b.population||0)-(a.population||0)||a.id-b.id)){
      const language=kind==='language'?e:kind==='culture'?e.language:civ.cultures.find(c=>c.family===e.id)?.language;
      if(!language?.phonology){taken.add(identityKey(e.name));continue;}
      if(claim(e,taken,a=>generateName(language,seed,`${kind}:${e.id}:distinct:${a}`,'culture')))renamed++;
    }
  }
  // Religions: families must not echo peoples, languages or nations; sects follow their family.
  if(civ.religionFamilies?.length){
    const reserved=new Set([...nationKeys,...civ.cultures.map(c=>identityKey(c.name)),...(civ.languages||[]).map(l=>identityKey(l.name))]);
    const clash=()=>{const seen=new Set();for(const r of civ.religions||[]){if(r.secular)continue;const k=identityKey(r.name);if(seen.has(k)||reserved.has(k))return true;seen.add(k);}return false;};
    if(clash()){renameReligionIdentities(world,reserved);renamed++;}
  }
  // Cities: unique across the world, most populous first.
  const cityKeys=new Set();
  for(const city of [...civ.cities].sort((a,b)=>Number(!!b.manual?.name)-Number(!!a.manual?.name)||(b.population||0)-(a.population||0)||a.id-b.id)){
    const language=languageOf(civ,city.language)||civ.cultures.find(c=>c.id===city.culture)?.language;if(!language)continue;
    if(claim(city,cityKeys,a=>{const t=generateToponym(language,seed,`city:${city.id}:distinct:${a}`,{features:featureWords(world,city.cell)});city.nameMeaning=t.meaning;city.nameRoots=t.roots;return t.name;}))renamed++;
  }
  // Provinces: unique among provinces and never another nation's or another province's seat name.
  const seatName=new Map();for(const city of civ.cities)seatName.set(city.id,identityKey(city.name));
  const provinceKeys=new Set(nationKeys);
  for(const p of [...(civ.provinces||[])].sort((a,b)=>Number(!!b.manual?.name)-Number(!!a.manual?.name)||(b.population||0)-(a.population||0)||a.id-b.id)){
    const own=seatName.get(p.capital),others=new Set([...cityKeys].filter(k=>k!==own)),taken=new Set([...provinceKeys,...others]),language=languageAt(world,p.center??0);
    if(!language){provinceKeys.add(identityKey(p.name));continue;}
    const before=p.name;if(claim(p,taken,a=>{const t=generateToponym(language,seed,`province:${p.id}:distinct:${a}`,{features:featureWords(world,p.center??0),kind:'province'});p.nameMeaning=p.meaning=t.meaning;return t.name;}))renamed++;
    provinceKeys.add(identityKey(p.name));if(before!==p.name)p.renamedFrom=before;
  }
  return renamed;
}

export {stateFaithFactor} from './faith.js';

/* ---------- colours ---------- */
const lin=c=>{c/=255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);};
export function oklab(hex){
  const r=lin(parseInt(hex.slice(1,3),16)),g=lin(parseInt(hex.slice(3,5),16)),b=lin(parseInt(hex.slice(5,7),16));
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
export function colorDistance(a,b){const p=oklab(a),q=oklab(b);return Math.hypot(p[0]-q[0],(p[1]-q[1])*1.4,(p[2]-q[2])*1.4);}
export const NEIGHBOUR_COLOR_THRESHOLD=.09;
/** Cell-adjacency between ids of a grid (x wraps). Returns Map<id, Map<neighbour, shared edges>> and cell counts. */
export function gridAdjacency(grid,width,height){
  const adj=new Map(),size=new Map(),link=(a,b)=>{if(!adj.has(a))adj.set(a,new Map());const m=adj.get(a);m.set(b,(m.get(b)||0)+1);};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,a=grid[i];if(!a)continue;size.set(a,(size.get(a)||0)+1);const r=grid[y*width+(x+1)%width];if(r&&r!==a){link(a,r);link(r,a);}if(y<height-1){const d=grid[i+width];if(d&&d!==a){link(a,d);link(d,a);}}}
  return {adj,size};
}
/** Greedy recolouring: larger entities keep their colour; a smaller neighbour that is too close moves to the
 * candidate furthest from all of its neighbours. Manual colours never change. Returns the ids recoloured. */
export function separateColors(entities,adjacency,candidates,threshold=NEIGHBOUR_COLOR_THRESHOLD){
  const byId=new Map(entities.map(e=>[e.id,e])),{adj,size}=adjacency,changed=[];
  const order=[...entities].sort((a,b)=>(size.get(b.id)||0)-(size.get(a.id)||0)||a.id-b.id),done=new Set();
  for(const e of order){
    const neighbours=[...(adj.get(e.id)?.keys()||[])].map(id=>byId.get(id)).filter(Boolean);
    const settled=neighbours.filter(n=>done.has(n.id)||n.manual?.color);
    done.add(e.id);if(e.manual?.color||!/^#[\da-f]{6}$/i.test(e.color||''))continue;
    if(!settled.some(n=>colorDistance(n.color,e.color)<threshold))continue;
    let best=e.color,score=-1;
    for(const c of candidates){const near=Math.min(...settled.map(n=>colorDistance(n.color,c)),...neighbours.filter(n=>!settled.includes(n)).map(n=>colorDistance(n.color,c)*1.6),9);
      // Prefer palette order (stable) once comfortably distinct.
      const value=Math.min(near,threshold*2.2);if(value>score+1e-9){score=value;best=c;}}
    if(best!==e.color){e.color=best;changed.push(e.id);}
  }
  return changed;
}
/** Keep bordering nations, peoples and languages visually distinct with colours from the same palette. */
export function separateNeighbourColors(world,paletteColor){
  const civ=world.meta?.civilization,l=world.layers;if(!civ||!l.ownership)return 0;const s=civ.settings||{};let total=0;
  for(const [group,grid] of [['nations',l.ownership],['cultures',l.culture],['languages',l.language]]){
    const list=civ[group];if(!list?.length||!grid)continue;
    const candidates=[];for(let k=1;k<=96;k++)candidates.push(paletteColor(k,`${civ.seed}:${group}:alt`,s.palette,s.paletteSaturation));
    total+=separateColors(list,gridAdjacency(grid,world.width,world.height),[...new Set(candidates)]).length;
  }
  return total;
}
