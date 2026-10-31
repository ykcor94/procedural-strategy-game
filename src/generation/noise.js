// Periodic gradient noise. The x lattice repeats, while y deliberately does not.
// Coordinates and frequencies use world widths, independent of raster resolution.
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a,b,t) => a + (b-a)*t;
function hash(x,y,seed) {
  let n = Math.imul(x ^ seed, 0x45d9f3b) ^ Math.imul(y, 0x27d4eb2d);
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  return (n ^ (n >>> 13)) >>> 0;
}
function gradient(h,x,y) {
  switch(h & 7) {
    case 0: return x+y; case 1: return x-y; case 2: return -x+y; case 3: return -x-y;
    case 4: return x*1.41421356237; case 5: return -x*1.41421356237;
    case 6: return y*1.41421356237; default: return -y*1.41421356237;
  }
}
export function periodicNoise(u,v,frequency,seed) {
  const x=u*frequency,y=v*frequency,ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;
  const x0=((ix%frequency)+frequency)%frequency,x1=(x0+1)%frequency;
  return mix(mix(gradient(hash(x0,iy,seed),tx,ty),gradient(hash(x1,iy,seed),tx-1,ty),fade(tx)),
    mix(gradient(hash(x0,iy+1,seed),tx,ty-1),gradient(hash(x1,iy+1,seed),tx-1,ty-1),fade(tx)),fade(ty));
}
export function fractalNoise(u,v,frequency,octaves,seed,persistence=0.5) {
  let value=0,weight=1,total=0;
  for(let o=0;o<octaves;o++) {
    value += periodicNoise(u,v,frequency,seed+o*1013)*weight;
    total += weight; weight*=persistence; frequency*=2;
  }
  return value/total;
}
