import {INDUSTRIES} from './industries.js';
// Tier A adds industry capacity (real revenue), tier B is an enabler with one narrow, stated effect,
// tier C is civic prestige: stability and upkeep only. `where` is the kind of place the project is built in.
export const SIZES=Object.freeze([
  {id:1,name:'Small',share:.025,min:25,speed:1},
  {id:2,name:'Medium',share:.06,min:60,speed:.8},
  {id:3,name:'Large',share:.12,min:120,speed:.62},
].map(Object.freeze));
const RURAL_ONLY=['farming','herding','forestry'],CITY_ONLY=['finance','knowledge','trade','heavy','tourism'];
const productive=INDUSTRIES.map(i=>({id:i.id,name:i.building,tier:'A',industry:i.id,where:RURAL_ONLY.includes(i.id)?['rural']:CITY_ONLY.includes(i.id)?['city']:['city','rural'],minDays:i.minDays,summary:i.blurb}));
export const BUILDINGS=Object.freeze([
  ...productive,
  {id:'housing',name:'Housing district',tier:'B',where:['city'],minDays:120,summary:'Homes for workers drawn in by new jobs. Removes labour shortages; adds property-tax base.'},
  {id:'port',name:'Harbour works',tier:'B',where:['city'],minDays:300,summary:'Deeper quays and cranes. Cuts costs on sea routes and raises port-fee income. Needs a coast.'},
  {id:'road',name:'Road & rail upgrade',tier:'B',where:['route'],minDays:240,summary:'Raises the capacity of an overland or river trade route, lifting trade volume.'},
  {id:'monument',name:'Grand monument',tier:'C',where:['city'],minDays:420,prestige:3,share:.006,summary:'A national landmark. Prestige and a little stability; upkeep only.'},
  {id:'park',name:'Public park',tier:'C',where:['city'],minDays:150,prestige:1.6,share:.003,summary:'Gardens and promenades. Small prestige gain.'},
  {id:'temple',name:'Great temple',tier:'C',where:['city'],minDays:480,prestige:2.8,share:.006,summary:'A place of worship and pilgrimage. Prestige.'},
  {id:'library',name:'Grand library',tier:'C',where:['city'],minDays:360,prestige:2.2,share:.005,summary:'Archives and a reading public. Prestige.'},
  {id:'stadium',name:'Stadium',tier:'C',where:['city'],minDays:300,prestige:2.4,share:.005,summary:'Games and gatherings. Prestige.'},
].map(Object.freeze));
export const BUILDING_BY_ID=Object.freeze(Object.fromEntries(BUILDINGS.map(b=>[b.id,b])));
export const TIER_NAMES=Object.freeze({A:'Productive',B:'Enabling',C:'Civic'});
