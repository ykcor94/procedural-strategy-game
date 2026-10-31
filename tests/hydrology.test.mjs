import test from 'node:test';
import assert from 'node:assert/strict';
import {generateHydrology} from '../src/generation/hydrology.js';
import {rowArea} from '../src/core/geo.js';

function world(width = 48, height = 24, options = {}) {
  const n = width * height, elevation = new Float32Array(n);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    elevation[y * width + x] = x < 3 || x > width - 4 ? -300 : 40 + y * 8 + Math.sin(x * 0.67) * 32;
  }
  const layers = {elevation, annualTemperature: new Float32Array(n).fill(15),
    annualPrecipitation: new Float32Array(n).fill(1100), soilMoisture: new Float32Array(n).fill(0.7)};
  return {width, height, seed: 'hydrology-fixture', settings: {riverAbundance: 0.7, lakeAbundance: 0, ...options}, layers, meta: {}};
}

function checkRoutes(w) {
  const {width, height, layers: L} = w, n = width * height;
  const state = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const j = L.flowTo[i];
    if (L.elevation[i] <= 0) { assert.equal(j, -1); continue; }
    assert.ok(L.basin[i] >= 0);
    if (j < 0) continue;
    const dx = Math.abs(i % width - j % width), dy = Math.abs((i / width | 0) - (j / width | 0));
    assert.ok(Math.min(dx, width - dx) <= 1 && dy <= 1 && i !== j, `nonadjacent ${i} → ${j}`);
    assert.ok(L.filledElevation[j] <= L.filledElevation[i], `uphill ${i} → ${j}`);
    assert.ok(L.flow[j] + 0.001 >= L.flow[i]);
    if (L.elevation[j] > 0) assert.equal(L.basin[i], L.basin[j]);
    if (L.river[i] && L.elevation[j] > 0 && !L.lake[j]) assert.equal(L.river[j], 1, `river stops at ${i}`);
  }
  for (let i = 0; i < n; i++) {
    let j = i;
    while (j >= 0 && !state[j]) { state[j] = 1; j = L.flowTo[j]; }
    assert.notEqual(j >= 0 ? state[j] : 0, 1, `cycle from ${i}`);
    j = i;
    while (j >= 0 && state[j] === 1) { state[j] = 2; j = L.flowTo[j]; }
  }
}

test('priority flood gives adjacent, acyclic, downhill, continuous, deterministic drainage', () => {
  const a = world(), b = world();
  generateHydrology(a); generateHydrology(b);
  checkRoutes(a);
  for (const key of ['filledElevation', 'flowTo', 'flow', 'basin', 'river', 'lake']) assert.deepEqual(a.layers[key], b.layers[key], key);
  assert.ok(a.meta.hydrology.riverCells > 0);
  assert.ok(a.meta.hydrology.basinCount > 0);
});

test('routing crosses the horizontal seam and never crosses a pole', () => {
  const a = world(20, 10);
  a.layers.elevation.fill(200);
  for (let y = 0; y < a.height; y++) a.layers.elevation[y * a.width] = -20;
  for (let y = 0; y < a.height; y++) a.layers.elevation[y * a.width + a.width - 1] = 40;
  generateHydrology(a); checkRoutes(a);
  const i = 5 * a.width + a.width - 1, j = a.layers.flowTo[i];
  assert.equal(j % a.width, 0);
});

test('steepest descent overrides the first priority-flood parent on a slope', () => {
  const a = world(16, 8), {elevation} = a.layers, source = 4 * 16 + 8;
  elevation.fill(-100);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) elevation[source + dy * 16 + dx] = 480;
  elevation[source] = 500;
  elevation[source + 1] = 200;
  // The diagonal is flooded first, but its longer path has a gentler slope.
  elevation[source - 16 + 1] = 150;
  generateHydrology(a); checkRoutes(a);
  assert.equal(a.layers.flowTo[source], source + 1);
});

function bowl(climate) {
  const a = world(64, 32, {lakeAbundance: 1});
  const {width: w, layers: L} = a;
  L.elevation.fill(240);
  // Distant ocean and an outward-sloping spillway at 100 m.
  for (let y = 0; y < a.height; y++) L.elevation[y * w + 1] = -100;
  for (let x = 2; x <= 25; x++) L.elevation[16 * w + x] = 70 + x;
  for (let y = 15; y <= 17; y++) for (let x = 26; x <= 28; x++) L.elevation[y * w + x] = 35;
  L.elevation[16 * w + 27] = 10;
  L.annualPrecipitation.fill(climate === 'wet' ? 1800 : 35);
  L.annualTemperature.fill(climate === 'wet' ? 8 : 28);
  L.soilMoisture.fill(climate === 'wet' ? 0.85 : 0.02);
  return a;
}

test('an actual wet depression forms one lake with consistent depth and an outflow', () => {
  const a = bowl('wet'); generateHydrology(a); checkRoutes(a);
  assert.equal(a.meta.hydrology.lakeCount, 1);
  const lake = a.meta.hydrology.lakes[0];
  assert.equal(lake.endorheic, false);
  assert.ok(lake.outlet >= 0);
  assert.ok(lake.maxDepth > 50);
  for (let i = 0; i < a.layers.lake.length; i++) if (a.layers.lake[i]) {
    assert.ok(Math.abs(a.layers.lakeDepth[i] - (a.layers.lakeSurface[i] - a.layers.elevation[i])) < 0.001);
  }
});

test('a dry basin can retain an endorheic lake with a lower water surface', () => {
  const a = bowl('dry'); generateHydrology(a); checkRoutes(a);
  assert.equal(a.meta.hydrology.lakeCount, 1);
  const lake = a.meta.hydrology.lakes[0];
  assert.equal(lake.endorheic, true);
  assert.equal(a.layers.flowTo[lake.sink], -1);
  assert.ok(lake.surface < lake.spillElevation);
  assert.ok(a.layers.lake[lake.sink]);
});

test('abundance controls masks without changing terrain or base drainage', () => {
  const a = world(), b = world();
  b.settings.riverAbundance = 0;
  const raw = a.layers.elevation.slice();
  generateHydrology(a); generateHydrology(b);
  assert.deepEqual(a.layers.elevation, raw);
  assert.deepEqual(a.layers.flowTo, b.layers.flowTo);
  assert.deepEqual(a.layers.basin, b.layers.basin);
  assert.equal(b.meta.hydrology.riverCells, 0);
  assert.equal(b.meta.hydrology.lakeCells, 0);
});

test('all-ocean and fully edited all-land worlds remain valid', () => {
  for (const value of [-100, 100]) {
    const a = world(16, 8);
    a.layers.elevation.fill(value);
    generateHydrology(a); checkRoutes(a);
    assert.equal(a.meta.hydrology.closedWorld, value > 0);
    if (value > 0) assert.equal([...a.layers.flowTo].filter(i => i < 0).length, 1);
  }
});

test('invalid elevations fail clearly and cancellation is observed', () => {
  const a = world(); a.layers.elevation[35] = NaN;
  assert.throws(() => generateHydrology(a), /not finite/);
  assert.throws(() => generateHydrology(world(), {cancelled: () => true}), /cancelled/);
});

test('latitude area changes discharge rather than giving polar cells equal weight', () => {
  const a = world(16, 16, {riverAbundance: 0});
  a.layers.elevation.fill(-100);
  const polar = 2, equatorial = 8 * 16 + 2;
  a.layers.elevation[polar] = 50; a.layers.elevation[equatorial] = 50;
  generateHydrology(a);
  assert.ok(a.layers.flow[equatorial] > a.layers.flow[polar] * 5);
});

test('accumulation conserves runoff at terminals, including closed lakes', () => {
  const a = bowl('dry'); generateHydrology(a);
  let input = 0, output = 0;
  for (let i = 0; i < a.layers.elevation.length; i++) {
    const cellArea = 6371 ** 2 * 2 * Math.PI / a.width * rowArea(i / a.width | 0, a.height);
    input += a.layers.runoff[i] * cellArea * 1000 / (365.25 * 86400);
    if (a.layers.flowTo[i] < 0) output += a.layers.flow[i];
  }
  assert.ok(Math.abs(output - input) / input < 0.000002);
});

test('rough randomized depressions retain graph invariants under lake rewiring', () => {
  let rng = 72;
  for (let seed = 0; seed < 12; seed++) {
    const a = world(48, 24, {lakeAbundance: 1});
    a.seed = `stress-${seed}`;
    for (let i = 0; i < a.layers.elevation.length; i++) {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      if (a.layers.elevation[i] > 0) a.layers.elevation[i] = 20 + (rng / 4294967296) * 250;
    }
    generateHydrology(a); checkRoutes(a);
  }
});
