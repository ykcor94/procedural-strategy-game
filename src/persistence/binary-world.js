import {WORLD_VERSION} from '../core/world.js';
import {deserializeWorld,restoreWorld,MIGRATIONS} from './world-file.js';
import {validateSettings} from '../core/settings.js';
import {validateDetail} from '../lod/detail-edits.js';

const MAGIC=new Uint8Array([65,84,76,65,83,50,0,0]); // ATLAS2
const TYPES={Float32Array,Float64Array,Int32Array,Uint32Array,Int16Array,Uint16Array,Int8Array,Uint8Array};
const align8=n=>Math.ceil(n/8)*8;

/** Versioned binary envelope: small UTF-8 JSON manifest + aligned typed bytes.
 * Blob parts avoid an enormous base64/JSON string and preserve exact Float32 bits.
 */
export function worldToBlob(world) {
  validateSettings(world.settings);validateDetail(world.meta.detail);
  const layers={},parts=[];let offset=0;
  for(const [name,a]of Object.entries(world.layers)) {
    layers[name]={type:a.constructor.name,length:a.length,offset,byteLength:a.byteLength};
    parts.push(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));
    const pad=align8(a.byteLength)-a.byteLength;if(pad)parts.push(new Uint8Array(pad));offset+=a.byteLength+pad;
  }
  const header=new TextEncoder().encode(JSON.stringify({format:'atlas-foundry',version:WORLD_VERSION,byteOrder:'LE',width:world.width,height:world.height,seed:world.seed,name:world.name,settings:world.settings,meta:world.meta,layers}));
  const length=new Uint8Array(4);new DataView(length.buffer).setUint32(0,header.length,true);
  const padding=new Uint8Array(align8(12+header.length)-12-header.length);
  return new Blob([MAGIC,length,header,padding,...parts],{type:'application/x-atlas-world'});
}

export async function readWorld(input) {
  if(typeof input==='string')return deserializeWorld(input);
  const blob=input instanceof Blob?input:new Blob([input]);
  const prefix=new Uint8Array(await blob.slice(0,12).arrayBuffer());
  if(prefix.length<12||!MAGIC.every((v,i)=>prefix[i]===v))return deserializeWorld(await blob.text());
  const headerSize=new DataView(prefix.buffer).getUint32(8,true);
  if(headerSize<20||headerSize>32*1024*1024||12+headerSize>blob.size)throw new Error('Invalid world manifest size.');
  let doc;try{doc=JSON.parse(await blob.slice(12,12+headerSize).text());}catch{throw new Error('Invalid world manifest.');}
  const originalVersion=doc.version;
  while(doc.version<WORLD_VERSION&&MIGRATIONS.has(doc.version))doc=MIGRATIONS.get(doc.version)(doc);
  const settings=validateSettings(doc.settings),n=settings.width*settings.height;
  if(doc.format!=='atlas-foundry'||doc.version!==WORLD_VERSION||!doc.layers||Object.keys(doc.layers).length>100)throw new Error('Unsupported binary world format.');
  if(doc.byteOrder&&doc.byteOrder!=='LE')throw new Error('Unsupported world byte order.');
  const buffer=await blob.arrayBuffer(),start=align8(12+headerSize),layers={},ranges=[];
  for(const [name,entry]of Object.entries(doc.layers)) {
    if(!Object.hasOwn(TYPES,entry.type))throw new Error(`Unknown layer type for ${name}.`);
    const Type=TYPES[entry.type],expected=['temperature','precipitation','seaIce'].includes(name)?n*12:n;
    if(entry.length!==expected||entry.byteLength!==expected*Type.BYTES_PER_ELEMENT||!Number.isSafeInteger(entry.offset)||entry.offset<0||entry.offset%8||start+entry.offset+entry.byteLength>buffer.byteLength)throw new Error(`Invalid byte range for ${name}.`);
    const end=entry.offset+entry.byteLength;
    if(ranges.some(([lo,hi])=>entry.offset<hi&&end>lo))throw new Error('World layer byte ranges overlap.');
    ranges.push([entry.offset,end]);layers[name]=new Type(buffer,start+entry.offset,entry.length);
  }
  return restoreWorld(doc,layers,originalVersion);
}
