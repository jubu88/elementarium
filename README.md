# Elementarium

*A tiny alchemy sandbox — Claude's idea.*

This project started with an open brief: "build whatever sounds interesting to you."
What I find most interesting is **emergence** — a handful of dumb local rules producing
behavior nobody wrote. So this is a falling-sand toy: every pixel is a particle, every
particle knows only its neighbors, and all the good stuff (rainstorms, wildfires,
glassblowing) falls out of the interactions.

## Run it

Double-click `index.html`. That's the whole install — no build step, no dependencies,
no server. Plain HTML/CSS/JS.

## Play

- **Draw** with the left mouse button, **erase** with the right.
- **Scroll** (or `[` / `]`) changes brush size. **Space** pauses. `C` clears, `D` rebuilds the demo scene, `H` opens help.
- Number keys `1`–`0` pick the first ten elements.

## The elements

| | |
|---|---|
| **sand** | falls, piles, sinks in liquid. Lava fuses it into **glass**. |
| **water** | flows, quenches fire and lava, freezes near ice, boils into steam |
| **steam** | rises, cools on ceilings, condenses and rains back down |
| **fire** | spreads to anything flammable, licks upward, dies into smoke |
| **oil** | floats on water; very flammable |
| **lava** | viscous, ignites what it touches; water turns it to stone |
| **plant / seed** | seeds sprout near water; plants drink water and grow |
| **wood** | structural, burns slow and long |
| **ice / snow** | ice creeps through water; snow drifts down and melts |
| **acid** | dissolves nearly everything — but not glass or wall |
| **gunpowder** | pours like sand until something lights it |
| **fungus** | creeps over plants and wood; flammable, fortunately |
| **stone** | falls straight down, stacks into pillars; conducts heat from lava (glows, boils water it touches) |
| **critter** | a one-pixel herbivore: walks, climbs, grazes plants and seeds, flees smoke *and predators*, won't step into water (but can drown), breeds when well fed, starves back into a seed |
| **predator** | hunts critters: scents them within sight, gives chase, kills on contact. Faster than prey, breeds slowly, starves fast — and also returns to the soil as a seed |
| **wall / glass** | indestructible / acid-proof scenery |

## Things to try

1. Build a weather jar. Pouring water straight onto lava is a one-shot storm — every
   raindrop quenches a lava cell and the rain murders its own engine in seconds
   (I learned this the hard way). For *perpetual* weather: glass box, lava pit and
   pond separated by a stone divider (stone conducts heat — watch it glow), and a
   glass canopy over the pit so rain sheds into the pond instead. Runs forever.
2. Lay a one-pixel gunpowder fuse to a powder keg and light the far end.
3. Pour oil on a pond, then drop one pixel of fire on it.
4. Drip lava onto a dune and harvest the glass.
5. Let fungus loose in a forest, then decide whether the cure (fire) is worse.
   (Tested: fungus also cannot cross water. A moat froze my plague at exactly
   the waterline, forever.)
6. Lava respects exactly one thing: water. Dig a moat — the flow quenches into
   a stone seawall, and the boiled-off steam rains back down to refill the ditch.
   (Tested with two cabins. The moated one survived untouched; the other is now
   a glass parking lot.)
7. Volcanism here is *effusive*, never explosive: stone sinks through liquid, so
   buried magma chambers are impossible and blast tunnels self-seal by cave-in
   (discovered over three failed eruptions). Build an open caldera with a lava
   lake, then breach the rim — or just overfill it.
8. Ranch critters: a sealed box, a plant meadow, a pond, two founders. Watch a
   textbook population overshoot — two critters became 116 in my test, deforested
   the box, and crashed. Starved critters become seeds; survivors scavenge the
   seeds; seeds near water sprout. The box oscillates. Carrying capacity is real
   and it is measured in pondweed.
9. Add a predator and you have a food chain. Fair warning, from a lot of testing:
   a sealed predator-prey world does **not** settle into tidy oscillating cycles —
   it overshoots and collapses, usually to a near-dead stalemate. (Why is below.)
   The fun is in the chase and the crash, not in a stable balance.

## What the ecosystem actually does (an honest lab report)

I tried hard to coax classic predator-prey *cycles* out of this world and couldn't —
and the reasons turned out to be the interesting part:

- **Movement is diffusion-limited.** Critters wander, they don't migrate toward
  food; that makes grazing and mate-finding both random-encounter processes.
- **Breeding is density-dependent (an Allee effect).** You need a neighbor of your
  own kind to reproduce. Pack critters together and they irrupt from 16 to 100+;
  spread those same 16 across a big marsh with *unlimited* food and they sit there,
  never breeding, because they never bump into each other.
- **So closed worlds overshoot and collapse.** Prey strip their food faster than it
  regrows, predators feast on the glut, then both crash. At low density nobody can
  find a mate to recover, and the world deadlocks at a few survivors.

Predators *do* get a directed sense — they scent prey within sight and give chase —
which makes them lethal, legible hunters when you drop one into a herd. I left the
prey on a pure random walk on purpose: the asymmetry (hunters seek, grazers drift)
is what makes a predator feel like a predator. None of this is scripted; it all
falls out of four rules per critter. A stable balance would need a spatial refuge
or directed foraging — good future experiments.

## Worlds are PNG files

**Save** writes the world as a PNG where every pixel is its element's exact
palette color — the save file is also a picture of the world. **Load** (or drop
any image onto the canvas) maps colors back to elements, using nearest-color for
images that weren't saved by Elementarium.

Which means: you can *paint a world in any image editor* using the palette in
`js/elements.js`, save it as PNG, and drop it in. You can also share worlds as
ordinary images — if you can see it, you can run it.

## How it works

The world is a `Uint8Array` of element ids (plus parallel arrays for per-cell shade
and lifetime), scanned bottom-up each frame with alternating sweep direction so piles
don't lean. Rendering writes one `Uint32` per cell into an `ImageData` buffer from
precomputed palettes; the canvas is scaled up with `image-rendering: pixelated` for
the chunky look. Everything interesting is in `js/sim.js` — each element's behavior
is a short function, and new elements are easy to add: pick an id, a color, and write
an `update` case.

## Put it online

The whole thing is static files — any static host works as-is:

- **GitHub Pages**: push this repo, then Settings → Pages → deploy from `main`, root.
- **Netlify / Cloudflare Pages**: drag the folder onto their dashboard, done.
- **itch.io**: zip the folder, upload as an HTML game (`index.html` as the entry).

No build step, no dependencies, nothing to configure.

## Ideas for later

- Wind, or a fan element
- Salt + water → brine; electricity arcing along metal
- Directed foraging or a spatial refuge — the missing ingredient for a *stable*
  food chain instead of overshoot-and-collapse (see the lab report above)
- Fish and fireflies — water and air deserve inhabitants too
- A pressure model, so this world can finally have explosive volcanism
- Sound: fire crackle, rain hiss, the pop of a powder keg
