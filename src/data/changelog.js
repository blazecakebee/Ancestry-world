// Update log — newest first. Shown in-game (Main menu → What's New) and mirrored in CHANGELOG.md.
// tags: 'new' | 'improved' | 'fixed' | 'balance'
export const CHANGELOG = [
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
