'use strict';

/* ============================================================
   The simulation: a grid of particles updated bottom-up each
   frame. Each cell carries an element id, a random shade byte
   (for texture), and a life counter (fire, gases).
   ============================================================ */

let cols = 0, rows = 0;
let grid, shade, life, moved; // typed arrays, length cols*rows
let frame = 0;

const R = Math.random;

function initSim(c, r) {
  cols = c;
  rows = r;
  grid = new Uint8Array(c * r);
  shade = new Uint8Array(c * r);
  life = new Uint8Array(c * r);
  moved = new Uint8Array(c * r);
}

/* Resize, keeping whatever overlaps the new size. */
function resizeSim(c, r) {
  const old = { grid, shade, life, cols, rows };
  initSim(c, r);
  if (!old.grid) return;
  const w = Math.min(c, old.cols), h = Math.min(r, old.rows);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = y * old.cols + x, dst = y * cols + x;
      grid[dst] = old.grid[src];
      shade[dst] = old.shade[src];
      life[dst] = old.life[src];
    }
  }
}

function clearSim() {
  grid.fill(EMPTY);
  life.fill(0);
}

function initLife(e) {
  switch (e) {
    case FIRE:    return 24 + (R() * 24) | 0;
    case STEAM:   return 110 + (R() * 110) | 0;
    case SMOKE:   return 80 + (R() * 70) | 0;
    case CRITTER: return 180 + (R() * 50) | 0; // energy
    default:      return 0;
  }
}

function setCell(i, e) {
  grid[i] = e;
  shade[i] = (R() * 256) | 0;
  life[i] = initLife(e);
}

function moveCell(i, j) { // j must be empty
  grid[j] = grid[i];
  shade[j] = shade[i];
  life[j] = life[i];
  grid[i] = EMPTY;
  moved[j] = 1;
}

function swapCells(i, j) {
  let t = grid[i]; grid[i] = grid[j]; grid[j] = t;
  t = shade[i]; shade[i] = shade[j]; shade[j] = t;
  t = life[i]; life[i] = life[j]; life[j] = t;
  moved[i] = moved[j] = 1;
}

/* ---------- main step ---------- */

function stepSim() {
  frame++;
  moved.fill(0);
  for (let y = rows - 1; y >= 0; y--) {
    const off = y * cols;
    const ltr = ((y ^ frame) & 1) === 0; // alternate scan direction to avoid drift
    for (let k = 0; k < cols; k++) {
      const x = ltr ? k : cols - 1 - k;
      const i = off + x;
      if (moved[i]) continue;
      switch (grid[i]) {
        case EMPTY: case WALL: case GLASS: case WOOD: break;
        case SAND:      updatePowder(x, y, i, SAND); break;
        case GUNPOWDER: updatePowder(x, y, i, GUNPOWDER); break;
        case SEED:      updateSeed(x, y, i); break;
        case SNOW:      updateSnow(x, y, i); break;
        case STONE:     updateStone(x, y, i); break;
        case WATER:     updateLiquid(x, y, i, WATER); break;
        case OIL:       updateLiquid(x, y, i, OIL); break;
        case ACID:      updateAcid(x, y, i); break;
        case LAVA:      updateLava(x, y, i); break;
        case FIRE:      updateFire(x, y, i); break;
        case STEAM:     updateSteam(x, y, i); break;
        case SMOKE:     updateSmoke(x, y, i); break;
        case PLANT:     updatePlant(x, y, i); break;
        case ICE:       updateIce(x, y, i); break;
        case FUNGUS:    updateFungus(x, y, i); break;
        case CRITTER:   updateCritter(x, y, i); break;
      }
    }
  }
}

/* ---------- movement helpers ---------- */

/* Powders fall straight, then roll diagonally; they sink through liquids. */
function updatePowder(x, y, i, e) {
  if (y + 1 >= rows) return false;
  const b = i + cols;
  const be = grid[b];
  if (be === EMPTY) { moveCell(i, b); return true; }
  if (DENS[be]) { swapCells(i, b); return true; }
  const d = R() < 0.5 ? 1 : -1;
  for (const dx of [d, -d]) {
    const nx = x + dx;
    if (nx < 0 || nx >= cols) continue;
    const j = b + dx;
    const je = grid[j];
    if (je === EMPTY) { moveCell(i, j); return true; }
    if (DENS[je] && R() < 0.4) { swapCells(i, j); return true; }
  }
  return false;
}

/* Liquids fall, sink below lighter liquids, then run sideways. */
function updateLiquid(x, y, i, e) {
  const d = DENS[e];
  if (y + 1 < rows) {
    const b = i + cols;
    const be = grid[b];
    if (be === EMPTY) { moveCell(i, b); return true; }
    const bd = DENS[be];
    if (bd && bd < d) { swapCells(i, b); return true; }
    const dr = R() < 0.5 ? 1 : -1;
    for (const dx of [dr, -dr]) {
      const nx = x + dx;
      if (nx < 0 || nx >= cols) continue;
      const j = b + dx;
      if (grid[j] === EMPTY) { moveCell(i, j); return true; }
    }
  }
  // blocked below: spread along the surface
  const dr = R() < 0.5 ? 1 : -1;
  const disp = DISP[e];
  let target = -1;
  for (let s = 1; s <= disp; s++) {
    const nx = x + dr * s;
    if (nx < 0 || nx >= cols) break;
    const j = i + dr * s;
    const je = grid[j];
    if (je === EMPTY) { target = j; continue; }
    if (s === 1 && DENS[je] && DENS[je] < d && R() < 0.35) { swapCells(i, j); return true; }
    break;
  }
  if (target >= 0) { moveCell(i, target); return true; }
  return false;
}

/* Stone falls straight down (no rolling), so it stacks into pillars.
   Stone touching lava runs hot: water on its other faces slowly boils
   off — heat conduction without consuming the lava. */
function updateStone(x, y, i) {
  if (y + 1 < rows) {
    const b = i + cols;
    if (grid[b] === EMPTY) { moveCell(i, b); return; }
    if (DENS[grid[b]]) { swapCells(i, b); return; }
  }
  // life doubles as temperature: 60 next to lava, -20 per cell of rock,
  // cooling by 1/frame once the heat source is gone. Cold stone only
  // polls for heat occasionally — stone is the most common element,
  // and this scan must stay cheap (inline, allocation-free).
  const myHeat = life[i];
  if (myHeat === 0 && R() >= 0.25) return;
  let heat = myHeat > 0 ? myHeat - 1 : 0;
  let wet = -1;
  let j = i - 1, je;
  if (x > 0) { je = grid[j]; if (je === LAVA) heat = 60; else if (je === STONE) { if (life[j] - 20 > heat) heat = life[j] - 20; } else if (je === WATER) wet = j; }
  j = i + 1;
  if (x < cols - 1) { je = grid[j]; if (je === LAVA) heat = 60; else if (je === STONE) { if (life[j] - 20 > heat) heat = life[j] - 20; } else if (je === WATER) wet = j; }
  j = i - cols;
  if (y > 0) { je = grid[j]; if (je === LAVA) heat = 60; else if (je === STONE) { if (life[j] - 20 > heat) heat = life[j] - 20; } else if (je === WATER) wet = j; }
  j = i + cols;
  if (y < rows - 1) { je = grid[j]; if (je === LAVA) heat = 60; else if (je === STONE) { if (life[j] - 20 > heat) heat = life[j] - 20; } else if (je === WATER) wet = j; }
  life[i] = heat;
  if (heat > 0 && wet >= 0 && R() < 0.006 * (heat / 60)) setCell(wet, STEAM);
}

/* ---------- element behaviors ---------- */

function updateSeed(x, y, i) {
  if (updatePowder(x, y, i, SEED)) return;
  // resting: sprout if there's water nearby, or slowly atop a plant
  const n = nb4(x, y, i, NB_A);
  for (let q = 0; q < n; q++) {
    if (grid[NB_A[q]] === WATER) { grid[i] = PLANT; shade[i] = (R() * 256) | 0; return; }
  }
  if (y + 1 < rows && grid[i + cols] === PLANT && R() < 0.02) grid[i] = PLANT;
}

function updateSnow(x, y, i) {
  if (R() < 0.55) return; // drifts down lazily
  if (y + 1 < rows) {
    const b = i + cols;
    const be = grid[b];
    if (be === WATER) { grid[i] = WATER; return; } // melts into the pond
    if (be === EMPTY) { moveCell(i, b); return; }
    const d = R() < 0.5 ? 1 : -1;
    for (const dx of [d, -d]) {
      const nx = x + dx;
      if (nx < 0 || nx >= cols) continue;
      const j = b + dx;
      if (grid[j] === EMPTY) { moveCell(i, j); return; }
    }
  }
}

function updateAcid(x, y, i) {
  const n = nb4(x, y, i, NB_A);
  for (let q = 0; q < n; q++) {
    const j = NB_A[q];
    const je = grid[j];
    if (je !== WATER && !ACID_PROOF[je] && R() < 0.08) {
      setCell(j, R() < 0.25 ? SMOKE : EMPTY);
      if (grid[j] === EMPTY) life[j] = 0;
      if (R() < 0.5) { grid[i] = EMPTY; return; } // acid spends itself
    }
  }
  updateLiquid(x, y, i, ACID);
}

function updateLava(x, y, i) {
  const n = nb4(x, y, i, NB_A);
  for (let q = 0; q < n; q++) {
    const j = NB_A[q];
    const je = grid[j];
    if (je === WATER || je === ACID) {
      grid[i] = STONE; shade[i] = (R() * 256) | 0;
      setCell(j, STEAM);
      return;
    }
    if (je === ICE || je === SNOW) { setCell(j, WATER); continue; }
    if (je === SAND && R() < 0.02) { grid[j] = GLASS; continue; }
    if (je === GUNPOWDER) { explode(j % cols, (j / cols) | 0, 7); continue; }
    if (FLAM[je] && R() < 0.4) {
      setCell(j, FIRE);
      if (je === WOOD) life[j] = 60 + (R() * 80) | 0;
    }
  }
  // licks of flame off the surface
  if (y > 0 && grid[i - cols] === EMPTY && R() < 0.02) setCell(i - cols, FIRE);
  updateLiquid(x, y, i, LAVA);
}

function updateFire(x, y, i) {
  if (life[i] <= 1) {
    setCell(i, R() < 0.25 ? SMOKE : EMPTY);
    return;
  }
  life[i]--;
  // interact with all 8 neighbors
  let hasFuel = false;
  for (let dy = -1; dy <= 1; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= rows) continue;
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= cols) continue;
      const j = ny * cols + nx;
      const je = grid[j];
      if (je === GUNPOWDER) { explode(nx, ny, 7); continue; }
      if (FLAM[je]) {
        hasFuel = true;
        if (R() * 255 < FLAM[je]) {
          setCell(j, FIRE);
          if (je === WOOD) life[j] = 60 + (R() * 80) | 0;
        }
        continue;
      }
      if (je === WATER) { // doused
        grid[i] = EMPTY;
        if (R() < 0.25) setCell(j, STEAM);
        return;
      }
      if ((je === ICE || je === SNOW) && R() < 0.3) setCell(j, WATER);
    }
  }
  if (hasFuel) {
    // anchored to fuel: stay and burn, occasionally throwing a flame lick
    if (y > 0 && grid[i - cols] === EMPTY && R() < 0.1) setCell(i - cols, FIRE);
    return;
  }
  // free flame: licks upward and dies out
  if (y > 0) {
    const up = i - cols;
    if (grid[up] === EMPTY && R() < 0.45) { moveCell(i, up); return; }
    const d = R() < 0.5 ? 1 : -1;
    if (x + d >= 0 && x + d < cols && grid[up + d] === EMPTY && R() < 0.2) moveCell(i, up + d);
  }
}

function updateSteam(x, y, i) {
  if (life[i] <= 1) {
    setCell(i, WATER); // what goes up must rain down
    return;
  }
  life[i]--;
  if (y > 0) {
    const up = i - cols;
    const ue = grid[up];
    if (ue === EMPTY && R() < 0.85) { moveCell(i, up); return; }
    if (DENS[ue] && R() < 0.25) { swapCells(i, up); return; } // bubbles up through liquid
    if ((ue === WALL || ue === STONE || ue === GLASS || ue === ICE || ue === WOOD) && R() < 0.015) {
      grid[i] = WATER; // condenses on a cold ceiling
      return;
    }
    const d = R() < 0.5 ? 1 : -1;
    if (x + d >= 0 && x + d < cols && grid[up + d] === EMPTY && R() < 0.5) { moveCell(i, up + d); return; }
  }
  const d = R() < 0.5 ? 1 : -1;
  if (x + d >= 0 && x + d < cols && grid[i + d] === EMPTY && R() < 0.4) moveCell(i, i + d);
}

function updateSmoke(x, y, i) {
  if (life[i] <= 1) { grid[i] = EMPTY; return; }
  life[i]--;
  if (y > 0) {
    const up = i - cols;
    if (grid[up] === EMPTY && R() < 0.7) { moveCell(i, up); return; }
    const d = R() < 0.5 ? 1 : -1;
    if (x + d >= 0 && x + d < cols && grid[up + d] === EMPTY && R() < 0.4) { moveCell(i, up + d); return; }
  }
  const d = R() < 0.5 ? 1 : -1;
  if (x + d >= 0 && x + d < cols && grid[i + d] === EMPTY && R() < 0.5) moveCell(i, i + d);
}

function updatePlant(x, y, i) {
  const n = nb4(x, y, i, NB_A);
  for (let q = 0; q < n; q++) {
    const j = NB_A[q];
    if (grid[j] !== WATER || R() >= 0.01) continue;
    // Plants need air: only claim water that touches empty space
    // (growth skins along the waterline) — or grow straight up,
    // reaching for the surface like pondweed. Never into a pocket
    // already crowded by plants, which keeps the growth lacy.
    const jx = j % cols, jy = (j / cols) | 0;
    let crowd = 0, air = false;
    const m = nb4(jx, jy, j, NB_B); // nested scan: second buffer
    for (let w = 0; w < m; w++) {
      const k = NB_B[w];
      if (grid[k] === PLANT) crowd++;
      else if (grid[k] === EMPTY) air = true;
    }
    if ((air || j === i - cols) && crowd < 3) { setCell(j, PLANT); return; }
  }
}

function updateIce(x, y, i) {
  const n = nb4(x, y, i, NB_A);
  for (let q = 0; q < n; q++) {
    if (grid[NB_A[q]] === WATER && R() < 0.004) { setCell(NB_A[q], ICE); return; }
  }
}

function updateFungus(x, y, i) {
  const n = nb4(x, y, i, NB_A);
  for (let q = 0; q < n; q++) {
    const j = NB_A[q];
    const je = grid[j];
    if ((je === PLANT || je === WOOD || je === SEED) && R() < 0.02) {
      setCell(j, FUNGUS);
      return;
    }
  }
}

/* A critter: one pixel of herbivore. Walks and climbs along surfaces
   (facing direction lives in shade bit 0), grazes plants and seeds,
   flees smoke, flails in deep water, breeds when well fed beside a
   friend, and starves back into a seed. life doubles as energy. */
function updateCritter(x, y, i) {
  // metabolism
  if (R() < 0.02) {
    if (life[i] <= 1) { setCell(i, SEED); return; } // returns to the soil
    life[i]--;
  }
  // senses: death, food, and the smell of smoke
  let submerged = 0;
  const n = nb4(x, y, i, NB_A);
  for (let q = 0; q < n; q++) {
    const j = NB_A[q];
    const je = grid[j];
    if (je === FIRE || je === LAVA) { setCell(i, FIRE); return; }
    if (je === ACID) { setCell(i, R() < 0.5 ? SMOKE : EMPTY); return; }
    if (je === WATER) submerged++;
    else if (je === SMOKE) { // run away from where the smoke is
      if (j === i - 1) shade[i] |= 1;
      else if (j === i + 1) shade[i] &= ~1;
    } else if ((je === PLANT || je === SEED) && life[i] < 220 && R() < 0.05) {
      setCell(j, EMPTY);
      life[i] = Math.min(255, life[i] + 70);
    }
  }
  // mostly underwater: struggle toward the surface, losing energy
  if (submerged >= 3) {
    if (R() < 0.05) {
      if (life[i] <= 10) { setCell(i, EMPTY); return; } // drowned
      life[i] -= 10;
    }
    if (y > 0) {
      const up = i - cols;
      if (grid[up] === EMPTY && R() < 0.6) { moveCell(i, up); return; }
      if (grid[up] === WATER && R() < 0.6) { swapCells(i, up); return; }
    }
  }
  // breeding: well fed, a friend adjacent, and an empty nest cell
  if (life[i] > 200 && R() < 0.01) {
    let friend = false, nest = -1;
    const m = nb4(x, y, i, NB_A);
    for (let q = 0; q < m; q++) {
      const j = NB_A[q];
      if (grid[j] === CRITTER) friend = true;
      else if (grid[j] === EMPTY) nest = j;
    }
    if (friend && nest >= 0) {
      setCell(nest, CRITTER);
      life[nest] = 120;
      life[i] -= 90;
    }
  }
  // gravity; sinks slowly through water
  if (y + 1 < rows) {
    const b = i + cols;
    if (grid[b] === EMPTY) { moveCell(i, b); return; }
    if (grid[b] === WATER && R() < 0.25) { swapCells(i, b); return; }
  }
  // amble: walk the facing direction, climb single steps, turn at walls
  if (R() < 0.35) {
    let dir = (shade[i] & 1) ? 1 : -1;
    if (R() < 0.01) { shade[i] ^= 1; dir = -dir; } // idle wandering
    const nx = x + dir;
    if (nx < 0 || nx >= cols) { shade[i] ^= 1; return; }
    const side = i + dir;
    const se = grid[side];
    if (se === EMPTY) {
      if (y + 1 < rows && grid[side + cols] === WATER) { shade[i] ^= 1; return; } // won't step onto water
      moveCell(i, side); return;
    }
    if (se !== WATER && y > 0 && grid[side - cols] === EMPTY) { moveCell(i, side - cols); return; }
    shade[i] ^= 1; // blocked (or facing water): turn around
  }
}

/* 4-neighborhood: writes flat indices into buf, returns the count.
   Reusable scratch buffers (no per-call allocation — this runs for
   thousands of cells per frame). Two buffers so one level of nesting
   is safe; deeper nesting needs its own buffer. */
const NB_A = new Int32Array(4), NB_B = new Int32Array(4);
function nb4(x, y, i, buf) {
  let n = 0;
  if (x > 0) buf[n++] = i - 1;
  if (x < cols - 1) buf[n++] = i + 1;
  if (y > 0) buf[n++] = i - cols;
  if (y < rows - 1) buf[n++] = i + cols;
  return n;
}

function explode(cx, cy, r) {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    const yy = cy + dy;
    if (yy < 0 || yy >= rows) continue;
    for (let dx = -r; dx <= r; dx++) {
      const xx = cx + dx;
      if (xx < 0 || xx >= cols) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const j = yy * cols + xx;
      const je = grid[j];
      if (je === WALL) continue;
      if (je === GUNPOWDER) { // chain reaction, one frame later
        setCell(j, FIRE);
        life[j] = 6 + (R() * 8) | 0;
        continue;
      }
      if (je === WATER) { setCell(j, STEAM); continue; }
      if (je === GLASS && R() > 0.7) continue; // glass mostly shatters
      const t = d2 / r2;
      if (R() < 1 - t * 0.7) {
        setCell(j, FIRE);
        life[j] = 12 + (R() * 28) | 0;
      } else if (R() < 0.4) {
        setCell(j, SMOKE);
      }
    }
  }
}

/* ---------- painting ---------- */

/* Solids overwrite; everything else only fills empty space;
   the eraser clears anything. */
const OVERWRITES = new Uint8Array(N_ELEMS);
OVERWRITES[WALL] = OVERWRITES[WOOD] = OVERWRITES[STONE] = 1;
OVERWRITES[GLASS] = OVERWRITES[ICE] = OVERWRITES[PLANT] = 1;

function paintBrush(cx, cy, radius, e) {
  const r2 = radius * radius;
  const sprinkle = (e === SAND || e === GUNPOWDER || e === SEED || e === SNOW) ? 0.75
                 : (e === FIRE || e === STEAM) ? 0.4
                 : (e === CRITTER) ? 0.15 : 1;
  for (let dy = -radius; dy <= radius; dy++) {
    const yy = cy + dy;
    if (yy < 0 || yy >= rows) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const xx = cx + dx;
      if (xx < 0 || xx >= cols) continue;
      if (dx * dx + dy * dy > r2) continue;
      const j = yy * cols + xx;
      if (e === EMPTY) { grid[j] = EMPTY; life[j] = 0; continue; }
      if (grid[j] !== EMPTY && !OVERWRITES[e]) continue;
      if (R() < sprinkle) setCell(j, e);
    }
  }
}

function paintLine(x0, y0, x1, y1, radius, e) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    paintBrush(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), radius, e);
  }
}

/* ---------- demo scene ---------- */

function sceneRect(x, y, w, h, e) {
  x |= 0; y |= 0;
  for (let yy = y; yy < y + h; yy++) {
    if (yy < 0 || yy >= rows) continue;
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || xx >= cols) continue;
      setCell(yy * cols + xx, e);
    }
  }
}

function sceneDisk(cx, cy, r, e) {
  cx |= 0; cy |= 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const xx = cx + dx, yy = cy + dy;
      if (xx < 0 || xx >= cols || yy < 0 || yy >= rows) continue;
      setCell(yy * cols + xx, e);
    }
  }
}

/* A parabolic mound of e sitting on baseY. */
function sceneMound(cx, baseY, halfW, h, e) {
  for (let dx = -halfW; dx <= halfW; dx++) {
    const xx = (cx + dx) | 0;
    if (xx < 0 || xx >= cols) continue;
    const t = dx / halfW;
    const top = baseY - h * (1 - t * t);
    for (let yy = Math.ceil(top); yy < baseY; yy++) {
      if (yy < 0 || yy >= rows) continue;
      setCell(yy * cols + xx, e);
    }
  }
}

function buildScene() {
  clearSim();
  const W = cols, H = rows;
  const fy = H - 6; // bedrock surface

  sceneRect(0, fy, W, 6, STONE);

  // sand dunes
  sceneMound(W * 0.16, fy, W * 0.13, H * 0.10, SAND);
  sceneMound(W * 0.85, fy, W * 0.10, H * 0.07, SAND);

  // pond in a stone bowl
  const px = W * 0.47, pw = W * 0.11, pd = H * 0.07;
  sceneRect(px - pw - 2, fy - pd - 2, 2, pd + 2, STONE);
  sceneRect(px + pw, fy - pd - 2, 2, pd + 2, STONE);
  sceneRect(px - pw, fy - pd, pw * 2, pd, WATER);
  sceneDisk(px - pw - 1, fy - pd - 4, 2, PLANT);
  sceneDisk(px + pw + 1, fy - pd - 4, 2, PLANT);

  // a tree
  const tx = W * 0.30, th = H * 0.12;
  sceneRect(tx, fy - th, 2, th, WOOD);
  sceneDisk(tx + 1, fy - th - 3, 5, PLANT);

  // lava shelf, slowly overflowing to the left onto the dune below
  const sx = W * 0.74, sw = W * 0.16, sy = H * 0.34;
  sceneRect(sx, sy, sw, 2, STONE);
  sceneRect(sx + sw - 2, sy - 9, 2, 9, STONE); // tall right rim
  sceneRect(sx, sy - 4, 2, 4, STONE);          // short left rim: the spout
  sceneRect(sx + 2, sy - 6, sw - 4, 6, LAVA);

  // seeds drifting down over the pond
  for (let k = 0; k < 5; k++) {
    const xx = (px - pw + R() * pw * 2) | 0;
    const yy = (fy - pd - 8 - R() * 10) | 0;
    if (grid[yy * cols + xx] === EMPTY) setCell(yy * cols + xx, SEED);
  }

  // a brief flurry of snow, upper left
  for (let k = 0; k < 80; k++) {
    const xx = (W * 0.04 + R() * W * 0.2) | 0;
    const yy = (H * 0.05 + R() * H * 0.12) | 0;
    if (grid[yy * cols + xx] === EMPTY) setCell(yy * cols + xx, SNOW);
  }

  // a founding population, dropped by the tree (upwind of the pond)
  for (let k = 0; k < 8; k++) {
    const xx = (W * 0.20 + R() * W * 0.09) | 0;
    const yy = (fy - 14 - R() * 8) | 0;
    if (grid[yy * cols + xx] === EMPTY) setCell(yy * cols + xx, CRITTER);
  }
}

/* ---------- stats ---------- */

function countParticles() {
  let n = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] !== EMPTY) n++;
  return n;
}
