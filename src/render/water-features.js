import {buildRiverGeometry} from './river-geometry.js';
import {bankWidthKm,deltaRadiusKm,riverWetness} from '../generation/surface-water.js';
import {clamp,wrapX} from '../core/geo.js';
import {sampleBilinear} from '../core/sampling.js';

// A compact visual index of significant rivers. The discharge graph remains
// global; these polylines only refine the vegetation along its banks.
export function createWaterFeatures(world) {
  const {layers:l,width:w,height:h}=world;
  const river=Uint8Array.from(l.flow,(q,i)=>q>=800&&l.elevation[i]>0&&!l.lake[i]?1:0);
  return buildRiverGeometry({...world,layers:{...l,river}}).map(path=>({
    points:Float32Array.from(path.points,(v,i)=>v/(i%2?h:w)),
    beds:Float32Array.from({length:path.points.length/2},(_,i)=>sampleBilinear(l.filledElevation,path.points[i*2]/w,path.points[i*2+1]/h,w,h)),
    bounds:[path.bounds[0]/w,path.bounds[1]/h,path.bounds[2]/w,path.bounds[3]/h],
    flow:path.flow,bed:l.filledElevation[path.start],
    mouth:l.elevation[path.end]<=0?1:0
  }));
}

export function createWaterIndex(features=[]) {
  const cols=256,rows=128,segments=new Map(),mouths=new Map(),n=features.length;
  const widths=new Float64Array(n),wetness=new Float64Array(n),stamps=new Uint32Array(n),nearest=new Float64Array(n),beds=new Float64Array(n),touched=new Int32Array(n);let stamp=0;
  function insert(bins,x0,y0,x1,y1,item){for(let y=Math.max(0,Math.floor(y0*rows));y<=Math.min(rows-1,Math.floor(y1*rows));y++)for(let x=Math.floor(x0*cols);x<=Math.floor(x1*cols);x++){const key=y*cols+wrapX(x,cols);let list=bins.get(key);if(!list)bins.set(key,list=[]);list.push(item);}}
  for(let id=0;id<n;id++) {
    const f=features[id],p=f.points,width=widths[id]=bankWidthKm(f.flow);wetness[id]=riverWetness(f.flow);
    for(let k=2;k<p.length;k+=2) {
      const a=p[k-2],b=p[k-1],c=p[k],d=p[k+1],py=width*3.8/20015;
      const cos=Math.max(.12,Math.cos(Math.max(Math.abs(b-.5),Math.abs(d-.5))*Math.PI)),px=width*3.8/(40075*cos);
      insert(segments,Math.min(a,c)-px,Math.min(b,d)-py,Math.max(a,c)+px,Math.max(b,d)+py,{id,a,b,c,d,mid:(a+c)*.5,bed0:f.beds?.[k/2-1]??f.bed,bed1:f.beds?.[k/2]??f.bed});
    }
    if(f.mouth){const x=p[p.length-2],y=p[p.length-1],radius=deltaRadiusKm(f.flow),py=radius*3.5/20015,px=radius*3.5/(40075*Math.max(.12,Math.cos((y-.5)*Math.PI)));insert(mouths,x-px,y-py,x+px,y+py,{id,x,y,r2:radius*radius*.65});}
  }
  return (u,v,e,out={})=>{
    out.moisture=out.delta=0;if(e<=0||e>2500)return out;
    const key=clamp(Math.floor(v*rows),0,rows-1)*cols+wrapX(Math.floor(u*cols),cols),sx=40075*Math.max(.12,Math.cos((v-.5)*Math.PI)),sy=20015;
    stamp=(stamp+1)>>>0;if(!stamp){stamps.fill(0);stamp=1;}let count=0;
    for(const s of segments.get(key)||[]) {
      const shift=Math.round(u-s.mid),ax=(s.a+shift-u)*sx,ay=(s.b-v)*sy,dx=(s.c-s.a)*sx,dy=(s.d-s.b)*sy,t=clamp(-(ax*dx+ay*dy)/(dx*dx+dy*dy||1),0,1),d2=(ax+t*dx)**2+(ay+t*dy)**2;
      if(stamps[s.id]!==stamp){stamps[s.id]=stamp;nearest[s.id]=Infinity;touched[count++]=s.id;}
      if(d2<nearest[s.id]){nearest[s.id]=d2;beds[s.id]=s.bed0+(s.bed1-s.bed0)*t;}
    }
    for(let k=0;k<count;k++){const id=touched[k];if(e<beds[id]+120)out.moisture=Math.max(out.moisture,wetness[id]*Math.exp(-nearest[id]/(widths[id]*widths[id])));}
    if(e<80)for(const m of mouths.get(key)||[]){const dx=(m.x+Math.round(u-m.x)-u)*sx,dy=(m.y-v)*sy,fan=wetness[m.id]*Math.exp(-(dx*dx+dy*dy)/m.r2)*clamp((80-e)/55,0,1);out.delta=Math.max(out.delta,fan);out.moisture=Math.max(out.moisture,fan);}
    return out;
  };
}
