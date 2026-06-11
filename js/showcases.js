'use strict';

/* ============================================================
   Showcases: hand-built scenes that each demonstrate one
   emergent behavior, with a caption explaining what to watch.
   Every build() is scaled to the current grid (cols/rows) so it
   fills whatever window you have. Layouts here are the ones I
   arrived at through a lot of playtesting — see the README's
   "Things to try" and lab reports for the stories behind them.
   ============================================================ */

/* inclusive-corner box; clips to the grid */
function scBox(x0, y0, x1, y1, e) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  for (let y = y0; y <= y1; y++) {
    if (y < 0 || y >= rows) continue;
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x >= cols) continue;
      setCell(y * cols + x, e);
    }
  }
}

/* hollow rectangle of wall thickness th */
function scShell(x0, y0, x1, y1, th, e) {
  scBox(x0, y0, x1, y0 + th - 1, e);
  scBox(x0, y1 - th + 1, x1, y1, e);
  scBox(x0, y0, x0 + th - 1, y1, e);
  scBox(x1 - th + 1, y0, x1, y1, e);
}

/* a packed cluster of e (for breeding founders that must touch) */
function scCluster(cx, cy, n, e) {
  let placed = 0, r = 1;
  while (placed < n && r < 40) {
    for (let dy = -r; dy <= r && placed < n; dy++)
      for (let dx = -r; dx <= r && placed < n; dx++) {
        const x = Math.round(cx) + dx, y = Math.round(cy) + dy;
        if (x >= 0 && x < cols && y >= 0 && y < rows && grid[y * cols + x] === EMPTY) {
          setCell(y * cols + x, e); placed++;
        }
      }
    r++;
  }
}

const SHOWCASES = [
  {
    id: 'weather-jar',
    title: 'A World in a Bottle',
    blurb: 'A sealed glass jar with a lava furnace at one end and a pond at the other, divided by a wall of stone. The stone conducts the heat, the pond simmers against it, and the steam climbs to the cold lid, condenses, and rains back down. A complete water cycle in a box — it runs forever.',
    watch: 'Steam rising off the pond, beading on the ceiling, and falling as rain. The glass roof over the lava keeps the rain from quenching the fire.',
    build() {
      const W = cols, H = rows;
      const x0 = W * 0.10, x1 = W * 0.90, y0 = H * 0.12, yb = H * 0.90;
      scShell(x0, y0, x1, yb, 2, GLASS);
      // lava furnace, left fifth
      const lx0 = x0 + 3, lx1 = W * 0.30;
      scBox(lx0, yb - 2, lx1 + 1, yb - 2, STONE);     // basin floor
      scBox(lx0, yb - 13, lx0 + 1, yb - 3, STONE);    // basin wall
      scBox(lx1, yb - 13, lx1 + 1, yb - 3, STONE);    // hot-plate divider
      scBox(lx0 + 2, yb - 11, lx1 - 1, yb - 3, LAVA);
      scBox(lx0, yb - 14, lx1 + 1, yb - 14, GLASS);   // canopy: shields lava from rain
      // pond, warmed at its left edge by the hot plate
      scBox(lx1 + 2, yb - 2, x1 - 2, yb - 2, STONE);
      scBox(lx1 + 2, yb - 8, x1 - 2, yb - 3, WATER);
    }
  },
  {
    id: 'moat-vs-lava',
    title: 'Two Cabins, One Volcano',
    blurb: 'An identical wooden cabin sits on each side of a lava spill — but the left one has a water moat. When the lava flows, the moat quenches it into a stone seawall, throwing off steam as it goes, and the cabin behind it is spared. The bare cabin on the right has no such luck.',
    watch: 'The moated cabin survives untouched while the lava self-dams into a stone seawall against the water. The exposed cabin is reached by the flow and burns.',
    build() {
      const W = cols, H = rows, gy = H - Math.round(H * 0.06);
      scBox(0, gy, W, H, STONE);
      scBox(0, gy - 2, W, gy - 1, SAND);
      const cabin = cx => { scBox(cx - 5, gy - 8, cx + 5, gy - 1, WOOD); scBox(cx - 3, gy - 6, cx + 3, gy - 1, EMPTY); };
      // Each side: an identical lava pool penned to flow toward a cabin. The
      // only difference is the moat. The moat holds more water than the pool
      // holds lava, so it quenches the whole flow into a stone dam before it
      // can reach the wood.
      const spill = (cx, moat) => {
        scBox(cx - 23, gy - 7, cx - 23, gy - 1, STONE);       // backstop aims the flow
        scBox(cx - 22, gy - 5, cx - 14, gy - 1, LAVA);        // 9 x 5 = 45 lava
        if (moat) scBox(cx - 13, gy - 6, cx - 6, gy - 1, WATER); // 8 x 6 = 48 water
      };
      cabin(W * 0.30); spill(W * 0.30, true);
      cabin(W * 0.74); spill(W * 0.74, false);
    }
  },
  {
    id: 'glassworks',
    title: 'Glassblowing',
    blurb: 'A walled pool of molten lava rests on a dune of sand. Where the two touch, the sand slowly fuses into glass. This is how you mine glass in Elementarium — and unlike wall, glass is something you can make, yet acid cannot eat it and fire cannot burn it.',
    watch: 'Pale blue glass forming along the contact line beneath the molten pool, spreading as the lava settles into the dune.',
    build() {
      const W = cols, H = rows, gy = H - Math.round(H * 0.06);
      scBox(0, gy, W, H, STONE);
      sceneMound(W * 0.5, gy, W * 0.26, H * 0.16, SAND);
      // a walled pool of lava resting on the dune crest; the sand it
      // touches (and sinks into) fuses to glass along the contact line
      const crestY = gy - Math.round(H * 0.16);
      scBox(W * 0.5 - 13, crestY - 10, W * 0.5 - 13, crestY, STONE);
      scBox(W * 0.5 + 13, crestY - 10, W * 0.5 + 13, crestY, STONE);
      scBox(W * 0.5 - 12, crestY - 9, W * 0.5 + 12, crestY, LAVA);
    }
  },
  {
    id: 'oil-fire',
    title: 'Setting the Sea on Fire',
    blurb: 'Oil is lighter than water, so it pools in a slick on the surface — and oil burns eagerly. One spark sets the whole slick alight; the flames feed as the floating oil drifts in, until it has all burned away. The water underneath, though, comes through unharmed.',
    watch: 'The slick going up in a sheet of flame and smoke and burning itself out, while the pond beneath survives completely intact.',
    build() {
      const W = cols, H = rows, gy = H - Math.round(H * 0.06);
      scBox(0, gy, W, H, STONE);
      // a broad basin
      const bx0 = W * 0.16, bx1 = W * 0.84, by = H * 0.42;
      scBox(bx0, by, bx0 + 1, gy, STONE);
      scBox(bx1 - 1, by, bx1, gy, STONE);
      scBox(bx0 + 2, by + 4, bx1 - 2, gy - 1, WATER);
      // a deep slick (4 rows): thick enough that the flame travels along its
      // top instead of being doused by the water the moment it burns through
      scBox(bx0 + 2, by, bx1 - 2, by + 3, OIL);
      scBox(bx0 + 2, by, bx0 + 5, by + 3, FIRE);   // lit at one end
    }
  },
  {
    id: 'the-fuse',
    title: 'Light the Fuse',
    blurb: 'A single thread of gunpowder snakes across the floor to a buried powder keg. Gunpowder pours like sand and sits inert — until fire touches it. Then it detonates, and the blast races down the fuse to the stockpile.',
    watch: 'The spark crawling along the fuse, then the keg going up in a chain of fire and smoke.',
    build() {
      const W = cols, H = rows, gy = H - Math.round(H * 0.06);
      scBox(0, gy, W, H, STONE);
      // the keg: a stone vault packed with gunpowder, far right
      const kx = W * 0.82;
      scShell(kx - 9, gy - 16, kx + 9, gy - 1, 2, STONE);
      scBox(kx - 6, gy - 13, kx + 6, gy - 3, GUNPOWDER);
      // the fuse: a one-pixel trail left along the ground to a far ignition point
      scBox(W * 0.10, gy - 1, kx - 10, gy - 1, GUNPOWDER);
      // the match at the far end
      scBox(W * 0.10, gy - 2, W * 0.10 + 1, gy - 1, FIRE);
    }
  },
  {
    id: 'firebreak',
    title: 'Rot and the Firebreak',
    blurb: 'Fungus creeps through anything living — plant, wood, seed — turning a green forest purple. But it cannot cross water. A thin moat will halt an infection at the waterline, permanently. (Fire stops it too, if you are willing to pay that price.)',
    watch: 'The purple rot spreading through the left grove and stopping dead at the moat, while the right grove stays green.',
    build() {
      const W = cols, H = rows, gy = H - Math.round(H * 0.06);
      scBox(0, gy, W, H, STONE);
      scBox(0, gy - 2, W, gy - 1, SAND);
      // left grove (will be infected)
      for (let k = 0; k < 5; k++) {
        const tx = W * (0.08 + k * 0.06);
        scBox(tx, gy - 12, tx, gy - 1, WOOD);
        sceneDisk(tx, gy - 14, 4, PLANT);
      }
      // the moat (fx, not mx — ui.js owns mx for the pointer)
      const fx = W * 0.46;
      scBox(fx, gy - 4, fx + 4, gy - 1, WATER);
      scBox(fx - 1, gy - 5, fx - 1, gy - 1, STONE);
      scBox(fx + 5, gy - 5, fx + 5, gy - 1, STONE);
      // right grove (protected)
      for (let k = 0; k < 5; k++) {
        const tx = W * (0.60 + k * 0.06);
        scBox(tx, gy - 12, tx, gy - 1, WOOD);
        sceneDisk(tx, gy - 14, 4, PLANT);
      }
      // patient zero, top-left
      sceneDisk(W * 0.08, gy - 16, 2, FUNGUS);
    }
  },
  {
    id: 'the-hunt',
    title: 'Predator and Shelter',
    blurb: 'A predator scents prey within sight and gives chase — it is a lethal hunter. But its sense of smell does not pass through walls. Here, one herd grazes in the open and one shelters behind a pane of glass. Only one herd is still around in a minute.',
    watch: 'The predator running down the exposed herd on the right, while the walled herd on the left grazes on, completely safe behind the glass.',
    build() {
      const W = cols, H = rows, gy = H - Math.round(H * 0.06);
      scBox(0, gy, W, H, STONE);
      scBox(0, gy - 1, W, gy - 1, PLANT); // a grazing meadow
      // a glass partition down the middle
      scBox(W * 0.5, gy - 16, W * 0.5, gy - 1, GLASS);
      // sheltered herd, left
      scCluster(W * 0.25, gy - 3, 8, CRITTER);
      // exposed herd, right
      scCluster(W * 0.70, gy - 3, 8, CRITTER);
      // the hunter, far right
      scCluster(W * 0.90, gy - 3, 2, PREDATOR);
    }
  },
  {
    id: 'boom-bust',
    title: 'Overshoot',
    blurb: 'A small herd, a lush meadow, and a sealed box. Watch a textbook population overshoot: the founding few irrupt into a dense swarm and strip the meadow bare in a feeding frenzy — far past what the land can ever sustain. With the pasture gone, slow starvation sets in and the swarm grinds back down. Carrying capacity, learned the hard way.',
    watch: 'The handful of founders exploding into a swarm and the green vanishing beneath them in a minute or so. Then, with nothing left to graze, the long starving decline.',
    build() {
      const W = cols, H = rows;
      const x0 = W * 0.12, x1 = W * 0.88, y0 = H * 0.18, yb = H * 0.88;
      scShell(x0, y0, x1, yb, 2, WALL);
      scBox(x0 + 2, yb - 4, x1 - 2, yb - 1, PLANT);          // a lush meadow
      scBox(x1 - 7, yb - 4, x1 - 2, yb - 1, WATER);          // only a small puddle
      scCluster(x0 + (x1 - x0) * 0.30, yb - 7, 5, CRITTER);  // a founding herd on the grass
    }
  },
  {
    id: 'sealed-biosphere',
    title: 'Life in a Jar',
    blurb: 'A whole living world sealed under glass: a long pond, plant beds, and a founding herd of critters, with no way in or out. How long can it last? Far longer than you would guess — it will breed, graze and thrive for a very long time. But watch the water level: grazing slowly locks it away, and a sealed world, like a real terrarium, is mortal.',
    watch: 'A stable little ecosystem that holds for thousands of frames. Over a long run the pond slowly shrinks as water becomes plant becomes nothing — the world is alive, but quietly winding down.',
    build() {
      const W = cols, H = rows;
      const x0 = W * 0.06, x1 = W * 0.94, y0 = H * 0.10, yb = H * 0.94;
      scShell(x0, y0, x1, yb, 2, GLASS);
      scBox(x0 + 2, yb - 2, x1 - 2, yb - 2, STONE);          // pond bed
      scBox(x0 + 2, yb - 6, x1 - 2, yb - 3, WATER);          // long shallow pond
      // two planted islands rising out of the water
      const i1 = W * 0.32, i2 = W * 0.66, iw = W * 0.12;
      scBox(i1 - iw / 2, yb - 7, i1 + iw / 2, yb - 6, STONE);
      scBox(i1 - iw / 2, yb - 9, i1 + iw / 2, yb - 8, PLANT);
      scBox(i2 - iw / 2, yb - 7, i2 + iw / 2, yb - 6, STONE);
      scBox(i2 - iw / 2, yb - 9, i2 + iw / 2, yb - 8, PLANT);
      // a clustered founder herd on the first island
      scCluster(i1, yb - 12, 16, CRITTER);
    }
  }
];

const SHOWCASE_BY_ID = {};
for (const s of SHOWCASES) SHOWCASE_BY_ID[s.id] = s;
