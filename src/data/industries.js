// Industry registry. Sectors keep the legacy agriculture / industry / services roll-up used by city.sectors.
// jobValue: output per worker relative to the local mean · wage: share of output paid as wages
// costFactor: cost of new capacity in years of its output · minDays: fastest possible build
export const SECTORS=Object.freeze([
  {id:'agriculture',name:'Agriculture & fishing',color:'#8fae5a'},
  {id:'industry',name:'Industry & resources',color:'#c07a52'},
  {id:'services',name:'Services',color:'#6a8fd0'},
].map(Object.freeze));
const rows=[
  ['farming','Farming','agriculture','#94b05f',.55,.45,1.2,60,0,'Farm','Grain, roots and orchards on fertile, well-watered land.'],
  ['herding','Herding & ranching','agriculture','#b8a766',.5,.42,1.05,60,0,'Ranch','Pastoral economies on grassland, steppe and dry uplands.'],
  ['fishing','Fishing','agriculture','#5aa3b9',.6,.5,1.35,90,1,'Fishery','Coastal and river fisheries, boats and drying yards.'],
  ['forestry','Forestry','agriculture','#5b8b5e',.65,.5,1.05,60,1,'Sawmill','Timber, charcoal and forest products.'],
  ['mining','Mining & quarrying','industry','#9b7a5e',1.35,.32,2.7,240,1,'Mine','Ore, coal and stone from mountains and old crust.'],
  ['energy','Energy','industry','#e0b43c',1.9,.22,3.3,300,1,'Power station','Hydro, fuel and wind power for industry and cities.'],
  ['heavy','Heavy industry','industry','#b5574a',1.2,.42,2.55,240,0,'Foundry','Smelting, shipyards and machinery.'],
  ['light','Light manufacturing','industry','#cf8654',.95,.5,1.65,150,0,'Workshop','Textiles, tools and household goods.'],
  ['food','Food processing','industry','#c9b062',1,.45,1.5,120,0,'Cannery','Mills, canneries and breweries.'],
  ['construction','Construction & materials','industry','#8f877d',.9,.6,1.5,90,0,'Builders’ yard','Brick, cement and contractors; sets how fast the state can build.'],
  ['trade','Trade & logistics','services','#5f8fd4',1,.5,1.5,120,0,'Market hall','Warehouses, shipping, merchants and caravan stations.'],
  ['finance','Finance & offices','services','#7d78c8',1.7,.55,1.95,180,0,'Office block','Banks, insurers, courts and administration.'],
  ['tourism','Tourism & culture','services','#d86f9a',.7,.6,2.1,210,0,'Resort','Coasts, pilgrimages, heritage towns and festivals.'],
  ['knowledge','Knowledge & technology','services','#a77bd0',1.6,.65,2.4,300,0,'Research park','Universities, laboratories and engineering firms.'],
];
export const INDUSTRIES=Object.freeze(rows.map(([id,name,sector,color,jobValue,wage,costFactor,minDays,extractive,building,blurb],index)=>Object.freeze({id,name,sector,color,jobValue,wage,costFactor,minDays,extractive:!!extractive,building,blurb,index})));
export const INDUSTRY_BY_ID=Object.freeze(Object.fromEntries(INDUSTRIES.map(i=>[i.id,i])));
export const INDUSTRY_COUNT=INDUSTRIES.length;
