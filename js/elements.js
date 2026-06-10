'use strict';

/* ============================================================
   Element ids + per-element property tables.
   Plain script (no modules) so the page runs from file://.
   ============================================================ */

const EMPTY = 0;
const WALL = 1;
const SAND = 2;
const WATER = 3;
const STONE = 4;
const OIL = 5;
const FIRE = 6;
const STEAM = 7;
const SMOKE = 8;
const PLANT = 9;
const SEED = 10;
const WOOD = 11;
const ICE = 12;
const SNOW = 13;
const LAVA = 14;
const GLASS = 15;
const ACID = 16;
const GUNPOWDER = 17;
const FUNGUS = 18;
const CRITTER = 19;
const PREDATOR = 20;
const N_ELEMS = 21;

/* Flammability: chance out of 255 that one burning neighbor
   ignites this cell on a given frame. 0 = doesn't burn. */
const FLAM = new Uint8Array(N_ELEMS);
FLAM[OIL] = 60;
FLAM[PLANT] = 30;
FLAM[SEED] = 35;
FLAM[WOOD] = 5;
FLAM[FUNGUS] = 22;
FLAM[GUNPOWDER] = 255; // handled specially: explodes

/* Liquid density. 0 = not a liquid. Heavier sinks below lighter. */
const DENS = new Uint8Array(N_ELEMS);
DENS[OIL] = 1;
DENS[ACID] = 2;
DENS[WATER] = 3;
DENS[LAVA] = 4;

/* Liquid horizontal dispersion: how far a blocked liquid scans
   sideways per step. Bigger = runnier. */
const DISP = new Uint8Array(N_ELEMS);
DISP[WATER] = 5;
DISP[ACID] = 4;
DISP[OIL] = 3;
DISP[LAVA] = 1;

/* Cells acid cannot dissolve. */
const ACID_PROOF = new Uint8Array(N_ELEMS);
ACID_PROOF[EMPTY] = ACID_PROOF[WALL] = ACID_PROOF[GLASS] = ACID_PROOF[ACID] = 1;
ACID_PROOF[FIRE] = ACID_PROOF[SMOKE] = ACID_PROOF[STEAM] = ACID_PROOF[LAVA] = 1;

/* Structural cells that block a predator's line of scent — the things
   you'd build a barrier from. Sand and powders are porous; gases and
   liquids are see-through. */
const SCENT_COVER = new Uint8Array(N_ELEMS);
SCENT_COVER[WALL] = SCENT_COVER[STONE] = SCENT_COVER[GLASS] = 1;
SCENT_COVER[WOOD] = SCENT_COVER[ICE] = 1;

/* Base color [r,g,b] and shade variation per element. */
const COLOR = [];
const VARY = new Uint8Array(N_ELEMS);

function defColor(id, r, g, b, vary) {
  COLOR[id] = [r, g, b];
  VARY[id] = vary;
}

defColor(EMPTY,      13,  16,  22,  0);
defColor(WALL,       90,  95, 107,  7);
defColor(SAND,      216, 184,  99, 22);
defColor(WATER,      44, 110, 196, 12);
defColor(STONE,     121, 125, 131, 14);
defColor(OIL,        98,  89,  44,  9);
defColor(FIRE,      255, 110,  40,  0); // animated, see render()
defColor(STEAM,     186, 202, 216,  8);
defColor(SMOKE,      80,  80,  88, 10);
defColor(PLANT,      58, 156,  74, 26);
defColor(SEED,      164, 199,  88, 18);
defColor(WOOD,      133,  94,  50, 16);
defColor(ICE,       168, 216, 238, 10);
defColor(SNOW,      238, 246, 255,  7);
defColor(LAVA,      226,  88,  34,  0); // animated
defColor(GLASS,     186, 222, 228,  6);
defColor(ACID,      152, 220,  34, 14);
defColor(GUNPOWDER,  64,  62,  70, 10);
defColor(FUNGUS,    152,  88, 178, 26);
defColor(CRITTER,   236, 110, 160, 18);
defColor(PREDATOR,  198,  40,  56, 16);

/* Toolbar entries, in display order. Hotkeys 1..0 cover the
   first ten; E selects the eraser. */
const TOOLBAR = [
  { id: SAND,      name: 'sand' },
  { id: WATER,     name: 'water' },
  { id: WALL,      name: 'wall' },
  { id: FIRE,      name: 'fire' },
  { id: PLANT,     name: 'plant' },
  { id: SEED,      name: 'seed' },
  { id: WOOD,      name: 'wood' },
  { id: OIL,       name: 'oil' },
  { id: LAVA,      name: 'lava' },
  { id: GUNPOWDER, name: 'gunpowder' },
  { id: STONE,     name: 'stone' },
  { id: ICE,       name: 'ice' },
  { id: SNOW,      name: 'snow' },
  { id: ACID,      name: 'acid' },
  { id: FUNGUS,    name: 'fungus' },
  { id: CRITTER,   name: 'critter' },
  { id: PREDATOR,  name: 'predator' },
  { id: GLASS,     name: 'glass' },
  { id: STEAM,     name: 'steam' },
  { id: EMPTY,     name: 'eraser' },
];

const ELEM_NAME = [];
for (const t of TOOLBAR) ELEM_NAME[t.id] = t.name;
ELEM_NAME[SMOKE] = 'smoke';
ELEM_NAME[EMPTY] = 'empty';
