# ✦ Ancestry World

A browser-based, **co-op pixel-art god simulator** inspired by WorldBox and RimWorld.
Guide a people from cavemen around a campfire to orbital stations and colony arks —
watching every single citizen live, love, work, fight, get sick and dream along the way.

You are a **Patron Deity**, not a dictator: your citizens are autonomous. You shape them through
**Glitter** (devotion) powered miracles, ideology, laws, planned buildings and — when you want to —
by **possessing** a citizen and walking among them.

---

## Quick start

```bash
npm install
npm start            # → http://localhost:8080
```

Requires Node 18+. Open the URL in a modern desktop browser (Chrome, Edge, Firefox, Safari).

**Play online:** https://blazecakebee.github.io/Ancestry-world/ (GitHub Pages — no install needed).

### Playing with friends (co-op)

1. Open the game (the GitHub Pages link or your local copy).
2. **Multiplayer → Host new world**. You get a 6-letter **invite code**.
3. Friends anywhere open the same link, choose **Multiplayer → Join**, and enter the code.

Co-op is **peer-to-peer over WebRTC (PeerJS)**, just like Fading Ink and Nectar's End, so it works straight
from GitHub Pages. The host's browser runs the authoritative simulation (keep that tab open), so everyone
shares **one global clock** — time, seasons, speed and pause are the same for all players.

Prefer your own server? `npm start` also runs a WebSocket relay; open the game with `?relay` to use it.
`?peerhost=…&peerport=…` points PeerJS at your own PeerJS server.

> **Consent is built in:** nobody can cast miracles on your land, plan buildings in your cities, or possess
> your citizens unless you grant them that permission (Nation → Permissions). Wars between nations are
> fought by mortals only — divine powers never touch another player's nation without consent.

---

## What's in the game

**World**
- Procedural spherical globe (seamless east–west wrap): tectonic continents, mountains, volcanic rifts,
  rivers, lakes, archipelagos, polar ice and 18 biomes.
- **Seamless zoom**: individual citizens → regional map with borders, armies and storms → rotating pixel-art
  planet with day/night and city lights → outer space with the moon, satellites, stations and colony arks.
- **Planetary atmosphere simulation** (inspired by RimWorld's *Atmosphere Overhaul*): pressure-driven wind
  with Coriolis deflection, heat and moisture carried on the wind, evaporation and condensation, orographic
  rain, and emergent thunderstorms, **tropical cyclones**, blizzards, snowfall and dust storms.
  Lightning starts fires; strong gusts knock people over.
- **Surface water physics** (rain pools, runs downhill and floods fields) and **wildfire** that spreads downwind.
- Day/night cycle, seasons, snow cover, cloud shadows, aurora, eclipses, meteors, earthquakes and eruptions.
- **World Ages** (Hope, Sun, Dark, Tears, Ice, Ash, Chaos, Wonders, Despair) that reshape the whole planet.

**People (RimWorld-style, one by one)**
- Every citizen is an individual: name, family line, race (Humans, Elves, Orcs), sex, age, skills with passions,
  40+ stackable traits (Genius, Zealot, Pyromaniac, Giant, Star-Blessed…), needs, a mood built from thoughts,
  relationships, romance, marriage and children who inherit traits.
- Health: body-part injuries, bleeding, infection, diseases racing against immunity, pain, hospitals,
  doctors, medicine tiers by era, hypothermia & heatstroke.
- Mental breaks (sad wandering, binges, tantrums, berserk, fire-starting sprees), inspirations, catharsis.
- Jobs chosen by need, skill and passion: foraging, fishing, hunting, farming, cooking & **preserved rations**,
  building, mining, research, crafting era gear, worship, preaching, doctoring, firefighting, patrols.
- **Verlet ragdolls** for deaths, blasts, heavy blows, gusts and quakes.
- **Possession**: take direct control of one of your people (WASD to move, F to act or attack, R to release).

**Civilizations**
- 10 eras from **Stone Age → Neolithic → Bronze → Iron → Medieval → Renaissance → Industrial → Atomic →
  Ultra-Tech → Offworld**. Clothes, armor, weapons, buildings, food and medicine all change with the era.
- Governments (Tribal Council → Chiefdom → Monarchies, Theocracy, Oligarchy, Republic, Technocracy,
  Commune, Stellar Empire) with succession rules; five ideology axes; laws & decrees (rations, focus,
  conscription, raids).
- AI nations everywhere: they expand, ally, declare wars, raid and conquer. Unhappy citizens **migrate**, discontented
  factions **flee to found their own AI nations**, distant cities **rebel**, and nomad bands settle the wilds.
- A storyteller: traders, wanderers, plagues, blights, heat waves, cold snaps, marauders, maddened animal packs,
  festivals, smog, strikes, reactor scares, solar flares, rogue AIs, orbital debris…
- Space program: satellites, orbital stations, lunar mining bases and colony arks.
- Custom **flags**: design your banner once your first settlement stands.

**Divine powers (never overpowered)** — 16 powers in 3 devotion tiers, e.g. *Inspire Idea, Fertile Rain,
Minor Healing, Golden Harvest, Ideological Revelation, Ore Blessing, Tectonic Sculpting, Divine Avatar,
Orbital Shielding, Prophecy*. All cost Glitter and have cooldowns.

**Interface**
- Modern glass UI, 6 themes (Celestial Glitter, Astral Void, Chronicle Parchment, Bio-Canopy Emerald,
  Cyber-Orbital Cyan, High-Contrast Slate), ultrawide-friendly HUD, draggable & resizable inspector windows,
  a quick interactive tutorial, the Lore & Trait Codex, custom pixel cursors and synthesized SFX for everything.
- Settings include all 20 QoL options: UI scale, text size, ultrawide edge padding, smart auto-pause, speed presets,
  rolling autosaves, edge scroll & sensitivities, zoom-to-cursor, overlay hotkeys, pinned citizens with death alerts,
  feed filters, tooltip delay, colour-blind palettes, shake/flash intensity, particle density, background FPS limit,
  pixel snapping, six audio channels, a full keybind matrix with conflict detection, and Stream-Safe mode.

---

## Controls (defaults — all remappable)

| Action | Key |
|---|---|
| Pan | Drag, WASD / arrows |
| Zoom (citizen → planet → space) | Mouse wheel, `=` / `-` |
| Pause · speeds | `Space` · `1`–`5` |
| Inspect · plan building · nation · codex · settings | `Q` · `B` · `N` · `C` · `O` |
| Map overlays (borders, ideology, Glitter, trade, weather, wind, temperature, pressure, humidity, races) | `F1`–`F10` |
| Possessed citizen: move · act · release | WASD · `F` / click · `R` |
| Chat (co-op) | `Enter` |
| Jump to capital | `H` |

---

## Project layout

```
index.html               entry page
styles/main.css          UI + 6 themes
server/server.js         static server + multiplayer relay (rooms, invite codes, rate limiting)
src/main.js              app: boot, loop, input, possession, power targeting, audio hooks, autosave
src/core/                rng, noise, utilities (DOM-free)
src/data/                eras, traits, races, buildings, powers, society (skills/gov/ideology/thoughts), lore
src/world/               worldgen (spherical noise), atmosphere (wind/pressure/storms), physics (water, fire)
src/sim/                 game loop, pawns, AI jobs, health, combat, animals, nations, war, events, commands
src/net/                 session (single/host/client), snapshots & saves
src/render/              renderer (surface/regional/globe/space), LPC compositor, tiles, buildings,
                         ragdolls, effects, globe, icons, flags
src/audio/audio.js       synthesized SFX, ambience, soundtrack & generative era music
src/ui/                  HUD, inspectors, menus, settings, tutorial, cursor, storage (IndexedDB)
assets/packs/lpc/        Universal LPC character layers (see credits)
assets/music/            soundtrack (see credits)
tools/                   build_character_pack.py (optional alternate character pack)
tests/                   headless simulation test + co-op network test (`npm test`)
```

All simulation code is DOM-free, so it runs headless in Node for tests (`npm test`).

### Optional alternate character pack
`tools/build_character_pack.py` can turn a folder of 4-direction 64×64 character sprites into
`assets/packs/characters/` (atlas, material mask and tags). It is ignored by git because the source
dataset's license is unknown — check it before publishing. Choose it under *Settings → Display → Character art*.

---

## Credits & licenses

- **Characters:** [Universal LPC Spritesheet](https://github.com/makrohn/Universal-LPC-spritesheet) by the
  Liberated Pixel Cup contributors — dual licensed **CC-BY-SA 3.0** / **GPL 3.0**. Full author list in
  `assets/packs/lpc/AUTHORS.txt`. Derivative art from these layers is shared under the same terms.
- **Music:** *"8 Bit Videogame Music No Copyright"* by **Lofi Elephant** — https://youtube.com/@lofielephant
  (free to use with attribution).
- Terrain, buildings, animals, icons, cursors, effects, sound effects and generative music are procedurally generated
  by the game's code.
- Mechanics inspired by *WorldBox* (Maxim Karpenko) and *RimWorld* (Ludeon Studios); the planetary air simulation is
  inspired by the RimWorld mod *Atmosphere Overhaul*. No assets from those games are used.

## Roadmap ideas
Boats and naval trade, vehicles and mechs on the map, deeper offworld gameplay (visiting moon colonies),
caravans between nations, more animal species and taming, deeper religion/culture systems, mod support.
