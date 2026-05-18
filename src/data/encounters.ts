// AD&D 2e random encounter tables derived from DMG Chapter 11 (Tables 11A-11K).
// Weights are proportional to encounter frequency in the source tables.
// "monster" names match MONSTERS in monsters.ts where possible; others are
// generated with fallback hd/hp for HP rolling.

import { MONSTERS, rollHD } from './monsters.ts';
import type { MonsterTemplate } from './monsters.ts';

// -- Types --------------------------------------------------------------------

export interface EncounterEntry {
  monster: string;
  number: string;   // dice expression: "2d6", "1d4+2", "1", etc.
  weight: number;   // relative probability (higher = more common)
  hd?: string;      // HD for HP rolling when monster is not in the library
  hp?: number;      // fallback typical HP when not in library
}

export interface TerrainTable {
  id: string;
  label: string;
  entries: EncounterEntry[];
}

export interface GeneratedEncounter {
  name: string;
  count: number;
  countExpr: string;
  template: MonsterTemplate | null;
  hd: string | null;
  hp: number | null;
}

// -- Dice roller for number-appearing expressions ------------------------------

export function rollCount(expr: string): number {
  const simple = /^(\d+)$/.exec(expr.trim());
  if (simple) return parseInt(simple[1], 10);

  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(expr.trim());
  if (m) {
    const num = parseInt(m[1], 10);
    const sides = parseInt(m[2], 10);
    const mod = m[3] ? parseInt(m[3], 10) : 0;
    let total = 0;
    for (let i = 0; i < num; i++) total += Math.floor(Math.random() * sides) + 1;
    return Math.max(1, total + mod);
  }
  return 1;
}

// -- Weighted random selection ------------------------------------------------

function weightedRandom(entries: EncounterEntry[]): EncounterEntry | null {
  if (entries.length === 0) return null;
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const entry of entries) {
    r -= entry.weight;
    if (r <= 0) return entry;
  }
  return entries[entries.length - 1];
}

// -- Generator ----------------------------------------------------------------

export function generateEncounter(terrainId: string): GeneratedEncounter | null {
  const table = ENCOUNTER_TABLES.find((t) => t.id === terrainId);
  if (!table) return null;

  const entry = weightedRandom(table.entries);
  if (!entry) return null;

  const count = rollCount(entry.number);
  const template = MONSTERS.find(
    (m) => m.name.toLowerCase() === entry.monster.toLowerCase(),
  ) ?? null;

  return {
    name: entry.monster,
    count,
    countExpr: entry.number,
    template,
    hd: template ? template.hd : (entry.hd ?? null),
    hp: template ? template.hp : (entry.hp ?? null),
  };
}

/** Roll HP for one instance of the generated encounter monster. */
export function rollEncounterHp(enc: GeneratedEncounter): number {
  if (enc.template) return rollHD(enc.template.hd);
  if (enc.hd) return rollHD(enc.hd);
  return enc.hp ?? 4;
}

// -- Encounter tables ---------------------------------------------------------

export const ENCOUNTER_TABLES: TerrainTable[] = [
  // ── Arctic / Subarctic ───────────────────────────────────────────────────────
  {
    id: 'arctic', label: 'Arctic / Subarctic',
    entries: [
      { monster: 'Wolf',                    number: '2d6',    weight: 5 },
      { monster: 'Dire Wolf',               number: '1d4',    weight: 4 },
      { monster: 'Polar Bear',              number: '1d2',    weight: 4 },
      { monster: 'Cave Bear',               number: '1d2',    weight: 2 },
      { monster: 'Winter Wolf',             number: '1d6',    weight: 4, hd: '3+3', hp: 17 },
      { monster: 'Yeti',                    number: '1d4',    weight: 3, hd: '4+4', hp: 22 },
      { monster: 'Ogre',                    number: '1d4',    weight: 2 },
      { monster: 'Frost Giant',             number: '1d3',    weight: 1 },
      { monster: 'Remorhaz',                number: '1',      weight: 1, hd: '7+7', hp: 39 },
      { monster: 'White Dragon',            number: '1',      weight: 1 },
      { monster: 'Barbarian Raiders',       number: '2d6',    weight: 3, hd: '1', hp: 5 },
    ],
  },

  // ── Desert ───────────────────────────────────────────────────────────────────
  {
    id: 'desert', label: 'Desert',
    entries: [
      { monster: 'Gnoll',                   number: '2d6',    weight: 5 },
      { monster: 'Hobgoblin',               number: '2d6',    weight: 4 },
      { monster: 'Orc',                     number: '2d8',    weight: 4 },
      { monster: 'Bandits',                 number: '2d6',    weight: 4, hd: '1', hp: 5 },
      { monster: 'Giant Scorpion',          number: '1d3',    weight: 4 },
      { monster: 'Giant Spider (Large)',     number: '1d3',    weight: 3 },
      { monster: 'Manticore',               number: '1d2',    weight: 2 },
      { monster: 'Wyvern',                  number: '1d2',    weight: 2 },
      { monster: 'Lamia',                   number: '1',      weight: 2, hd: '9', hp: 41 },
      { monster: 'Medusa',                  number: '1',      weight: 1 },
      { monster: 'Blue Dragon',             number: '1',      weight: 1 },
      { monster: 'Basilisk',                number: '1d2',    weight: 2 },
    ],
  },

  // ── Forest (Temperate) ───────────────────────────────────────────────────────
  {
    id: 'forest-temperate', label: 'Forest (Temperate)',
    entries: [
      { monster: 'Orc',                     number: '2d8',    weight: 5 },
      { monster: 'Goblin',                  number: '2d8',    weight: 5 },
      { monster: 'Wolf',                    number: '2d6',    weight: 5 },
      { monster: 'Hobgoblin',               number: '2d6',    weight: 4 },
      { monster: 'Gnoll',                   number: '2d6',    weight: 3 },
      { monster: 'Bugbear',                 number: '1d6',    weight: 3 },
      { monster: 'Bandits',                 number: '2d10',   weight: 4, hd: '1', hp: 5 },
      { monster: 'Brown Bear',              number: '1d2',    weight: 3 },
      { monster: 'Owlbear',                 number: '1d2',    weight: 3 },
      { monster: 'Displacer Beast',         number: '1d2',    weight: 2 },
      { monster: 'Troll',                   number: '1d3',    weight: 2 },
      { monster: 'Green Dragon',            number: '1',      weight: 1 },
      { monster: 'Harpy',                   number: '1d4',    weight: 2 },
    ],
  },

  // ── Forest (Tropical / Subtropical) ─────────────────────────────────────────
  {
    id: 'forest-tropical', label: 'Forest (Tropical)',
    entries: [
      { monster: 'Lizard Man',              number: '2d6',    weight: 5 },
      { monster: 'Troglodyte',              number: '2d6',    weight: 5 },
      { monster: 'Yuan-ti (Half-Blood)',    number: '1d4+1',  weight: 3 },
      { monster: 'Tiger',                   number: '1',      weight: 4 },
      { monster: 'Giant Spider (Huge)',     number: '1d3',    weight: 4 },
      { monster: 'Giant Spider (Large)',    number: '1d4',    weight: 4 },
      { monster: 'Giant Centipede',         number: '2d4',    weight: 4 },
      { monster: 'Crocodile',              number: '1d4',    weight: 3 },
      { monster: 'Troll',                   number: '1d3',    weight: 2 },
      { monster: 'Black Dragon',            number: '1',      weight: 1 },
      { monster: 'Naga (Spirit)',           number: '1',      weight: 2 },
    ],
  },

  // ── Hills ────────────────────────────────────────────────────────────────────
  {
    id: 'hills', label: 'Hills',
    entries: [
      { monster: 'Orc',                     number: '2d8',    weight: 5 },
      { monster: 'Goblin',                  number: '2d8',    weight: 5 },
      { monster: 'Hobgoblin',               number: '2d6',    weight: 4 },
      { monster: 'Gnoll',                   number: '2d6',    weight: 4 },
      { monster: 'Bugbear',                 number: '1d6',    weight: 3 },
      { monster: 'Wolf',                    number: '2d6',    weight: 4 },
      { monster: 'Dire Wolf',               number: '1d4',    weight: 3 },
      { monster: 'Ogre',                    number: '1d4',    weight: 3 },
      { monster: 'Troll',                   number: '1d3',    weight: 2 },
      { monster: 'Hill Giant',              number: '1d3',    weight: 2 },
      { monster: 'Griffon',                 number: '1d4',    weight: 2 },
      { monster: 'Wyvern',                  number: '1d2',    weight: 2 },
    ],
  },

  // ── Jungle ───────────────────────────────────────────────────────────────────
  {
    id: 'jungle', label: 'Jungle',
    entries: [
      { monster: 'Lizard Man',              number: '2d6',    weight: 5 },
      { monster: 'Troglodyte',              number: '2d6',    weight: 4 },
      { monster: 'Yuan-ti (Half-Blood)',    number: '1d4+1',  weight: 3 },
      { monster: 'Tiger',                   number: '1',      weight: 4 },
      { monster: 'Giant Scorpion',          number: '1d2',    weight: 3 },
      { monster: 'Giant Spider (Huge)',     number: '1d3',    weight: 4 },
      { monster: 'Giant Centipede',         number: '2d4',    weight: 4 },
      { monster: 'Crocodile',              number: '1d4',    weight: 4 },
      { monster: 'Giant Crocodile',         number: '1',      weight: 2 },
      { monster: 'Troll',                   number: '1d3',    weight: 2 },
      { monster: 'Black Dragon',            number: '1',      weight: 1 },
      { monster: 'Naga (Water)',            number: '1',      weight: 2 },
    ],
  },

  // ── Mountains ────────────────────────────────────────────────────────────────
  {
    id: 'mountains', label: 'Mountains',
    entries: [
      { monster: 'Orc',                     number: '2d8',    weight: 5 },
      { monster: 'Goblin',                  number: '2d8',    weight: 4 },
      { monster: 'Kobold',                  number: '4d4',    weight: 4 },
      { monster: 'Ogre',                    number: '1d4',    weight: 3 },
      { monster: 'Troll',                   number: '1d3',    weight: 3 },
      { monster: 'Hill Giant',              number: '1d3',    weight: 2 },
      { monster: 'Stone Giant',             number: '1d2',    weight: 1 },
      { monster: 'Frost Giant',             number: '1d2',    weight: 1 },
      { monster: 'Griffon',                 number: '1d4',    weight: 2 },
      { monster: 'Wyvern',                  number: '1d2',    weight: 2 },
      { monster: 'Roc (Small)',             number: '1d2',    weight: 1 },
      { monster: 'Manticore',               number: '1d2',    weight: 2 },
      { monster: 'Red Dragon',              number: '1',      weight: 1 },
      { monster: 'Harpy',                   number: '1d4',    weight: 2 },
    ],
  },

  // ── Plains / Grasslands ──────────────────────────────────────────────────────
  {
    id: 'plains', label: 'Plains / Grasslands',
    entries: [
      { monster: 'Orc',                     number: '2d8',    weight: 5 },
      { monster: 'Hobgoblin',               number: '2d6',    weight: 4 },
      { monster: 'Gnoll',                   number: '2d6',    weight: 4 },
      { monster: 'Bandits',                 number: '2d10',   weight: 5, hd: '1', hp: 5 },
      { monster: 'Wolf',                    number: '2d6',    weight: 4 },
      { monster: 'Dire Wolf',               number: '1d4',    weight: 3 },
      { monster: 'Lion',                    number: '1d4',    weight: 3 },
      { monster: 'Ogre',                    number: '1d4',    weight: 3 },
      { monster: 'Griffon',                 number: '1d4',    weight: 2 },
      { monster: 'Hippogriff',              number: '1d4',    weight: 2 },
      { monster: 'Manticore',               number: '1d2',    weight: 2 },
      { monster: 'Giant Eagle',             number: '1d4',    weight: 2 },
      { monster: 'Wyvern',                  number: '1d2',    weight: 1 },
    ],
  },

  // ── Swamp ────────────────────────────────────────────────────────────────────
  {
    id: 'swamp', label: 'Swamp / Marsh',
    entries: [
      { monster: 'Lizard Man',              number: '2d6',    weight: 5 },
      { monster: 'Troglodyte',              number: '2d6',    weight: 4 },
      { monster: 'Kuo-toa',                 number: '2d6',    weight: 3 },
      { monster: 'Crocodile',              number: '1d4',    weight: 5 },
      { monster: 'Giant Crocodile',         number: '1',      weight: 2 },
      { monster: 'Troll',                   number: '1d3',    weight: 3 },
      { monster: 'Otyugh',                  number: '1d3',    weight: 3 },
      { monster: 'Shambling Mound',         number: '1',      weight: 2 },
      { monster: 'Will-o-Wisp',            number: '1d3',    weight: 2, hd: '9', hp: 45 },
      { monster: 'Harpy',                   number: '1d4',    weight: 2 },
      { monster: 'Black Dragon',            number: '1',      weight: 1 },
    ],
  },

  // ── Dungeon (Level 1-2) ──────────────────────────────────────────────────────
  {
    id: 'dungeon-1', label: 'Dungeon (Levels 1–2)',
    entries: [
      { monster: 'Kobold',                  number: '4d4',    weight: 6 },
      { monster: 'Goblin',                  number: '2d8',    weight: 6 },
      { monster: 'Orc',                     number: '2d6',    weight: 5 },
      { monster: 'Giant Rat',               number: '3d6',    weight: 5 },
      { monster: 'Skeleton',                number: '2d6',    weight: 4 },
      { monster: 'Zombie',                  number: '2d4',    weight: 3 },
      { monster: 'Hobgoblin',               number: '1d6',    weight: 3 },
      { monster: 'Giant Centipede',         number: '2d4',    weight: 4 },
      { monster: 'Giant Spider (Large)',    number: '1d4',    weight: 3 },
      { monster: 'Stirge',                  number: '2d4',    weight: 3 },
      { monster: 'Gelatinous Cube',         number: '1',      weight: 2 },
    ],
  },

  // ── Dungeon (Level 3-4) ──────────────────────────────────────────────────────
  {
    id: 'dungeon-3', label: 'Dungeon (Levels 3–4)',
    entries: [
      { monster: 'Bugbear',                 number: '1d6',    weight: 5 },
      { monster: 'Hobgoblin',               number: '2d6',    weight: 4 },
      { monster: 'Orc',                     number: '2d8',    weight: 4 },
      { monster: 'Skeleton',                number: '2d6',    weight: 5 },
      { monster: 'Zombie',                  number: '2d6',    weight: 4 },
      { monster: 'Ghoul',                   number: '1d6',    weight: 4 },
      { monster: 'Gnoll',                   number: '2d4',    weight: 3 },
      { monster: 'Ogre',                    number: '1d3',    weight: 3 },
      { monster: 'Shadow',                  number: '2d4',    weight: 3 },
      { monster: 'Wraith',                  number: '1d4',    weight: 2 },
      { monster: 'Gargoyle',                number: '1d4',    weight: 3 },
      { monster: 'Gelatinous Cube',         number: '1',      weight: 3 },
      { monster: 'Carrion Crawler',         number: '1d2',    weight: 3 },
    ],
  },

  // ── Dungeon (Level 5-6) ──────────────────────────────────────────────────────
  {
    id: 'dungeon-5', label: 'Dungeon (Levels 5–6)',
    entries: [
      { monster: 'Troll',                   number: '1d4',    weight: 4 },
      { monster: 'Ghast',                   number: '1d4',    weight: 4 },
      { monster: 'Wight',                   number: '1d6',    weight: 3 },
      { monster: 'Ogre',                    number: '1d4',    weight: 3 },
      { monster: 'Wraith',                  number: '1d4',    weight: 3 },
      { monster: 'Gargoyle',                number: '1d4',    weight: 3 },
      { monster: 'Shadow',                  number: '2d6',    weight: 3 },
      { monster: 'Umber Hulk',              number: '1d3',    weight: 2 },
      { monster: 'Carrion Crawler',         number: '1d2',    weight: 3 },
      { monster: 'Phase Spider',            number: '1d3',    weight: 2 },
      { monster: 'Minotaur',                number: '1d3',    weight: 2 },
      { monster: 'Rust Monster',            number: '1d2',    weight: 2 },
    ],
  },

  // ── Dungeon (Level 7+) ───────────────────────────────────────────────────────
  {
    id: 'dungeon-7', label: 'Dungeon (Levels 7+)',
    entries: [
      { monster: 'Mind Flayer',             number: '1d4',    weight: 3 },
      { monster: 'Wight',                   number: '1d6',    weight: 3 },
      { monster: 'Wraith',                  number: '1d4',    weight: 3 },
      { monster: 'Spectre',                 number: '1d4',    weight: 3 },
      { monster: 'Mummy',                   number: '1d4',    weight: 2 },
      { monster: 'Vampire',                 number: '1d4',    weight: 2 },
      { monster: 'Beholder',                number: '1',      weight: 2 },
      { monster: 'Lich',                    number: '1',      weight: 1 },
      { monster: 'Death Knight',            number: '1',      weight: 1 },
      { monster: 'Umber Hulk',              number: '1d4',    weight: 3 },
      { monster: 'Displacer Beast',         number: '1d4',    weight: 2 },
      { monster: 'Phase Spider',            number: '1d3',    weight: 2 },
    ],
  },

  // ── Underdark / Deep Underground ─────────────────────────────────────────────
  {
    id: 'underdark', label: 'Underdark',
    entries: [
      { monster: 'Drow',                    number: '1d6+1',  weight: 4 },
      { monster: 'Kuo-toa',                 number: '2d6',    weight: 4 },
      { monster: 'Troglodyte',              number: '2d6',    weight: 4 },
      { monster: 'Mind Flayer',             number: '1d4',    weight: 3 },
      { monster: 'Aboleth',                 number: '1',      weight: 2 },
      { monster: 'Beholder',                number: '1',      weight: 2 },
      { monster: 'Umber Hulk',              number: '1d4',    weight: 3 },
      { monster: 'Phase Spider',            number: '1d3',    weight: 2 },
      { monster: 'Duergar',                 number: '2d4',    weight: 3, hd: '1+2', hp: 6 },
      { monster: 'Otyugh',                  number: '1d3',    weight: 3 },
      { monster: 'Gargoyle',                number: '1d4',    weight: 2 },
    ],
  },

  // ── Coastal / Ocean ──────────────────────────────────────────────────────────
  {
    id: 'coastal', label: 'Coastal / Ocean',
    entries: [
      { monster: 'Sahuagin',                number: '2d6',    weight: 5 },
      { monster: 'Pirates',                  number: '2d10',   weight: 4, hd: '1', hp: 5 },
      { monster: 'Kuo-toa',                 number: '2d6',    weight: 3 },
      { monster: 'Griffon',                 number: '1d4',    weight: 2 },
      { monster: 'Wyvern',                  number: '1d2',    weight: 2 },
      { monster: 'Giant Eagle',             number: '1d4',    weight: 2 },
      { monster: 'Roc (Small)',             number: '1d2',    weight: 1 },
      { monster: 'Water Elemental (8 HD)',  number: '1',      weight: 1 },
      { monster: 'Harpy',                   number: '1d4',    weight: 2 },
    ],
  },

  // ── River / Lake (Fresh Water) ───────────────────────────────────────────────
  {
    id: 'fresh-water', label: 'River / Lake',
    entries: [
      { monster: 'Crocodile',              number: '1d4',    weight: 5 },
      { monster: 'Giant Crocodile',         number: '1',      weight: 2 },
      { monster: 'Lizard Man',              number: '2d6',    weight: 4 },
      { monster: 'Kuo-toa',                 number: '2d6',    weight: 3 },
      { monster: 'Hippopotamus',            number: '1d3',    weight: 3 },
      { monster: 'Giant Spider (Large)',    number: '1d3',    weight: 2 },
      { monster: 'Will-o-Wisp',            number: '1d2',    weight: 2, hd: '9', hp: 45 },
      { monster: 'Water Elemental (8 HD)', number: '1',      weight: 1 },
      { monster: 'Troll',                   number: '1d3',    weight: 2 },
    ],
  },
];
