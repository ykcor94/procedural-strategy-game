import {clamp,wrapX} from '../core/geo.js';
export class Camera {
  constructor(){this.x=0;this.y=0;this.scale=1;this.minScale=0.1;this.width=1;this.height=1;this.worldWidth=1;this.worldHeight=1;}
  resize(width,height){this.width=width;this.height=height;}
  fit(w,h){this.worldWidth=w;this.worldHeight=h;// A collapsed canvas (panels mid-transition) must not poison the camera with zero or NaN scales.
    if(!(this.width>0&&this.height>0)){this.x=w/2;this.y=h/2;return;}this.minScale=Math.min(this.width/w,this.height/h)*0.9;this.scale=this.minScale;this.x=w/2;this.y=h/2;}
  toWorld(sx,sy){return {x:(sx-this.width/2)/this.scale+this.x,y:(sy-this.height/2)/this.scale+this.y};}
  toScreen(x,y){return {x:(x-this.x)*this.scale+this.width/2,y:(y-this.y)*this.scale+this.height/2};}
  get maxScale(){return 262144/this.worldWidth;}
  zoom(factor,sx=this.width/2,sy=this.height/2){const p=this.toWorld(sx,sy);this.scale=clamp(this.scale*factor,this.minScale*0.7,this.maxScale);const q=this.toWorld(sx,sy);this.x+=p.x-q.x;this.y+=p.y-q.y;this.constrain();}
  pan(dx,dy){this.x-=dx/this.scale;this.y-=dy/this.scale;this.constrain();}
  constrain(){this.x=wrapX(this.x,this.worldWidth);const half=this.height/this.scale/2;this.y=half>this.worldHeight/2?this.worldHeight/2:clamp(this.y,half,this.worldHeight-half);}
}
