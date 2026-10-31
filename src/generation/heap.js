/** Typed binary min-heap. A stable hashed tie break avoids directional flatland bias. */
export class RasterHeap {
  constructor(capacity, height, seed = 0) {
    this.items = new Int32Array(capacity);
    this.height = height;
    this.seed = seed;
    this.size = 0;
  }
  less(a, b) {
    const delta = this.height[a] - this.height[b];
    if (delta) return delta < 0;
    const ah = mix(a ^ this.seed), bh = mix(b ^ this.seed);
    return ah === bh ? a < b : ah < bh;
  }
  push(value) {
    let p = this.size++;
    while (p) {
      const parent = (p - 1) >>> 1;
      if (!this.less(value, this.items[parent])) break;
      this.items[p] = this.items[parent];
      p = parent;
    }
    this.items[p] = value;
  }
  pop() {
    const result = this.items[0], value = this.items[--this.size];
    if (!this.size) return result;
    let p = 0;
    while (p * 2 + 1 < this.size) {
      let child = p * 2 + 1;
      if (child + 1 < this.size && this.less(this.items[child + 1], this.items[child])) child++;
      if (!this.less(this.items[child], value)) break;
      this.items[p] = this.items[child];
      p = child;
    }
    this.items[p] = value;
    return result;
  }
}

function mix(value) {
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}
