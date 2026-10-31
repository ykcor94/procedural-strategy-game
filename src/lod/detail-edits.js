import {clamp,wrappedDelta} from '../core/geo.js';

export function validateDetail(detail={version:1,algorithm:'anchored-fbm-v1',edits:[]}) {
  if(detail.version!==1||detail.algorithm!=='anchored-fbm-v1'||!Array.isArray(detail.edits)||detail.edits.length>10000)throw new Error('Unsupported or invalid visual terrain edits.');
  let count=0;
  for(const edit of detail.edits) {
    if(!['raise','lower','smooth'].includes(edit.operation)||!Number.isFinite(edit.radius)||edit.radius<=0||edit.radius>.25||!Number.isFinite(edit.strength)||edit.strength<0||edit.strength>5000||!Array.isArray(edit.points)||edit.points.length===0)throw new Error('Invalid visual terrain stroke.');
    count+=edit.points.length;if(count>200000)throw new Error('Too many visual terrain edit points.');
    for(const p of edit.points)if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[0]>=1||p[1]<0||p[1]>1)throw new Error('Invalid visual edit coordinates.');
  }
  return detail;
}
export function editBounds(edit) {
  const first=edit.points[0]?.[0]??0;let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
  for(const [u,v]of edit.points){const x=first+wrappedDelta(u,first,1);u0=Math.min(u0,x-edit.radius);u1=Math.max(u1,x+edit.radius);v0=Math.min(v0,v-edit.radius*2);v1=Math.max(v1,v+edit.radius*2);}
  return {u0,u1,v0:clamp(v0,0,1),v1:clamp(v1,0,1)};
}
export function applyDetailEdits(height,residual,u,v,edits,guard=1) {
  for(const edit of edits) {
    let weight=0;
    for(const p of edit.points){const d=Math.hypot(wrappedDelta(u,p[0],1),(v-p[1])*.5)/edit.radius;if(d<1)weight=Math.max(weight,(1-d*d)**2);}
    if(edit.operation==='smooth')height-=residual*weight*clamp(edit.strength/900,0,1)*guard;
    else height+=(edit.operation==='raise'?1:-1)*edit.strength*weight*guard;
  }
  return height;
}
