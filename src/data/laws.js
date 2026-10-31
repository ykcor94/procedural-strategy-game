// National positions. Each axis has ordered positions; effects are additive deltas against the starting
// position (so a new campaign always begins exactly at the generated economy), except the ABSOLUTE keys,
// which are read straight from the current position.
//   growth      annual organic growth          income…fees  collection efficiency
//   openness    cross-border trade volume      corruption   share of revenue lost
//   unemp       unemployment                   stab         stability target
//   buildCost / buildSpeed  construction       credit       borrowing limit    interest  loan rate
//   ind         { industry: efficiency }
// ABSOLUTE: welfare (share of baseline revenue), tariffCap, enterprise (state-firm profit share),
//           prioritySlots, load (administrative capacity the tax system demands)
export const ABSOLUTE_KEYS=Object.freeze(['welfare','tariffCap','enterprise','prioritySlots','load']);
const p=(id,name,desc,fx={},req)=>({id,name,desc,fx,req});
export const LAW_AXES=Object.freeze([
  {id:'tax',name:'Tax system',blurb:'Which taxes the state can collect cheaply.',cost:.06,shock:5,months:12,cooldown:720,weight:1,sens:.3,
   positions:[
    p('tribute','Land & tribute','Levies on land and harvests. Little paperwork, little growth.',{income:-.35,corporate:-.3,consumption:-.1,property:.6,royalty:.1,growth:-.002,load:0}),
    p('customs','Customs-led','The state lives off its ports and borders.',{income:-.25,corporate:-.2,property:-.1,fees:.2,load:.15}),
    p('flat','Flat tax','One simple rate. Easy to collect, kind to investment.',{income:.12,corporate:.12,consumption:.05,growth:.002,stab:-1,load:.35}),
    p('progressive','Progressive income','Heavy on high earners. Raises more, needs a capable administration.',{income:.22,corporate:.1,consumption:-.1,property:.1,growth:-.001,stab:1,load:.55},{inst:.45}),
    p('vat','Consumption-led','Tax what people buy; hard to dodge.',{income:-.1,corporate:.05,consumption:.35,growth:.001,stab:-.5,load:.45},{inst:.35}),
  ]},
  {id:'ideology',name:'Economic ideology',blurb:'How far the state steers the economy.',cost:.08,shock:9,months:18,cooldown:1080,weight:1.2,sens:.4,
   positions:[
    p('laissez','Laissez-faire','The market decides. Fast, uneven and lightly governed.',{growth:.006,corruption:.03,stab:-1.5,credit:.1,enterprise:0}),
    p('liberal','Market liberal','Private enterprise first, with a thin safety net.',{growth:.003,corruption:.01,stab:-.5,enterprise:.03}),
    p('social','Social market','Competitive markets, strong institutions.',{growth:.001,corruption:-.01,stab:1.2,enterprise:.06}),
    p('capitalism','State capitalism','National champions, directed credit and public builders.',{corruption:.02,buildSpeed:.1,buildCost:-.05,enterprise:.18}),
    p('planned','Central planning','Targets and quotas. Mobilises capital, starves initiative.',{growth:-.004,corruption:.04,buildSpeed:.2,buildCost:-.1,stab:-1,enterprise:.38,ind:{heavy:.05,construction:.05,farming:.02,light:-.04,trade:-.03,finance:-.04}},{inst:.35}),
  ]},
  {id:'trade',name:'Trade policy',blurb:'How open the borders are.',cost:.03,shock:4,months:6,cooldown:540,weight:1,sens:.9,
   positions:[
    p('free','Free trade','Almost no tariffs. Maximum volume, maximum exposure.',{openness:.2,growth:.002,ind:{light:-.03,farming:-.01},tariffCap:.05}),
    p('open','Open','Low tariffs, broad access.',{openness:.1,growth:.001,tariffCap:.15}),
    p('managed','Managed','Selective protection and negotiated terms.',{tariffCap:.3}),
    p('protectionist','Protectionist','High walls around favoured industries.',{openness:-.18,growth:-.001,ind:{light:.04,heavy:.02,farming:.02},tariffCap:.45}),
    p('autarky','Autarky','Self-reliance at any price.',{openness:-.45,growth:-.004,stab:-.5,corruption:.02,ind:{light:.06,heavy:.04,farming:.04,trade:-.06,finance:-.03},tariffCap:.6}),
  ]},
  {id:'welfare',name:'Welfare',blurb:'What the state owes its people. Expectations rise with development.',cost:.02,shock:4,months:9,cooldown:540,weight:1.2,sens:.5,
   positions:[
    p('none','None','Charity and family. No state support.',{welfare:.02}),
    p('minimal','Minimal','Famine relief and basic poor laws.',{welfare:.08,growth:.0004}),
    p('moderate','Moderate','Pensions, schools and clinics.',{welfare:.16,growth:.0008}),
    p('generous','Generous','Broad insurance and public services.',{welfare:.26,growth:.0012,unemp:-.01}),
    p('universal','Universal','Cradle to grave. Expensive; cushions every downturn.',{welfare:.38,growth:.0008,unemp:-.02},{tech:.45}),
  ]},
  {id:'labour',name:'Labour',blurb:'Wages, unions and working conditions.',cost:.02,shock:5,months:6,cooldown:540,weight:.9,sens:.4,
   positions:[
    p('free','Unregulated','No protections.',{growth:.003,unemp:.01,stab:-2,corporate:.04}),
    p('light','Light','Basic safety rules.',{growth:.0015,stab:-.7}),
    p('standard','Standard','Contracts and a minimum wage.',{}),
    p('protected','Protected','Strong unions and secure employment.',{growth:-.002,unemp:-.01,stab:2,corporate:-.05}),
    p('syndicalist','Syndicalist','Workers direct industry.',{growth:-.004,stab:3,corporate:-.1,ind:{heavy:-.03,light:-.02}}),
  ]},
  {id:'fdi',name:'Foreign investment',blurb:'Who may own what.',cost:.02,shock:3,months:6,cooldown:360,weight:.6,sens:-.6,
   positions:[
    p('closed','Closed','No foreign owners.',{growth:-.002,openness:-.05,corruption:-.01}),
    p('screened','Screened','Case-by-case approval.',{}),
    p('open','Open','Capital and know-how welcome.',{growth:.003,corporate:-.08,openness:.05}),
    p('zones','Zones','Special economic zones with their own rules.',{growth:.005,corporate:-.15,corruption:.02,stab:-1,openness:.05},{inst:.3}),
  ]},
  {id:'industry',name:'Industrial policy',blurb:'How much the state backs chosen industries.',cost:.03,shock:3,months:6,cooldown:360,weight:.6,sens:.3,
   positions:[
    p('none','None','Let markets pick winners. One priority slot.',{prioritySlots:1}),
    p('selective','Selective support','Backing for a couple of priorities.',{prioritySlots:2,growth:.0005}),
    p('strategic','Strategic sectors','A planned set of national priorities.',{prioritySlots:3,corruption:.01},{inst:.4}),
    p('direction','State direction','The state decides which industries grow.',{prioritySlots:4,corruption:.02,growth:-.001,buildCost:-.05},{inst:.5}),
  ]},
  {id:'land',name:'Land & property',blurb:'Who holds the land.',cost:.05,shock:7,months:12,cooldown:1080,weight:.9,sens:.6,
   positions:[
    p('customary','Customary','Village and clan tenure.',{ind:{farming:-.03},property:-.2,stab:.5}),
    p('smallholders','Smallholders','Family farms with secure title.',{ind:{farming:.02},stab:1}),
    p('estates','Estates','Large commercial holdings.',{ind:{farming:.04,herding:.03},property:.1,stab:-1.5}),
    p('collective','Collective','Land farmed in common under state plans.',{ind:{farming:-.02},property:-.3,stab:-.5}),
  ]},
  {id:'money',name:'Money & credit',blurb:'The currency and the central bank.',cost:.03,shock:4,months:6,cooldown:720,weight:.6,sens:0,
   positions:[
    p('bound','Commodity-bound','Hard money. Cheap to trust, slow to grow.',{credit:-.3,growth:-.002,interest:-.01}),
    p('cautious','Cautious central bank','Independent and conservative.',{}),
    p('managed','Managed','A flexible currency in the government’s service.',{credit:.2,growth:.001,interest:.005}),
    p('printing','Printing press','Money on demand. Today’s problem is tomorrow’s.',{credit:.6,growth:.002,stab:-1.5,corruption:.02,interest:.03}),
  ]},
].map(a=>Object.freeze({...a,positions:Object.freeze(a.positions.map(Object.freeze))})));
export const LAW_BY_ID=Object.freeze(Object.fromEntries(LAW_AXES.map(a=>[a.id,a])));
