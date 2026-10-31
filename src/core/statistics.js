import {rowArea} from './geo.js';
export function calculateStatistics(world) {
  const {width:w,height:h,layers:l}=world, climate={},biome={};
  let area=0,land=0,lakes=0,river=0,temp=0,rain=0,min=Infinity,max=-Infinity,landTemp=0;
  let riverCells=0,lakeCells=0;
  for(let y=0;y<h;y++){
    const a=rowArea(y,h);
    for(let x=0;x<w;x++){
      const i=y*w+x,e=l.elevation[i]; area+=a; min=Math.min(min,e);max=Math.max(max,e);
      temp+=l.annualTemperature[i]*a;
      if(e>0){land+=a;landTemp+=l.annualTemperature[i]*a;rain+=l.annualPrecipitation[i]*a;climate[l.koppen[i]]=(climate[l.koppen[i]]||0)+a;biome[l.biome[i]]=(biome[l.biome[i]]||0)+a;if(l.lake[i]){lakes+=a;lakeCells++;}if(l.river[i]){river+=a;riverCells++;}}
    }
  }
  const distribution = o=>Object.entries(o).map(([id,a])=>({id:+id,share:a/land})).sort((a,b)=>b.share-a.share);
  return {landShare:land/area,oceanShare:1-land/area,minElevation:min,maxElevation:max,meanTemperature:temp/area,meanLandTemperature:landTemp/(land||1),meanPrecipitation:rain/(land||1),lakeShare:lakes/(land||1),riverShare:river/(land||1),riverCells,lakeCells,climate:distribution(climate),biome:distribution(biome)};
}
