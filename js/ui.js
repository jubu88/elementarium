'use strict';

/* ============================================================
   Rendering, input, toolbar, main loop.
   ============================================================ */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');

let img, buf32;
let current = SAND;
let brushSize = 4;
let speed = 2;
let paused = false;

let pointerDown = false, erasing = false;
let mx = -1, my = -1, pmx = -1, pmy = -1; // pointer pos in sim coords

/* ---------- palettes ---------- */

const A = 0xff000000;
const pack = (r, g, b) => A | (b << 16) | (g << 8) | r;
const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;

const BG32 = pack(...COLOR[EMPTY]);

/* 32 shade variants per element. */
const PAL = [];
for (let e = 0; e < N_ELEMS; e++) {
  const p = new Uint32Array(32);
  const [r, g, b] = COLOR[e];
  const v = VARY[e];
  for (let k = 0; k < 32; k++) {
    const d = ((k - 16) / 16) * v;
    p[k] = pack(clamp255(r + d), clamp255(g + d), clamp255(b + d));
  }
  PAL[e] = p;
}

/* Fire: indexed by remaining life — dying embers deep red, fresh flame near white. */
const FIRE_PAL = new Uint32Array(48);
{
  const stops = [[120, 16, 8], [201, 42, 14], [255, 110, 30], [255, 180, 70], [255, 236, 160]];
  for (let k = 0; k < 48; k++) {
    const t = (k / 47) * (stops.length - 1);
    const s0 = stops[Math.min(t | 0, stops.length - 2)];
    const s1 = stops[Math.min((t | 0) + 1, stops.length - 1)];
    const f = t - (t | 0);
    FIRE_PAL[k] = pack(
      clamp255(s0[0] + (s1[0] - s0[0]) * f),
      clamp255(s0[1] + (s1[1] - s0[1]) * f),
      clamp255(s0[2] + (s1[2] - s0[2]) * f));
  }
}

/* Lava: slow pulsing glow. */
const LAVA_PAL = new Uint32Array(32);
{
  const lo = [156, 44, 10], hi = [255, 154, 60];
  for (let k = 0; k < 32; k++) {
    const t = 0.5 - 0.5 * Math.cos((k / 32) * Math.PI * 2); // smooth loop
    LAVA_PAL[k] = pack(
      clamp255(lo[0] + (hi[0] - lo[0]) * t),
      clamp255(lo[1] + (hi[1] - lo[1]) * t),
      clamp255(lo[2] + (hi[2] - lo[2]) * t));
  }
}

/* Gases fade toward the background as life runs out. */
function fadePal(elem) {
  const p = new Uint32Array(32);
  const [r, g, b] = COLOR[elem];
  const [br, bg_, bb] = COLOR[EMPTY];
  for (let k = 0; k < 32; k++) {
    const t = k / 31;
    p[k] = pack(
      clamp255(br + (r - br) * t),
      clamp255(bg_ + (g - bg_) * t),
      clamp255(bb + (b - bb) * t));
  }
  return p;
}
const STEAM_FADE = fadePal(STEAM);
const SMOKE_FADE = fadePal(SMOKE);

/* ---------- render ---------- */

function render() {
  const n = grid.length;
  for (let i = 0; i < n; i++) {
    const e = grid[i];
    let c;
    switch (e) {
      case EMPTY: c = BG32; break;
      case FIRE:  c = FIRE_PAL[Math.min(life[i], 47)]; break;
      case LAVA:  c = LAVA_PAL[(shade[i] + (frame >> 2)) & 31]; break;
      case WATER: c = PAL[WATER][(shade[i] + (frame >> 3)) & 31]; break;
      case ACID:  c = PAL[ACID][(shade[i] + (frame >> 1)) & 31]; break;
      case STEAM: c = STEAM_FADE[Math.min(31, life[i] >> 3)]; break;
      case SMOKE: c = SMOKE_FADE[Math.min(31, life[i] >> 2)]; break;
      case CRITTER: c = PAL[CRITTER][(shade[i] >> 1) & 31]; break; // bit 0 is facing
      case PREDATOR: c = PAL[PREDATOR][(shade[i] >> 1) & 31]; break;
      case STONE: { // life is temperature: glow ember-red near lava
        const base = PAL[STONE][shade[i] & 31];
        const h = life[i];
        if (!h) { c = base; break; }
        const t = h / 100;
        const r = ((base & 255) + (226 - (base & 255)) * t) | 0;
        const g = (((base >> 8) & 255) + (90 - ((base >> 8) & 255)) * t) | 0;
        const b = (((base >> 16) & 255) + (36 - ((base >> 16) & 255)) * t) | 0;
        c = A | (b << 16) | (g << 8) | r;
        break;
      }
      default:    c = PAL[e][shade[i] & 31];
    }
    buf32[i] = c;
  }
  ctx.putImageData(img, 0, 0);

  // brush preview ring
  if (mx >= 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx + 0.5, my + 0.5, brushSize, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ---------- sizing ---------- */

function fitCanvas(preserve) {
  const w = stage.clientWidth, h = stage.clientHeight;
  let cell = 4;
  if ((w / cell) * (h / cell) > 260000) cell = 5;
  const c = Math.max(64, (w / cell) | 0);
  const r = Math.max(48, (h / cell) | 0);
  if (c === cols && r === rows) return;
  if (preserve) resizeSim(c, r);
  else initSim(c, r);
  canvas.width = c;
  canvas.height = r;
  img = ctx.createImageData(c, r);
  buf32 = new Uint32Array(img.data.buffer);
}

/* React to the stage actually changing size (window resize, panel
   resize, or getting real dimensions after a zero-size load). */
let resizeTimer;
let awaitingFirstLayout = false; // set at init if the stage measured 0x0
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    fitCanvas(true);
    if (awaitingFirstLayout && stage.clientWidth > 0) {
      awaitingFirstLayout = false;
      buildScene(); // the load-time scene was built blind; redo it at real size
    }
  }, 150);
}).observe(stage);

/* ---------- toolbar ---------- */

const chipsEl = document.getElementById('chips');
const chipButtons = new Map();

TOOLBAR.forEach((t, idx) => {
  const btn = document.createElement('button');
  btn.className = 'chip';
  const hotkey = idx < 9 ? String(idx + 1) : idx === 9 ? '0' : t.id === EMPTY ? 'E' : null;
  btn.title = hotkey ? `${t.name}  (${hotkey})` : t.name;
  const dot = document.createElement('span');
  dot.className = 'dot';
  if (t.id === EMPTY) {
    dot.style.background = 'transparent';
    dot.style.border = '1px dashed #7c8696';
  } else {
    const [r, g, b] = COLOR[t.id];
    dot.style.background = `rgb(${r},${g},${b})`;
  }
  btn.append(dot, document.createTextNode(t.name));
  btn.addEventListener('click', () => selectElement(t.id));
  chipsEl.append(btn);
  chipButtons.set(t.id, btn);
});

function selectElement(id) {
  current = id;
  for (const [eid, btn] of chipButtons) btn.classList.toggle('selected', eid === id);
}
selectElement(SAND);

/* ---------- controls ---------- */

const brushInput = document.getElementById('brush');
const brushVal = document.getElementById('brushval');
const pauseBtn = document.getElementById('pause');
const speedBtn = document.getElementById('speed');
const statusLeft = document.getElementById('status-left');
const statusRight = document.getElementById('status-right');
const hintEl = document.getElementById('hint');
const helpEl = document.getElementById('help');

function setBrush(v) {
  brushSize = Math.max(1, Math.min(24, v));
  brushInput.value = brushSize;
  brushVal.textContent = brushSize;
}

brushInput.addEventListener('input', () => setBrush(+brushInput.value));

function togglePause() {
  paused = !paused;
  pauseBtn.innerHTML = paused ? '&#9654;' : '&#10074;&#10074;';
}
pauseBtn.addEventListener('click', togglePause);

speedBtn.addEventListener('click', () => {
  speed = speed % 3 + 1;
  speedBtn.textContent = speed + '×';
});

document.getElementById('clear').addEventListener('click', clearSim);
document.getElementById('demo').addEventListener('click', buildScene);
document.getElementById('helpbtn').addEventListener('click', () => helpEl.classList.toggle('hidden'));
document.getElementById('help-close').addEventListener('click', () => helpEl.classList.add('hidden'));
helpEl.addEventListener('click', e => { if (e.target === helpEl) helpEl.classList.add('hidden'); });

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key;
  if (k === ' ') { togglePause(); e.preventDefault(); }
  else if (k === 'c' || k === 'C') clearSim();
  else if (k === 'd' || k === 'D') buildScene();
  else if (k === 'e' || k === 'E') selectElement(EMPTY);
  else if (k === 's' || k === 'S') saveWorld();
  else if (k === 'l' || k === 'L') fileInput.click();
  else if (k === 'h' || k === 'H' || k === '?') helpEl.classList.toggle('hidden');
  else if (k === 'Escape') helpEl.classList.add('hidden');
  else if (k === '[') setBrush(brushSize - 1);
  else if (k === ']') setBrush(brushSize + 1);
  else if (k >= '1' && k <= '9') { const t = TOOLBAR[+k - 1]; if (t) selectElement(t.id); }
  else if (k === '0') { const t = TOOLBAR[9]; if (t) selectElement(t.id); }
});

/* ---------- pointer input ---------- */

function updatePointer(e) {
  const rect = canvas.getBoundingClientRect();
  mx = Math.max(0, Math.min(cols - 1, ((e.clientX - rect.left) / rect.width * cols) | 0));
  my = Math.max(0, Math.min(rows - 1, ((e.clientY - rect.top) / rect.height * rows) | 0));
}

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointerDown = true;
  erasing = e.button === 2;
  updatePointer(e);
  pmx = mx; pmy = my;
  hintEl.classList.add('fade');
});

canvas.addEventListener('pointermove', e => {
  updatePointer(e);
  if (pointerDown) {
    paintLine(pmx, pmy, mx, my, brushSize, erasing ? EMPTY : current);
    pmx = mx; pmy = my;
  }
});

const endStroke = () => { pointerDown = false; erasing = false; };
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
canvas.addEventListener('pointerleave', () => { if (!pointerDown) { mx = my = -1; } });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  setBrush(brushSize + (e.deltaY < 0 ? 1 : -1));
}, { passive: false });

/* ---------- worlds as PNG files ----------
   Each pixel is its element's exact base color, so the save file is
   also a picture of the world. Loading matches colors back to
   elements (nearest-color for foreign images), which means you can
   paint a world in any image editor using the palette in elements.js. */

function encodeWorld() {
  const off = document.createElement('canvas');
  off.width = cols; off.height = rows;
  const octx = off.getContext('2d');
  const oimg = octx.createImageData(cols, rows);
  const ob = new Uint32Array(oimg.data.buffer);
  for (let i = 0; i < grid.length; i++) {
    const [r, g, b] = COLOR[grid[i]];
    ob[i] = pack(r, g, b);
  }
  octx.putImageData(oimg, 0, 0);
  return off;
}

function saveWorld() {
  encodeWorld().toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'elementarium-world.png';
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

const COLOR_TO_ELEM = new Map();
for (let e = 0; e < N_ELEMS; e++) {
  const [r, g, b] = COLOR[e];
  COLOR_TO_ELEM.set((r << 16) | (g << 8) | b, e);
}

function nearestElem(r, g, b) {
  let best = EMPTY, bestD = Infinity;
  for (let e = 0; e < N_ELEMS; e++) {
    const [er, eg, eb] = COLOR[e];
    const d = (r - er) * (r - er) + (g - eg) * (g - eg) + (b - eb) * (b - eb);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function decodeWorld(data, w, h) {
  clearSim();
  const ox = Math.max(0, (cols - w) >> 1), oy = Math.max(0, (rows - h) >> 1);
  const cw = Math.min(w, cols), ch = Math.min(h, rows);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = (y * w + x) * 4;
      if (data[p + 3] < 128) continue; // transparent = empty
      const key = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
      let e = COLOR_TO_ELEM.get(key);
      if (e === undefined) e = nearestElem(data[p], data[p + 1], data[p + 2]);
      if (e !== EMPTY) setCell((oy + y) * cols + (ox + x), e);
    }
  }
}

async function loadWorldFile(file) {
  try {
    const bmp = await createImageBitmap(file);
    const off = document.createElement('canvas');
    off.width = bmp.width; off.height = bmp.height;
    const octx = off.getContext('2d');
    octx.drawImage(bmp, 0, 0);
    const d = octx.getImageData(0, 0, bmp.width, bmp.height);
    decodeWorld(d.data, bmp.width, bmp.height);
  } catch (err) {
    console.error('could not load world:', err);
  }
}

const fileInput = document.getElementById('file');
document.getElementById('save').addEventListener('click', saveWorld);
document.getElementById('load').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadWorldFile(fileInput.files[0]);
  fileInput.value = '';
});
canvas.addEventListener('dragover', e => e.preventDefault());
canvas.addEventListener('drop', e => {
  e.preventDefault();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) loadWorldFile(f);
});

/* ---------- main loop ---------- */

let fps = 0, fpsFrames = 0, fpsLast = performance.now();
let particleCount = 0;

function tick() {
  // self-heal if a resize was missed (e.g. throttled in a background tab);
  // no-op when the size already matches
  fitCanvas(true);
  if (pointerDown) paintBrush(mx, my, brushSize, erasing ? EMPTY : current);
  if (!paused) {
    for (let s = 0; s < speed; s++) stepSim();
  }
  render();

  fpsFrames++;
  const now = performance.now();
  if (now - fpsLast >= 500) {
    fps = Math.round(fpsFrames * 1000 / (now - fpsLast));
    fpsFrames = 0;
    fpsLast = now;
    particleCount = countParticles();
    const hover = (mx >= 0 && my >= 0) ? grid[my * cols + mx] : EMPTY;
    statusLeft.textContent = (ELEM_NAME[current] || '') +
      (hover !== EMPTY ? `  ·  cursor: ${ELEM_NAME[hover]}` : '') +
      (paused ? '  ·  PAUSED' : '');
    statusRight.textContent = `${particleCount.toLocaleString()} particles  ·  ${fps} fps`;
  }
  requestAnimationFrame(tick);
}

awaitingFirstLayout = stage.clientWidth === 0;
fitCanvas(false);
buildScene();
requestAnimationFrame(tick);
