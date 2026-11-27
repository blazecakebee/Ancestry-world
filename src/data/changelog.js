// Update log — newest first. Shown in-game (Main menu → What's New) and mirrored in CHANGELOG.md.
// tags: 'new' | 'improved' | 'fixed' | 'balance'
export const CHANGELOG = [
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
