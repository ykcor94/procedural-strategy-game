/** One floating tooltip for the whole app: any element with `data-tip` (text) or `data-tip-html` (markup
 * produced by our own renderers) shows it on hover or keyboard focus, kept inside the viewport. */
export function installTooltip(){
  if(document.getElementById('rich-tip'))return;
  const tip=document.createElement('div');tip.id='rich-tip';tip.className='rich-tip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
  let target=null;
  const place=(x,y)=>{const r=tip.getBoundingClientRect(),pad=10;let left=x+14,top=y+16;if(left+r.width>innerWidth-pad)left=x-r.width-14;if(top+r.height>innerHeight-pad)top=y-r.height-12;tip.style.left=`${Math.max(pad,left)}px`;tip.style.top=`${Math.max(pad,top)}px`;};
  const show=(el,x,y)=>{const html=el.getAttribute('data-tip-html'),text=el.getAttribute('data-tip');if(!html&&!text){hide();return;}target=el;if(html)tip.innerHTML=html;else tip.textContent=text;tip.hidden=false;place(x,y);};
  const hide=()=>{target=null;tip.hidden=true;};
  document.addEventListener('pointermove',e=>{const el=e.target.closest?.('[data-tip],[data-tip-html]');if(!el){if(target)hide();return;}if(el!==target)show(el,e.clientX,e.clientY);else place(e.clientX,e.clientY);},{passive:true});
  document.addEventListener('pointerdown',hide,{passive:true});document.addEventListener('scroll',hide,{passive:true,capture:true});
  document.addEventListener('focusin',e=>{const el=e.target.closest?.('[data-tip],[data-tip-html]');if(el){const r=el.getBoundingClientRect();show(el,r.left,r.bottom);}});
  document.addEventListener('focusout',hide);
}
