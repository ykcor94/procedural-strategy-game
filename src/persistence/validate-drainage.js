/** Files may be older than the generator, but their routing graph must still
 * have adjacent downhill edges and no cycles before visual paths consume it.
 */
export function validateDrainage(l,w,h) {
  const n=w*h,state=new Uint8Array(n);
  for(let i=0;i<n;i++) {
    const j=l.flowTo[i];if(j<0)continue;
    const dx=Math.abs(i%w-j%w),dy=Math.abs(Math.floor(i/w)-Math.floor(j/w));
    if(i===j||Math.min(dx,w-dx)>1||dy>1)throw new Error('Drainage edges must join adjacent cells.');
    if(l.filledElevation[j]>l.filledElevation[i]+.01)throw new Error('Drainage contains an uphill edge.');
  }
  for(let start=0;start<n;start++)if(!state[start]) {
    let i=start;while(i>=0&&!state[i]){state[i]=1;i=l.flowTo[i];}
    if(i>=0&&state[i]===1)throw new Error('Drainage contains a cycle.');
    i=start;while(i>=0&&state[i]===1){state[i]=2;i=l.flowTo[i];}
  }
}
