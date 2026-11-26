// Peoples of the world (matching the character art: humans, lavender-skinned elves, green-skinned orcs).
// fx are added on top of personal traits. ideo nudges the starting ideology of a nation of that race.
export const RACES = {
  human: { name: 'Humans', adj: 'Human', color: '#f0c9a0', weight: 0.55,
    desc: 'Adaptable and ambitious. Learn quickly and settle anywhere.',
    fx: { learn: 0.1, research: 0.05 }, ideo: {} },
  elf: { name: 'Elves', adj: 'Elven', color: '#b9b4e8', weight: 0.25,
    desc: 'Long-lived, graceful and patient. Love the wild woods; slow to breed and slow to anger.',
    fx: { lifespan: 55, research: 0.12, speed: 0.08, fertility: -0.4, melee: -0.1, glitter: 0.1 }, ideo: { nature: 40, war: 15 } },
  orc: { name: 'Orcs', adj: 'Orcish', color: '#6cc26a', weight: 0.2,
    desc: 'Hardy, fierce and fertile. Born warriors who shrug off wounds, though their scholars are few.',
    fx: { melee: 0.3, hp: 0.2, fertility: 0.5, research: -0.12, lifespan: -14, hunger: 0.2 }, ideo: { war: -40, faith: -10 } },
};
export const RACE_IDS = Object.keys(RACES);
