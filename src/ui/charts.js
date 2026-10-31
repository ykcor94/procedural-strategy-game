import {escapeHTML as esc} from './controls.js';
/** Dependency-free SVG/HTML charts for the in-game panels. Every mark carries `data-tip` (plain text) or
 * `data-tip-html` (trusted markup built here) for the shared hover tooltip in ui/tooltip.js. Colours come
 * from callers or theme tokens. */
const f1=v=>Number.isFinite(v)?v.toFixed(1):'0';
const attrTip=(tip,html=false)=>tip?` ${html?'data-tip-html':'data-tip'}="${esc(tip)}"`:'';

/** Multi-series line chart with hover columns. series: [{label,color,values,format?}], labels: x labels. */
export function lineChart(series,{labels=[],width=320,height=110,format=v=>String(v),zero=false,area=false,className='',band=null}={}){
  const all=series.flatMap(s=>s.values.filter(Number.isFinite)).concat(band?band.flatMap(b=>[b.lo,b.hi]):[]);if(all.length<2)return `<div class="chart-empty">Not enough history yet</div>`;
  let lo=Math.min(...all),hi=Math.max(...all);if(zero)lo=Math.min(0,lo);if(hi===lo){hi+=1;lo-=1;}const pad=(hi-lo)*.08;lo-=zero&&lo===0?0:pad;hi+=pad;
  const n=Math.max(...series.map(s=>s.values.length)),L=34,R=6,T=8,B=16,W=width-L-R,H=height-T-B,x=i=>L+(n<=1?0:i/(n-1)*W),y=v=>T+H-(v-lo)/(hi-lo)*H;
  let svg=`<svg class="chart line-chart ${className}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(series.map(s=>s.label).join(', '))}">`;
  for(let k=0;k<=3;k++){const v=lo+(hi-lo)*k/3,yy=y(v);svg+=`<line class="grid" x1="${L}" x2="${width-R}" y1="${f1(yy)}" y2="${f1(yy)}"/><text class="axis" x="${L-4}" y="${f1(yy+3)}" text-anchor="end">${esc(format(v))}</text>`;}
  if(band){svg+=`<path class="band" d="M${band.map((b,i)=>`${f1(x(i))},${f1(y(b.hi))}`).join('L')}L${band.map((b,i)=>`${f1(x(i))},${f1(y(b.lo))}`).reverse().join('L')}Z"/>`;}
  for(const s of series){const pts=s.values.map((v,i)=>Number.isFinite(v)?`${f1(x(i))},${f1(y(v))}`:null).filter(Boolean);if(pts.length<2)continue;
    if(area)svg+=`<path class="area" style="fill:${s.color}" d="M${f1(x(0))},${f1(y(Math.max(lo,0)))}L${pts.join('L')}L${f1(x(s.values.length-1))},${f1(y(Math.max(lo,0)))}Z"/>`;
    svg+=`<polyline class="series${s.dashed?' dashed':''}" style="stroke:${s.color}" points="${pts.join(' ')}"/>`;}
  if(labels.length){const step=Math.max(1,Math.ceil(labels.length/5));labels.forEach((l,i)=>{if(i%step===0||i===labels.length-1)svg+=`<text class="axis" x="${f1(x(i))}" y="${height-3}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}">${esc(l)}</text>`;});}
  const colW=W/Math.max(1,n-1);for(let i=0;i<n;i++){const tip=`<b>${esc(labels[i]??'')}</b>${series.map(s=>`<div><i style="background:${s.color}"></i>${esc(s.label)} <strong>${esc((s.format||format)(s.values[i]))}</strong></div>`).join('')}${band?.[i]?`<div class="dim">range ${esc(format(band[i].lo))} – ${esc(format(band[i].hi))}</div>`:''}`;svg+=`<rect class="hover" x="${f1(x(i)-colW/2)}" y="${T}" width="${f1(colW)}" height="${H}"${attrTip(tip,true)}/>`;}
  return svg+'</svg>';
}
/** Donut with hoverable slices. parts: [{label,value,color,act?,data?}] */
export function donut(parts,{size=118,thickness=18,center='',sub='',className=''}={}){
  const total=parts.reduce((s,p)=>s+Math.max(0,p.value),0)||1,r=size/2-thickness/2,c=size/2;let a=-Math.PI/2,svg=`<svg class="chart donut ${className}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(parts.map(p=>`${p.label} ${Math.round(p.value/total*100)}%`).join(', '))}">`;
  for(const p of parts){const frac=Math.max(0,p.value)/total;if(frac<=0)continue;const b=a+frac*Math.PI*2-(frac<1?.002:0),large=frac>.5?1:0,path=frac>=.999?`M${c},${c-r}A${r},${r} 0 1 1 ${c-.01},${c-r}`:`M${f1(c+r*Math.cos(a))},${f1(c+r*Math.sin(a))}A${r},${r} 0 ${large} 1 ${f1(c+r*Math.cos(b))},${f1(c+r*Math.sin(b))}`;
    svg+=`<path class="slice" d="${path}" style="stroke:${p.color};stroke-width:${thickness}"${p.act?` data-act="${p.act}"${Object.entries(p.data||{}).map(([k,v])=>` data-${k}="${esc(v)}"`).join('')}`:''}${attrTip(`${p.label} · ${(frac*100).toFixed(1)}%${p.extra?` · ${p.extra}`:''}`)}/>`;a+=frac*Math.PI*2;}
  return svg+`${center?`<text class="donut-center" x="${c}" y="${c+(sub?-1:4)}" text-anchor="middle">${esc(center)}</text>`:''}${sub?`<text class="donut-sub" x="${c}" y="${c+13}" text-anchor="middle">${esc(sub)}</text>`:''}</svg>`;
}
/** Squarified treemap of HTML cells. items: [{label,value,color,act,data,tip,icon}] */
export function treemap(items,{width=100,height=170,className=''}={}){
  const list=items.filter(i=>i.value>0).sort((a,b)=>b.value-a.value),total=list.reduce((s,i)=>s+i.value,0)||1,cells=[];
  const layout=(rows,x,y,w,h)=>{let rest=rows.slice();while(rest.length){const vertical=w>=h,side=vertical?h:w;let row=[],best=Infinity;
      for(const item of rest){const test=[...row,item],s=test.reduce((a,i)=>a+i.area,0),worst=Math.max(...test.map(i=>Math.max(side*side*i.area/(s*s),s*s/(side*side*i.area))));if(worst>best)break;best=worst;row=test;}
      const s=row.reduce((a,i)=>a+i.area,0),thick=s/side;let o=0;for(const i of row){const len=i.area/thick;cells.push(vertical?{i,x,y:y+o,w:thick,h:len}:{i,x:x+o,y,w:len,h:thick});o+=len;}
      if(vertical){x+=thick;w-=thick;}else{y+=thick;h-=thick;}rest=rest.slice(row.length);}};
  layout(list.map(i=>({...i,area:i.value/total*width*height})),0,0,width,height);
  return `<div class="treemap ${className}" style="height:${height}px">${cells.map(({i,x,y,w,h})=>`<button class="tm-cell" style="left:${(x/width*100).toFixed(3)}%;top:${(y/height*100).toFixed(3)}%;width:${(w/width*100).toFixed(3)}%;height:${(h/height*100).toFixed(3)}%;--c:${i.color}"${i.act?` data-act="${i.act}"`:''}${Object.entries(i.data||{}).map(([k,v])=>` data-${k}="${esc(v)}"`).join('')}${attrTip(i.tip||i.label)}>${w/width*100>9&&h>26?`<span>${i.icon||''}<b>${esc(i.label)}</b>${h>44?`<small>${esc(i.sub||'')}</small>`:''}</span>`:''}</button>`).join('')}</div>`;
}
/** Population pyramid from five bands, optionally against a previous census outline. */
export function pyramid(bands,{previous=null,labels=['0–14','15–29','30–44','45–64','65+'],width=520,height=170,format=v=>String(v)}={}){
  const total=bands.reduce((s,v)=>s+v,0)||1,prevTotal=previous?previous.reduce((s,v)=>s+v,0)||1:1,max=Math.max(...bands.map(v=>v/total),...(previous||[]).map(v=>v/prevTotal),.01),rowH=(height-10)/bands.length,mid=width/2,half=width/2-30;
  let svg=`<svg class="chart pyramid" viewBox="0 0 ${width} ${height}" role="img" aria-label="Age structure">`;
  bands.slice().reverse().forEach((v,j)=>{const k=bands.length-1-j,share=v/total,len=share/max*half,y=4+j*rowH;
    svg+=`<rect class="male" x="${f1(mid-24-len)}" y="${f1(y+1)}" width="${f1(len)}" height="${f1(rowH-3)}" rx="2"/><rect class="female" x="${f1(mid+24)}" y="${f1(y+1)}" width="${f1(len)}" height="${f1(rowH-3)}" rx="2"/>`;
    if(previous){const p=previous[k]/prevTotal/max*half;svg+=`<path class="prev" d="M${f1(mid-24-p)},${f1(y+1)}v${f1(rowH-3)}M${f1(mid+24+p)},${f1(y+1)}v${f1(rowH-3)}"/>`;}
    svg+=`<text class="axis" x="${mid}" y="${f1(y+rowH/2+3)}" text-anchor="middle">${esc(labels[k])}</text><rect class="hover" x="0" y="${f1(y)}" width="${width}" height="${f1(rowH)}"${attrTip(`<b>${esc(labels[k])}</b><div>${esc(format(v))} · ${(share*100).toFixed(1)}%</div>${previous?`<div class="dim">last census ${(previous[k]/prevTotal*100).toFixed(1)}%</div>`:''}`,true)}/>`;});
  return svg+'</svg>';
}
/** Horizontal bars with optional icons and values. items: [{label,value,color,icon,valueLabel,tip,act,data}] */
export function bars(items,{max=null,className=''}={}){
  const m=max??Math.max(...items.map(i=>Math.abs(i.value)),1e-9);
  return `<div class="hbars ${className}">${items.map(i=>`<div class="hbar"${i.act?` data-act="${i.act}"`:''}${Object.entries(i.data||{}).map(([k,v])=>` data-${k}="${esc(v)}"`).join('')}${attrTip(i.tip||'')}><span class="hbar-label">${i.icon||''}${esc(i.label)}</span><span class="hbar-track"><b style="width:${Math.min(100,Math.abs(i.value)/m*100).toFixed(1)}%;background:${i.color||'var(--accent)'}"></b></span><strong>${i.valueLabel??''}</strong></div>`).join('')}</div>`;
}
/** Diverging bars around zero (stability terms, deltas). */
export function diverging(items,{max=null}={}){
  const m=max??Math.max(...items.map(i=>Math.abs(i.value)),1e-9);
  return `<div class="dbars">${items.map(i=>`<div class="dbar"${attrTip(i.tip||'')}><span>${i.icon||''}${esc(i.label)}</span><span class="dbar-track"><b class="${i.value>=0?'up':'down'}" style="width:${(Math.abs(i.value)/m*50).toFixed(1)}%;${i.value>=0?'left:50%':'right:50%'}"></b></span><strong class="${i.value>=0?'up':'down'}">${i.valueLabel??''}</strong></div>`).join('')}</div>`;
}
/** Small progress ring with a label inside. */
export function ring(value,{size=38,color='var(--accent)',label='',tip=''}={}){
  const r=size/2-3,c=2*Math.PI*r,v=Math.max(0,Math.min(1,value));
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"${attrTip(tip)}><circle class="ring-track" cx="${size/2}" cy="${size/2}" r="${r}"/><circle class="ring-value" cx="${size/2}" cy="${size/2}" r="${r}" style="stroke:${color};stroke-dasharray:${f1(c*v)} ${f1(c)}"/><text x="${size/2}" y="${size/2+3.5}" text-anchor="middle">${esc(label)}</text></svg>`;
}
/** Semi-circular gauge. bands: [{to,color}] over [min,max]. */
export function gauge(value,{min=0,max=100,bands=[],label='',sub='',width=150}={}){
  const h=width*.74,cx=width/2,cy=width*.52,r=width/2-12,ang=v=>Math.PI*(1-(Math.max(min,Math.min(max,v))-min)/(max-min)),pt=(v,rr=r)=>[cx+rr*Math.cos(ang(v)),cy-rr*Math.sin(ang(v))];
  let svg=`<svg class="chart gauge" viewBox="0 0 ${width} ${h}" role="img" aria-label="${esc(label)} ${esc(String(value))}">`,from=min;
  for(const b of bands){const [x0,y0]=pt(from),[x1,y1]=pt(b.to);svg+=`<path d="M${f1(x0)},${f1(y0)}A${r},${r} 0 0 1 ${f1(x1)},${f1(y1)}" style="stroke:${b.color}" class="gauge-band"/>`;from=b.to;}
  const [nx,ny]=pt(value,r-10);svg+=`<line class="needle" x1="${cx}" y1="${cy}" x2="${f1(nx)}" y2="${f1(ny)}"/><circle class="needle-hub" cx="${cx}" cy="${cy}" r="4"/>`;
  return svg+`<text class="gauge-label" x="${cx}" y="${cy+24}" text-anchor="middle">${esc(label)}</text>${sub?`<text class="gauge-sub" x="${cx}" y="${cy+36}" text-anchor="middle">${esc(sub)}</text>`:''}</svg>`;
}
/** Radar chart. axes: [{label}], series: [{label,color,values (0..1)}] */
export function radar(axes,series,{size=210}={}){
  const c=size/2,r=size/2-30,n=axes.length,pt=(k,v)=>[c+r*v*Math.sin(2*Math.PI*k/n),c-r*v*Math.cos(2*Math.PI*k/n)];
  let svg=`<svg class="chart radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="Positions">`;
  for(const g of [.25,.5,.75,1])svg+=`<polygon class="grid" points="${axes.map((_,k)=>pt(k,g).map(f1).join(',')).join(' ')}"/>`;
  axes.forEach((a,k)=>{const [x,y]=pt(k,1.16);svg+=`<line class="grid" x1="${c}" y1="${c}" x2="${f1(pt(k,1)[0])}" y2="${f1(pt(k,1)[1])}"/><text class="axis" x="${f1(x)}" y="${f1(y+3)}" text-anchor="middle">${esc(a.label)}</text>`;});
  for(const s of series)svg+=`<polygon class="series" style="stroke:${s.color};fill:${s.color}" points="${s.values.map((v,k)=>pt(k,Math.max(.02,v)).map(f1).join(',')).join(' ')}"${attrTip(s.label)}/>`;
  return svg+'</svg>';
}
/** Budget flow: sources → treasury → uses, ribbon widths proportional to amounts. */
export function flow(sources,uses,{width=420,height=190,format=v=>String(v),center='Treasury'}={}){
  const total=Math.max(sources.reduce((s,x)=>s+x.value,0),uses.reduce((s,x)=>s+x.value,0),1e-9),gap=3,colW=10,usable=height-10,scaleS=(usable-gap*(sources.length-1))/total,scaleU=(usable-gap*(uses.length-1))/total;
  const lx=118,rx=width-118,cx=width/2,cw=16;let svg=`<svg class="chart flow" viewBox="0 0 ${width} ${height}" role="img" aria-label="Budget flow">`;
  const inT=sources.reduce((s,x)=>s+x.value,0)*scaleS,outT=uses.reduce((s,x)=>s+x.value,0)*scaleU,cy0=(height-Math.max(inT,outT))/2;
  svg+=`<rect class="flow-center" x="${cx-cw/2}" y="${f1(cy0)}" width="${cw}" height="${f1(Math.max(inT,outT))}" rx="3"/><text class="axis flow-center-label" x="${cx}" y="${f1(cy0-4)}" text-anchor="middle">${esc(center)}</text>`;
  let y=5,cyIn=cy0;for(const s of sources){const h=Math.max(1,s.value*scaleS),h2=Math.max(1,s.value*scaleS);svg+=`<path class="ribbon" style="fill:${s.color}" d="M${lx+colW},${f1(y)}C${f1((lx+cx)/2)},${f1(y)} ${f1((lx+cx)/2)},${f1(cyIn)} ${cx-cw/2},${f1(cyIn)}V${f1(cyIn+h2)}C${f1((lx+cx)/2)},${f1(cyIn+h2)} ${f1((lx+cx)/2)},${f1(y+h)} ${lx+colW},${f1(y+h)}Z"${attrTip(`${s.label}: ${format(s.value)}`)}/><rect x="${lx}" y="${f1(y)}" width="${colW}" height="${f1(h)}" style="fill:${s.color}" rx="2"/><text class="axis flow-label" x="${lx-4}" y="${f1(y+h/2+3)}" text-anchor="end">${esc(s.label)}</text>`;y+=h+gap;cyIn+=h2;}
  y=5;let cyOut=cy0;for(const u of uses){const h=Math.max(1,u.value*scaleU);svg+=`<path class="ribbon" style="fill:${u.color}" d="M${cx+cw/2},${f1(cyOut)}C${f1((rx+cx)/2)},${f1(cyOut)} ${f1((rx+cx)/2)},${f1(y)} ${rx},${f1(y)}V${f1(y+h)}C${f1((rx+cx)/2)},${f1(y+h)} ${f1((rx+cx)/2)},${f1(cyOut+h)} ${cx+cw/2},${f1(cyOut+h)}Z"${attrTip(`${u.label}: ${format(u.value)}`)}/><rect x="${rx}" y="${f1(y)}" width="${colW}" height="${f1(h)}" style="fill:${u.color}" rx="2"/><text class="axis flow-label" x="${rx+colW+4}" y="${f1(y+h/2+3)}">${esc(u.label)}</text>`;y+=h+gap;cyOut+=h;}
  return svg+'</svg>';
}
/** Stacked horizontal share bar (groups). */
export function shareBar(parts,{className='',height=10}={}){const total=parts.reduce((s,p)=>s+Math.max(0,p.value),0)||1;return `<div class="share-bar ${className}" style="height:${height}px">${parts.filter(p=>p.value>0).map(p=>`<span style="flex:${p.value};background:${p.color}"${attrTip(`${p.label} · ${(p.value/total*100).toFixed(1)}%`)}></span>`).join('')}</div>`;}
/** Inline sparkline (no axes). */
export function spark(values,{width=90,height=24,color='currentColor',className=''}={}){
  const list=values.filter(Number.isFinite);if(list.length<2)return `<svg class="spark ${className}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"></svg>`;
  const lo=Math.min(...list),hi=Math.max(...list),span=hi-lo||Math.abs(hi)||1;return `<svg class="spark ${className}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" aria-hidden="true"><polyline style="stroke:${color}" points="${list.map((v,i)=>`${f1(i/(list.length-1)*width)},${f1(height-2-(v-lo)/span*(height-4))}`).join(' ')}"/></svg>`;
}
