import {clamp,wrapX} from '../core/geo.js';
export const TILE_SIZE=256;
export const MAX_LOD=8; // 131,072 × 65,536 visual pixels; ~306 m at equator.
export const tileKey=({level,x,y})=>`${level}/${x}/${y}`;
export function tileBounds({level,x,y}){const rows=2**level;return {u:x/(rows*2),v:y/rows,du:1/(rows*2),dv:1/rows};}
export function parentTile(tile){return tile.level?{level:tile.level-1,x:Math.floor(tile.x/2),y:Math.floor(tile.y/2)}:null;}
/** `previous` adds hysteresis, so a zoom resting near a threshold never
 * alternates between two levels (and their fades) from frame to frame. */
export function visibleTiles(camera,w,h,maxLevel=MAX_LOD,tileBudget=48,previous=null) {
  const raw=Math.log2(w*camera.scale/(TILE_SIZE*2));let level=Math.ceil(raw);
  if(Number.isInteger(previous)&&previous<=maxLevel&&raw>previous-1.12&&raw<=previous+.12)level=previous;
  level=clamp(level,0,maxLevel);
  const rows=2**level,cols=rows*2,left=(camera.x-camera.width/(2*camera.scale))/w,right=(camera.x+camera.width/(2*camera.scale))/w;
  const top=Math.max(0,(camera.y-camera.height/(2*camera.scale))/h),bottom=Math.min(1,(camera.y+camera.height/(2*camera.scale))/h),tiles=[];
  for(let y=Math.max(0,Math.floor(top*rows));y<Math.min(rows,Math.ceil(bottom*rows));y++)
    for(let x=Math.floor(left*cols);x<Math.ceil(right*cols);x++)tiles.push({level,x:wrapX(x,cols),y,copy:Math.floor(x/cols)});
  return tiles.length>tileBudget&&level>0?visibleTiles(camera,w,h,level-1,tileBudget):tiles;
}
export function intersectsBounds(tile,bounds) {
  const b=tileBounds(tile);
  if(b.v+b.dv<bounds.v0||b.v>bounds.v1)return false;
  for(const shift of [-1,0,1])if(b.u+b.du>=bounds.u0+shift&&b.u<=bounds.u1+shift)return true;
  return false;
}
export function affectsDetailTile(tile,bounds){const b=tileBounds(tile),pad=Math.max(14/40075,b.du/TILE_SIZE*2);return intersectsBounds(tile,{u0:bounds.u0-pad,u1:bounds.u1+pad,v0:bounds.v0-pad*2,v1:bounds.v1+pad*2});}
