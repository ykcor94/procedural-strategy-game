import {hashSeed} from '../core/random.js';
import {wrapX,clamp} from '../core/geo.js';
import {BIOMES} from '../data/biomes.js';

const SIZE=32,GRID=8192,atlases=new Map();
export function spriteHash(x,y,seed=0) {let n=Math.imul(x^seed,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}

// Small, self-authored top-down raster symbols. Workers build this atlas once.
// Keeping the art separate from terrain lets users toggle it without new jobs.
export function spriteAtlas(kind,variant=0) {
  const key=`${kind}:${variant}`;if(atlases.has(key))return atlases.get(key);
  const pixels=new Uint8ClampedArray(SIZE*SIZE*4);
  const dot=(x,y,c,alpha=255)=>{if(x<0||x>=SIZE||y<0||y>=SIZE)return;const j=(Math.floor(y)*SIZE+Math.floor(x))*4,a=alpha/255,old=pixels[j+3]/255,out=a+old*(1-a);for(let k=0;k<3;k++)pixels[j+k]=(c[k]*a+pixels[j+k]*old*(1-a))/(out||1);pixels[j+3]=out*255;};
  const ellipse=(cx,cy,rx,ry,c,a=255)=>{for(let y=Math.max(0,Math.floor(cy-ry));y<=Math.min(31,Math.ceil(cy+ry));y++)for(let x=Math.max(0,Math.floor(cx-rx));x<=Math.min(31,Math.ceil(cx+rx));x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<1)dot(x,y,c,a);};
  const line=(ax,ay,bx,by,c,width=1)=>{const steps=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)*2));for(let i=0;i<=steps;i++)ellipse(ax+(bx-ax)*i/steps,ay+(by-ay)*i/steps,width,width,c);};
  const crown=(x,y,r,c)=>{ellipse(x+1.5,y+2,r,r*.75,[16,36,27],65);ellipse(x,y,r,r*.8,c);ellipse(x-2,y-2,r*.7,r*.55,c.map(v=>Math.min(255,v+17)));ellipse(x+2,y+2,r*.5,r*.4,c.map(v=>v*.82));};
  const jitter=(spriteHash(variant,4,91)-.5)*3;
  if(['rainforest','forest','seasonal'].includes(kind)) {
    const colors=kind==='rainforest'?[[28,76,49],[34,91,56],[44,103,64]]:kind==='forest'?[[55,98,57],[70,111,63],[81,119,70]]:[[89,113,60],[102,123,65],[77,105,54]];
    for(let i=0;i<5;i++){const a=i*2.399,r=i?7:0;crown(16+Math.cos(a)*r,16+Math.sin(a)*r,6+jitter*.3,colors[(i+variant)%3]);}
  }else if(kind==='conifer') {
    for(const [x,y]of [[11,19],[21,20],[16,10]]){ellipse(x+2,y+4,6,5,[16,33,27],70);for(let r=7;r>1;r-=2)ellipse(x,y-r*.45,r,r*.7,[39+r*2,76+r*2,58+r]);line(x,y-6,x,y+3,[103,128,87],.65);}
  }else if(kind==='acacia') {
    line(16,22,16,15,[104,83,48],1.4);crown(15,14,10,[89,109,56]);ellipse(11,12,6,3,[118,135,71]);
  }else if(kind==='palm') {
    ellipse(18,21,8,5,[29,48,30],55);line(17,22,15,15,[113,91,55],1.2);
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7;line(15,15,15+Math.cos(a)*11,15+Math.sin(a)*9,[54,103,56],1.7);line(15,15,15+Math.cos(a)*8,15+Math.sin(a)*6,[98,137,70],.65);}
  }else if(kind==='cactus') {
    ellipse(18,24,9,3,[100,85,51],65);line(16,23,16,8,[76,112,65],2.2);line(16,17,10,17,[76,112,65],1.9);line(10,17,10,12,[76,112,65],1.9);line(17,14,22,14,[76,112,65],1.8);line(22,14,22,9,[76,112,65],1.8);line(15,21,15,9,[140,159,88],.6);
  }else if(kind==='dune') {
    for(let i=0;i<3;i++){const cy=10+i*6;for(let x=4;x<28;x++){const y=cy+Math.sin((x-3)/24*Math.PI)*4;line(x,y,x,y+2.5,[160,126,75],.9);dot(x,Math.round(y-1),[226,203,146],200);}}
  }else if(kind==='rock') {
    ellipse(18,20,10,5,[64,66,55],60);ellipse(16,16,8,6,[134,136,116]);ellipse(13,14,5,4,[166,164,139]);line(18,12,20,20,[102,111,97],.8);
  }else {
    const c=kind==='reeds'?[69,115,72]:kind==='tundra'?[133,145,108]:[151,155,96];
    for(let i=0;i<8;i++){const x=7+spriteHash(i,variant)*18,y=11+spriteHash(i,7+variant)*13;line(x,y,x-1,y-4,c,.65);line(x,y,x+2,y-3,c,.65);}
  }
  const atlas={pixels,size:SIZE};atlases.set(key,atlas);return atlas;
}

export function spriteKind(biome,moisture,temp,wet=0) {
  const code=BIOMES[biome]?.code;
  if(['ocean','lake','river','ice'].includes(code))return null;
  if(wet>.48&&temp>12)return 'palm';
  if(wet>.4)return 'reeds';
  if(code==='rainforest')return 'rainforest';
  if(code==='seasonal-forest')return 'seasonal';
  if(code==='savanna')return 'acacia';
  if(['temperate-forest','temperate-rainforest','mediterranean','riparian','delta'].includes(code))return moisture>.4?'forest':'acacia';
  if(code==='taiga'||code==='montane')return 'conifer';
  if(code==='hot-desert')return 'dune';
  if(['cold-desert','alpine'].includes(code))return 'rock';
  if(code==='tundra')return 'tundra';
  if(code==='wetland')return 'reeds';
  return 'grass';
}

export function generateSpritePlane(source,tile,bounds,size,sample) {
  if(tile.level<6)return null;
  const pixels=new Uint8ClampedArray(size*size*4),seed=hashSeed(source.seed,'biome-symbols-v1'),stride=tile.level===6?4:tile.level===7?2:1;
  const pad=14/40075,x0=Math.floor((bounds.u-pad)*GRID/stride)*stride,x1=Math.ceil((bounds.u+bounds.du+pad)*GRID),y0=Math.max(0,Math.floor((bounds.v-pad*2)*GRID/2/stride)*stride),y1=Math.min(GRID/2,Math.ceil((bounds.v+bounds.dv+pad*2)*GRID/2));
  for(let gy=y0;gy<=y1;gy+=stride)for(let gx=x0;gx<=x1;gx+=stride) {
    const x=wrapX(gx,GRID),r=spriteHash(x,gy,seed),u=(gx+.5+(spriteHash(x,gy,seed+1)-.5)*2)/GRID,v=(gy+.5+(spriteHash(x,gy,seed+2)-.5)*2)/(GRID/2),s=sample(u,v);
    if(!s||s.e<=2||s.lake||s.warmest<1||s.e>3800)continue;
    let kind=spriteKind(s.biome,s.moisture,s.temp,s.wet);if(!kind)continue;
    const density=['rainforest','forest','conifer','seasonal'].includes(kind)?.94:kind==='dune'?.24:kind==='grass'?.28:kind==='rock'?.3:.52;
    if(r>density)continue;
    if(kind==='dune'&&r<.1&&s.moisture>.03&&s.temp>13)kind='cactus';
    const sprite=spriteAtlas(kind,Math.floor(r*31)%4),diamKm=kind==='rainforest'?6:kind==='dune'?6.5:4.5;
    const diameter=clamp(diamKm/40075/bounds.du*size,2,30),cx=(u-bounds.u)/bounds.du*size,cy=(v-bounds.v)/bounds.dv*size;
    const left=Math.floor(cx-diameter/2),top=Math.floor(cy-diameter/2);
    for(let yy=Math.max(0,top);yy<Math.min(size,Math.ceil(cy+diameter/2));yy++)for(let xx=Math.max(0,left);xx<Math.min(size,Math.ceil(cx+diameter/2));xx++) {
      const sx=clamp(Math.floor((xx+.5-cx)/diameter*SIZE+SIZE/2),0,31),sy=clamp(Math.floor((yy+.5-cy)/diameter*SIZE+SIZE/2),0,31),a=(sy*SIZE+sx)*4,j=(yy*size+xx)*4,alpha=sprite.pixels[a+3]/255;
      if(!alpha)continue;const old=pixels[j+3]/255,out=alpha+old*(1-alpha);
      for(let k=0;k<3;k++)pixels[j+k]=(sprite.pixels[a+k]*alpha+pixels[j+k]*old*(1-alpha))/(out||1);pixels[j+3]=out*255;
    }
  }
  return pixels;
}
