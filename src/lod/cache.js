export class TileCache {
  constructor(limitBytes=64*1024*1024){this.limitBytes=limitBytes;this.bytes=0;this.entries=new Map();this.pinned=new Set();}
  get(key){const item=this.entries.get(key);if(!item)return null;this.entries.delete(key);this.entries.set(key,item);return item;}
  set(key,item){this.delete(key);this.entries.set(key,item);this.bytes+=item.bytes;this.trim();}
  pin(keys){this.pinned=new Set(keys);this.trim();}
  trim(){while(this.bytes>this.limitBytes&&this.entries.size>1){const disposable=[...this.entries.keys()].find(key=>!this.pinned.has(key));if(disposable!==undefined)this.delete(disposable);else if(this.bytes>this.limitBytes*2)this.delete(this.entries.keys().next().value);else break;}}
  delete(key){const item=this.entries.get(key);if(!item)return;this.bytes-=item.bytes;for(const plane of ['bitmap','mask','shade','sprites'])item[plane]?.close?.();this.entries.delete(key);}
  clear(){for(const key of this.entries.keys())this.delete(key);this.pinned.clear();}
}
