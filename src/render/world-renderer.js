import {MapRenderer} from './renderer.js';
import {MAP_MODES} from './modes.js';
import {clamp,lerp} from '../core/geo.js';
import {buildRiverGeometry} from './river-geometry.js';
import {TileManager,snapRect} from '../lod/tile-manager.js';
import {visibleTiles,TILE_SIZE} from '../lod/quadtree.js';
import {createTileSource,createTerrainSampler} from '../lod/terrain-sampler.js';
import {createSurfaceSampler} from '../lod/surface-sampler.js';
import {formatDistance} from '../ui/units.js';
import {reliefField,reliefTone,reliefOpacity,invalidateRelief} from './relief.js';
import {setBorderDetail} from './territory-geometry.js';
import {CIVILIZATION_MODES,TERRITORY_MODES,drawCivilizationTerritories,drawCivilizationLabels,drawTradeRoutes,invalidateCivilizationGeometry,civilizationSampleIndices} from './civilization-renderer.js';

const DETAIL_MODES=new Set(['physical','elevation','biome']);

/** Composite a stable global atlas, streamed visual terrain and vector water.
 * The base renderer remains useful without workers (exports and previews).
 */
export class WorldRenderer extends MapRenderer {
  constructor(canvas) {
    super(canvas);this.lodEnabled=true;this.overlays.ice=true;this.overlays.valleys=false;this.overlays.sprites=true;this.overlays.boldRelief=false;
    this.features=document.createElement('canvas');this.landClip=document.createElement('canvas');
    this.paths=[];this.tiles=new TileManager(()=>this.draw());this.previewing=false;
    this.overlays.borders=true;this.overlays.labels=true;this.overlays.cities=true;this.selectedNation=0;
    Object.assign(this.overlays,{terrainReveal:true,provinces:false,provinceColors:false,provinceNames:false,tradeRoutes:false});this.selectedProvince=0;this.provinceBreakdown='none';
    this.planes={features:this.features,mask:this.landClip};for(const key of ['civilization','national','edge','work'])this.planes[key]=document.createElement('canvas');this.cityPositions=new Map();this.riverEndCache=new Map();
  }
  /** Border roughness follows the land: rugged in mountains, calmer on plains and along rivers. */
  applyBorderDetail(level=this.borderDetail??'natural'){
    this.borderDetail=level;const w=this.world,l=w?.layers;const amplitude=level==='off'?0:level==='rugged'?.3:.2;
    if(!l?.elevation){setBorderDetail(amplitude,null);return;}
    const W=w.width,H=w.height;setBorderDetail(amplitude,(x,y)=>{const i=clamp(Math.floor(y),0,H-1)*W+((Math.floor(x)%W)+W)%W,m=clamp((l.mountainUplift?.[i]||0)/1800+Math.max(0,l.elevation[i])/4000,0,1),river=l.river?.[i]?.45:1;return (.55+.95*m)*river;});
  }
  setWorld(world,fit=false,products=['elevation']) {
    const physicalChange=this.world!==world||world.meta.preview||products.some(p=>['elevation','terrain','climate','hydrology'].includes(p));
    invalidateCivilizationGeometry(world);
    if(world.meta.preview||products.some(p=>['elevation','terrain','climate','hydrology'].includes(p)))invalidateRelief(world);
    super.setWorld(world,fit,products);if(physicalChange){this.resetSampling();this.applyBorderDetail();}
    if(world.meta.preview){if(!this.previewing)this.tiles.dispose();this.previewing=true;}
    else {this.previewing=false;if(physicalChange){this.paths=buildRiverGeometry(world);this.tiles.dispose();this.tiles.failed=false;}}
  }
  shade(){return this.layer('shade',ctx=>{const {width:w,height:h}=this.world,field=reliefField(this.world),image=ctx.createImageData(w,h);for(let i=0;i<field.length;i++){const s=reliefTone(field[i]),j=i*4;image.data[j]=image.data[j+1]=image.data[j+2]=s>0?255:0;image.data[j+3]=Math.abs(s)*255;}ctx.putImageData(image,0,0);});}
  drawShade(ctx,shade,x=0,y=0){const alpha=ctx.globalAlpha;ctx.globalAlpha=alpha*reliefOpacity(this.overlays.boldRelief);ctx.drawImage(shade,x,y);ctx.globalAlpha=alpha;}
  layer(key,build) {
    const result=super.layer(key,build);
    let bytes=0;for(const c of this.cache.values())bytes+=c.width*c.height*4;
    while(bytes>64*1024*1024&&this.cache.size>1){const k=this.cache.keys().next().value,c=this.cache.get(k);bytes-=c.width*c.height*4;this.cache.delete(k);}
    return result;
  }
  base(modeId=this.mode) {
    const {width:w,height:h,layers:l}=this.world,n=w*h,mode=MAP_MODES.get(modeId),month=mode.monthly?this.month:-1,vector=TERRITORY_MODES.has(modeId)&&!!this.world.meta.civilization,civil=CIVILIZATION_MODES.has(modeId);
    return this.layer(`base:${modeId}:${month}:${this.overlays.ice}:${civil?this.world.meta.civilization?.revision||0:''}`,ctx=>{
      const image=ctx.createImageData(w,h),d=image.data;
      const samples=civil?civilizationSampleIndices(this.world):null;
      for(let i=0;i<n;i++) {
        // Political color is a vector fill, so painting ownership never needs
        // to rebuild a whole-planet categorical image.
        let c=vector?[166,170,153]:mode.color(l,samples?.[i]>=0?samples[i]:i,month,n,this.world);
        if(!civil&&l.lake?.[i]&&l.elevation[i]>0&&!['temperature','precipitation','koppen','biome','elevation'].includes(modeId))c=[49,115,137];
        if(this.overlays.ice&&l.elevation[i]<=0&&['physical','biome'].includes(modeId)) {
          const ice=(month<0?l.annualIce?.[i]:l.seaIce?.[month*n+i])||0;c=c.map((v,k)=>lerp(v,[228,235,235][k],ice/255));
        }
        const j=i*4;d[j]=c[0];d[j+1]=c[1];d[j+2]=c[2];d[j+3]=255;
      }
      ctx.putImageData(image,0,0);
    });
  }
  landMask() {
    return this.layer('land-mask:physical-water',ctx=>{
      const {width:w,height:h,layers:l}=this.world,image=ctx.createImageData(w,h);
      for(let i=0;i<w*h;i++)if(l.elevation[i]>0&&!l.lake[i]){image.data[i*4]=255;image.data[i*4+1]=255;image.data[i*4+2]=255;image.data[i*4+3]=255;}
      ctx.putImageData(image,0,0);
    });
  }
  coasts() {
    const ice=this.overlays.ice&&['physical','biome'].includes(this.mode),month=this.mode==='physical'?this.month:-1;
    return this.layer(`coasts:${ice}:${month}`,ctx=>{
      const {width:w,height:h,layers:l}=this.world,n=w*h,cover=i=>l.elevation[i]<=0?(month<0?l.annualIce[i]:l.seaIce[month*n+i])/255:clamp((2-l.warmestTemperature[i])/5,0,1);
      ctx.lineWidth=.6;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
        const i=y*w+x,land=l.elevation[i]>0;
        for(const [j,vertical]of [[y*w+(x+1)%w,true],[Math.min(h-1,y+1)*w+x,false]])if(land!==(l.elevation[j]>0)) {
          const opacity=.48*(ice?1-Math.max(cover(i),cover(j))*.98:1);
          ctx.strokeStyle=`rgba(60,65,57,${opacity})`;ctx.beginPath();
          if(vertical){ctx.moveTo(x+1,y);ctx.lineTo(x+1,y+1);}else{ctx.moveTo(x,y+1);ctx.lineTo(x+1,y+1);}ctx.stroke();
        }
      }
    });
  }
  compositeFeatures(ctx,tiles,options,from,to) {
    const c=this.camera,w=this.world.width,h=this.world.height;
    for(const canvas of [this.features,this.landClip])if(canvas.width!==this.canvas.width||canvas.height!==this.canvas.height){canvas.width=this.canvas.width;canvas.height=this.canvas.height;}
    const feature=this.features.getContext('2d'),mask=this.landClip.getContext('2d');
    for(const target of [feature,mask]){target.setTransform(1,0,0,1,0,0);target.clearRect(0,0,this.canvas.width,this.canvas.height);target.setTransform(this.dpr*c.scale,0,0,this.dpr*c.scale,this.dpr*(c.width/2-c.x*c.scale),this.dpr*(c.height/2-c.y*c.scale));}
    mask.imageSmoothingEnabled=false;
    for(let copy=from;copy<=to;copy++)mask.drawImage(this.landMask(),copy*w,0);
    if(tiles)this.tiles.draw(mask,tiles,options,w,h,'mask');
    if(tiles&&this.overlays.sprites&&['physical','biome'].includes(this.mode)) {
      const zoom=Math.log2(w*c.scale/512),fade=clamp(zoom-5,0,1);feature.globalAlpha=fade*fade*(3-2*fade);
      feature.imageSmoothingEnabled=true;this.tiles.draw(feature,tiles,options,w,h,'sprites');feature.globalAlpha=1;
    }
    if(this.overlays.valleys&&this.mode==='physical')this.drawRivers(feature,c.scale,c,true);
    if(this.overlays.rivers||this.mode==='hydrology')this.drawRivers(feature,c.scale,c);
    feature.setTransform(1,0,0,1,0,0);feature.globalCompositeOperation='destination-in';feature.drawImage(this.landClip,0,0);feature.globalCompositeOperation='source-over';
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(this.features,0,0);ctx.restore();
  }
  drawRivers(ctx,scale=1,camera=null,valleys=false) {
    const w=this.world.width,from=camera?Math.floor((camera.x-camera.width/(2*scale))/w)-1:-1,to=camera?Math.ceil((camera.x+camera.width/(2*scale))/w)+1:1;
    const x0=camera?camera.x-camera.width/(2*scale):0,x1=camera?camera.x+camera.width/(2*scale):w;
    const y0=camera?camera.y-camera.height/(2*scale):0,y1=camera?camera.y+camera.height/(2*scale):this.world.height;
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=valleys?'rgba(41,90,63,.15)':this.mode==='hydrology'?'#215e86':'rgba(36,104,145,.9)';
    for(let copy=from;copy<=to;copy++)for(const path of this.paths) {
      const b=path.bounds,shift=copy*w;if(b[2]+shift<x0||b[0]+shift>x1||b[3]<y0||b[1]>y1)continue;
      const physicalWidth=(.035+Math.sqrt(Math.max(0,path.flow))*.003)*w/40075;
      ctx.lineWidth=valleys?clamp(physicalWidth*15*scale,3,16)/scale:clamp(Math.max(physicalWidth*scale,.45+.13*Math.log2(1+path.flow/500)),.55,4.5)/scale;
      const p=this.riverPoints(path);ctx.beginPath();ctx.moveTo(p[0]+shift,p[1]);
      for(let k=2;k<p.length-2;k+=2)ctx.quadraticCurveTo(p[k]+shift,p[k+1],(p[k]+p[k+2])*.5+shift,(p[k+1]+p[k+3])*.5);
      ctx.lineTo(p[p.length-2]+shift,p[p.length-1]);ctx.stroke();
    }
  }
  updateDetails(detail,bounds){this.resetSampling();this.tiles.updateEdits(detail,bounds);this.draw();}
  invalidateCivilization(){
    if(this.world)invalidateCivilizationGeometry(this.world);
    for(const key of this.cache.keys())if(key.startsWith('base:')&&CIVILIZATION_MODES.has(key.split(':')[1]))this.cache.delete(key);
    this.draw();
  }
  resetSampling(){this.detailSampler=null;this.surfaceSampler=null;this.terrainRevision=(this.terrainRevision||0)+1;this.cityPositions.clear();this.riverEndCache.clear();}
  initSampling(){if(this.detailSampler)return;const source=createTileSource(this.world,{includeWater:false});this.detailSampler=createTerrainSampler(source);this.surfaceSampler=createSurfaceSampler(source);}
  sampleElevation(u,v){this.initSampling();return this.detailSampler(u,v,{valleys:this.mode==='physical'&&this.overlays.valleys,edits:this.world.meta.detail?.edits||[]});}
  isVisualLand(x,y){if(!this.world||y<0||y>=this.world.height)return false;this.initSampling();const u=((x/this.world.width)%1+1)%1,v=y/this.world.height,e=this.sampleElevation(u,v);return e>0&&!this.surfaceSampler(u,v,e,-2,{}).lake;}
  visualCityPosition(city){
    const old=this.cityPositions.get(city.id);if(old?.sourceX===city.x&&old.sourceY===city.y)return old;let x=city.x,y=city.y;
    if(!this.isVisualLand(x,y)){let found=false;for(let ring=1;ring<=10&&!found;ring++)for(let k=0;k<16;k++){const a=k*Math.PI/8+(city.id%7)*.11,xx=((city.x+Math.cos(a)*ring*.047)%this.world.width+this.world.width)%this.world.width,yy=city.y+Math.sin(a)*ring*.047;if(this.isVisualLand(xx,yy)){x=xx;y=yy;found=true;break;}}}
    const result={x,y,sourceX:city.x,sourceY:city.y};this.cityPositions.set(city.id,result);return result;
  }
  transform(ctx,c=this.camera){ctx.setTransform(this.dpr*c.scale,0,0,this.dpr*c.scale,this.dpr*(c.width/2-c.x*c.scale),this.dpr*(c.height/2-c.y*c.scale));}
  plane(name,worldSpace=true){const c=this.planes[name];if(c.width!==this.canvas.width||c.height!==this.canvas.height){c.width=this.canvas.width;c.height=this.canvas.height;}const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,c.width,c.height);if(worldSpace)this.transform(ctx);return ctx;}
  clipPlane(name,mask=this.landClip){const ctx=this.planes[name].getContext('2d');ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);ctx.restore();}
  composite(ctx,name,alpha=1){const image=this.planes[name];if(!image.width||!image.height)return;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha*=alpha;ctx.drawImage(image,0,0);ctx.restore();}
  innerEdge(mask,width=1.5){
    const edge=this.plane('edge',false),work=this.plane('work',false),r=Math.max(1,width*this.dpr),w=mask.width,h=mask.height;work.drawImage(mask,0,0);work.globalCompositeOperation='destination-in';for(const [x,y]of [[r,0],[-r,0],[0,r],[0,-r]])work.drawImage(mask,x,y);work.globalCompositeOperation='source-over';edge.drawImage(mask,0,0);edge.globalCompositeOperation='destination-out';edge.drawImage(this.planes.work,0,0);edge.globalCompositeOperation='source-over';edge.clearRect(0,0,w,r);edge.clearRect(0,h-r,w,r);edge.clearRect(0,0,r,h);edge.clearRect(w-r,0,r,h);return this.planes.edge;
  }
  buildMask(tiles,options,from,to){const ctx=this.plane('mask');ctx.imageSmoothingEnabled=true;for(let copy=from;copy<=to;copy++){const r=snapRect(ctx,copy*this.world.width,0,(copy+1)*this.world.width,this.world.height);ctx.drawImage(this.landMask(),r.x,r.y,r.w,r.h);}if(tiles)this.tiles.draw(ctx,tiles,options,this.world.width,this.world.height,'mask');}
  riverPoints(path){
    const l=this.world.layers;if(l.elevation[path.end]>0&&!l.lake?.[path.end])return path.points;if(this.riverEndCache.has(path))return this.riverEndCache.get(path);const p=path.points;let result=p;
    for(let k=Math.max(2,p.length-24);k<p.length;k+=2)if(!this.isVisualLand(p[k],p[k+1])){let ax=p[k-2],ay=p[k-1],bx=p[k],by=p[k+1];if(!this.isVisualLand(ax,ay))continue;for(let step=0;step<14;step++){const x=(ax+bx)/2,y=(ay+by)/2;if(this.isVisualLand(x,y)){ax=x;ay=y;}else{bx=x;by=y;}}result=Float32Array.from([...p.slice(0,k),bx,by]);break;}this.riverEndCache.set(path,result);return result;
  }
  updateTerrainReveal(civil,zoom,now=performance.now()){
    const t=clamp((zoom-1.4)/2.5,0,1),target=civil&&this.overlays.terrainReveal!==false?t*t*(3-2*t):0;
    if(this.revealTarget===undefined){this.revealTarget=target;this.revealFrom=target;this.revealStarted=now;}
    if(this.revealTarget!==target){this.revealFrom=this.terrainRevealAmount??target;this.revealTarget=target;this.revealStarted=now;}
    const fraction=clamp((now-this.revealStarted)/200,0,1),ease=fraction*fraction*(3-2*fraction),interpolated=this.revealFrom+(target-this.revealFrom)*ease,value=Math.abs(interpolated-target)<.001?target:interpolated;
    this.terrainRevealAmount=value;if(fraction<1&&Math.abs(value-target)>.001)this.draw();return value;
  }
  paint(markers=true) {
    const ctx=this.ctx,c=this.camera,{width:sw,height:sh}=c;this.citySceneFrame=(this.citySceneFrame||0)+1;
    // Responsive panels can briefly collapse the map between resize events.
    // A zero-sized backing canvas is not a valid drawImage source.
    if(!(sw>0&&sh>0)||!this.canvas.width||!this.canvas.height)return;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.fillStyle='#102532';ctx.fillRect(0,0,sw,sh);if(!this.world)return;
    const {width:w,height:h}=this.world,civil=Boolean(this.world.meta.civilization)&&CIVILIZATION_MODES.has(this.mode),terrain=civil?'physical':this.mode,physical=['physical','elevation'].includes(terrain),base=this.base(terrain);
    const shading=this.overlays.shading&&physical?this.shade():null,coasts=this.overlays.coasts&&!CIVILIZATION_MODES.has(this.mode)?this.coasts():null;
    ctx.save();ctx.translate(sw/2-c.x*c.scale,sh/2-c.y*c.scale);ctx.scale(c.scale,c.scale);ctx.imageSmoothingEnabled=!['koppen','biome','hydrology'].includes(this.mode);
    const from=Math.floor((c.x-sw/2/c.scale)/w),to=Math.ceil((c.x+sw/2/c.scale)/w);
    for(let copy=from;copy<=to;copy++){ctx.drawImage(base,copy*w,0);if(shading)this.drawShade(ctx,shading,copy*w,0);if(coasts)ctx.drawImage(coasts,copy*w,0);}
    const detailed=this.lodEnabled&&!this.previewing&&(civil||DETAIL_MODES.has(this.mode))&&!this.tiles.failed&&c.scale>=(civil?c.minScale*.8:Math.max(1.2,c.minScale*1.05));
    let tiles=null,options=null;
    if(detailed) {
      if(!this.tiles.workers.length)this.tiles.setWorld(this.world);
      tiles=visibleTiles(c,w,h,undefined,48,this.tiles.visibleLevel);options={mode:terrain,month:MAP_MODES.get(terrain).monthly?this.month:-1,shading:this.overlays.shading,boldRelief:this.overlays.boldRelief,coasts:false,valleys:this.mode==='physical'&&this.overlays.valleys,ice:this.overlays.ice&&['physical','biome'].includes(terrain)};
      this.tiles.beginFrame();this.tiles.request(tiles,options);const ready=this.tiles.draw(ctx,tiles,options,w,h),level=tiles[0]?.level||0;
      this.detailStatus={level,ready,total:tiles.length,pixelKm:40075/(TILE_SIZE*2*2**level),...this.tiles.stats};
    }else {this.tiles.queue=[];this.detailStatus={level:0,ready:0,total:0,pixelKm:40075/w,...this.tiles.stats,global:true};}
    this.refinedPoliticalMask=true;this.buildMask(tiles,options,from,to);
    const zoom=Math.log2(w*c.scale/850),revealed=this.updateTerrainReveal(civil,zoom),reveal=this.atlas&&TERRITORY_MODES.has(this.mode)?Math.min(revealed,.2):revealed,tint=1-.75*reveal;
    // Distant political atlases use calm water; the physical ocean appears with
    // the terrain reveal. Both use the same refined shoreline and lake mask.
    if(civil&&reveal<1){const water=this.plane('work',false);water.fillStyle='#142d3b';water.fillRect(0,0,water.canvas.width,water.canvas.height);water.globalCompositeOperation='destination-out';water.drawImage(this.landClip,0,0);water.globalCompositeOperation='source-over';this.composite(ctx,'work',1-reveal);}
    if(civil){const fill=this.plane('civilization');if(TERRITORY_MODES.has(this.mode))drawCivilizationTerritories(fill,this,from,to,c,{pass:'fill',extended:true});else for(let copy=from;copy<=to;copy++)fill.drawImage(this.base(),copy*w,0);this.clipPlane('civilization');this.composite(ctx,'civilization',tint);}
    if(this.overlays.provinces||this.overlays.provinceColors){const p=this.plane('civilization');drawCivilizationTerritories(p,this,from,to,c,{pass:'provinces',extended:true});this.clipPlane('civilization');this.composite(ctx,'civilization');}
    if(civil&&this.overlays.borders!==false){const border=this.plane('features');drawCivilizationTerritories(border,this,from,to,c,{pass:'borders',extended:true});this.clipPlane('features');this.composite(ctx,'features');}
    if(this.overlays.coasts||civil&&reveal>.1&&this.overlays.borders!==false){
      const edge=this.overlays.coasts?this.innerEdge(this.landClip,civil&&reveal>.1?3.5:1):(this.plane('edge',false),this.planes.edge);
      if(civil&&reveal>.1){const national=this.plane('national');drawCivilizationTerritories(national,this,from,to,c,{pass:'fill',mode:'political',extended:true,atlas:false});this.clipPlane('national');const borders=this.plane('features');if(this.overlays.borders!==false)drawCivilizationTerritories(borders,this,from,to,c,{pass:'borderMask',width:4,extended:true});borders.setTransform(1,0,0,1,0,0);borders.drawImage(edge,0,0);borders.globalCompositeOperation='source-in';borders.drawImage(this.planes.national,0,0);borders.globalCompositeOperation='source-over';this.composite(ctx,'features',clamp((reveal-.1)*2.4,0,1)*.95);}
      else{const e=this.planes.edge.getContext('2d');e.globalCompositeOperation='source-in';e.fillStyle='rgba(20,43,48,.6)';e.fillRect(0,0,e.canvas.width,e.canvas.height);e.globalCompositeOperation='source-over';this.composite(ctx,'edge');}
    }
    const features=this.plane('features');if(tiles&&this.overlays.sprites&&(['physical','biome'].includes(this.mode)||civil&&reveal>.25)){const fade=clamp(zoom-5,0,1);features.globalAlpha=fade*fade*(3-2*fade);this.tiles.draw(features,tiles,options,w,h,'sprites');features.globalAlpha=1;}drawCivilizationLabels(features,this,from,to,c,{pass:'sprites'});this.clipPlane('features');this.composite(ctx,'features');
    // Rivers are trimmed against this refined coast, then painted continuously.
    // Clipping them again to a second land mask created mouth/confluence gaps.
    if(this.overlays.valleys&&this.mode==='physical')this.drawRivers(ctx,c.scale,c,true);if(this.overlays.rivers||this.mode==='hydrology')this.drawRivers(ctx,c.scale,c);drawTradeRoutes(ctx,this,from,to,c);
    if(this.overlays.rivers&&zoom>3){const bridges=this.plane('features');drawCivilizationLabels(bridges,this,from,to,c,{pass:'bridges'});this.clipPlane('features');this.composite(ctx,'features');}
    for(const [kind,id,color,width]of [['nation',this.selectedNation,'#fff1bd',2.5],['province',this.selectedProvince,'#80e5dc',2]])if(id){const selection=this.plane('civilization');drawCivilizationTerritories(selection,this,from,to,c,{pass:'selectionFill',kind,extended:true});this.clipPlane('civilization');this.innerEdge(this.planes.civilization,width);const edge=this.planes.edge.getContext('2d');edge.globalCompositeOperation='source-in';edge.fillStyle=color;edge.fillRect(0,0,edge.canvas.width,edge.canvas.height);edge.globalCompositeOperation='source-over';this.composite(ctx,'edge');}
    drawCivilizationLabels(ctx,this,from,to,c,{pass:'labels'});
    if(this.overlays.grid) {
      ctx.save();ctx.strokeStyle='rgba(231,236,219,.24)';ctx.lineWidth=.7/c.scale;ctx.setLineDash([3/c.scale,5/c.scale]);ctx.beginPath();
      for(let copy=from;copy<=to;copy++){for(let x=0;x<=w;x+=w/12){ctx.moveTo(copy*w+x,0);ctx.lineTo(copy*w+x,h);}for(let y=0;y<=h;y+=h/6){ctx.moveTo(copy*w,y);ctx.lineTo((copy+1)*w,y);}}
      ctx.stroke();ctx.restore();
    }
    if(markers)for(let copy=from;copy<=to;copy++)if(this.selected>=0){const x=this.selected%w+copy*w+.5,y=Math.floor(this.selected/w)+.5;ctx.strokeStyle='#fff5ce';ctx.lineWidth=1.5/c.scale;ctx.beginPath();ctx.arc(x,y,6/c.scale,0,Math.PI*2);ctx.stroke();}
    if(markers&&this.brush){ctx.strokeStyle='rgba(255,250,226,.85)';ctx.lineWidth=1/c.scale;ctx.fillStyle='rgba(255,250,226,.06)';ctx.beginPath();ctx.arc(this.brush.x,this.brush.y,this.brush.radius,0,Math.PI*2);ctx.fill();ctx.stroke();}
    ctx.restore();
    const label=document.getElementById('detail-status');
    if(label)label.textContent=detailed?`Detail L${this.detailStatus.level} · ${formatDistance(this.detailStatus.pixelKm,this.detailStatus.pixelKm<1?2:1)}/px${this.detailStatus.ready<this.detailStatus.total?' · refining…':''}`:'Global grid';
  }
  async exportPNG() {
    const source=document.createElement('canvas');source.width=this.world.width;source.height=this.world.height;const ctx=source.getContext('2d'),civil=CIVILIZATION_MODES.has(this.mode);ctx.drawImage(this.base(civil?'physical':this.mode),0,0);
    if(civil){const water=document.createElement('canvas');water.width=source.width;water.height=source.height;const w=water.getContext('2d');w.fillStyle='#142d3b';w.fillRect(0,0,water.width,water.height);w.globalCompositeOperation='destination-out';w.drawImage(this.landMask(),0,0);ctx.drawImage(water,0,0);}
    if(civil&&!TERRITORY_MODES.has(this.mode)){const overlay=document.createElement('canvas');overlay.width=source.width;overlay.height=source.height;const c=overlay.getContext('2d');c.drawImage(this.base(),0,0);c.globalCompositeOperation='destination-in';c.drawImage(this.landMask(),0,0);ctx.drawImage(overlay,0,0);}
    if(this.overlays.shading&&['physical','elevation'].includes(this.mode))this.drawShade(ctx,this.shade());
    if(this.overlays.coasts&&!CIVILIZATION_MODES.has(this.mode))ctx.drawImage(this.coasts(),0,0);
    const exportCamera={x:source.width/2,y:source.height/2,width:source.width,height:source.height,scale:1};
    drawCivilizationTerritories(ctx,this,0,0,exportCamera,{pass:'all',extended:false});
    const features=document.createElement('canvas');features.width=source.width;features.height=source.height;const f=features.getContext('2d');
    if(this.overlays.valleys&&this.mode==='physical')this.drawRivers(f,1,null,true);
    if(this.overlays.rivers||this.mode==='hydrology')this.drawRivers(f);
    ctx.drawImage(features,0,0);drawTradeRoutes(ctx,this,0,0,exportCamera);
    if(this.overlays.grid){ctx.strokeStyle='rgba(255,255,255,.25)';ctx.lineWidth=.5;ctx.beginPath();for(let x=0;x<source.width;x+=source.width/12){ctx.moveTo(x,0);ctx.lineTo(x,source.height);}for(let y=0;y<source.height;y+=source.height/6){ctx.moveTo(0,y);ctx.lineTo(source.width,y);}ctx.stroke();}
    drawCivilizationLabels(ctx,this,0,0,exportCamera,{pass:'labels'});
    return new Promise(resolve=>source.toBlob(resolve,'image/png'));
  }
  async exportViewportPNG(){this.paint(false);const result=new Promise(resolve=>this.canvas.toBlob(resolve,'image/png'));this.draw();return result;}
  dispose(){this.tiles.dispose();this.resizeObserver.disconnect();}
}
