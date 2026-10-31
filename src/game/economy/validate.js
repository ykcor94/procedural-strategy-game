import {LAW_AXES} from '../../data/laws.js';
import {INDUSTRY_BY_ID} from '../../data/industries.js';
import {BUILDING_BY_ID} from '../../data/buildings.js';
import {INITIATIVE_BY_ID} from '../../data/initiatives.js';
export const ECONOMY_VERSION=1;
const finite=(...values)=>values.every(Number.isFinite);
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
/** Structural validation of a saved campaign economy. Throws on anything a tampered or damaged file could break. */
export function validateEconomy(econ,nationIds){
  const fail=why=>{throw new Error(`Invalid campaign economy: ${why}.`);};
  if(!isObject(econ)||econ.version!==ECONOMY_VERSION)fail('version');
  if(nationIds&&!nationIds.has(econ.nation))fail('nation');
  if(!Number.isInteger(econ.day)||econ.day<0||!finite(econ.treasury,econ.debt,econ.stability,econ.corruption,econ.prestige)||econ.debt<0||econ.stability<0||econ.stability>100)fail('figures');
  for(const key of ['rates','spend','laws','mood','board','built','ports','routeLevels','partners','organic','surveys','snap','consts','cooldown'])if(!isObject(econ[key]))fail(key);
  for(const [id,rate]of Object.entries(econ.rates))if(!finite(rate)||rate<0||rate>1)fail('tax rate');
  for(const key of ['admin','services'])if(!finite(econ.spend[key])||econ.spend[key]<.25||econ.spend[key]>2)fail('spending');
  for(const axis of LAW_AXES){const s=econ.laws[axis.id];if(!isObject(s)||!Number.isInteger(s.pos)||s.pos<0||s.pos>=axis.positions.length||!finite(s.from,s.progress)||s.from<0||s.from>axis.positions.length-1||s.progress<0||s.progress>1)fail(`law ${axis.id}`);if(!finite(econ.mood[axis.id]))fail('mood');if(!Number.isInteger(econ.consts.baseLaws?.[axis.id]))fail('baseline laws');}
  if(!finite(econ.consts.stab0,econ.consts.stabBase,econ.consts.scale,econ.consts.burden0,econ.consts.gdp0,econ.consts.rev0)||econ.consts.scale<=0)fail('constants');
  for(const [id,b]of Object.entries(econ.board))if(!INDUSTRY_BY_ID[id]||!(b.invest>=0&&b.invest<=2)||!(b.fund>=0&&b.fund<=3)||!(b.regulate>=0&&b.regulate<=2))fail('industry board');
  for(const [id,v]of Object.entries(econ.organic))if(!INDUSTRY_BY_ID[id]||!finite(v)||v<=0||v>50)fail('growth');
  if(!Array.isArray(econ.queue)||econ.queue.length>200)fail('queue');
  for(const p of econ.queue)if(!BUILDING_BY_ID[p.type]||!finite(p.work,p.done,p.paid,p.days)||p.work<0||p.done<0||p.days<=0||typeof p.place!=='string')fail('project');
  for(const [key,list]of Object.entries(econ.built)){if(!Array.isArray(list)||list.length>200)fail('buildings');for(const b of list)if(!BUILDING_BY_ID[b.t]||!finite(b.jobs,b.suit,b.cost)||!Number.isInteger(b.i))fail('building');}
  if(!isObject(econ.initiatives)||!Array.isArray(econ.initiatives.active)||econ.initiatives.active.length>10)fail('initiatives');
  for(const a of econ.initiatives.active)if(!INITIATIVE_BY_ID[a.id]||!finite(a.left,a.total))fail('initiative');
  if(!Array.isArray(econ.shocks)||!Array.isArray(econ.hist)||!Array.isArray(econ.log)||econ.hist.length>400||econ.log.length>200)fail('history');
  if(econ.link!==undefined&&!isObject(econ.link))fail('link');
  if(econ.fund!==undefined){const f=econ.fund;if(!isObject(f)||!finite(f.share,f.balance)||f.share<0||f.share>.5||!Array.isArray(f.directives)||f.directives.length>8)fail('fund');}
  return true;
}
