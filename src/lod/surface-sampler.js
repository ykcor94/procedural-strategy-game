import {clamp,wrapX} from '../core/geo.js';
import {createWaterIndex} from '../render/water-features.js';
import {BIOME_BY_CODE} from '../data/biomes.js';

/** All continuous fields share one four-cell stencil. Fallbacks are evaluated
 * only when a refined cove/islet lacks coarse samples of its surface type.
 */
export function createSurfaceSampler(source) {
  const {width:w,height:h,layers:l}=source,water=createWaterIndex(source.waterFeatures),wet={},fertility=source.settings.riverFertility??.65;
  return (u,v,e,month=-1,out={})=>{
    const x=wrapX(u*w-.5,w),y=clamp(v*h-.5,0,h-1),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const a=iy*w+ix,b=iy*w+(ix+1)%w,c=Math.min(h-1,iy+1)*w+ix,d=Math.min(h-1,iy+1)*w+(ix+1)%w;
    const wa=(1-fx)*(1-fy),wb=fx*(1-fy),wc=(1-fx)*fy,wd=fx*fy;
    const ground=l.elevation[a]*wa+l.elevation[b]*wb+l.elevation[c]*wc+l.elevation[d]*wd;
    const mean=l.annualTemperature[a]*wa+l.annualTemperature[b]*wb+l.annualTemperature[c]*wc+l.annualTemperature[d]*wd,lapse=(Math.max(0,e)-Math.max(0,ground))*.0061;
    const hot=l.warmestTemperature,temp=mean-lapse,warm=hot?hot[a]*wa+hot[b]*wb+hot[c]*wc+hot[d]*wd:20;
    const aa=l.elevation[a]>0?wa:0,bb=l.elevation[b]>0?wb:0,cc=l.elevation[c]>0?wc:0,dd=l.elevation[d]>0?wd:0,land=aa+bb+cc+dd;
    let moisture=0,strength=0,delta=0;
    if(e>0) {
      const soil=l.naturalMoisture||l.soilMoisture;
      const rain=l.annualPrecipitation;
      moisture=land>1e-8?(soil[a]*aa+soil[b]*bb+soil[c]*cc+soil[d]*dd)/land:clamp((rain?rain[a]*wa+rain[b]*wb+rain[c]*wc+rain[d]*wd:500)/Math.max(300,500+mean*38)*.3,0,.8);
      moisture=clamp(moisture-(e-ground)*.0012,0,1);
      if(fertility>0){water(u,v,e,wet);strength=wet.moisture*fertility;delta=wet.delta*fertility;}
    }
    const nearest=clamp(Math.floor(v*h),0,h-1)*w+wrapX(Math.floor(u*w),w);
    let biome=l.biome[nearest];if(e>0&&temp>4&&strength>.45)biome=delta>.45?BIOME_BY_CODE.delta.id:BIOME_BY_CODE.riparian.id;
    const lakes=l.lake,surfaces=l.lakeSurface,lakeWeight=lakes?lakes[a]*wa+lakes[b]*wb+lakes[c]*wc+lakes[d]*wd:0,lakeSurface=lakeWeight&&surfaces?(surfaces[a]*wa+surfaces[b]*wb+surfaces[c]*wc+surfaces[d]*wd)/lakeWeight:0;
    let ice=0;
    if(month!==-2) {
      const field=month<0?l.annualIce:l.seaIce,offset=month<0?0:month*w*h,sea=1-land;
      if(field){if(sea>1e-8)ice=(field[offset+a]*(wa-aa)+field[offset+b]*(wb-bb)+field[offset+c]*(wc-cc)+field[offset+d]*(wd-dd))/sea/255;
        else{const t=month<0?mean:mean+Math.max(0,warm-mean)*Math.cos((month-6.5)*Math.PI/6)*(v<.5?1:-1);ice=warm<-1.8?1:clamp((-1.8-t)/9,0,1);}}
    }
    const relief=l.relief;out.e=e;out.temp=temp;out.moisture=moisture+(1-moisture)*strength;out.biome=biome;out.lake=lakeWeight>.05&&ground<lakeSurface&&l.elevation[nearest]>0;out.warmest=warm-lapse;out.wet=strength;out.ice=clamp(ice,0,1);out.macro=relief?relief[a]*wa+relief[b]*wb+relief[c]*wc+relief[d]*wd:0;
    return out;
  };
}
