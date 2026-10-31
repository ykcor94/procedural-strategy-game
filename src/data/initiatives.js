// National programmes. cost is a share of annual revenue; months is how long the effects last.
// scope: nation | province | city | partner. `done` runs once when the programme ends.
export const INITIATIVES=Object.freeze([
  {id:'electrification',name:'Rural electrification',scope:'nation',cost:.05,months:36,cooldown:24,desc:'Power lines and pumps reach the countryside.',fx:{ind:{farming:.05,herding:.03,light:.02},growth:.001}},
  {id:'literacy',name:'Literacy & university charter',scope:'nation',cost:.06,months:60,cooldown:36,desc:'Schools, colleges and a reading public. Slow, but it compounds.',fx:{growth:.003,stab:.5,ind:{knowledge:.05,finance:.02}}},
  {id:'mission',name:'Trade mission',scope:'partner',cost:.03,months:24,cooldown:12,desc:'Envoys and merchants secure preferential terms with a partner.',fx:{}},
  {id:'harbour',name:'Port modernisation',scope:'city',cost:.04,months:12,cooldown:12,desc:'Cranes and dredging for one port city. Adds a harbour level at once.',fx:{}},
  {id:'zone',name:'Special economic zone',scope:'province',cost:.06,months:48,cooldown:24,desc:'Lower rules and faster approvals in one province.',fx:{corruption:.01}},
  {id:'integrity',name:'Anti-corruption campaign',scope:'nation',cost:.04,months:18,cooldown:48,desc:'Audits and prosecutions. Painful for the elite, lasting for the state.',fx:{corruption:-.03,stab:-1},done:{corruption:-.02}},
  {id:'survey',name:'Geological survey',scope:'province',cost:.03,months:12,cooldown:12,desc:'Prospectors map one province. Might find ore and fuel; might not.',fx:{}},
  {id:'stimulus',name:'Infrastructure stimulus',scope:'nation',cost:.08,months:12,cooldown:36,desc:'Public works funding: builders work faster and jobs return.',fx:{buildSpeed:.3,unemp:-.01}},
  {id:'tourism',name:'Tourism board',scope:'nation',cost:.035,months:36,cooldown:24,desc:'Promotion of coasts, shrines and heritage.',fx:{ind:{tourism:.08,trade:.01}}},
  {id:'restructuring',name:'Debt restructuring',scope:'nation',cost:.02,months:24,cooldown:60,desc:'Negotiate cheaper loans. Creditors remember.',fx:{interest:-.015,credit:-.1,stab:-.5}},
].map(i=>Object.freeze({...i,fx:Object.freeze(i.fx)})));
export const INITIATIVE_BY_ID=Object.freeze(Object.fromEntries(INITIATIVES.map(i=>[i.id,i])));
