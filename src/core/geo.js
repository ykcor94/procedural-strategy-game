export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const lerp = (a,b,t) => a + (b-a)*t;
export const wrapX = (x,w) => ((x % w) + w) % w;
export const indexAt = (x,y,w,h) => clamp(Math.floor(y),0,h-1)*w + wrapX(Math.floor(x),w);
export const latitude = (y,h) => 90 - (y+0.5)/h*180;
export const longitude = (x,w) => (x+0.5)/w*360-180;
export const rowArea = (y,h) => Math.sin((90-y/h*180)*Math.PI/180)-Math.sin((90-(y+1)/h*180)*Math.PI/180);
export const wrappedDelta = (a,b,w) => {let d=a-b; return d-Math.round(d/w)*w;};
export const neighbors8 = (i,w,h,fn) => {const x=i%w,y=(i/w)|0; for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy||y+dy<0||y+dy>=h)continue;fn((y+dy)*w+wrapX(x+dx,w),dx,dy);}};
export function distanceToMask(mask,w,h,value=1) {
  const d = new Float32Array(w*h); d.fill(Infinity);
  const q = new Int32Array(w*h); let a=0,b=0;
  for(let i=0;i<d.length;i++) if(mask[i]===value){d[i]=0;q[b++]=i;}
  while(a<b){const i=q[a++],x=i%w,y=(i/w)|0;for(const j of [y*w+wrapX(x-1,w),y*w+wrapX(x+1,w),y>0?i-w:-1,y<h-1?i+w:-1])if(j>=0&&d[j]>d[i]+1){d[j]=d[i]+1;q[b++]=j;}}
  return d;
}
