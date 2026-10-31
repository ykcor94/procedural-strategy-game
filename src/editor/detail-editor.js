import {editBounds} from '../lod/detail-edits.js';
import {wrappedDelta} from '../core/geo.js';

// Sparse, normalized world-space strokes belong to visual geography only.
// They never allocate a high-resolution political or climate raster.
export class DetailEditor {
  constructor(onChange){this.onChange=onChange;this.reset();}
  reset(){this.undoStack=[];this.redoStack=[];this.stroke=null;}
  begin(world,operation,radius,strength){this.stroke={world,edit:{id:crypto.randomUUID(),operation,radius:Math.min(.25,Math.max(.000001,radius)),strength,points:[]}};}
  dab(u,v){if(!this.stroke)return;const e=this.stroke.edit,last=e.points.at(-1);if(!last||Math.hypot(wrappedDelta(u,last[0],1),(v-last[1])*.5)>e.radius*.18){if(e.points.length<2048)e.points.push([u,v]);}}
  end(){if(!this.stroke)return false;const {world,edit}=this.stroke;this.stroke=null;if(!edit.points.length)return false;world.meta.detail??={version:1,algorithm:'anchored-fbm-v1',edits:[]};world.meta.detail.edits.push(edit);this.undoStack.push(edit);if(this.undoStack.length>100)this.undoStack.shift();this.redoStack=[];this.onChange(world.meta.detail,editBounds(edit));return true;}
  rollback(){this.stroke=null;}
  undo(world){const edit=this.undoStack.pop();if(!edit)return false;const i=world.meta.detail.edits.findIndex(e=>e.id===edit.id);if(i>=0)world.meta.detail.edits.splice(i,1);this.redoStack.push(edit);this.onChange(world.meta.detail,editBounds(edit));return true;}
  redo(world){const edit=this.redoStack.pop();if(!edit)return false;world.meta.detail.edits.push(edit);this.undoStack.push(edit);this.onChange(world.meta.detail,editBounds(edit));return true;}
}
