import {neighbors8, rowArea, latitude, clamp,distanceToMask} from '../core/geo.js';
import {hashSeed} from '../core/random.js';
import {RasterHeap} from './heap.js';

const EARTH_RADIUS_KM = 6371;
const SECONDS_PER_YEAR = 365.25 * 86400;
const MM_KM2_TO_CUMEC = 1000 / SECONDS_PER_YEAR;
const EPSILON = 0.001;

/**
 * A wrap-aware priority flood builds an acyclic drainage surface. Small pits that
 * are not persistent lakes remain filled for routing: elevation is never changed.
 * Flow is mean discharge in m³/s, rather than a resolution-dependent pixel count.
 */
export function generateHydrology(world, ctx = {}) {
  const {width: w, height: h, layers: L, settings = {}} = world, n = w * h;
  const elevation = L.elevation;
  if (!(elevation instanceof Float32Array) || elevation.length !== n) throw new Error('Hydrology requires a complete Float32 elevation raster.');
  const progress = (fraction, message) => {
    if (ctx.signal?.aborted || (typeof ctx.cancelled === 'function' ? ctx.cancelled() : ctx.cancelled)) throw new Error('Generation cancelled.');
    ctx.report?.('hydrology', fraction, message);
  };
  progress(0, 'Finding drainage outlets');
  const filled = elevation.slice(), flowTo = new Int32Array(n), rank = new Int32Array(n);
  const visited = new Uint8Array(n), order = new Int32Array(n), area = new Float64Array(h);
  const flow = new Float32Array(n), runoff = new Float32Array(n);
  flowTo.fill(-1); rank.fill(-1);
  const heap = new RasterHeap(n, filled, hashSeed(world.seed, 'hydrology'));
  let landCells = 0, landArea = 0, oceanCells = 0, lowest = 0;
  const precipitation = L.annualPrecipitation, temperature = L.annualTemperature, moisture = L.soilMoisture;
  for (let y = 0; y < h; y++) {
    area[y] = EARTH_RADIUS_KM ** 2 * (2 * Math.PI / w) * rowArea(y, h);
    for (let x = 0; x < w; x++) {
      const i = y * w + x, z = elevation[i];
      if (!Number.isFinite(z)) throw new Error(`Elevation is not finite at cell ${i}.`);
      if (z < elevation[lowest]) lowest = i;
      if (z <= 0) { visited[i] = 1; filled[i] = 0; oceanCells++; continue; }
      landCells++; landArea += area[y];
      const p = Math.max(0, precipitation?.[i] ?? 800), t = temperature?.[i] ?? 12;
      const pet = potentialEvaporation(t);
      const wet = clamp(moisture?.[i] ?? p / (pet + p + 1), 0, 1);
      runoff[i] = p * (0.14 + 0.6 * wet) * clamp(Math.pow(p / (pet + 1), 0.65), 0.015, 1);
      flow[i] = runoff[i] * area[y] * MM_KM2_TO_CUMEC;
    }
  }
  // Oceans are water surfaces at zero. Only coastal seeds need heap entries.
  for (let i = 0; i < n; i++) if (visited[i]) {
    let coastal = false;
    neighbors8(i, w, h, j => { if (elevation[j] > 0) coastal = true; });
    if (coastal) heap.push(i);
  }
  // An entirely edited land world has one internal terminal, never polar drains.
  if (!oceanCells && n) { visited[lowest] = 1; heap.push(lowest); }
  let count = 0, reported = 0;
  while (heap.size) {
    const i = heap.pop();
    if (elevation[i] > 0) { rank[i] = count; order[count++] = i; }
    neighbors8(i, w, h, j => {
      if (visited[j]) return;
      visited[j] = 1;
      filled[j] = Math.max(elevation[j], filled[i]);
      flowTo[j] = i;
      heap.push(j);
    });
    if (count - reported >= 32768) {
      reported = count;
      progress(0.04 + 0.31 * count / Math.max(1, landCells), 'Filling drainage depressions');
    }
  }
  // Priority-flood parents only resolve perfectly flat drainage. On slopes the
  // first discovered neighbor is often diagonal, and is not the steepest route.
  // Re-evaluate every neighbor using real equirectangular cell distances.
  for (let k = 0; k < count; k++) {
    const i = order[k], y = (i / w) | 0;
    const east = Math.max(0.035, Math.cos(latitude(y, h) * Math.PI / 180)) * 2 * Math.PI / w;
    const north = Math.PI / h;
    let parent = flowTo[i], best = 0;
    neighbors8(i, w, h, (j, dx, dy) => {
      if (filled[j] > filled[i] || (filled[j] === filled[i] && rank[j] >= rank[i])) return;
      const slope = (filled[i] - filled[j]) / Math.hypot(dx * east, dy * north);
      if (slope > best) { best = slope; parent = j; }
    });
    flowTo[i] = parent;
  }
  // This first accumulation estimates the water budget of each candidate lake.
  for (let k = count - 1; k >= 0; k--) {
    const i = order[k], j = flowTo[i];
    if (j >= 0) flow[j] += flow[i];
  }
  progress(0.4, 'Evaluating lakes and water balance');
  const lake = new Uint8Array(n), lakeId = new Int32Array(n);
  const lakeDepth = new Float32Array(n), lakeSurface = new Float32Array(n);
  const labels = new Int32Array(n), queue = new Int32Array(n), localVisited = new Uint8Array(n);
  const abundance = clamp(settings.lakeAbundance ?? 0.45, 0, 1);
  const candidates = [];
  let label = 0;
  if (abundance > 0) for (let start = 0; start < n; start++) {
    if (labels[start] || elevation[start] <= 0 || filled[start] - elevation[start] < 0.25) continue;
    label++;
    let head = 0, tail = 1, minIndex = start, outlet = start;
    let totalArea = 0, maxDepth = 0, volume = 0, pSum = 0, tSum = 0;
    const surface = filled[start];
    queue[0] = start; labels[start] = label;
    while (head < tail) {
      const i = queue[head++], a = area[(i / w) | 0], depth = surface - elevation[i];
      totalArea += a; volume += depth / 1000 * a; maxDepth = Math.max(maxDepth, depth);
      pSum += (precipitation?.[i] ?? 800) * a;
      tSum += (temperature?.[i] ?? 12) * a;
      if (elevation[i] < elevation[minIndex]) minIndex = i;
      if (rank[i] < rank[outlet]) outlet = i;
      neighbors8(i, w, h, j => {
        if (!labels[j] && elevation[j] > 0 && filled[j] === surface && surface - elevation[j] >= 0.25) {
          labels[j] = label; queue[tail++] = j;
        }
      });
    }
    const minCells = abundance < 0.25 ? 3 : 2;
    const singleLimit = landArea * (0.004 + 0.028 * abundance);
    if (tail < minCells || maxDepth < 4 + (1 - abundance) * 9 || totalArea > singleLimit) continue;
    const meanP = pSum / totalArea, meanT = tSum / totalArea;
    candidates.push({label, cells: queue.slice(0, tail), surface, minIndex, outlet,
      area: totalArea, maxDepth, volume, meanP, meanT,
      score: Math.sqrt(totalArea) * Math.sqrt(maxDepth) * (0.3 + Math.min(2, meanP / potentialEvaporation(meanT)))});
  }
  candidates.sort((a, b) => b.score - a.score || a.minIndex - b.minIndex);
  const lakes = [];
  const budget = landArea * 0.035 * Math.pow(abundance, 1.4);
  let usedArea = 0;
  for (const candidate of candidates) {
    if (usedArea + candidate.area > budget) continue;
    const c = candidate, id = lakes.length + 1;
    let supply = 0;
    for (const i of c.cells) if (flowTo[i] < 0 || labels[flowTo[i]] !== c.label) supply += flow[i];
    const netEvaporation = Math.max(0, potentialEvaporation(c.meanT) - c.meanP);
    const evaporation = netEvaporation * c.area * MM_KM2_TO_CUMEC;
    const endorheic = evaporation > 0 && supply < evaporation * 0.8;
    let surface = c.surface;
    if (endorheic) {
      const fraction = clamp(supply / (evaporation + 0.001), 0.12, 0.82);
      surface = elevation[c.minIndex] + (c.surface - elevation[c.minIndex]) * Math.sqrt(fraction);
      routeClosedLake(c, surface, filled, flowTo, elevation, labels, localVisited, heap, w, h);
    } else {
      routeOpenLake(c, flowTo, labels, localVisited, queue, w, h);
    }
    let actualArea = 0, actualVolume = 0, actualMaxDepth = 0, cellCount = 0;
    for (const i of c.cells) {
      const depth = surface - elevation[i];
      if (depth <= 0 || filled[i] > surface + EPSILON) continue;
      const a = area[(i / w) | 0];
      lake[i] = 1; lakeId[i] = id; lakeSurface[i] = surface; lakeDepth[i] = depth;
      actualArea += a; actualVolume += a * depth / 1000;
      actualMaxDepth = Math.max(actualMaxDepth, depth); cellCount++;
    }
    usedArea += actualArea;
    lakes.push({id, areaKm2: actualArea, volumeKm3: actualVolume, maxDepth: actualMaxDepth,
      surface, cells: cellCount, endorheic, outlet: endorheic ? -1 : flowTo[c.outlet],
      sink: endorheic ? c.minIndex : -1, spillElevation: c.surface});
  }
  progress(0.65, 'Accumulating river discharge');
  // Lake rewiring changes the order. Kahn's algorithm both sorts and verifies it.
  const incoming = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (flowTo[i] >= 0) incoming[flowTo[i]]++;
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) {
    flow[i] = elevation[i] > 0 ? runoff[i] * area[(i / w) | 0] * MM_KM2_TO_CUMEC : 0;
    if (!incoming[i]) queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++], j = flowTo[i];
    if (j >= 0) { flow[j] += flow[i]; if (!--incoming[j]) queue[tail++] = j; }
  }
  if (tail !== n) throw new Error('Drainage routing contains a cycle.');
  const basin = new Int32Array(n); basin.fill(-1);
  const coastalBasins = new Map();
  let basinCount = 0;
  for (let k = n - 1; k >= 0; k--) {
    const i = queue[k], j = flowTo[i];
    if (elevation[i] <= 0) continue;
    if (j < 0) basin[i] = basinCount++;
    else if (elevation[j] <= 0) {
      if (!coastalBasins.has(j)) coastalBasins.set(j, basinCount++);
      basin[i] = coastalBasins.get(j);
    } else basin[i] = basin[j];
  }
  const river = new Uint8Array(n), riverAbundance = clamp(settings.riverAbundance ?? 0.5, 0, 1);
  // Render major drainage at world-map scale. A low cutoff draws every humid
  // hillslope as a blue comb; this retains connected trunks and tributaries.
  // Abundance still controls a physical discharge cutoff, never random deletion.
  const threshold = landArea / Math.max(1, landCells) * 0.34 * Math.pow(10, (0.5 - riverAbundance) * 1.3);
  let riverCells = 0, mouths = 0, maxDischarge = 0, lakeCells = 0;
  for (let i = 0; i < n; i++) {
    if (lake[i]) lakeCells++;
    if (elevation[i] <= 0) continue;
    maxDischarge = Math.max(maxDischarge, flow[i]);
    if (riverAbundance > 0 && !lake[i] && flow[i] >= threshold) { river[i] = 1; riverCells++; }
  }
  // Float32 summation can only increase discharge; downstream continuity follows
  // the threshold automatically, including an outlet river beyond an open lake.
  for (let i = 0; i < n; i++) if (river[i]) {
    const j = flowTo[i];
    if (j < 0 || elevation[j] <= 0 || lake[j]) mouths++;
  }
  Object.assign(L, {filledElevation: filled, flowTo, flow, runoff, basin, river, lake, lakeId, lakeDepth, lakeSurface});
  const riverDistance=distanceToMask(river,w,h,1);
  for(let i=0;i<n;i++)if(!Number.isFinite(riverDistance[i]))riverDistance[i]=w+h;
  L.riverDistance=riverDistance;
  world.meta ??= {};
  world.meta.hydrology = {riverCells, lakeCells, lakeCount: lakes.length, basinCount, riverMouths: mouths,
    lakeAreaKm2: usedArea, endorheicLakes: lakes.filter(l => l.endorheic).length,
    maxDischarge, riverThreshold: threshold, flowUnits: 'm³/s', runoffUnits: 'mm/year',
    closedWorld: !oceanCells, lakes};
  progress(1, 'Drainage and lakes complete');
  return world;
}

function potentialEvaporation(temperature) {
  return Math.max(100, 380 + Math.max(-8, temperature) * 35);
}

function routeOpenLake(c, flowTo, labels, visited, queue, w, h) {
  for (const i of c.cells) visited[i] = 0;
  let head = 0, tail = 1;
  queue[0] = c.outlet; visited[c.outlet] = 1;
  while (head < tail) {
    const i = queue[head++];
    neighbors8(i, w, h, j => {
      if (labels[j] !== c.label || visited[j]) return;
      visited[j] = 1; flowTo[j] = i; queue[tail++] = j;
    });
  }
}

function routeClosedLake(c, surface, filled, flowTo, elevation, labels, visited, heap, w, h) {
  for (const i of c.cells) visited[i] = 0;
  heap.size = 0;
  filled[c.minIndex] = surface; flowTo[c.minIndex] = -1;
  visited[c.minIndex] = 1; heap.push(c.minIndex);
  while (heap.size) {
    const i = heap.pop();
    neighbors8(i, w, h, j => {
      if (labels[j] !== c.label || visited[j]) return;
      visited[j] = 1; filled[j] = Math.max(elevation[j], filled[i]); flowTo[j] = i; heap.push(j);
    });
  }
}
