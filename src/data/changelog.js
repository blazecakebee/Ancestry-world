// Update log — newest first. Shown in-game (Main menu → What's New) and mirrored in CHANGELOG.md.
// tags: 'new' | 'improved' | 'fixed' | 'balance'
export const CHANGELOG = [
  {
    version: '0.6.0', date: '2026-11-27', title: 'Creeds, bigger worlds, 31 new powers and a new Codex',
    notes: [
      ['new', 'Creeds replace Divine Will: every nation holds a few Ideals (Spiritual, Pacifist, Industrialist, Stewardship...), six Precepts (war, toil, land, the dead, outsiders, knowledge) and rites it performs on its own. Certainty rises and falls with prophets, temples and happiness; low certainty brings doubt, conversion to rival creeds, or a schism. Revelation restores certainty and lets you reform at once.'],
      ['improved', 'The Nation window is larger and the Creed & Will tab is laid out with ideal cards, precept selectors, rituals and tendency bars.'],
      ['new', '31 new powers across every tab: Benediction, Gift of Tongues, Consecration, Great Awakening, Grove of Life, Rainbow, Wetland, Oasis, Vigor, Muse, Manna, Wild Boar, Camels, Elephants, Woolly Mammoth, War Horn, Thunderclap, Holy Wrath, Nightmares, Lightning Strike, Heat Wave, Cold Snap, Wildfire, Acid Rain, Madness, Raise Island, Flood, Earthquake, Meteor, Tsunami and Volcano. Each has its own icon.'],
      ['balance', 'New powers are priced between the old tiers (small gifts 14-30 Glitter, wonders 45-140, big disasters 240-330) and the heavy ones rest for 8-20 days. Harmful powers only touch wild land, your own land, or nations that granted you miracles; war powers only hurt people at war with you.'],
      ['improved', 'Co-op: every new power runs on the host like the rest, so the results (terrain, buildings, creatures, moods, cooldowns, Glitter) reach every player in sync.'],
      ['new', 'Bigger worlds: Small, Normal, Large and Huge planets (up to 1536x768), with more starting nations as the planet grows.'],
      ['new', 'World generation archetypes (Pangaea, archipelago, twin continents, ice age, water world, and more) with randomised ice caps, climate, rivers, lakes and volcanoes, so no two worlds look alike.'],
      ['improved', 'Coastlines are smoothed: shores curve in rounded bays and headlands with a sand and foam fringe instead of stair-steps where land meets water.'],
      ['improved', 'The Codex is rebuilt as a sidebar reference with icons, searchable cards and filters: Welcome, Powers (by tab and tier), Creeds, Traits, Races, Eras, Governments, World Ages, Biomes and Credits.'],
    ],
  },
  {
    version: '0.5.0', date: '2026-11-27', title: 'Mountains, new lands and moonlight',
    notes: [
      ['new', 'Mountain ranges: tall chunky peaks with snow caps rise out of the high ground, and hill-shading makes every slope, ridge and valley read at a glance across the whole map.'],
      ['new', '10 new biomes: Steppe, Red Badlands, Blossom Grove, Autumn Woods, Temperate Rainforest, Mangrove Coast, Salt Flats, Alpine Meadow, Ashlands (around volcanic rifts) and Glowcap Fen. Each has its own ground art, trees, wildlife and resources.'],
      ['improved', 'Smarter world generation: warped coastlines, mountain chains that grow along ridge lines inland, foothills that step down from the peaks, island arcs off the continents, patchier biome regions and a smoothing pass that removes lone speckle tiles.'],
      ['improved', 'Land borders blend softly into each other instead of stair-stepping, and all trees are now recolours of the existing tree sprites (autumn reds, blossom pinks, redwood greens, frosted, ashen...).'],
      ['new', 'Dynamic lighting: a golden-hour glow at sunrise and sunset, deep blue nights, flickering fires, and people carrying a little light after dark.'],
      ['new', 'Possession actions: punch, swing, chop, mine, harvest and talk. Pick one with the action bar or keys 1-7, then press F or click. You never harm your own people or another deity\'s.'],
      ['new', 'Cloud saves only list Ancestry World saves. Start with a founding pair (or a small family or full band) of a random race. Farm and Wild creature tabs, and a themed scrollbar on the power dock.'],
      ['improved', 'Pausing now freezes every animation. The zoom out to the planet is slower and ends with a planet-reveal animation, and the flat map is shown once instead of repeating.'],
      ['fixed', 'Removed stray dark dashes on the grass, half-cut bushes at chunk edges and the floating clotheslines.'],
    ],
  },
  {
    version: '0.4.1', date: '2026-11-27', title: 'Tidier clouds, less moon',
    notes: [
      ['fixed', 'Cloud Saves now lists only Ancestry World saves. Files from other games that share the same Google Drive app folder are no longer shown.'],
      ['improved', 'The two distant grey planets behind the globe are recoloured (rusty desert world and glacial blue ice world) so they no longer look like the moon.'],
    ],
  },
  {
    version: '0.4.0', date: '2026-11-27', title: 'Banners, clouds and a fresh coat of icons',
    notes: [
      ['new', 'Google sign-in and Cloud Saves (main menu): saves are copied into a private app folder in your own Google Drive, so you can pick up your worlds on any device. Auto-sync on every save/autosave, or upload/download/delete by hand.'],
      ['new', 'Flag designer: 32 patterns (up from 13) and about 60 emblems (up from 13), plus emblem position (centre, hoist, canton, fly), three sizes, emblem outline, mirrored patterns and a "Surprise me" button.'],
      ['new', 'Ducks join the creatures: a new power, plus ducklings, with new Modern Farm art.'],
      ['new', 'More Modern Farm art in play: calves, lambs, piglets, kids, bunnies, chicks, foals and ducklings now appear in herds; roosters and many more coat colours for every animal; 18 crop types (corn, tomatoes, grapes, pineapples, pumpkins and more) with tall plants grow on farms.'],
      ['new', 'Animated main-menu quote under the title: "When everything is wrong, being hopeful is a rebellion." — the words rise out of a blur one by one, the last ones glow gold and a light sweep loops across it.'],
      ['improved', 'The main menu is centred over the globe and laid out in tiers: Continue/Singleplayer on top, then Multiplayer, Load and Cloud Saves, then Codex, Settings and What\'s New.'],
      ['improved', 'Every sidebar, dock, overlay, menu and HUD icon now uses crisp outlined icons from Pixel Atlas (CC0): globe, cloud, gear, floppy disk, magnifier, flags, resources and more. The toolbar is slightly wider so labels fit.'],
    ],
  },
  {
    version: '0.3.0', date: '2026-11-27', title: 'A prettier, bigger world',
    notes: [
      ['new', 'New art from the Gandalf, Pixel Fire, VerArc and Super Pixel Effects packs: layered characters (humans, elves and orcs kept), trees, pets and slimes, tents, campfires and props.'],
      ['new', 'LimeZu Modern Farm art: animated cows, sheep, dogs, cats and donkeys (horses) walk and idle; real crop plants with growth stages on farms; distant solar-system planets (lava, ice, barren, terran, black hole) behind the globe.'],
      ['new', 'Powers play animated Super Pixel Effects bursts in their own colour; each creature power has its own VerArc icon; portraits use the new characters; credits updated.'],
      ['new', 'Five new creature powers: cows, pigs, goats, chickens and rabbits.'],
      ['new', 'Waves-style sea: rolling shore foam, wet-sand wash, wave glints, whales, dolphins, rays, jellyfish, fish shoals and gulls.'],
      ['new', 'Lots more grass tufts, bushes, pebbles and boulders across the land.'],
      ['new', '30 more god powers, creature spawning, and skill/buff icons on every power. Cursor takes the colour of the armed power and previews its radius.'],
      ['new', 'Continue button for your latest save, autosave, and a "new update is out" banner with a reload button.'],
      ['new', 'Nation colour is now a simple colour wheel. Left toolbar shows labels. Bottom bar is split into sections.'],
      ['new', 'Passive trickle of glitter from your people.'],
      ['improved', 'Buildings drawn much bigger than before; creatures and pawns scaled up so they read at a glance.'],
      ['improved', 'Real smoke and Pixel Fire flames replace the old burning-tree puffs.'],
      ['improved', 'The moon is rebuilt with Deep-Fold\'s PixelPlanets shader (dithered lighting, craters); the planet gets dithered pixel-art lighting, ocean glints and an atmosphere rim. Zooming out bends the flat map into the globe gradually.'],
      ['improved', 'Notifications for important events; the Chronicle is smaller and keeps the minor lore.'],
      ['improved', 'Rain, thunder and ambience are much quieter; thunder flashes are rarer and gentler.'],
      ['fixed', 'Flag icon and trait tooltip no longer flicker; the tutorial card stays on screen.'],
    ],
  },
  {
    version: '0.2.1', date: '2026-11-26', title: 'The Chronicle of Updates',
    notes: [
      ['new', 'Update Log: see every change from the main menu ("What\'s New"), with a badge when something new has landed.'],
      ['new', 'CHANGELOG.md in the repository mirrors the in-game log.'],
      ['new', "What's New is also in the in-game pause menu."],
      ['fixed', 'Optional panels no longer show a stray "null" (New Globe screen, citizen inspector).'],
    ],
  },
  {
    version: '0.2.0', date: '2026-11-26', title: 'Play together, anywhere',
    notes: [
      ['new', 'Peer-to-peer co-op over WebRTC (PeerJS) — host and join straight from the GitHub Pages link, no server needed.'],
      ['improved', 'Clearer messages when an invite code is wrong or the host has closed their tab.'],
      ['improved', 'The Node relay server is still available with ?relay for self-hosting.'],
    ],
  },
  {
    version: '0.1.1', date: '2026-11-26', title: 'Online at last',
    notes: [
      ['new', 'Playable on GitHub Pages: blazecakebee.github.io/Ancestry-world'],
      ['fixed', 'Static files are served as-is on Pages (.nojekyll).'],
    ],
  },
  {
    version: '0.1.0', date: '2026-11-26', title: 'The first campfire',
    notes: [
      ['new', 'Procedural spherical globe with 18 biomes, rivers, lakes, archipelagos, volcanic rifts and polar ice.'],
      ['new', 'Seamless zoom from a single citizen to the regional map, the rotating planet and outer space.'],
      ['new', 'Planetary atmosphere simulation: pressure-driven wind, Coriolis, cyclones, thunderstorms, blizzards and dust storms.'],
      ['new', 'Surface water that pools and floods, wildfires that spread downwind, snow cover, day/night and seasons.'],
      ['new', 'RimWorld-style citizens: traits, skills & passions, needs, moods, injuries, diseases, hospitals, romance and families.'],
      ['new', 'Three races — Humans, Elves and Orcs — drawn with animated Universal LPC layered characters.'],
      ['new', 'Era clothing, armor and weapons from the Stone Age to Offworld; Verlet ragdolls for falls, blasts and deaths.'],
      ['new', 'Ten eras, governments with succession, five ideology axes, laws, diplomacy, wars, raids and conquest.'],
      ['new', 'Living AI world: migrations, exiles founding new nations, rebellions, nomads and marauders.'],
      ['new', '16 Glitter-powered divine powers in three devotion tiers — never overpowered.'],
      ['new', 'Possess any of your citizens and walk among your people.'],
      ['new', 'Co-op with a shared global clock and consent-based permissions between deities.'],
      ['new', 'Modern UI with six themes, all 20 QoL settings, tutorial, Codex, custom cursors, SFX and soundtrack.'],
    ],
  },
];
export const CURRENT_VERSION = CHANGELOG[0].version;
