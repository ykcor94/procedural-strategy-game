// Goods traded on national and world markets. Raw goods come from the land (see game/resources.js);
// manufactured goods are made from them. `industry` produces the good; `basic` goods are staples whose
// shortages hurt stability; `hidden` deposits must be surveyed before the player can see them.
// `icon` names a symbol in ui/icons.js. Prices are relative to 1.0 at the start of a campaign.
export const GOOD_GROUPS=Object.freeze([
  {id:'farm',name:'Farm & sea',color:'#94b05f'},
  {id:'mineral',name:'Minerals',color:'#9b7a5e'},
  {id:'energy',name:'Energy',color:'#e0b43c'},
  {id:'made',name:'Manufactured',color:'#cf8654'},
].map(Object.freeze));
const rows=[
  // id, name, group, color, icon, industry, basic, hidden, blurb
  ['grain','Grain','farm','#d8be5c','grain','farming',1,0,'Wheat, rice, maize and roots from fertile, well-watered plains.'],
  ['livestock','Livestock','farm','#b8875e','livestock','herding',1,0,'Cattle, sheep and goats on grassland, steppe and dry uplands.'],
  ['fish','Fish','farm','#5aa3b9','fish','fishing',1,0,'Catches from cool coasts, deltas, lakes and great rivers.'],
  ['timber','Timber','farm','#5b8b5e','timber','forestry',0,0,'Logs and wood from boreal, temperate and tropical forests.'],
  ['fibres','Fibres','farm','#e3d7b5','fibres','farming',0,0,'Cotton from warm valleys and wool from cool pastures.'],
  ['fruit','Fruit & spices','farm','#d8774f','fruit','farming',0,0,'Orchards, vineyards, tea and spice gardens in tropical and mediterranean climates.'],
  ['iron','Iron ore','mineral','#8a6d63','iron','mining',0,1,'Banded ores on ancient continental shields.'],
  ['copper','Copper & tin','mineral','#c47a45','copper','mining',0,1,'Porphyry ores along young mountain belts and old volcanoes.'],
  ['coal','Coal','energy','#4f4c4b','coal','mining',0,1,'Seams in lowland basins beside old mountains, laid down by ancient forests.'],
  ['oil','Oil & gas','energy','#2f3a46','oil','energy',0,1,'Sedimentary basins, rift valleys and continental shelves.'],
  ['precious','Precious metals','mineral','#e2c35a','precious','mining',0,1,'Gold and silver veins in orogens and volcanic arcs.'],
  ['stone','Stone & clay','mineral','#a9a198','stone','construction',0,0,'Quarries and clay pits: the bulk of every building.'],
  ['salt','Salt','mineral','#d9e2e3','salt','mining',0,0,'Evaporite flats in dry basins and sun-baked coasts.'],
  ['gems','Gemstones','mineral','#b26fc7','gem','mining',0,1,'Rare pipes on old cratons and volcanic gravels.'],
  ['food','Processed food','made','#c9b062','food','food',1,0,'Flour, preserves, beer and packaged food from mills and canneries.'],
  ['goods','Consumer goods','made','#cf8654','goods','light',0,0,'Clothing, furniture, tools and household wares.'],
  ['machinery','Machinery & steel','made','#b5574a','gear','heavy',0,0,'Steel, engines, ships and equipment for industry and construction.'],
  ['power','Power','energy','#f0c850','bolt','energy',1,0,'Electricity and fuel delivered to homes and factories. Barely tradable.'],
];
export const GOODS=Object.freeze(rows.map(([id,name,group,color,icon,industry,basic,hidden,blurb],index)=>Object.freeze({id,index,name,group,color,icon,industry,basic:!!basic,hidden:!!hidden,blurb,raw:group!=='made'&&id!=='power'})));
export const GOOD_COUNT=GOODS.length;
export const GOOD_BY_ID=Object.freeze(Object.fromEntries(GOODS.map(g=>[g.id,g])));
export const G=Object.freeze(Object.fromEntries(GOODS.map(g=>[g.id,g.index])));
/** Raw resources with a geographic deposit field (stone and salt are common enough to always be known). */
export const RESOURCE_IDS=Object.freeze(['grain','livestock','fish','timber','fibres','fruit','iron','copper','coal','oil','precious','stone','salt','gems']);
export const RESOURCE_COUNT=RESOURCE_IDS.length;
/** How far goods travel: power hardly at all, bulk stone little, gems everywhere. */
export const TRADABILITY=Object.freeze({grain:.8,livestock:.55,fish:.6,timber:.7,fibres:.9,fruit:.85,iron:.85,copper:.95,coal:.75,oil:1,precious:1,stone:.25,salt:.7,gems:1,food:.85,goods:1,machinery:1,power:.12});

/** What each industry turns out, as shares of its output. Extractive mixes follow local deposits and are
 * replaced per place; these are the fallbacks for places with no data. Services produce no goods. */
export const OUTPUT_MIX=Object.freeze({
  farming:{grain:.7,fibres:.15,fruit:.15},herding:{livestock:.85,fibres:.15},fishing:{fish:1},forestry:{timber:1},
  mining:{iron:.25,copper:.15,coal:.25,precious:.08,salt:.12,gems:.03,stone:.12},energy:{power:.7,oil:.3},
  heavy:{machinery:1},light:{goods:1},food:{food:1},construction:{stone:.3},
});
/** Inputs used per unit of each industry's output (value terms). */
export const INPUTS=Object.freeze({
  farming:{machinery:.03,power:.02},herding:{grain:.05},fishing:{power:.03,machinery:.02},forestry:{machinery:.03},
  mining:{power:.08,machinery:.05},energy:{coal:.18,oil:.14},
  heavy:{iron:.22,coal:.1,copper:.08,power:.08},light:{fibres:.18,timber:.08,copper:.03,power:.05},
  food:{grain:.22,livestock:.15,fish:.08,fruit:.06,salt:.03,power:.03},
  construction:{stone:.18,timber:.1,machinery:.1},trade:{power:.02,goods:.02},finance:{power:.01},tourism:{food:.06,goods:.03,power:.02},knowledge:{power:.03,machinery:.03},
});
/** Household spending per unit of national output, scaled by income (luxuries rise faster with wealth). */
export const HOUSEHOLD=Object.freeze({food:.06,grain:.012,fish:.006,livestock:.006,fruit:.008,goods:.05,power:.03,gems:.002,precious:.003,timber:.004});
export const LUXURY=Object.freeze({gems:1,precious:1,fruit:.5,goods:.4});
