import {KOPPEN_BY_CODE} from '../data/climates.js';

// Peel/Beck variant (0°C C/D boundary), in °C and mm. Primary source:
// Beck et al. (2018), Scientific Data, Methods and Table 2.
// https://doi.org/10.1038/sdata.2018.214
// B climates take precedence. If both s/w tests pass, seasonal rain totals
// break the tie as described in Beck's Methods. As extends the tropical Aw
// category to distinguish the rare dry-summer savanna subtype explicitly.
export const KOPPEN_THRESHOLDS = Object.freeze({
  tropicalMin:18, hotAridMean:18, rainforestDriest:60,
  monsoonIntercept:100, monsoonAnnualDivisor:25,
  aridityTemperatureFactor:20, ariditySummerAdjustment:280, aridityMixedAdjustment:140,
  seasonalDominance:0.7, desertFraction:0.5,
  temperateColdBoundary:0, polarWarmest:10, iceCapWarmest:0,
  summerDryMax:40, summerDryWinterRatio:1/3, winterDrySummerRatio:0.1,
  hotSummer:22, warmMonth:10, warmMonths:4, extremeWinter:-38,
});

function classifyStats(mean,cold,hot,warmMonths,total,dry,sdry,swet,wdry,wwet,summerRain,winterRain) {
  const t=KOPPEN_THRESHOLDS;
  const dryThreshold=Math.max(0,t.aridityTemperatureFactor*mean+
    (summerRain>t.seasonalDominance*total?t.ariditySummerAdjustment:
      winterRain>t.seasonalDominance*total?0:t.aridityMixedAdjustment));
  if(total<dryThreshold) return `B${total<dryThreshold*t.desertFraction?'W':'S'}${mean>=t.hotAridMean?'h':'k'}`;
  if(cold>=t.tropicalMin) {
    if(dry>=t.rainforestDriest)return 'Af';
    if(dry>=t.monsoonIntercept-total/t.monsoonAnnualDivisor)return 'Am';
    return sdry<wdry?'As':'Aw';
  }
  if(hot<=t.polarWarmest)return hot<=t.iceCapWarmest?'EF':'ET';
  const group=cold>t.temperateColdBoundary?'C':'D';
  const drySummer=sdry<t.summerDryMax&&sdry<wwet*t.summerDryWinterRatio;
  const dryWinter=wdry<swet*t.winterDrySummerRatio;
  let season='f';
  if(drySummer&&dryWinter)season=winterRain>summerRain?'s':'w';
  else if(drySummer)season='s';else if(dryWinter)season='w';
  const heat=hot>=t.hotSummer?'a':warmMonths>=t.warmMonths?'b':
    group==='D'&&cold<t.extremeWinter?'d':'c';
  return group+season+heat;
}

// Strided series avoids allocating two tiny arrays for every raster cell.
function classifySeries(temperature,precipitation,latitude,offset,stride) {
  let sum=0,cold=Infinity,hot=-Infinity,warm=0,total=0,dry=Infinity;
  let apT=0,apRain=0,otherT=0,otherRain=0,apDry=Infinity,apWet=0,otherDry=Infinity,otherWet=0;
  for(let m=0;m<12;m++) {
    const v=temperature[offset+m*stride], p=precipitation[offset+m*stride];
    sum+=v;cold=Math.min(cold,v);hot=Math.max(hot,v);total+=p;dry=Math.min(dry,p);
    if(v>KOPPEN_THRESHOLDS.warmMonth)warm++;
    if(m>=3&&m<=8){apT+=v;apRain+=p;apDry=Math.min(apDry,p);apWet=Math.max(apWet,p);}
    else{otherT+=v;otherRain+=p;otherDry=Math.min(otherDry,p);otherWet=Math.max(otherWet,p);}
  }
  const northSummer=apT>otherT||(apT===otherT&&latitude>=0);
  return classifyStats(sum/12,cold,hot,warm,total,dry,
    northSummer?apDry:otherDry,northSummer?apWet:otherWet,
    northSummer?otherDry:apDry,northSummer?otherWet:apWet,
    northSummer?apRain:otherRain,northSummer?otherRain:apRain);
}

export function classifyKoppen(temperature,precipitation,latitude=45) {
  if(temperature.length!==12||precipitation.length!==12)throw new Error('Köppen classification requires 12 monthly values.');
  for(let m=0;m<12;m++)if(!Number.isFinite(temperature[m])||!Number.isFinite(precipitation[m])||precipitation[m]<0)
    throw new Error('Climate values must be finite, with nonnegative precipitation.');
  return classifySeries(temperature,precipitation,latitude,0,1);
}

export function classifyClimate(world) {
  const {width:w,height:h,layers:l}=world,n=w*h;
  const out=new Uint8Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x;
    if(l.elevation[i]>0)out[i]=KOPPEN_BY_CODE[classifySeries(l.temperature,l.precipitation,90-(y+.5)*180/h,i,n)].id;
  }
  l.koppen=out;
}
