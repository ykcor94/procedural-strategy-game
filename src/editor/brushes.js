import {clamp,wrapX,wrappedDelta} from '../core/geo.js';
export class TerrainEditor {
  constructor(){this.undoStack=[];this.redoStack=[];this.stroke=null;this.limit=30;}
  reset(){this.undoStack=[];this.redoStack=[];this.stroke=null;}
  begin(world){this.stroke={before:new Map(),world};}
  dab(cx,cy,radius,strength,tool) {
    if(!this.stroke)return;
    const {world,before}=this.stroke,{width:w,height:h,layers:l,settings:s}=world,e=l.elevation;
    const r=Math.min(w/2-0.5,Math.max(1,radius)), x0=Math.floor(cx-r),x1=Math.ceil(cx+r),y0=Math.max(0,Math.floor(cy-r)),y1=Math.min(h-1,Math.ceil(cy+r));
    const changes=[];
    for(let y=y0;y<=y1;y++)for(let xx=x0;xx<=x1;xx++){
      const x=wrapX(xx,w),i=y*w+x,d=Math.hypot(wrappedDelta(x,cx,w),y-cy)/r;
      if(d>=1)continue;
      const k=(1-d*d)**2,amount=strength*k;
      let v=e[i];
      if(tool==='raise')v+=amount;
      else if(tool==='lower')v-=amount;
      else if(tool==='land')v+=Math.max(40,-v+160)*Math.min(1,amount/350);
      else if(tool==='ocean')v-=Math.max(40,v+200)*Math.min(1,amount/350);
      else if(tool==='smooth'){
        let sum=0,n=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const yy=y+dy;if(yy>=0&&yy<h){sum+=e[yy*w+wrapX(x+dx,w)];n++;}}
        v+=(sum/n-v)*Math.min(0.9,amount/500);
      }
      v=clamp(v,s.minElevation,s.maxElevation);
      if(!before.has(i))before.set(i,e[i]);
      changes.push([i,v]);
    }
    for(const [i,v]of changes)e[i]=v;
  }
  end(){if(!this.stroke)return false;const {before,world}=this.stroke;this.stroke=null;if(!before.size)return false;const indices=Int32Array.from(before.keys()),old=Float32Array.from(before.values()),next=Float32Array.from(indices,i=>world.layers.elevation[i]);this.undoStack.push({indices,old,next});if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack=[];return true;}
  rollback(){if(this.stroke){for(const [i,v]of this.stroke.before)this.stroke.world.layers.elevation[i]=v;this.stroke=null;}}
  undo(world){const change=this.undoStack.pop();if(!change)return false;this.apply(world,change,'old');this.redoStack.push(change);return true;}
  redo(world){const change=this.redoStack.pop();if(!change)return false;this.apply(world,change,'next');this.undoStack.push(change);return true;}
  apply(world,change,key){change.indices.forEach((i,j)=>world.layers.elevation[i]=change[key][j]);}
}
