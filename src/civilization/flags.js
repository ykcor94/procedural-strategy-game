import {seededRandom} from '../core/random.js';
const COLORS=['#243954','#e6cd88','#a64846','#eeeadd','#377766','#42618b','#76536f','#c58c43','#354d3b','#8eb3ae','#2f303e','#d8b6a1'];
export const FLAG_STYLES=Object.freeze(['horizontal','vertical','cross','nordic','diagonal','saltire','quartered','chevron','sunburst','bicolor','canton','bordered','pall','lozenge','triband-disc','rising-sun','double-chevron','hoist-band']);
const luminance=c=>{const a=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255).map(x=>x<=.04?x/12.92:((x+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];};
export function generateFlag(seed){
 const r=seededRandom(seed,'flag'),pick=a=>a[Math.floor(r()*a.length)],colors=[...COLORS];for(let i=colors.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[colors[i],colors[j]]=[colors[j],colors[i]];}
 // Adjacent fields have distinct tonal values, and emblems occupy one deliberate field or canton.
 if(Math.abs(luminance(colors[0])-luminance(colors[1]))<.13){const j=colors.findIndex(c=>Math.abs(luminance(c)-luminance(colors[0]))>.2);if(j>0)[colors[1],colors[j]]=[colors[j],colors[1]];}
 const style=pick(FLAG_STYLES),flag={version:2,style,colors:colors.slice(0,4),emblem:pick(['none','star','sun','diamond','crescent','disc','mountain','three-stars','wreath','tower','flower']),stripes:pick([2,3,3,5]),seed:String(seed)};flag.emblemPosition=['quartered','canton','diagonal','saltire','sunburst','rising-sun'].includes(style)?'canton':style==='chevron'||style==='double-chevron'?'hoist':'center';if(['cross','nordic','pall'].includes(style)&&r()<.6)flag.emblem='none';return flag;
}
export function flagEmblemZone(flag){const s=flag.style,k=[2,3,5].includes(flag.stripes)?flag.stripes:3;if(s==='quartered'||s==='canton')return {x:45,y:27,r:16,field:s==='canton'?2:0};if(s==='diagonal')return {x:135,y:24,r:15,field:1};if(s==='saltire')return {x:30,y:54,r:14,field:0};if(s==='sunburst'||s==='rising-sun')return {x:90,y:54,r:14,field:2};if(s==='double-chevron')return {x:34,y:54,r:9,field:3};if(s==='chevron')return {x:27,y:54,r:14,field:2};if(s==='nordic'||s==='cross')return {x:s==='nordic'?55:63,y:54,r:10,field:2};if(s==='vertical')return {x:k===2?45:90,y:54,r:Math.min(20,78/k),field:k===2?0:k===3?1:2};if(s==='horizontal')return {x:90,y:k===2?27:54,r:Math.min(18,43/k),field:k===2?0:k===3?1:2};if(s==='hoist-band')return {x:111,y:27,r:18,field:0};if(s==='bicolor')return {x:90,y:27,r:18,field:0};if(s==='pall')return {x:120,y:54,r:11,field:1};return {x:90,y:54,r:18,field:s==='bordered'||s==='triband-disc'?2:s==='lozenge'?1:0};}
export function flagSVG(flag,width=180,height=108){
 if(!flag)return '';const safe=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:'#243954',[a,b,c,d]=[0,1,2,3].map(i=>safe(flag.colors?.[i])),s=FLAG_STYLES.includes(flag.style)?flag.style:'horizontal';let parts=`<rect width="180" height="108" fill="${a}"/>`;
 if(s==='horizontal'||s==='vertical'){const k=[2,3,5].includes(flag.stripes)?flag.stripes:3;for(let i=0;i<k;i++)parts+=s==='horizontal'?`<rect y="${i*108/k}" width="180" height="${108/k+.1}" fill="${[a,b,c,b,a][i]}"/>`:`<rect x="${i*180/k}" width="${180/k+.1}" height="108" fill="${[a,b,c,b,a][i]}"/>`;}
 else if(s==='cross'||s==='nordic'){const x=s==='nordic'?55:63;parts+=`<path d="M0 54H180M${x} 0V108" stroke="${b}" stroke-width="29"/><path d="M0 54H180M${x} 0V108" stroke="${c}" stroke-width="16"/>`;}
 else if(s==='diagonal')parts+=`<path d="M0 0H180V108Z" fill="${b}"/><path d="M-10-6L190 114" stroke="${c}" stroke-width="15"/>`;
 else if(s==='saltire')parts+=`<path d="M0 0L180 108M180 0L0 108" stroke="${b}" stroke-width="23"/><path d="M0 0L180 108M180 0L0 108" stroke="${c}" stroke-width="9"/>`;
 else if(s==='quartered')parts+=`<path d="M90 0H180V54H90ZM0 54H90V108H0Z" fill="${b}"/>`;
 else if(s==='chevron'||s==='double-chevron'){parts+=`<rect y="36" width="180" height="36" fill="${b}"/><path d="M0 0L78 54L0 108Z" fill="${c}"/>`;if(s==='double-chevron')parts+=`<path d="M0 0L50 54L0 108L18 54Z" fill="${d}"/>`;}
 else if(s==='sunburst'||s==='rising-sun'){for(let k=0;k<8;k++){const t=k*Math.PI/4;parts+=`<path d="M90 54L${90+210*Math.cos(t)} ${54+210*Math.sin(t)}L${90+210*Math.cos(t+.24)} ${54+210*Math.sin(t+.24)}Z" fill="${b}"/>`;}parts+=`<circle cx="90" cy="54" r="23" fill="${c}"/>`;}
 else if(s==='canton')parts+=`<rect y="36" width="180" height="36" fill="${b}"/><rect width="90" height="54" fill="${c}"/>`;
 else if(s==='bordered')parts+=`<rect x="10" y="10" width="160" height="88" fill="${b}"/><rect x="17" y="17" width="146" height="74" fill="${c}"/>`;
 else if(s==='pall')parts+=`<path d="M0 0L72 54L0 108" fill="none" stroke="${b}" stroke-width="29"/><path d="M70 54H180" stroke="${b}" stroke-width="29"/>`;
 else if(s==='lozenge')parts+=`<path d="M90 9L166 54L90 99L14 54Z" fill="${b}"/>`;
 else if(s==='triband-disc')parts+=`<rect y="36" width="180" height="36" fill="${b}"/><circle cx="90" cy="54" r="27" fill="${c}"/>`;
 else if(s==='hoist-band')parts+=`<rect y="54" width="180" height="54" fill="${b}"/><rect width="43" height="108" fill="${c}"/>`;
 else parts+=`<rect y="54" width="180" height="54" fill="${b}"/>`;
 const zone=flagEmblemZone({...flag,style:s}),{x,y,r}=zone,background=[a,b,c,d][zone.field],ec=Math.abs(luminance(d)-luminance(background))>.15?d:(luminance(background)>.4?'#243954':'#eeeadd');
 // Old flags are repaired at render time too: a quartered emblem never straddles four fields.
 if(flag.emblem&&flag.emblem!=='none'){
 const star=(xx,yy,rr)=>{let pts='';for(let j=0;j<10;j++){const q=-Math.PI/2+j*Math.PI/5,z=j%2?rr*.43:rr;pts+=`${xx+Math.cos(q)*z},${yy+Math.sin(q)*z} `;}return `<polygon points="${pts}" fill="${ec}"/>`;};
 if(flag.emblem==='star')parts+=star(x,y,r);else if(flag.emblem==='three-stars')parts+=star(x-r*.62,y+r*.26,r*.4)+star(x,y-r*.4,r*.4)+star(x+r*.62,y+r*.26,r*.4);
 else if(flag.emblem==='sun'){for(let j=0;j<12;j++){const t=j*Math.PI/6;parts+=`<path d="M${x+Math.cos(t)*r*.63} ${y+Math.sin(t)*r*.63}L${x+Math.cos(t)*r} ${y+Math.sin(t)*r}" stroke="${ec}" stroke-width="2"/>`;}parts+=`<circle cx="${x}" cy="${y}" r="${r*.48}" fill="${ec}"/>`;}
 else if(flag.emblem==='diamond')parts+=`<path d="M${x} ${y-r}L${x+r*.85} ${y}L${x} ${y+r}L${x-r*.85} ${y}Z" fill="${ec}"/>`;
 else if(flag.emblem==='crescent')parts+=`<path d="M${x+r*.4} ${y-r}A${r} ${r} 0 1 0 ${x+r*.4} ${y+r}A${r*.88} ${r*.88} 0 0 1 ${x+r*.4} ${y-r}Z" fill="${ec}"/>`;
 else if(flag.emblem==='mountain')parts+=`<path d="M${x-r} ${y+r*.7}L${x-r*.25} ${y-r}L${x+r*.12} ${y}L${x+r*.55} ${y-r*.7}L${x+r} ${y+r*.7}Z" fill="${ec}"/>`;
 else if(flag.emblem==='wreath')parts+=`<path d="M${x-r*.7} ${y-r*.7}A${r} ${r} 0 1 0 ${x+r*.7} ${y-r*.7}" fill="none" stroke="${ec}" stroke-width="${r*.3}"/>`;
 else if(flag.emblem==='tower')parts+=`<path d="M${x-r*.65} ${y+r}V${y-r}H${x-r*.3}V${y-r*.6}H${x+r*.3}V${y-r}H${x+r*.65}V${y+r}Z" fill="${ec}"/>`;
 else if(flag.emblem==='flower'){for(let k=0;k<6;k++){const t=k*Math.PI/3;parts+=`<circle cx="${x+Math.cos(t)*r*.5}" cy="${y+Math.sin(t)*r*.5}" r="${r*.43}" fill="${ec}"/>`;}parts+=`<circle cx="${x}" cy="${y}" r="${r*.25}" fill="${a}"/>`;}
 else parts+=`<circle cx="${x}" cy="${y}" r="${r*.86}" fill="${ec}"/>`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1,Number(width)||180)}" height="${Math.max(1,Number(height)||108)}" viewBox="0 0 180 108" role="img" aria-label="National flag">${parts}</svg>`;
}
