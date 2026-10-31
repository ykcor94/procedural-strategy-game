export function hashSeed(seed, stage = '') {
  const s = `${seed}:${stage}`; let h = 2166136261;
  for (let i=0;i<s.length;i++) {h ^= s.charCodeAt(i); h = Math.imul(h,16777619);}
  return h >>> 0;
}
export function seededRandom(seed, stage = '') {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed,stage);
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15,t|1); t ^= t + Math.imul(t ^ t >>> 7,t|61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
