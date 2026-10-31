import test from 'node:test';
import assert from 'node:assert/strict';
import {runPipeline} from '../src/generation/pipeline.js';
import {validateSettings} from '../src/core/settings.js';
import {serializeWorld, deserializeWorld} from '../src/persistence/world-file.js';

const settings = validateSettings({seed: 'pipeline-integration', width: 128, height: 64});
let reference;
async function generated() {
  if (!reference) reference = await runPipeline({settings});
  return structuredClone(reference);
}

function checkWorld(world) {
  const n = world.width * world.height, L = world.layers;
  for (const [name, values] of Object.entries(L)) {
    assert.ok(ArrayBuffer.isView(values), `${name} should remain a typed raster`);
    assert.equal(values.length, ['temperature', 'precipitation','seaIce'].includes(name) ? n * 12 : n, `${name} size`);
    for (const value of values) assert.ok(Number.isFinite(value), `${name} has a non-finite saved value`);
  }
  const visited = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (L.elevation[i] <= 0) {
      assert.equal(L.koppen[i], 0); assert.equal(L.flowTo[i], -1);
      continue;
    }
    assert.ok(L.koppen[i] > 0 && L.biome[i] > 0);
    assert.ok(L.basin[i] >= 0);
    const j = L.flowTo[i];
    if (j >= 0) {
      assert.ok(j < n);
      const dx = Math.abs(i % world.width - j % world.width);
      assert.ok(Math.min(dx, world.width - dx) <= 1);
      assert.ok(Math.abs((i / world.width | 0) - (j / world.width | 0)) <= 1);
      assert.ok(L.filledElevation[j] <= L.filledElevation[i]);
      if (L.river[i] && !L.lake[j] && L.elevation[j] > 0) assert.equal(L.river[j], 1);
    }
    let next = i;
    while (next >= 0 && !visited[next]) { visited[next] = 1; next = L.flowTo[next]; }
    assert.notEqual(next >= 0 ? visited[next] : 0, 1, `cycle from ${i}`);
    next = i;
    while (next >= 0 && visited[next] === 1) { visited[next] = 2; next = L.flowTo[next]; }
  }
  const stats = world.meta.statistics;
  assert.ok(Math.abs(stats.landShare + stats.oceanShare - 1) < 1e-9);
  for (const distribution of [stats.climate, stats.biome]) {
    assert.ok(Math.abs(distribution.reduce((sum, entry) => sum + entry.share, 0) - 1) < 1e-7);
  }
}

test('complete pipeline is deterministic and every persisted raster is finite', async () => {
  const a = await generated(), b = await runPipeline({settings});
  checkWorld(a); checkWorld(b);
  assert.deepEqual(Object.keys(a.layers).sort(), Object.keys(b.layers).sort());
  for (const name of Object.keys(a.layers)) assert.deepEqual(a.layers[name], b.layers[name], `${name} determinism`);
  assert.deepEqual(a.meta, b.meta);
});

test('climate-only settings preserve terrain and recompute downstream products', async () => {
  const a = await generated(), originalTerrain = a.layers.elevation.slice();
  const originalBase = a.layers.baseElevation.slice(), originalPlate = a.layers.plate.slice();
  const oldTemperature = a.layers.annualTemperature, oldFlow = a.layers.flow, oldBiome = a.layers.biome;
  const b = await runPipeline({world: a, settings: {...a.settings, temperatureOffset: 5}, products: ['climate']});
  assert.deepEqual(b.layers.elevation, originalTerrain);
  assert.deepEqual(b.layers.baseElevation, originalBase);
  assert.deepEqual(b.layers.plate, originalPlate);
  assert.notEqual(b.layers.annualTemperature, oldTemperature);
  assert.notEqual(b.layers.flow, oldFlow);
  assert.notEqual(b.layers.biome, oldBiome);
  assert.ok(b.layers.annualTemperature.some((t, i) => t > oldTemperature[i] + 2));
  checkWorld(b);
});

test('an elevation edit keeps the base terrain and propagates to climate and drainage', async () => {
  const a = await generated(), L = a.layers;
  let edited = -1, warmest = -Infinity;
  for (let i = 0; i < L.elevation.length; i++) {
    if (L.elevation[i] > 0 && L.elevation[i] < 1500 && L.annualTemperature[i] > warmest) {
      edited = i; warmest = L.annualTemperature[i];
    }
  }
  assert.ok(edited >= 0);
  const originalBase = L.baseElevation.slice(), oldTemperature = L.annualTemperature[edited];
  const oldClimate = L.temperature, oldDrainage = L.flowTo, oldBiome = L.biome;
  L.elevation[edited] += 2500;
  const editedHeight = L.elevation[edited];
  const b = await runPipeline({world: a, products: ['elevation']});
  assert.equal(b.layers.elevation[edited], editedHeight);
  assert.deepEqual(b.layers.baseElevation, originalBase);
  assert.ok(b.layers.annualTemperature[edited] < oldTemperature - 8);
  assert.notEqual(b.layers.temperature, oldClimate);
  assert.notEqual(b.layers.flowTo, oldDrainage);
  assert.notEqual(b.layers.biome, oldBiome);
  assert.ok(b.layers.filledElevation[edited] >= editedHeight);
  checkWorld(b);
});

test('complete world files retain edited terrain and all hydrology arrays exactly', async () => {
  const a = await generated();
  a.name = 'Integration world'; a.layers.elevation[700] += 350;
  const b = await runPipeline({world: a, products: ['elevation']});
  const loaded = deserializeWorld(serializeWorld(b));
  assert.equal(loaded.name, b.name);
  assert.deepEqual(loaded.settings, b.settings);
  for (const name of Object.keys(b.layers)) assert.deepEqual(loaded.layers[name], b.layers[name], `${name} save roundtrip`);
  checkWorld(loaded);
});
