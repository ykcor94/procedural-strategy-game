import {KOPPEN} from '../data/climates.js';
import {BIOME_BY_CODE} from '../data/biomes.js';

const id=code=>BIOME_BY_CODE[code].id;
// Class-derived vegetation is modified only by measurable terrain and water.
// No random per-cell biome decisions: boundaries follow climate/soil contours.
export function deriveBiomes(world) {
  const {width:w,height:h,layers:l}=world,n=w*h,biome=new Uint8Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x,z=l.elevation[i];
    if(z<=0){biome[i]=id('ocean');continue;}
    if(l.lake?.[i]){biome[i]=id('lake');continue;}
    const code=KOPPEN[l.koppen[i]]?.code||'ET',moist=(l.surfaceMoisture||l.soilMoisture)[i],rain=l.annualPrecipitation[i],temp=l.annualTemperature[i];
    let b;
    if(code==='EF')b='ice';
    else if(code==='ET')b=z>1500?'alpine':'tundra';
    else if(code==='BWh')b='hot-desert';
    else if(code==='BWk')b='cold-desert';
    else if(code.startsWith('BS'))b='steppe';
    else if(code==='Af')b='rainforest';
    else if(code==='Am')b=moist>.68?'rainforest':'seasonal-forest';
    else if(code==='Aw'||code==='As')b=moist>.55?'seasonal-forest':'savanna';
    else if(code[1]==='s')b=moist>.66&&rain>1000?'temperate-forest':'mediterranean';
    else if(code[0]==='D'&&(code[2]==='c'||code[2]==='d'))b='taiga';
    else if(moist<.28&&rain<850)b='grassland';
    else if(rain>1450&&moist>.62&&temp>3&&temp<20)b='temperate-rainforest';
    else b='temperate-forest';
    const treeline=3400-Math.abs(90-(y+.5)*180/h)*29;
    if(z>Math.max(1700,treeline)&&b!=='ice'&&b!=='hot-desert'&&b!=='cold-desert'&&b!=='tundra')b='alpine';
    else if(z>1400&&moist>.45&&(b==='temperate-forest'||b==='rainforest'||b==='seasonal-forest'))b='montane';
    const west=y*w+(x+w-1)%w,east=y*w+(x+1)%w,north=y?i-w:i,south=y<h-1?i+w:i;
    const adjacentWater=l.lake?.[west]||l.lake?.[east]||l.lake?.[north]||l.lake?.[south]||
      l.river?.[west]||l.river?.[east]||l.river?.[north]||l.river?.[south];
    if(b!=='ice'&&b!=='tundra'&&b!=='alpine') {
      // A raster river cell is a catchment corridor, often tens of km wide.
      // Keep its vegetation underneath the independent, narrow channel overlay.
      if(temp>4&&z<80&&(l.alluvium?.[i]||0)>.45)b='delta';
      else if(temp>4&&(l.floodplainFraction?.[i]||0)>.4&&(l.riparianMoisture?.[i]||0)>.4)b='riparian';
      else if(z<130&&moist>.7&&adjacentWater)b='wetland';
      else if(z<14&&!['hot-desert','cold-desert','steppe'].includes(b)&&(l.elevation[west]<=0||l.elevation[east]<=0||l.elevation[north]<=0||l.elevation[south]<=0))b='coast';
    }
    biome[i]=id(b);
  }
  l.biome=biome;
}
