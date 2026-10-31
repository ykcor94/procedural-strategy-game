import {seededRandom} from '../core/random.js';

/* Phonology archetypes. Each evokes a broad sound family (some deliberately
 * familiar, some invented) without copying any real language: inventories,
 * weights, phonotactics and endings are recombined per language, then dialects
 * drift through regular sound changes. Accented letters are never part of a
 * base inventory; each language adopts a few "marks" as a consistent habit,
 * and the whole system can be generated without them.
 *
 * Compact notation: "k3 t2" = grapheme + relative weight; "CV4" = pattern ×4;
 * marks "c:č" = base → accented grapheme. */
const ARCHETYPE_DATA=[
 {id:'sibilant',label:'Northern sibilant',c:'k3 t3 p2 d2 b2 g2 z2 s3 w2 r3 n3 m2 l3 j1 ch1 cz2 sz2 rz1 h1 c1',v:'a4 e3 i3 o4 u2 y2',on:'pr tr kr st sk sl zw gr br dr pl kl sw szcz',co:'k n m s sz cz ch w j',pat:'CV4 CVC3 CCV2 CCVC1',syl:'2-3',suf:'ow owo ice in ek ka ny sko',place:'owo ice in ow ny',nat:'ia ska',marks:'l:ł z:ż s:ś c:ć n:ń o:ó',rate:.2,fam:'ski ak owicz',glue:'o',familyFirst:0},
 {id:'southslav',label:'Highland sibilant',c:'k3 t3 v3 d3 r3 l3 n3 m2 s3 z2 b2 g2 p2 j2 h1 c2 dz1',v:'a5 e3 i4 o4 u2',on:'br dr gr kr pr sv sl zl vr st sk',co:'k n c t r v j',pat:'CV4 CVC3 CCV2',syl:'2-3',suf:'ovo ac ica in ov iste ane',place:'grad ovo ica ac iste',nat:'ija ska',marks:'c:č s:š z:ž c:ć d:đ',rate:.28,fam:'ic ovic ski',glue:'o',familyFirst:0},
 {id:'romance',label:'Littoral open',c:'l3 n3 r4 t3 s3 c2 d2 m2 p2 v2 b1 g1 f1 gn1 gl1 qu1 ch1 z1',v:'a5 o4 e4 i3 u1',on:'pr tr br fr pl bl cr',co:'n r l s',pat:'CV6 CVC2 V1 CCV1',syl:'2-3',suf:'ia ano ena ella ona etto ara ino ola',place:'ano ella ona ino ara',nat:'ia ona',marks:'e:è o:ò a:à',rate:.12,fam:'i ini etti',glue:'a',familyFirst:0},
 {id:'iberian',label:'Peninsular open',c:'l2 n3 r4 t3 s4 c2 d3 m2 p1 v1 b2 g2 j1 ll1 z1 ch1',v:'a6 o5 e4 i2 u1',on:'br tr gr pl fl',co:'n r s l z d',pat:'CV5 CVC3 V1',syl:'2-3',suf:'ez ado eira ia as ona illa ejo',place:'illa ejo ado eira al',nat:'ia',marks:'n:ñ a:á e:é o:ó',rate:.14,fam:'ez es eira',glue:'a',familyFirst:0},
 {id:'gallic',label:'Riverland soft',c:'b2 d2 f1 g1 j1 l3 m2 n3 p2 r4 s3 t3 v2 ch1',v:'a3 e4 i2 o2 u1 ai1 eau1 ou1 eu1',on:'br bl fr tr pl gr',co:'n r l s t',pat:'CV5 CVC2 CCV1',syl:'2-3',suf:'eux ais elle ac ignac ois ier ette',place:'ville ac mont elle ais',nat:'ie ance',marks:'e:é e:è c:ç',rate:.15,fam:'ier eau ard',glue:'e',familyFirst:0},
 {id:'germanic',label:'Forest compound',c:'k2 t3 s3 d2 b2 g2 h2 l3 m2 n3 r3 f2 w2 sch1 pf1 ck1 z1 ch1',v:'a4 e4 i3 o3 u2 au1 ei1',on:'br dr gr kr st sp schw fl fr',co:'rg rt ld nd ng ck st n m r l ch',pat:'CVC5 CV3 CCVC2',syl:'1-2',suf:'en er ing ung',place:'berg burg heim stadt dorf au wald feld',nat:'land mark',marks:'a:ä o:ö u:ü',rate:.2,fam:'er mann ing',glue:'en',familyFirst:0},
 {id:'nordic',label:'Fjord compound',c:'k2 t3 s3 d2 g2 h2 l3 m2 n3 r3 v2 j1 b1 f1',v:'a4 e3 i3 o3 u2 y1',on:'sk sv st br fr tr kv',co:'n r l k d st nd rk',pat:'CVC5 CV3 CCVC2',syl:'1-2',suf:'en ar is und',place:'vik dal by holm stad nes fjord',nat:'land rike',marks:'a:å o:ø e:æ',rate:.25,fam:'sen son dottir',glue:'s',familyFirst:0},
 {id:'celtic',label:'Western lilting',c:'b1 c2 d2 g2 l3 m2 n3 r3 s2 t2 w2 ll2 dd1 ch2 th1 gw1 f1',v:'a4 e3 i2 o2 u1 y2 ae1',on:'gw cr br tr bl gl',co:'n r l dd ch th',pat:'CV4 CVC4',syl:'2-3',suf:'wen dun more agh ach ys',place:'dun llyn aber ach more',nat:'ia',marks:'a:â w:ŵ y:ŷ',rate:.1,fam:'ach agh',prefix:'mac ap',glue:'',familyFirst:0},
 {id:'hellenic',label:'Archipelago classical',c:'p2 t3 k3 d2 g1 l3 m2 n3 r3 s4 x1 z1 ph1 th2 ch1',v:'a4 e3 i3 o4 y1 ou1',on:'pl kr tr st pr ps',co:'s n r x',pat:'CV5 CVC3 CCV1',syl:'2-4',suf:'os is ia on ene ikos',place:'opolis ia ion os',nat:'ia is',marks:'e:é o:ó a:á',rate:.08,fam:'opoulos idis akis',glue:'o',familyFirst:0},
 {id:'turkic',label:'Steppe harmonic',c:'k3 t2 q1 b2 d2 g1 gh1 l3 m2 n3 r3 s3 sh2 y2 z2 ch1 j1',v:'a4 e3 i3 o2 u2',co:'k r n z l sh t m',pat:'CVC5 CV4 VC1',syl:'2-3',suf:'lar an ir ek',place:'kent abad tepe dag kul su',nat:'istan ia',marks:'s:ş c:ç g:ğ',rate:.22,fam:'oglu ov',glue:'',familyFirst:0,harmony:true},
 {id:'semitic',label:'Desert root',c:'k2 t3 s3 d2 b2 m3 n3 r3 l3 h2 kh2 gh1 sh2 z1 q1 f1 y2 w1 dh1 th1',v:'a6 i3 u3 aa1 ii1',co:'n r l m d t sh',pat:'CV4 CVC5',syl:'2-3',suf:'an at ia el ur ah im',place:'abad ir el at iya',nat:'ia an',prefix:'al el',marks:'a:ā i:ī u:ū',rate:.08,fam:'i ani',glue:'',familyFirst:0},
 {id:'iranian',label:'Plateau',c:'k2 g2 t3 d3 p1 b2 f1 v1 s3 z2 sh2 kh2 gh1 r4 l2 m2 n3 y1 j1 ch1',v:'a5 e2 i3 o2 u2 aa1',on:'kh sh st',co:'n r d z sh m',pat:'CVC4 CV4',syl:'2-3',suf:'an ar ish eh',place:'abad stan gard shahr deh kand',nat:'stan an',marks:'a:â',rate:.08,fam:'i zadeh pour',glue:'',familyFirst:0},
 {id:'indic',label:'River-plain aspirate',c:'k3 kh1 g2 gh1 t2 th1 d2 dh1 p2 ph1 b2 bh1 n3 m3 r4 l2 v2 s2 sh2 h2 j2 ch1 y1',v:'a6 aa2 i3 ii1 u2 e2 o2 ai1',on:'pr tr shr',co:'n m r l',pat:'CV6 CVC3',syl:'2-3',suf:'an a esh ita ika',place:'pur nagar abad garh pura ganj',nat:'desh rashtra',marks:'a:ā i:ī u:ū s:ś',rate:.07,fam:'an ar wala',glue:'a',familyFirst:0},
 {id:'sinitic',label:'Basin tonal',c:'zh2 ch2 sh2 x2 q1 j2 z1 c1 s2 b2 p1 d2 t2 g2 k1 h3 l3 m2 n2 r1 w2 y2 ng1',v:'a4 e2 i3 o1 u3 ia1 ao2 ou1 ei1 uo1 ua1',co:'n ng',pat:'CV5 CVC4',syl:'1-2',suf:'an ing',place:'zhou jing an ning shan hai yang cheng',nat:'guo',marks:'a:ā e:é i:ǐ o:ò',rate:.1,fam:'',glue:'',familyFirst:.95},
 {id:'japonic',label:'Island syllabic',c:'k3 s3 t3 n3 h2 m2 y2 r3 w1 g1 z1 d1 b1 sh2 ch1 ts1',v:'a4 i3 u3 e2 o4',on:'ky ry',co:'n',pat:'CV8 V1 CVC1',syl:'2-4',suf:'',place:'shima yama kawa saki mura oka hara',nat:'',marks:'o:ō u:ū',rate:.1,fam:'',glue:'',familyFirst:.9},
 {id:'koreanic',label:'Peninsular syllabic',c:'g2 k2 n3 d2 t1 r2 m2 b2 p1 s3 j2 ch2 h2 l1 ng1',v:'a4 eo2 o3 u3 eu1 i3 ae1 e1 yo1 yu1',co:'k n l m p ng',pat:'CV4 CVC5',syl:'1-2',suf:'',place:'ju won do san cheon pyeong yang',nat:'',marks:'',rate:0,fam:'',glue:'',familyFirst:.95},
 {id:'polynesian',label:'Ocean open',c:'h2 k3 l2 m2 n2 p2 w1 v1 t2 r1',v:'a5 e3 i4 o3 u3',pat:'CV6 V2',syl:'2-4',suf:'',place:'ua nui loa iki kai motu',nat:'',marks:'a:ā e:ē o:ō',rate:.12,fam:'',glue:'',familyFirst:0},
 {id:'nusantaran',label:'Monsoon coastal',c:'k3 t2 p2 b3 d2 g2 s3 l3 m3 n3 ng2 r3 y1 w1 j2 h1',v:'a7 i3 u3 e1 o1',co:'n ng k t s r',pat:'CV5 CVC4',syl:'2-3',suf:'an ang ina',place:'pura bayan wan nagara batu',nat:'',marks:'',rate:0,fam:'',glue:'',familyFirst:0},
 {id:'bantu',label:'Savanna prefixing',c:'b2 d1 g1 k3 l2 m3 n3 p1 s2 t2 w2 y1 z2 mb2 nd2 ng2 nk1 ny1 sh1 ch1',v:'a6 e3 i4 o3 u4',pat:'CV9 V1',syl:'2-4',suf:'',prefix:'ka mu ki u ba',place:'ani ula ombe enga ini',nat:'',marks:'',rate:0,fam:'',glue:'',familyFirst:0,prefixing:true},
 {id:'click',label:'Southern click',c:'xh2 qh1 q1 gc1 nq1 dl1 hl2 tsh1 ph1 th2 kh1 m3 n3 b2 z2 l3 s2 y1 w2 k2 nd1 mb1',v:'a5 e3 i4 o3 u4',pat:'CV9 V1',syl:'2-4',suf:'',prefix:'ku em on',place:'eni ana ile weni',nat:'',marks:'',rate:0,fam:'',glue:'',familyFirst:0,prefixing:true},
 {id:'kartvelian',label:'Mountain cluster',c:'k2 t2 p1 d2 b2 g2 ts2 dz1 kh2 gh1 q1 ch1 j1 sh1 zh1 v3 r3 l2 m2 n2 s2 z1',v:'a5 e3 i3 o3 u2',on:'gv kv tsk mts dg gr br mtsk tskh tq',co:'s n r l',pat:'CCVC3 CV4 CVC3 CCV2',syl:'2-3',suf:'eti ia uri ani',place:'eti uri ani isi',nat:'eti',marks:'',rate:0,fam:'shvili dze ia ava',glue:'',familyFirst:0},
 {id:'nahuan',label:'Lake-basin',c:'tl3 tz1 ch2 x2 k1 c2 t2 p2 m2 n3 l1 hu1 y2 h1 qu1 cu1',v:'a5 e2 i3 o4',co:'tl n c ch',pat:'CV5 CVC4',syl:'2-4',suf:'',place:'tlan co pan tepec oya can',nat:'',marks:'',rate:0,fam:'',glue:'',familyFirst:0},
 {id:'andean',label:'Highland valley',c:'k2 q2 t2 p2 ch3 ll2 m2 n2 r2 s2 w2 y2 h2',v:'a6 i3 u4',co:'n q y s',pat:'CV6 CVC3',syl:'2-3',suf:'',place:'pampa marca bamba cocha llacta',nat:'',marks:'n:ñ',rate:.25,fam:'',glue:'',familyFirst:0},
 {id:'fennic',label:'Lakeland long-vowel',c:'k3 t3 p2 v2 h2 j2 l3 m2 n3 r2 s3',v:'a4 e3 i3 o2 u2 y1 aa1 ee1 ii1 uu1',co:'n s t l',pat:'CV6 CVC3',syl:'2-4',suf:'nen la inen',place:'la jarvi koski vaara salo niemi',nat:'maa',marks:'a:ä o:ö',rate:.3,fam:'nen la',glue:'',familyFirst:0,geminate:true},
 {id:'magyar',label:'Plains agglutinative',c:'sz2 cs2 zs1 gy2 ny1 ly1 k2 t2 b2 d1 v2 l3 m2 n3 r3 s2 h2 f1',v:'a4 e4 i2 o3 u1',co:'n r l sz k t ny',pat:'CVC5 CV4',syl:'2-3',suf:'i',place:'falva var halom hegy keszi',nat:'',marks:'a:á e:é o:ő u:ű o:ö',rate:.22,fam:'i',glue:'',familyFirst:.9},
 {id:'basque',label:'Isolate',c:'k2 t2 b2 d1 g2 l2 m1 n2 r3 rr1 s2 z2 tz2 tx1 x1 h1',v:'a5 e4 i3 o3 u3',co:'n r tz z k',pat:'CV5 CVC4',syl:'2-3',suf:'eta aga',place:'eta aga zu ondo ibar',nat:'',marks:'',rate:0,fam:'ena',glue:'',familyFirst:0},
 {id:'sylvan',label:'Liquid',c:'l4 r3 n3 m2 th2 v2 s2 y1 d1 f1 h1',v:'a4 e4 i4 o2 ae1 ia1 ue1',co:'l n r th s',pat:'CV5 CVC3 V2',syl:'2-4',suf:'iel ion ara wen ith',place:'ost ion ara wen',nat:'',marks:'e:ë i:ï',rate:.1,fam:'',glue:'',familyFirst:0},
 {id:'ironclad',label:'Hard-stop',c:'k3 r3 g3 z2 d2 t2 b1 m1 n2 kh1 zh1',v:'a4 o4 u3 e1',on:'gr kr zg dr br',co:'k g r z rk rg',pat:'CVC5 CCVC3 CV2',syl:'1-2',suf:'ak uk or',place:'grad gor kar rok',nat:'',marks:'',rate:0,fam:'',glue:'',familyFirst:0},
];
const words=s=>String(s||'').split(/\s+/).filter(Boolean);
const weighted=s=>words(s).map(x=>{const m=/^(\D+?)(\d*\.?\d*)$/.exec(x);return [m[1],+m[2]||1];});
export const ARCHETYPES=Object.freeze(ARCHETYPE_DATA.map(a=>Object.freeze({...a,consonants:weighted(a.c),vowels:weighted(a.v),onsets:words(a.on),codas:words(a.co),patterns:weighted(a.pat).flatMap(([p,w])=>Array(Math.round(w)).fill(p)),range:(a.syl||'2-3').split('-').map(Number),suffixes:words(a.suf),places:words(a.place),nationSuffixes:words(a.nat),prefixes:words(a.prefix),marks:words(a.marks).map(x=>x.split(':')),familySuffixes:words(a.fam)})));
const ARCHETYPE_BY_ID=new Map(ARCHETYPES.map(a=>[a.id,a]));
/** Exonym-style adjective for families and peoples: "Bukre" → "Bukran", "Trizwak" → "Trizwakic". */
export function exonym(name){const base=String(name||'');const stem=base.replace(/[aeiouyáéíóúäöüåøæ]+$/i,'');return stem!==base?(stem.length>=3?stem+'an':base+'n'):base+(/(?:ic|ish|an)$/i.test(base)?'':'ic');}
export function languageStyle(language){return language?.phonology?.style||ARCHETYPE_BY_ID.get(language?.phonology?.archetype)?.label||'';}

export const SEMANTIC_ROOTS=Object.freeze(['river','water','sea','lake','mountain','hill','valley','forest','plain','island','harbor','mouth','ford','town','fort','market','new','old','white','red','high','great','sacred','bridge']);
const pick=(r,a)=>a[Math.floor(r()*a.length)];
export const titleCase=s=>s.charAt(0).toUpperCase()+s.slice(1);
const clean=s=>s.normalize('NFC').replace(/(.)\1{2,}/gi,'$1$1').replace(/[^\p{Script=Latin}]/gu,'');
const latin=s=>String(s??'').normalize('NFC').toLowerCase().replace(/[^\p{Script=Latin}]/gu,'');
const plain=s=>s.normalize('NFD').replace(/\p{Mark}/gu,'').replace(/ø/g,'o').replace(/æ/g,'a').replace(/œ/g,'e').replace(/ł/g,'l').replace(/đ/g,'d').replace(/ı/g,'i');
const vowelGroups=['aáàâäãåāǎ','eéèêëēě','iíìîïyīǐı','oóòôöõøōőǒ','uúùûüūűǔ'];
const consonantGroups=[['b','p','v','f','ph','bh','pf'],['d','t','th','dh','tt','dd'],['g','k','q','kh','gh','h','ck','kk','qh','c','x'],['s','z','sh','zh','ch','ts','tz','tx','j','c','cz','sz','rz','cs','zs','x','xh','ş','š','ž','č','ć','ś','ż','ç','tsh','dz'],['m','n','ng','mb','nd','ny','nk','gn','ñ','ń','ly','gy'],['r','l','w','y','ll','rr','ł','hl','dl','tl']];
function nearestSound(sound,inventory,vowel=false){
 let best=inventory[0]||'a',cost=Infinity;for(const candidate of inventory){let score=candidate===sound?0:plain(candidate)===plain(sound)?.1:4;if(vowel){const a=vowelGroups.findIndex(g=>g.includes(sound)),b=vowelGroups.findIndex(g=>g.includes(candidate));if(a>=0&&b>=0)score=Math.min(score,a===b?.15:Math.abs(a-b)===1?1.3:2.5);}else if(consonantGroups.some(g=>g.includes(sound)&&g.includes(candidate)))score=Math.min(score,1);if(score<cost){cost=score;best=candidate;}}return best;
}
function legalWord(word,p,previous){
 const text=latin(word),tokens=[...new Set([...p.consonants,...p.vowels])].sort((a,b)=>b.length-a.length),old=[...(previous?.consonants||[]),...(previous?.vowels||[])].sort((a,b)=>b.length-a.length);let out='';
 for(let k=0;k<text.length;){const allowed=tokens.find(token=>text.startsWith(token,k));if(allowed){out+=allowed;k+=allowed.length;continue;}const removed=old.find(token=>text.startsWith(token,k))||text[k],isVowel=(previous?.vowels||[]).includes(removed)||vowelGroups.some(g=>g.includes(removed));out+=nearestSound(removed,isVowel?p.vowels:p.consonants,isVowel);k+=removed.length;}
 return out||p.consonants[0]+p.vowels[0];
}
/** Split a word into inventory graphemes (longest first). */
function tokenize(word,tokens){const sorted=[...tokens].sort((a,b)=>b.length-a.length),out=[];for(let k=0;k<word.length;){const t=sorted.find(x=>word.startsWith(x,k))||word[k];out.push(t);k+=t.length;}return out;}
const weightOf=(p,g)=>p.weights?.[g]??1;
function pickWeighted(r,list,p){let total=0;for(const g of list)total+=weightOf(p,g);let x=r()*total;for(const g of list){x-=weightOf(p,g);if(x<=0)return g;}return list[list.length-1];}
function consonantCluster(cluster,consonants){return tokenize(cluster,consonants).every(t=>consonants.includes(t));}

/** Project every reusable word onto the declared inventory after sound changes or player edits. */
export function normalizeLanguagePhonology(language){
 if(!language?.phonology)return language;const p=language.phonology,previous=p.inventorySnapshot,inventory=(items,fallback)=>{const values=[...new Set((Array.isArray(items)?items:[]).map(latin).filter(Boolean))];return values.length?values:fallback;};
 p.consonants=inventory(p.consonants,['k','l','m','n','r','s','t']);p.vowels=inventory(p.vowels,['a','e','i','o','u']);p.patterns=(Array.isArray(p.patterns)?p.patterns:[]).filter(x=>typeof x==='string'&&/^[CV]{1,5}$/.test(x));if(!p.patterns.length)p.patterns=['CV','CVC'];
 const adapt=word=>legalWord(word,p,previous),cluster=list=>[...new Set(inventory(list,[]).map(c=>{const tokens=[...p.consonants].sort((a,b)=>b.length-a.length),old=[...(previous?.consonants||[])].sort((a,b)=>b.length-a.length);let result='';for(let k=0;k<c.length;){const allowed=tokens.find(token=>c.startsWith(token,k));if(allowed){result+=allowed;k+=allowed.length;}else{const removed=old.find(token=>c.startsWith(token,k))||c[k];result+=nearestSound(removed,p.consonants);k+=removed.length;}}return result;}))];
 p.suffixes=inventory(p.suffixes,[p.vowels[0]]).map(adapt);p.clusters=cluster(p.clusters);if(Array.isArray(p.codas))p.codas=cluster(p.codas);
 for(const key of ['placeSuffixes','nationSuffixes','familyPrefixes'])if(Array.isArray(p[key]))p[key]=[...new Set(inventory(p[key],[]).map(adapt))];
 if(language.lexicon)for(const [meaning,word]of Object.entries(language.lexicon))language.lexicon[meaning]=adapt(word);p.roots=language.lexicon?Object.values(language.lexicon):inventory(p.roots,[p.consonants[0]+p.vowels[0]]).map(adapt);p.prefixes=(Array.isArray(p.prefixes)?p.prefixes:[]).map(adapt);
 if(typeof p.glue==='string')p.glue=p.glue?adapt(p.glue):'';
 if(p.weights&&typeof p.weights==='object'){const keep={};for(const g of [...p.consonants,...p.vowels])if(Number.isFinite(p.weights[g])&&p.weights[g]>0)keep[g]=+p.weights[g];p.weights=keep;}
 if(p.harmony){const valid=Array.isArray(p.harmony.back)&&Array.isArray(p.harmony.front)&&p.harmony.back.length===p.harmony.front.length&&[...p.harmony.back,...p.harmony.front].every(v=>p.vowels.includes(v));if(!valid)delete p.harmony;}
 language.personal||={};for(const key of ['patronymic','familySuffix','demonymSuffix','familyPrefix'])if(language.personal[key])language.personal[key]=adapt(language.personal[key]);language.personal.familySuffix||=p.suffixes[0];language.personal.demonymSuffix||=p.suffixes.at(-1);if(language.name&&!language.manual?.name)language.name=titleCase(adapt(language.name));
 p.minSyllables=Math.max(1,Math.min(6,Math.round(+p.minSyllables||2)));p.maxSyllables=Math.max(p.minSyllables,Math.min(8,Math.round(+p.maxSyllables||3)));p.inventorySnapshot={consonants:[...p.consonants],vowels:[...p.vowels]};return language;
}

/** One syllable from a weighted pattern, onset clusters and codas. */
function syllable(p,r,pattern){
 const lead=/^C*/.exec(pattern)[0].length,trail=/C*$/.exec(pattern)[0].length,nuclei=pattern.length-lead-trail;let s='';
 if(lead>=2&&p.clusters?.length)s+=pick(r,p.clusters);else for(let k=0;k<Math.min(lead,2);k++)s+=pickWeighted(r,p.consonants,p);
 for(let k=0;k<Math.max(1,nuclei);k++){let v=pickWeighted(r,p.vowels,p);if(k&&s.endsWith(v))v=pickWeighted(r,p.vowels,p);s+=v;}
 if(trail)s+=Array.isArray(p.codas)?(p.codas.length?pick(r,p.codas):''):pickWeighted(r,p.consonants,p);
 return s;
}
function harmonize(word,p){
 const h=p.harmony;if(!h)return word;const tokens=tokenize(word,[...p.consonants,...p.vowels]);let side=null;
 return tokens.map(t=>{const b=h.back.indexOf(t),f=h.front.indexOf(t);if(b<0&&f<0)return t;if(side===null){side=b>=0?'back':'front';return t;}return side==='back'?(b>=0?t:h.back[f]):(f>=0?t:h.front[b]);}).join('');
}
function syllables(p,r,count=2){
 let s='';for(let j=0;j<count;j++){let next=syllable(p,r,pick(r,p.patterns));
  // Avoid doubled consonants across a boundary unless the language geminates.
  if(!p.geminate&&s&&next&&s.at(-1)===next[0]&&!/[aeiouy]/i.test(next[0]))next=next.slice(1)||next;s+=next;}
 return clean(harmonize(s,p));
}

/** Build one language. Family languages draw an archetype; dialects inherit and drift. */
export function createLanguage(seed,familyId=1,id=1,parent,options={}){
 const accents=options.accents!==false,r=seededRandom(seed,`language:${id}`);
 if(parent?.phonology)return createDialect(seed,familyId,id,parent,r,accents);
 const order=shuffled(ARCHETYPES,seededRandom(seed,'archetype-order')),index=(familyId-1)%order.length,lap=Math.floor((familyId-1)/order.length);
 // Families beyond the archetype list, and a minority before it, blend two traditions.
 let base=order[index],second=null;if(lap>0||r()<.16)second=pick(r,ARCHETYPES.filter(a=>a!==base));
 const p=buildPhonology(base,second,r,accents),lexicon={};
 for(const meaning of SEMANTIC_ROOTS){let word=syllables(p,r,r()<.62?1:2);if(word.length<2)word+=pickWeighted(r,p.consonants,p);lexicon[meaning]=word;}
 p.roots=Object.values(lexicon);p.prefixes=[lexicon.new,lexicon.high,lexicon.sacred];
 const language={id,family:familyId,name:'',phonology:p,lexicon,dialectOf:null,soundChanges:[],personal:personalConventions(base,p,r),manual:{}};
 language.name=titleCase(syllables(p,r,Math.max(1,p.minSyllables))+(p.suffixes.length?pick(r,p.suffixes):''));return normalizeLanguagePhonology(language);
}
function shuffled(list,r){const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function buildPhonology(base,second,r,accents){
 const weights={},jitter=()=>.6+r()*.9;
 // Keep the character of the archetype, drop a few rarer sounds, vary frequencies.
 const consonantSource=second&&r()<.5?mergeWeighted(base.consonants,second.consonants,r):base.consonants,vowelSource=second&&r()<.5?second.vowels:base.vowels;
 const consonants=consonantSource.filter(([g,w])=>w>=2||r()<.75).map(([g,w])=>{weights[g]=(weights[g]||0)+w*jitter();return g;});
 const vowels=vowelSource.filter(([g,w])=>w>=2||r()<.8).map(([g,w])=>{weights[g]=(weights[g]||0)+w*jitter();return g;});
 if(consonants.length<6)for(const [g,w]of base.consonants)if(!consonants.includes(g)){consonants.push(g);weights[g]=w;if(consonants.length>=6)break;}
 if(vowels.length<3)for(const [g,w]of base.vowels)if(!vowels.includes(g)){vowels.push(g);weights[g]=w;}
 const onsets=[...(base.onsets||[]),...(second?.onsets||[]).filter(()=>r()<.4)].filter(c=>consonantCluster(c,consonants)&&r()<.85);
 const codaSource=second&&r()<.4?second.codas:base.codas,codas=codaSource.length?codaSource.filter(c=>consonantCluster(c,consonants)):[];
 const patterns=(second&&r()<.35?second.patterns:base.patterns).filter(x=>codas.length||!/VC+$/.test(x)||!base.codas.length).slice();
 const p={archetype:second?`${base.id}+${second.id}`:base.id,style:second?`${base.label} × ${second.label}`:base.label,consonants:[...new Set(consonants)],vowels:[...new Set(vowels)],clusters:[...new Set(onsets)],codas:base.codas.length||second?.codas.length?[...new Set(codas)]:[],patterns:patterns.length?patterns:['CV','CVC'],
  suffixes:sample(r,[...base.suffixes,...(second?.suffixes||[])],5),placeSuffixes:sample(r,[...base.places,...(second?.places||[]).slice(0,2)],5),nationSuffixes:sample(r,[...base.nationSuffixes,...(second?.nationSuffixes||[])],2),familyPrefixes:sample(r,base.prefixes,2),
  glue:base.glue||'',weights,minSyllables:base.range[0],maxSyllables:base.range[1],geminate:!!base.geminate,prefixing:!!base.prefixing,
  rule:'Weighted sounds, onset clusters and permitted codas shape every word; related dialects share roots and regular sound changes.'};
 if(!p.suffixes.length)p.suffixes=[pickWeighted(r,p.vowels,p)+(codas.length?pick(r,codas):'')];
 // Vowel harmony keeps every word on one side of the vowel space.
 if(base.harmony){p.harmony=accents?{back:['a','o','u','ı'],front:['e','ö','ü','i']}:{back:['a','o','u'],front:['e','e','i']};for(const v of [...p.harmony.back,...p.harmony.front])if(!p.vowels.includes(v)){p.vowels.push(v);weights[v]=1.2;}}
 if(accents)adoptMarks(p,[...base.marks,...(second?.marks||[])],accents&&(base.rate||second?.rate)?Math.max(base.rate,second?.rate||0):0,r);
 return p;
}
function mergeWeighted(a,b,r){const map=new Map(a);for(const [g,w]of b)if(r()<.45)map.set(g,(map.get(g)||0)+w*.8);return [...map];}
function sample(r,list,count){const out=[];for(const x of shuffled([...new Set(list)],r))if(out.length<count)out.push(x);return out;}
/** A language adopts a few accented letters as a consistent orthographic habit. */
function adoptMarks(p,marks,rate,r){
 if(!rate||!marks.length||r()>.85)return;const usable=marks.filter(([a])=>p.consonants.includes(a)||p.vowels.includes(a)),chosen=sample(r,usable,1+Math.floor(r()*Math.min(3,usable.length)));
 for(const [base,marked]of chosen){const list=p.vowels.includes(base)?p.vowels:p.consonants;if(list.includes(marked))continue;const share=Math.min(.55,rate*(1+r()*1.1)),w=weightOf(p,base);list.push(marked);p.weights[marked]=w*share;p.weights[base]=w*(1-share);}
}
function personalConventions(base,p,r){
 const familySuffix=base.familySuffixes.length&&r()<.85?pick(r,base.familySuffixes):pick(r,p.suffixes);
 return {familyFirst:r()<(base.familyFirst??.15)+.05,patronymic:pick(r,base.familySuffixes.length?base.familySuffixes:['an','in','son','ar','es']),familySuffix,demonymSuffix:pick(r,p.suffixes),familyPrefix:p.familyPrefixes?.length&&r()<.6?pick(r,p.familyPrefixes):''};
}

/* Regular sound changes. Each rule maps graphemes across the whole language. */
const CONSONANT_SHIFTS=[['p','f','lenition'],['b','v','lenition'],['t','th','lenition'],['k','kh','lenition'],['k','h','lenition'],['g','gh','lenition'],['d','z','lenition'],['k','ch','palatalization'],['g','j','palatalization'],['s','sh','palatalization'],['t','ts','affrication'],['z','zh','palatalization'],['b','p','devoicing'],['d','t','devoicing'],['g','k','devoicing'],['v','f','devoicing'],['w','v','fortition'],['v','b','fortition'],['h','k','fortition'],['r','l','liquid shift'],['l','r','liquid shift'],['th','t','stopping'],['sh','s','depalatalization'],['kh','h','weakening'],['ch','sh','spirantization'],['ts','s','deaffrication']];
const VOWEL_SHIFTS=[['a','o'],['o','u'],['e','i'],['i','e'],['u','o'],['e','a'],['ai','e'],['au','o'],['ou','u']];
const ACCENTED_VOWEL_SHIFTS=[['a','ä'],['o','ö'],['u','ü'],['e','é'],['a','å']];
function createDialect(seed,familyId,id,parent,r,accents){
 const pp=parent.phonology,p=structuredClone({...pp,inventorySnapshot:undefined});p.weights={...(pp.weights||{})};
 if(!accents){for(const list of [p.consonants,p.vowels])for(let k=list.length-1;k>=0;k--)if(plain(list[k])!==list[k]){const flat=plain(list[k]);if(!list.includes(flat))list[k]=flat;else list.splice(k,1);}}
 const shifts=[],has=g=>p.consonants.includes(g)||p.vowels.includes(g),count=2+Math.floor(r()*3);
 const replace=(from,to,reason)=>{const list=p.vowels.includes(from)?p.vowels:p.consonants;if(!list.includes(from))return false;const w=weightOf(p,from);if(list.includes(to)){list.splice(list.indexOf(from),1);p.weights[to]=(p.weights[to]??1)+w;}else{list[list.indexOf(from)]=to;p.weights[to]=w;}delete p.weights[from];shifts.push({from,to,reason});return true;};
 for(let k=0,guard=0;k<count&&guard<30;guard++){
  const roll=r();
  if(roll<.5){const options=CONSONANT_SHIFTS.filter(([a,b])=>has(a)&&!shifts.some(s=>s.from===a||s.to===a));if(options.length){const [a,b,why]=pick(r,options);if(replace(a,b,why))k++;}}
  else if(roll<.78){const options=VOWEL_SHIFTS.filter(([a])=>has(a)&&p.vowels.length>2&&!shifts.some(s=>s.from===a||s.to===a));if(options.length){const [a,b]=pick(r,options);if(replace(a,b,'vowel shift'))k++;}
   // Accented vowels arrive as a partial spelling habit, never a wholesale replacement.
   if(accents&&r()<.18){const [a,b]=pick(r,ACCENTED_VOWEL_SHIFTS);if(has(a)&&!has(b)){const w=weightOf(p,a),share=.18+r()*.14;p.vowels.push(b);p.weights[b]=w*share;p.weights[a]=w*(1-share);shifts.push({from:a,to:b,reason:'partial fronting'});}}}
  else if(roll<.86&&p.clusters.length>1){p.clusters=p.clusters.filter(()=>r()<.4);shifts.push({from:'clusters',to:'simplified',reason:'cluster reduction'});k++;}
  else if(roll<.93&&p.codas?.length>1){p.codas=p.codas.slice(0,1+Math.floor(r()*2));shifts.push({from:'codas',to:'reduced',reason:'final consonant loss'});k++;}
  else{const n=p.suffixes.length;if(n){p.suffixes=p.suffixes.map(s=>r()<.5?syllable(p,r,pick(r,['CV','VC','V','CVC'])):s);shifts.push({from:'endings',to:'renewed',reason:'new endings'});k++;}}
 }
 if(p.vowels.length>4&&r()<.35){const removed=p.vowels.splice(Math.floor(r()*p.vowels.length),1)[0],replacement=nearestSound(removed,p.vowels,true);if(p.harmony&&([...p.harmony.back,...p.harmony.front].includes(removed)))p.vowels.push(removed);else{shifts.push({from:removed,to:replacement,reason:'vowel merger'});p.weights[replacement]=weightOf(p,replacement)+weightOf(p,removed);delete p.weights[removed];}}
 const oldTokens=[...pp.consonants,...pp.vowels],map=new Map(shifts.filter(s=>oldTokens.includes(s.from)&&s.reason!=='partial fronting').map(s=>[s.from,s.to]));
 const apply=word=>tokenize(latin(word),oldTokens).map(t=>map.get(t)??t).join('');
 if(p.harmony){const hv=[...p.harmony.back,...p.harmony.front];for(const v of hv)if(!p.vowels.includes(v))p.vowels.push(v);}
 for(const key of ['clusters','codas','suffixes','placeSuffixes','nationSuffixes','familyPrefixes'])if(Array.isArray(p[key]))p[key]=[...new Set(p[key].map(apply))];
 p.patterns=[...p.patterns,pick(r,p.patterns)];p.glue=p.glue?apply(p.glue):'';
 const lexicon={};for(const meaning of SEMANTIC_ROOTS){const inherited=parent.lexicon?.[meaning];lexicon[meaning]=inherited&&r()<.86?apply(inherited):syllables(p,r,r()<.68?1:2);if(lexicon[meaning].length<2)lexicon[meaning]+=pickWeighted(r,p.consonants,p);}
 p.roots=Object.values(lexicon);p.prefixes=[lexicon.new,lexicon.high,lexicon.sacred];
 const personal={...parent.personal};for(const key of ['patronymic','familySuffix','demonymSuffix','familyPrefix'])if(personal[key])personal[key]=apply(personal[key]);if(r()<.4)personal.demonymSuffix=pick(r,p.suffixes);
 const language={id,family:familyId,name:'',phonology:p,lexicon,dialectOf:parent.id||null,soundChanges:shifts.map(s=>({from:s.from,to:s.to,reason:s.reason})),personal,manual:{}};
 language.name=titleCase(syllables(p,r,Math.max(1,p.minSyllables))+(p.suffixes.length?pick(r,p.suffixes):''));return normalizeLanguagePhonology(language);
}

/** Semantic compounds are common enough that the language becomes readable across a map. */
export function generateToponym(language,seed,key='',context={}){
 const lang=language?.phonology?language:createLanguage('fallback'),p=lang.phonology,r=seededRandom(seed,`toponym:${key}`),lex=lang.lexicon||Object.fromEntries(SEMANTIC_ROOTS.map((meaning,i)=>[meaning,p.roots[i%p.roots.length]]));
 const features=(context.features||[]).filter(x=>lex[x]),feature=features.length?pick(r,features):pick(r,['river','hill','forest','valley','plain','water','island']),head=pick(r,context.kind==='province'?['valley','plain','forest','hill','island','lake','river','mountain']:['town','fort','ford','market','harbor','bridge']);
 const modifier=r()<.24?pick(r,['new','old','great','white','red','sacred']):feature,meanings=modifier===head?[modifier,'town']:[modifier,head],roots=meanings.map(meaning=>({meaning,root:lex[meaning]}));
 const places=p.placeSuffixes?.length?p.placeSuffixes:p.suffixes;let name,semantic=r()<.86;
 if(semantic){const ordered=lang.personal?.familyFirst?[...roots].reverse():roots,glue=p.glue&&r()<.35?p.glue:r()<.12?pickWeighted(r,p.vowels,p):'';name=ordered.map(x=>x.root).join(glue);if(name.length>11&&r()<.65){name=ordered[0].root+(places.length?pick(r,places):'');}else if(r()<.3)name+=pick(r,places);}
 else{const stem=syllables(p,r,Math.max(1,p.minSyllables));name=stem+(places.length?pick(r,places):'');roots.length=0;roots.push({meaning:'traditional name',root:stem});}
 name=titleCase(clean(name).slice(0,23));if(name.length<3)name+=titleCase(lex.town);
 return {name,meaning:semantic?meanings.map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(' '):'Traditional place-name',roots,language:lang.id,semantic};
}
export function generateName(language,seed,key='',kind='city'){
 if(kind==='city'||kind==='province')return generateToponym(language,seed,key,{kind}).name;const lang=language?.phonology?language:createLanguage('fallback'),p=lang.phonology,r=seededRandom(seed,`name:${key}:${kind}`);
 const range=kind==='person'?[Math.max(1,p.minSyllables-(p.minSyllables>2?1:0)),Math.max(1,Math.min(p.maxSyllables,3))]:[p.minSyllables,p.maxSyllables];
 let s=(p.prefixing&&kind!=='person'&&r()<.4&&p.familyPrefixes?.length?pick(r,p.familyPrefixes):'')+syllables(p,r,range[0]+Math.floor(r()*(range[1]-range[0]+1)));
 if(kind==='nation'&&p.nationSuffixes?.length&&r()<.45)s+=pick(r,p.nationSuffixes);
 else if(['nation','language','culture'].includes(kind)&&r()<.62)s+=pick(r,p.suffixes);
 if(s.length<3)s+=pick(r,p.roots);return titleCase(clean(s).slice(0,kind==='person'?14:22)||'Aren');
}
export function generatePersonName(language,seed,key=''){
 const r=seededRandom(seed,`person:${key}`),first=generateName(language,seed,`${key}:given`,'person');let last=generateName(language,seed,`${key}:family`,'person');
 const personal=language?.personal||{};
 if(personal.familySuffix&&r()<.55&&last.length<11)last=titleCase(clean(last.toLowerCase()+personal.familySuffix));
 else if(personal.familyPrefix&&r()<.5)last=titleCase(personal.familyPrefix)+last;
 return personal.familyFirst?`${last} ${first}`:`${first} ${last}`;
}

export function generateDemonym(language,seed,key='',placeName=''){
 const lang=normalizeLanguagePhonology(language?.phonology?language:createLanguage('fallback')),r=seededRandom(seed,`demonym:${key}`),p=lang.phonology,base=latin(placeName||generateName(lang,seed,key,'nation')),stem=legalWord(base,p,p.inventorySnapshot),suffix=lang.personal.demonymSuffix||pick(r,p.suffixes),link=stem.endsWith(suffix)?pick(r,p.vowels):'';return titleCase(stem.slice(0,Math.max(2,28-suffix.length-link.length))+link+suffix);
}
