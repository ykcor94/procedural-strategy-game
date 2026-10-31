import {validateEconomy} from './economy/validate.js';
import {validateWorldState} from './world/state.js';
/** A saved campaign: clock, player identity and the player's national economy (see game/economy). */
export const GAME_VERSION=3;
export const GAME_SPEEDS=Object.freeze([1,6,24,72,168]); // game hours per real second
const MAX_DATE=Date.parse('9999-12-31T23:00:00Z');
export function dateEpoch(date){if(typeof date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(date))throw new Error('Invalid campaign date.');const epoch=Date.parse(date+'T00:00:00Z');if(!Number.isFinite(epoch)||new Date(epoch).toISOString().slice(0,10)!==date||epoch<Date.parse('0001-01-01T00:00:00Z'))throw new Error('Invalid campaign date.');return epoch;}
export function createGameState(world,nationId){
  if(!world.meta.civilization?.nations.some(n=>n.id===+nationId&&n.area>0))throw new Error('Select an existing nation before starting.');
  const startDate=world.meta.civilization.startDate||'2000-01-01';dateEpoch(startDate);
  return {version:GAME_VERSION,playerNation:+nationId,startDate,currentDate:startDate,elapsedHours:0,paused:true,speed:1,view:{mode:'political',camera:null},rules:{simulation:'economy',editing:false},settings:{liveForeign:false}};
}
export function advanceGame(state,realMilliseconds){
  if(state.paused||!Number.isFinite(realMilliseconds)||realMilliseconds<=0)return false;
  const start=dateEpoch(state.startDate),before=state.elapsedHours,hours=realMilliseconds/1000*GAME_SPEEDS[state.speed-1];state.elapsedHours=Math.min((MAX_DATE-start)/3600000,before+hours);state.currentDate=new Date(start+Math.floor(state.elapsedHours)*3600000).toISOString().slice(0,10);if(start+state.elapsedHours*3600000>=MAX_DATE)state.paused=true;return state.elapsedHours!==before;
}
export function validateGameState(world){const g=world.meta.game;if(!g)return true;if(g.version!==GAME_VERSION||!world.meta.civilization?.nations.some(n=>n.id===g.playerNation))throw new Error('Invalid campaign player nation.');const start=dateEpoch(g.startDate);dateEpoch(g.currentDate);if(!Number.isFinite(g.elapsedHours)||g.elapsedHours<0||start+g.elapsedHours*3600000>MAX_DATE||!Number.isInteger(g.speed)||g.speed<1||g.speed>5||typeof g.paused!=='boolean')throw new Error('Invalid campaign clock.');if(new Date(start+Math.floor(g.elapsedHours)*3600000).toISOString().slice(0,10)!==g.currentDate)throw new Error('Campaign date does not match its elapsed time.');if(g.view?.camera&&['x','y','scale'].some(key=>!Number.isFinite(g.view.camera[key]))||g.view?.camera?.scale<=0)throw new Error('Invalid campaign camera.');return true;}
export function validateCampaignEconomy(world){const g=world.meta.game;if(g?.economy)validateEconomy(g.economy,new Set(world.meta.civilization.nations.map(n=>n.id)));return true;}
export function normalizeGameState(world){
  if(!world.meta.game)return world;
  const g=world.meta.game;if(g.version===1||g.version===2){g.rules={...g.rules,simulation:'economy'};g.version=GAME_VERSION;}
  try{validateGameState(world);}catch{delete world.meta.game;return world;}
  try{validateCampaignEconomy(world);}catch{delete g.economy;delete g.world;delete g.demography;}
  const ids=new Set(world.meta.civilization.nations.map(n=>n.id));
  if(g.world){try{validateWorldState(g.world,ids);if(g.world.player!==g.playerNation)throw new Error('player');}catch{delete g.world;}}
  if(g.demography){const d=g.demography;if(d.version!==1||d.nation!==g.playerNation||!d.places||typeof d.places!=='object'||!d.census||!d.policies)delete g.demography;}
  if(!g.settings||typeof g.settings!=='object')g.settings={liveForeign:false};
  return world;
}
export function selectionGroup(nation){const government=String(nation.government||'').toLowerCase();return /monarch|crown|kingdom/.test(government)?'monarchy':/dictat|regime|fascist|authoritarian|communist/.test(government)?'authoritarian':/theocra/.test(government)?'theocracy':'republic';}
export function filterNations(nations,{search='',geography='all',government='all',development='all',sort='population'}={},coastal=new Set()){
  const fold=s=>String(s).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase(),query=fold(search.trim());return nations.filter(n=>(!query||fold(`${n.name} ${n.officialName||''} ${n.government||''} ${n.demonym||''}`).includes(query))&&(geography==='all'||(geography==='coastal'?coastal.has(n.id):!coastal.has(n.id)))&&(government==='all'||selectionGroup(n)===government)&&(development==='all'||(development==='advanced'?(n.technology||0)>=.7:(n.technology||0)<.7))).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):(b[sort]||0)-(a[sort]||0)||a.name.localeCompare(b.name));
}
