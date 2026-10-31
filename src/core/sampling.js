import {clamp,wrapX} from './geo.js';

// Pixel centers represent geographic samples. Shared by simulation resampling
// and visual tiles; longitude wraps and latitude never does.
export function sampleBilinear(a,u,v,w,h,offset=0) {
  const x=wrapX(u*w-.5,w),y=clamp(v*h-.5,0,h-1);
  const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,x1=(x0+1)%w,y1=Math.min(h-1,y0+1);
  return (a[offset+y0*w+x0]*(1-fx)+a[offset+y0*w+x1]*fx)*(1-fy)+
    (a[offset+y1*w+x0]*(1-fx)+a[offset+y1*w+x1]*fx)*fy;
}
export function sampleNearest(a,u,v,w,h) {
  return a[clamp(Math.floor(v*h),0,h-1)*w+wrapX(Math.floor(u*w),w)];
}
function cubic(p0,p1,p2,p3,t) {
  const delta=p2-p1;if(delta===0)return p1;
  const previous=p1-p0,next=p3-p2;
  const m1=previous*delta<=0?0:2*previous*delta/(previous+delta);
  const m2=next*delta<=0?0:2*next*delta/(next+delta);
  const t2=t*t,t3=t2*t;return (2*t3-3*t2+1)*p1+(t3-2*t2+t)*m1+(-2*t3+3*t2)*p2+(t3-t2)*m2;
}
// Monotone Hermite interpolation is C1 across grid boundaries without the
// height overshoots that unconstrained Catmull-Rom introduces at coastlines.
export function sampleBicubic(a,u,v,w,h) {
  const x=wrapX(u*w-.5,w),y=clamp(v*h-.5,0,h-1),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const x0=wrapX(ix-1,w),x1=ix,x2=(ix+1)%w,x3=(ix+2)%w;
  const row=j=>{const r=clamp(j,0,h-1)*w;return cubic(a[r+x0],a[r+x1],a[r+x2],a[r+x3],fx);};
  return cubic(row(iy-1),row(iy),row(iy+1),row(iy+2),fy);
}
export function resampleRaster(a,sw,sh,w,h,nearest=false,offset=0) {
  const out=new a.constructor(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const u=(x+.5)/w,v=(y+.5)/h;
    out[y*w+x]=nearest?sampleNearest(a,u,v,sw,sh):sampleBilinear(a,u,v,sw,sh,offset);
  }
  return out;
}
