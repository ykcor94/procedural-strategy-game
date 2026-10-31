// Identical arithmetic to periodicNoise, with lazily cached gradient lattices.
// The fixed power-of-two frequencies used by detail allow cheap wrapped indices.
const fade=t=>t*t*t*(t*(t*6-15)+10),mix=(a,b,t)=>a+(b-a)*t;
function hash(x,y,seed){let n=Math.imul(x^seed,0x45d9f3b)^Math.imul(y,0x27d4eb2d);n=Math.imul(n^(n>>>16),0x85ebca6b);return(n^(n>>>13))>>>0;}
function gradient(h,x,y){switch(h&7){case 0:return x+y;case 1:return x-y;case 2:return -x+y;case 3:return -x-y;case 4:return x*1.41421356237;case 5:return -x*1.41421356237;case 6:return y*1.41421356237;default:return -y*1.41421356237;}}
export function cachedPeriodicNoise(frequency,seed,maxBlocks=24) {
  const blocks=new Map(),mask=frequency-1;let lastKey=NaN,last;
  function code(x,y){
    x&=mask;const bx=x>>5,by=Math.floor(y/32),key=by*65536+bx;
    if(key!==lastKey){
      last=blocks.get(key);
      if(!last){last=new Uint8Array(1024);for(let yy=0;yy<32;yy++)for(let xx=0;xx<32;xx++)last[yy*32+xx]=hash((bx*32+xx)&mask,by*32+yy,seed)&7;blocks.set(key,last);if(blocks.size>maxBlocks)blocks.delete(blocks.keys().next().value);}
      else{blocks.delete(key);blocks.set(key,last);}lastKey=key;
    }
    return last[(y-by*32)*32+(x&31)];
  }
  return (u,v)=>{
    const x=u*frequency,y=v*frequency,ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy,fx=fade(tx),fy=fade(ty);
    return mix(mix(gradient(code(ix,iy),tx,ty),gradient(code(ix+1,iy),tx-1,ty),fx),mix(gradient(code(ix,iy+1),tx,ty-1),gradient(code(ix+1,iy+1),tx-1,ty-1),fx),fy);
  };
}

// Dense, tile-local gradient windows avoid map lookups in the pixel loop. The
// gradients still come from the same wrapped world lattice, so neighboring
// windows and arbitrary evaluation order produce bit-identical noise.
export function preparePeriodicNoise(frequency,seed,bounds,pad=0) {
  const minX=Math.floor((bounds.u-pad)*frequency)-2,minY=Math.floor((bounds.v*.5-pad)*frequency)-2;
  const maxX=Math.ceil((bounds.u+bounds.du+pad)*frequency)+2,maxY=Math.ceil(((bounds.v+bounds.dv)*.5+pad)*frequency)+2;
  const width=maxX-minX+1,codes=new Uint8Array(width*(maxY-minY+1)),mask=frequency-1,center=(minX+maxX)*.5;
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)codes[(y-minY)*width+x-minX]=hash(x&mask,y,seed)&7;
  return (u,v)=>{
    const x=u*frequency,y=v*frequency,rawX=Math.floor(x),iy=Math.floor(y),tx=x-rawX,ty=y-iy,ix=rawX+Math.round((center-rawX)/frequency)*frequency;
    const offset=(iy-minY)*width+ix-minX,fx=fade(tx),fy=fade(ty);
    return mix(mix(gradient(codes[offset],tx,ty),gradient(codes[offset+1],tx-1,ty),fx),mix(gradient(codes[offset+width],tx,ty-1),gradient(codes[offset+width+1],tx-1,ty-1),fx),fy);
  };
}
