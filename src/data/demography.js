// Demographic policies and programmes. Effects are read by game/demography/model.js.
export const AGE_BANDS=Object.freeze([
  {id:0,name:'Children',range:'0–14',width:15,work:0},
  {id:1,name:'Young adults',range:'15–29',width:15,work:.82},
  {id:2,name:'Adults',range:'30–44',width:15,work:.9},
  {id:3,name:'Middle age',range:'45–64',width:20,work:.72},
  {id:4,name:'Elderly',range:'65+',width:Infinity,work:.08},
].map(Object.freeze));
/** Census intervals in years; cost per census is a share of a year's revenue. */
export const CENSUS_INTERVALS=Object.freeze([1,2,5,10]);
export const CENSUS_COST=.012,EMERGENCY_CENSUS_COST=.03,EMERGENCY_CENSUS_MONTHS=3;

const p=(id,name,desc,fx={})=>Object.freeze({id,name,desc,fx:Object.freeze(fx)});
// fx keys: imm (immigration multiplier), skilled (literacy of arrivals), stab (stability), cost (share of revenue a year),
// assim (cultural assimilation multiplier), lang (language shift), conv (conversion to the state faith), secular,
// minority (satisfaction of minorities), refugees
export const POLICIES=Object.freeze([
  {id:'immigration',name:'Immigration',icon:'passport',blurb:'Who may settle here, and how many.',options:[
    p('closed','Closed borders','Almost no newcomers. Workforce shrinks as people age.',{imm:.08,stab:.4,minority:-4}),
    p('selective','Selective','Skilled workers only: few, but well educated.',{imm:.35,skilled:.85}),
    p('regulated','Regulated','Quotas and visas for workers and families.',{imm:.75}),
    p('open','Open','Anyone with a job offer may come.',{imm:1.3,stab:-.6,minority:3}),
    p('recruit','Recruitment drive','Pay agencies and fares to attract workers abroad.',{imm:2,stab:-1,cost:.008}),
  ]},
  {id:'refugees',name:'Refugees',icon:'tent',blurb:'Whether people fleeing nearby crises are taken in.',options:[
    p('refuse','Turn away','Borders close to those fleeing war and famine.',{refugees:0,minority:-2}),
    p('limited','Limited','Accept vulnerable families only.',{refugees:.4}),
    p('welcome','Welcome','Open camps and resettlement.',{refugees:1,stab:-.4,minority:2,cost:.003}),
  ]},
  {id:'minorities',name:'Minorities',icon:'people',blurb:'How the state treats cultural minorities.',options:[
    p('assimilate','Assimilation','One people, one culture. Fast, and resented.',{assim:2.4,minority:-14}),
    p('integrate','Integration','Shared civic life; customs left alone.',{assim:1}),
    p('multicultural','Multiculturalism','Minorities keep their cultures and institutions.',{assim:.45,minority:8,stab:-.3}),
    p('autonomy','Regional autonomy','Minority homelands govern themselves.',{assim:.12,minority:14,stab:-.6}),
  ]},
  {id:'language',name:'Language',icon:'speech',blurb:'Which languages schools and courts use.',options:[
    p('single','Single official language','The national language everywhere.',{lang:1.7,minority:-6}),
    p('regional','Regional languages','Local languages co-official in their regions.',{lang:.75,minority:3}),
    p('multilingual','Multilingual state','Every major language is official.',{lang:.3,minority:7,cost:.002}),
  ]},
  {id:'religion',name:'Religion',icon:'temple',blurb:'The relationship between the state and faith.',options:[
    p('secular','Secular state','No state church; belief is private.',{conv:0,secular:1.5}),
    p('tolerant','Tolerant','Official faith, protected minorities.',{conv:.3,secular:1}),
    p('established','Established church','The state funds and favours one faith.',{conv:1,secular:.5,minority:-3}),
    p('enforced','Enforced orthodoxy','Conversion is expected; dissent is punished.',{conv:2.6,secular:.08,minority:-16,stab:-.5}),
  ]},
]);
export const POLICY_BY_ID=Object.freeze(Object.fromEntries(POLICIES.map(x=>[x.id,x])));

// scope: nation | province | city. cost: share of a year's revenue. months: duration.
export const DEMO_INITIATIVES=Object.freeze([
  {id:'natalist',name:'Family allowance',scope:'nation',icon:'cradle',cost:.05,months:60,cooldown:24,desc:'Child benefits and parental leave. Births rise slowly.',fx:{fert:.32}},
  {id:'health',name:'Public health campaign',scope:'nation',icon:'cross',cost:.045,months:48,cooldown:24,desc:'Clinics, vaccination and clean water. Fewer early deaths.',fx:{life:3.5}},
  {id:'schools',name:'School expansion',scope:'nation',icon:'book',cost:.05,months:60,cooldown:36,desc:'Primary schools in every district. Literacy climbs and the national language spreads.',fx:{lit:.025,lang:1.4}},
  {id:'standardize',name:'Language standardisation',scope:'province',icon:'speech',cost:.02,months:36,cooldown:12,desc:'Teach and broadcast in the official language in one province.',fx:{lang:4,minority:-3}},
  {id:'assimilate',name:'Assimilation drive',scope:'province',icon:'people',cost:.025,months:36,cooldown:12,desc:'National curriculum, settlers and incentives in one province. Unrest likely.',fx:{assim:5,minority:-6}},
  {id:'mission',name:'Religious mission',scope:'province',icon:'temple',cost:.02,months:36,cooldown:12,desc:'Preachers and charities spread the state faith in one province.',fx:{conv:5}},
  {id:'charter',name:'Autonomy charter',scope:'province',icon:'scroll',cost:.015,months:120,cooldown:60,desc:'Grant one province cultural self-government. Minorities there are content and assimilation stops.',fx:{assim:-1,minority:12}},
  {id:'resettle',name:'Frontier resettlement',scope:'province',icon:'wagon',cost:.04,months:24,cooldown:24,desc:'Move families from crowded provinces to one with room to grow.',fx:{resettle:.012}},
  {id:'renewal',name:'Urban renewal',scope:'city',icon:'city',cost:.03,months:36,cooldown:12,desc:'Housing and sanitation in one city: it can grow faster and live longer.',fx:{urban:.012,life:1.5}},
  {id:'modernize',name:'Census modernisation',scope:'nation',icon:'clipboard',cost:.02,months:24,cooldown:120,desc:'Trained enumerators and registers. Censuses become cheaper and more accurate.',fx:{},done:{accuracy:.3,censusCost:-.35}},
].map(Object.freeze));
export const DEMO_INITIATIVE_BY_ID=Object.freeze(Object.fromEntries(DEMO_INITIATIVES.map(x=>[x.id,x])));
export const DEFAULT_DEMO_POLICIES=Object.freeze({immigration:'regulated',refugees:'limited',minorities:'integrate',language:'regional',religion:'tolerant'});
