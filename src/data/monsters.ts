// AD&D 2e Monstrous Manual reference data for the monster picker.
// Stats are taken from the 2e Monstrous Manual (1993).
// hp = typical (near-average) HP for a single standard specimen.

export type MonsterTag =
  | 'humanoid'
  | 'undead'
  | 'beast'
  | 'giant'
  | 'dragon'
  | 'monster'
  | 'elemental'
  | 'fiend'
  | 'construct';

export interface MonsterTemplate {
  name: string;
  hd: string;       // hit dice expression (display only)
  hp: number;       // typical HP
  ac: number;
  thac0: number;
  attacks: string;  // e.g. "1", "3", "2/2/1"
  damage: string;   // e.g. "1d8" or "1d4/1d4/2d6"
  mv: string;       // movement (display only)
  tags: MonsterTag[];
  notes?: string;   // brief special abilities
  /** Weapon / attack speed factor for initiative. Undefined = natural attacks with no standard modifier. */
  speed?: number;
}

// -- HP roller -----------------------------------------------------------------

/** Roll actual HP from a 2e HD string such as "2", "3+1", "1-1", "6+6", "1/2", "45 hp". */
export function rollHD(hd: string): number {
  const s = hd.trim().toLowerCase();

  // Fixed or range HP notation: "45 hp", "45-75 hp"
  if (s.includes('hp')) {
    const range = s.match(/(\d+)-(\d+)\s*hp/);
    if (range) {
      const lo = parseInt(range[1], 10);
      const hi = parseInt(range[2], 10);
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    }
    const fixed = s.match(/(\d+)\s*hp/);
    return fixed ? parseInt(fixed[1], 10) : 1;
  }

  // Fractional HD: "1/2" → 1d4, "1/4" → 1 HP
  if (s.includes('/')) {
    const den = parseInt(s.split('/')[1] ?? '2', 10);
    return den >= 4 ? 1 : rollN(1, 4, 0);
  }

  // Open-ended: "11+"
  const openMatch = s.match(/^(\d+)\+$/);
  if (openMatch) return rollN(parseInt(openMatch[1], 10), 8, 0);

  // Standard: "X", "X+Y", "X-Y"
  const m = s.match(/^(\d+)(?:([+-])(\d+))?$/);
  if (m) {
    const num = parseInt(m[1], 10);
    const mod = m[2] ? (m[2] === '+' ? 1 : -1) * parseInt(m[3], 10) : 0;
    return rollN(num, 8, mod);
  }

  return 1;
}

function rollN(n: number, sides: number, mod: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.floor(Math.random() * sides) + 1;
  return Math.max(1, total + mod);
}

export const ALL_TAGS: MonsterTag[] = [
  'humanoid', 'undead', 'beast', 'giant', 'dragon',
  'monster', 'elemental', 'fiend', 'construct',
];

export const TAG_LABELS: Record<MonsterTag, string> = {
  humanoid:  'Humanoid',
  undead:    'Undead',
  beast:     'Beast',
  giant:     'Giant',
  dragon:    'Dragon',
  monster:   'Monster',
  elemental: 'Elemental',
  fiend:     'Fiend',
  construct: 'Construct',
};

export const MONSTERS: MonsterTemplate[] = [

  // ── HUMANOIDS ────────────────────────────────────────────────────────────────
  { name: 'Kobold',               hd: '1/2',   hp:  2, ac:  7, thac0: 20, attacks: '1',   damage: '1d4',             mv: '6',           tags: ['humanoid'], speed: 2  },
  { name: 'Goblin',               hd: '1-1',   hp:  4, ac:  6, thac0: 20, attacks: '1',   damage: '1d6',             mv: '6',           tags: ['humanoid'], speed: 3  },
  { name: 'Orc',                  hd: '1',     hp:  5, ac:  6, thac0: 19, attacks: '1',   damage: '1d8',             mv: '9',           tags: ['humanoid'], speed: 7  },
  { name: 'Hobgoblin',            hd: '1+1',   hp:  6, ac:  5, thac0: 18, attacks: '1',   damage: '1d8',             mv: '9',           tags: ['humanoid'], speed: 3  },
  { name: 'Gnoll',                hd: '2',     hp:  9, ac:  5, thac0: 19, attacks: '1',   damage: '2d4',             mv: '9',           tags: ['humanoid'], speed: 7  },
  { name: 'Gnoll (Flind)',         hd: '3',     hp: 14, ac:  5, thac0: 17, attacks: '3',   damage: '1d6+1/1d6+1/1d4+1', mv: '9',       tags: ['humanoid'], speed: 7,  notes: 'flindbar: disarm or stun (save vs. paralysis)' },
  { name: 'Troglodyte',           hd: '2',     hp:  9, ac:  5, thac0: 19, attacks: '3',   damage: '1d4/1d4/1d4',    mv: '12',          tags: ['humanoid'], notes: 'stench: save vs. poison or -2 to hit/damage; chameleon skin' },
  { name: 'Lizard Man',           hd: '2+1',   hp: 10, ac:  5, thac0: 19, attacks: '2',   damage: '1d2+1/2d4',      mv: '6, Sw 12',    tags: ['humanoid'], speed: 6  },
  { name: 'Kuo-toa',              hd: '2',     hp:  9, ac:  4, thac0: 17, attacks: '1',   damage: '2d4',             mv: '9, Sw 18',    tags: ['humanoid'], speed: 6,  notes: 'immune to illusion; sticky hands; lightning; 1-in-4 chance to pin shield' },
  { name: 'Bugbear',              hd: '3+1',   hp: 15, ac:  5, thac0: 17, attacks: '1',   damage: '2d4+1',           mv: '9',           tags: ['humanoid'], speed: 7  },
  { name: 'Drow',                 hd: '1+1',   hp:  6, ac:  4, thac0: 18, attacks: '1',   damage: '1d4',             mv: '12',          tags: ['humanoid'], speed: 3,  notes: 'spell abilities (darkness, faerie fire, levitate); light sensitivity; +2 save vs. magic' },
  { name: 'Sahuagin',             hd: '2+2',   hp: 11, ac:  5, thac0: 19, attacks: '4',   damage: '1d4/1d4/1d4/1d6 or weapon', mv: '12, Sw 24', tags: ['humanoid'], speed: 6 },
  { name: 'Yuan-ti (Half-Blood)', hd: '5',     hp: 22, ac:  5, thac0: 15, attacks: '2',   damage: '2d4/2d4',         mv: '12',          tags: ['humanoid'], notes: 'spell abilities; constrict; poison 2d6/rd (save vs. poison)' },
  { name: 'Ogre Mage',            hd: '5+4',   hp: 27, ac:  4, thac0: 15, attacks: '1',   damage: '1d12',            mv: '9, Fl 15',    tags: ['humanoid', 'giant'], speed: 9, notes: 'fly; invisibility; charm; sleep; darkness; polymorph' },

  // ── UNDEAD ───────────────────────────────────────────────────────────────────
  { name: 'Skeleton',             hd: '1',     hp:  5, ac:  7, thac0: 19, attacks: '1',   damage: '1d6',             mv: '12',          tags: ['undead'], notes: 'immune: cold, sleep; edged weapons ½ damage; missile immunity' },
  { name: 'Zombie',               hd: '2',     hp:  9, ac:  8, thac0: 19, attacks: '1',   damage: '1d8',             mv: '6',           tags: ['undead'], notes: 'always acts last in initiative; immune: charm, sleep, hold, poison' },
  { name: 'Ghoul',                hd: '2',     hp:  9, ac:  6, thac0: 19, attacks: '3',   damage: '1d3/1d3/1d6',    mv: '9',           tags: ['undead'], notes: 'paralysis on hit (save vs. paralysis); elves immune' },
  { name: 'Shadow',               hd: '3+3',   hp: 17, ac:  7, thac0: 17, attacks: '1',   damage: '1d4+Str drain',  mv: '12',          tags: ['undead'], notes: 'Str drain 1 per hit; hit only by magic weapons; not affected by turn undead as normal' },
  { name: 'Ghast',                hd: '4',     hp: 18, ac:  4, thac0: 17, attacks: '3',   damage: '1d4/1d4/1d6',    mv: '15',          tags: ['undead'], notes: 'stench (save vs. poison); paralysis (save vs. paralysis); not affected by turn undead normally' },
  { name: 'Wight',                hd: '4+3',   hp: 21, ac:  5, thac0: 15, attacks: '1',   damage: 'energy drain',   mv: '12',          tags: ['undead'], notes: 'energy drain 1 level; hit only by silver or magic weapons' },
  { name: 'Wraith',               hd: '5+3',   hp: 26, ac:  4, thac0: 15, attacks: '1',   damage: 'energy drain',   mv: '12, Fl 24',   tags: ['undead'], notes: 'energy drain 1 level; hit only by silver/+1 weapons' },
  { name: 'Spectre',              hd: '7+3',   hp: 35, ac:  2, thac0: 13, attacks: '1',   damage: 'energy drain ×2', mv: '15, Fl 30',  tags: ['undead'], notes: 'drains 2 levels per hit; hit only by +1 or better weapons' },
  { name: 'Mummy',                hd: '6+3',   hp: 30, ac:  3, thac0: 13, attacks: '1',   damage: '1d12+disease',   mv: '6',           tags: ['undead'], notes: 'rotting disease; fear gaze (save vs. spell); vulnerable to fire; +1 weapons to hit' },
  { name: 'Skeleton Warrior',     hd: '9+',    hp: 45, ac:  2, thac0: 11, attacks: '1',   damage: 'by weapon',      mv: '12',          tags: ['undead'], notes: 'elite fighter; fearless; tiara binds it; turns as lich; immune: non-magic weapons' },
  { name: 'Vampire',              hd: '8+3',   hp: 40, ac:  1, thac0: 13, attacks: '2',   damage: '1d6+4/energy drain', mv: '12, Fl 18', tags: ['undead'], notes: 'drains 2 levels; charm gaze; regenerates 3hp/rd; +1 weapons to hit' },
  { name: 'Lich',                 hd: '11+',   hp: 55, ac:  0, thac0:  7, attacks: '1',   damage: '1d10+paralysis', mv: '6',           tags: ['undead'], notes: 'paralysis touch; fear gaze (20\'); immune: charm, sleep, cold; powerful spellcaster' },
  { name: 'Banshee',              hd: '7',     hp: 32, ac:  0, thac0: 13, attacks: '1',   damage: '1d8',             mv: '15',          tags: ['undead'], notes: 'wail: all within 30\' die (save vs. death); hit only by +1 or better weapons' },
  { name: 'Death Knight',         hd: '12',    hp: 54, ac: -4, thac0:  7, attacks: '1',   damage: 'by weapon+12',   mv: '12',          tags: ['undead'], notes: 'fireball 11d6; immune: cold, electricity, fear, non-magic weapons; spell abilities (F9/MU15)' },

  // ── GIANT-KIND ───────────────────────────────────────────────────────────────
  { name: 'Ogre',                 hd: '4+1',   hp: 19, ac:  5, thac0: 15, attacks: '1',   damage: '1d10+6',          mv: '9',           tags: ['giant'] },
  { name: 'Troll',                hd: '6+6',   hp: 33, ac:  4, thac0: 13, attacks: '3',   damage: '1d4+4/1d4+4/2d6', mv: '12',         tags: ['giant'], notes: 'regenerates 3hp/rd; killed only by fire or acid' },
  { name: 'Minotaur',             hd: '6+3',   hp: 30, ac:  6, thac0: 15, attacks: '3',   damage: '2d4/2d4/1d6',    mv: '12',          tags: ['giant'] },
  { name: 'Ettin',                hd: '10',    hp: 45, ac:  3, thac0:  9, attacks: '2',   damage: '2d8/2d10',        mv: '12',          tags: ['giant'], notes: 'two heads; near-impossible to surprise; can attack two opponents' },
  { name: 'Hill Giant',           hd: '12+2',  hp: 56, ac:  4, thac0:  7, attacks: '1',   damage: '2d8+9',           mv: '12',          tags: ['giant'], notes: 'hurls boulders 2d8 at 200\'' },
  { name: 'Stone Giant',          hd: '14',    hp: 63, ac:  0, thac0:  5, attacks: '1',   damage: '3d10',            mv: '12',          tags: ['giant'], notes: 'hurls boulders 3d10 at 300\'' },
  { name: 'Frost Giant',          hd: '14+1',  hp: 65, ac: -1, thac0:  5, attacks: '1',   damage: '4d6+5',           mv: '12',          tags: ['giant'], notes: 'immune to cold; hurls boulders or icicles (4d6) at 200\'' },
  { name: 'Fire Giant',           hd: '15+1',  hp: 70, ac: -1, thac0:  5, attacks: '1',   damage: '5d6+6',           mv: '12',          tags: ['giant'], notes: 'immune to fire; hurls boulders or lava rocks (5d6) at 200\'' },
  { name: 'Cloud Giant',          hd: '16+2',  hp: 74, ac: -2, thac0:  3, attacks: '1',   damage: '6d6+11',          mv: '15',          tags: ['giant'], notes: 'keen smell; hurls rocks or objects (6d6) at 250\'' },
  { name: 'Storm Giant',          hd: '21+1',  hp: 97, ac: -3, thac0:  1, attacks: '1',   damage: '7d10+12',         mv: '15, Sw 15',   tags: ['giant'], notes: 'control weather; lightning bolt (15d4); hurls boulders (7d10)' },

  // ── BEASTS ───────────────────────────────────────────────────────────────────
  { name: 'Giant Rat',            hd: '1/2',   hp:  2, ac:  7, thac0: 20, attacks: '1',   damage: '1d3',             mv: '12, Sw 6',    tags: ['beast'], notes: 'disease (save vs. poison or contract plague)' },
  { name: 'Stirge',               hd: '1+1',   hp:  6, ac:  8, thac0: 19, attacks: '1',   damage: '1d3+blood drain', mv: '3, Fl 18',    tags: ['beast'], notes: '+4 to hit on dive; drains 1d4 hp/rd after hit until dead or removed' },
  { name: 'Wolf',                 hd: '2+2',   hp: 11, ac:  7, thac0: 19, attacks: '1',   damage: '2d4',             mv: '18',          tags: ['beast'] },
  { name: 'Worg',                 hd: '3+3',   hp: 17, ac:  6, thac0: 17, attacks: '1',   damage: '2d6',             mv: '18',          tags: ['beast'] },
  { name: 'Dire Wolf',            hd: '4+4',   hp: 22, ac:  6, thac0: 15, attacks: '1',   damage: '2d4+2',           mv: '18',          tags: ['beast'] },
  { name: 'Black Bear',           hd: '3+3',   hp: 17, ac:  7, thac0: 17, attacks: '3',   damage: '1d3/1d3/1d6',    mv: '12',          tags: ['beast'], notes: 'hug for 2d6 if both paws hit' },
  { name: 'Brown Bear',           hd: '5+5',   hp: 28, ac:  6, thac0: 15, attacks: '3',   damage: '1d6/1d6/1d8',    mv: '12',          tags: ['beast'], notes: 'hug for 2d8 if both paws hit' },
  { name: 'Cave Bear',            hd: '7+7',   hp: 39, ac:  6, thac0: 13, attacks: '3',   damage: '1d8/1d8/2d6',    mv: '12',          tags: ['beast'], notes: 'hug for 3d6 if both paws hit' },
  { name: 'Polar Bear',           hd: '6+6',   hp: 33, ac:  6, thac0: 15, attacks: '3',   damage: '1d8/1d8/1d12',   mv: '12, Sw 9',    tags: ['beast'], notes: 'hug for 2d12 if both paws hit' },
  { name: 'Lion',                 hd: '5+2',   hp: 25, ac:  6, thac0: 15, attacks: '3',   damage: '1d4+2/1d4+2/1d8+2', mv: '12',       tags: ['beast'] },
  { name: 'Tiger',                hd: '5+5',   hp: 28, ac:  6, thac0: 15, attacks: '3',   damage: '1d6/1d6/2d6',    mv: '12',          tags: ['beast'] },
  { name: 'Giant Spider (Large)', hd: '2+2',   hp: 11, ac:  4, thac0: 17, attacks: '1',   damage: '1d6+poison',     mv: '9',           tags: ['beast'], notes: 'poison: save vs. poison or die in 1d4 turns' },
  { name: 'Giant Spider (Huge)',  hd: '2+2',   hp: 11, ac:  6, thac0: 17, attacks: '1',   damage: '1d8+poison',     mv: '9',           tags: ['beast'], notes: 'poison: save vs. poison or die in 1 turn; web (save vs. paralysis)' },
  { name: 'Giant Scorpion',       hd: '5+5',   hp: 28, ac:  3, thac0: 15, attacks: '3',   damage: '1d10/1d10/1d4+poison', mv: '15',    tags: ['beast'], notes: 'tail sting: save vs. poison or die in 1d6 turns' },
  { name: 'Giant Centipede',      hd: '1/4',   hp:  1, ac:  9, thac0: 20, attacks: '1',   damage: '0+disease',      mv: '15',          tags: ['beast'], notes: 'save vs. poison or incapacitated 10 days' },
  { name: 'Giant Ant (Warrior)',  hd: '3',     hp: 14, ac:  3, thac0: 17, attacks: '1',   damage: '2d6',             mv: '18',          tags: ['beast'] },
  { name: 'Crocodile',            hd: '3',     hp: 14, ac:  5, thac0: 17, attacks: '1',   damage: '2d8',             mv: '6, Sw 9',     tags: ['beast'] },
  { name: 'Giant Crocodile',      hd: '7',     hp: 32, ac:  4, thac0: 13, attacks: '1',   damage: '3d10',            mv: '6, Sw 9',     tags: ['beast'], notes: 'death roll: 3d10 again next round if first attack hits' },
  { name: 'Wyvern',               hd: '7+7',   hp: 39, ac:  3, thac0: 13, attacks: '2',   damage: '2d8/1d6+poison', mv: '6, Fl 24',    tags: ['beast', 'dragon'], notes: 'tail sting: save vs. poison or die' },
  { name: 'Griffon',              hd: '7',     hp: 32, ac:  3, thac0: 13, attacks: '3',   damage: '1d4/1d4/2d8',    mv: '12, Fl 30',   tags: ['beast'] },
  { name: 'Hippogriff',           hd: '3+3',   hp: 17, ac:  5, thac0: 17, attacks: '3',   damage: '1d6/1d6/1d10',   mv: '18, Fl 36',   tags: ['beast'] },
  { name: 'Pegasus',              hd: '4',     hp: 18, ac:  6, thac0: 17, attacks: '3',   damage: '1d8/1d8/1d3',    mv: '24, Fl 48',   tags: ['beast'] },
  { name: 'Giant Eagle',          hd: '4',     hp: 18, ac:  7, thac0: 17, attacks: '3',   damage: '1d4+1/1d4+1/2d6', mv: '3, Fl 48',   tags: ['beast'] },
  { name: 'Roc (Small)',          hd: '6',     hp: 27, ac:  6, thac0: 13, attacks: '3',   damage: '1d6/1d6/2d10',   mv: '6, Fl 48',    tags: ['beast'] },

  // ── CLASSIC MONSTERS ─────────────────────────────────────────────────────────
  { name: 'Carrion Crawler',      hd: '3+1',   hp: 15, ac:  3, thac0: 17, attacks: '8',   damage: '0+paralysis ×8', mv: '12',          tags: ['monster'], notes: '8 tentacles: paralysis on each hit (save vs. paralysis)' },
  { name: 'Gelatinous Cube',      hd: '4',     hp: 18, ac:  8, thac0: 17, attacks: '1',   damage: '2d4+paralysis',  mv: '6',           tags: ['monster'], notes: 'nearly transparent; paralysis touch; immune to most spells' },
  { name: 'Owlbear',              hd: '5+2',   hp: 25, ac:  5, thac0: 15, attacks: '3',   damage: '1d6/1d6/2d6',    mv: '12',          tags: ['monster'], notes: 'hug for 2d8 if paws score 18+ total to-hit' },
  { name: 'Displacer Beast',      hd: '6+6',   hp: 33, ac: -4, thac0: 13, attacks: '2',   damage: '2d8/2d8',         mv: '15',          tags: ['monster'], notes: 'displacement: appears 3\' from true location; attacks at -2; save vs. spells at +2' },
  { name: 'Manticore',            hd: '6+3',   hp: 30, ac:  4, thac0: 13, attacks: '3',   damage: '1d6/1d6/1d6',    mv: '12, Fl 18',   tags: ['monster'], notes: '24 iron tail spikes (1d6 each), 6/rd, up to 180\' range' },
  { name: 'Basilisk',             hd: '6+1',   hp: 28, ac:  4, thac0: 13, attacks: '1',   damage: '1d10',            mv: '6',           tags: ['monster'], notes: 'gaze: petrification (save vs. petrification); own reflection is dangerous' },
  { name: 'Cockatrice',           hd: '5',     hp: 23, ac:  6, thac0: 15, attacks: '1',   damage: '1d3',             mv: '6, Fl 18',    tags: ['monster'], notes: 'touch: petrification (save vs. petrification)' },
  { name: 'Medusa',               hd: '6',     hp: 27, ac:  5, thac0: 15, attacks: '1',   damage: '1d4',             mv: '9',           tags: ['monster'], notes: 'gaze: petrification (save vs. petrification); snake bite: poison (save or die)' },
  { name: 'Harpy',                hd: '3',     hp: 14, ac:  7, thac0: 17, attacks: '3',   damage: '1d3/1d3/1d6',    mv: '6, Fl 15',    tags: ['monster'], notes: 'song: charm (save vs. spell); attacks charmed victims automatically' },
  { name: 'Gargoyle',             hd: '4+4',   hp: 22, ac:  5, thac0: 15, attacks: '4',   damage: '1d3/1d3/1d6/1d4+1', mv: '9, Fl 15', tags: ['monster'], notes: 'hit only by +1 or better weapons; immune: sleep, charm, hold, fear' },
  { name: 'Rust Monster',         hd: '5',     hp: 23, ac:  2, thac0: 15, attacks: '2',   damage: 'rust ferrous metal', mv: '18',        tags: ['monster'], notes: 'touch rusts and destroys any ferrous metal item instantly' },
  { name: 'Beholder',             hd: '45 hp', hp: 57, ac:  0, thac0:  7, attacks: '1+11 eyes', damage: '2d4+eye rays', mv: '3',        tags: ['monster'], notes: '10 eye rays (death, petrify, disintegrate, sleep, slow, etc.) + anti-magic ray' },
  { name: 'Mind Flayer',          hd: '8+4',   hp: 40, ac:  5, thac0: 11, attacks: '4',   damage: '2/2/2/2',         mv: '12',          tags: ['monster'], notes: 'mind blast cone (stuns); 4 tentacles: extract brain if all hit' },
  { name: 'Chimera',              hd: '9',     hp: 41, ac:  6, thac0: 11, attacks: '6',   damage: '1d3/1d3/1d4/1d4/2d4/3d4', mv: '12, Fl 18', tags: ['monster'], notes: 'fire breath cone 50\' (3d8), 3×/day' },
  { name: 'Hydra (5-headed)',      hd: '5',     hp: 23, ac:  5, thac0: 15, attacks: '5',   damage: '1d10 per head',   mv: '12',          tags: ['monster'], notes: 'one attack per head; severing a head requires 6+ damage in a single blow' },
  { name: 'Hydra (8-headed)',      hd: '8',     hp: 36, ac:  5, thac0: 13, attacks: '8',   damage: '1d10 per head',   mv: '12',          tags: ['monster'], notes: 'one attack per head; severing a head requires 8+ damage in a single blow' },
  { name: 'Roper',                hd: '10',    hp: 45, ac:  0, thac0:  9, attacks: '7',   damage: 'Str drain ×6+bite 5d4+5', mv: '3',   tags: ['monster'], notes: '6 strands (100\' range): hold + Str drain 1d4; bite 5d4+5 if held' },
  { name: 'Bulette (Landshark)',   hd: '9',     hp: 41, ac: -2, thac0: 11, attacks: '3',   damage: '4d12/2d6/2d6',   mv: '14',          tags: ['monster'], notes: 'leaping charge; burrows through earth; armored hide (-2 AC on flanks)' },
  { name: 'Gorgon',               hd: '8',     hp: 36, ac:  2, thac0: 13, attacks: '1',   damage: '2d10',            mv: '12',          tags: ['monster'], notes: 'breath: petrification gas cone 60×30\' (save vs. petrification)' },
  { name: 'Xorn',                 hd: '7+7',   hp: 38, ac: -2, thac0: 13, attacks: '4',   damage: '1d4/1d4/1d4/3d4+7', mv: '9',         tags: ['monster'], notes: 'phases through earth and stone; immune: fire, cold, electricity; senses metals/gems' },
  { name: 'Shambling Mound',      hd: '8+8',   hp: 44, ac:  0, thac0: 11, attacks: '2',   damage: '2d8/2d8',         mv: '6',           tags: ['monster'], notes: 'suffocation hug (2d8+2d6/rd after hit); immune: fire, cold; electricity heals and enlarges' },
  { name: 'Phase Spider',         hd: '5+5',   hp: 28, ac:  7, thac0: 15, attacks: '1',   damage: '1d6+poison',      mv: '6, Wb 15',    tags: ['monster'], notes: 'phases between material/ethereal planes at will; poison: save or die' },
  { name: 'Umber Hulk',           hd: '8+8',   hp: 44, ac: -2, thac0: 11, attacks: '3',   damage: '3d4/3d4/1d10',   mv: '6',           tags: ['monster'], notes: 'gaze: confusion (save vs. spell); burrowing; exceptional strength' },
  { name: 'Aboleth',              hd: '8',     hp: 36, ac:  4, thac0: 11, attacks: '4',   damage: '1d6/1d6/1d6/1d6', mv: '9, Sw 18',   tags: ['monster'], notes: 'slime: save vs. breath weapon or skin becomes membrane; 3 spell-like abilities/day' },
  { name: 'Otyugh',               hd: '6+6',   hp: 33, ac:  3, thac0: 13, attacks: '3',   damage: '1d8/1d8/1d4+1',  mv: '6',           tags: ['monster'], notes: 'bite causes disease (save vs. poison); 2 tentacles grab (Str check to escape)' },
  { name: 'Naga (Spirit)',        hd: '9',     hp: 41, ac:  4, thac0: 11, attacks: '2',   damage: '1d3+poison/1d6',  mv: '12',          tags: ['monster'], notes: 'spell abilities up to 6th level MU; poison (save or die)' },
  { name: 'Naga (Water)',         hd: '5',     hp: 23, ac:  5, thac0: 15, attacks: '2',   damage: '1d4+poison/1d6',  mv: '12, Sw 18',   tags: ['monster'], notes: 'constriction (2d6/rd); spell abilities (1st-3rd level)' },

  // ── DRAGONS ──────────────────────────────────────────────────────────────────
  { name: 'Pseudodragon',         hd: '2',     hp:  9, ac:  2, thac0: 19, attacks: '3',   damage: '1d2/1d2/1d3',    mv: '6, Fl 24',    tags: ['dragon'], notes: 'tail sting: save vs. poison or sleep 1d6 days; chameleon skin; telepathy' },
  { name: 'White Dragon',         hd: '7+7',   hp: 39, ac:  3, thac0: 13, attacks: '3',   damage: '1d6+1/1d6+1/2d8+1', mv: '9, Fl 30', tags: ['dragon'], notes: 'breath: cold cone (7d10); immune to cold; lair in icy terrain' },
  { name: 'Black Dragon',         hd: '8+8',   hp: 44, ac:  3, thac0: 11, attacks: '3',   damage: '1d4+4/1d4+4/3d6+4', mv: '9, Sw 12, Fl 24', tags: ['dragon'], notes: 'breath: acid line (8d10); immune to acid; swamp lairs' },
  { name: 'Green Dragon',         hd: '9+9',   hp: 50, ac:  1, thac0: 11, attacks: '3',   damage: '1d6+5/1d6+5/2d10+5', mv: '9, Sw 9, Fl 24', tags: ['dragon'], notes: 'breath: chlorine gas cone (9d10); forest lairs' },
  { name: 'Blue Dragon',          hd: '10+10', hp: 55, ac: -1, thac0:  9, attacks: '3',   damage: '1d6+6/1d6+6/3d8+6', mv: '9, Fl 24', tags: ['dragon'], notes: 'breath: lightning bolt (10d10); immune to electricity; desert lairs' },
  { name: 'Red Dragon',           hd: '11+11', hp: 60, ac: -1, thac0:  9, attacks: '3',   damage: '1d8+7/1d8+7/3d10+7', mv: '9, Fl 24', tags: ['dragon'], notes: 'breath: fire cone (11d10+11); immune to fire; mountain lairs' },
  { name: 'Silver Dragon',        hd: '10+10', hp: 55, ac: -1, thac0:  9, attacks: '3',   damage: '2d4+7/2d4+7/5d6+7', mv: '9, Fl 30', tags: ['dragon'], notes: 'breath: cold cone or paralytic gas; polymorph self; spell abilities (F9)' },
  { name: 'Gold Dragon',          hd: '11+11', hp: 60, ac: -2, thac0:  7, attacks: '3',   damage: '2d4+8/2d4+8/6d6+8', mv: '12, Sw 12, Fl 40', tags: ['dragon'], notes: 'breath: fire cone or chlorine gas; polymorph; bless; spell abilities' },

  // ── ELEMENTALS ───────────────────────────────────────────────────────────────
  { name: 'Fire Elemental (8 HD)',    hd: '8',  hp: 36, ac:  2, thac0: 13, attacks: '1', damage: '3d8',   mv: '12',          tags: ['elemental'], notes: 'sets combustibles alight on hit; +1d8 vs. water-using creatures' },
  { name: 'Earth Elemental (8 HD)',   hd: '8',  hp: 36, ac:  2, thac0: 13, attacks: '1', damage: '4d8',   mv: '6',           tags: ['elemental'], notes: 'earth glide; destroys stone structures; cannot cross water' },
  { name: 'Water Elemental (8 HD)',   hd: '8',  hp: 36, ac:  2, thac0: 13, attacks: '1', damage: '5d6',   mv: '6, Sw 18',    tags: ['elemental'], notes: '+4 to hit in water; capsizes boats; cannot stray 60\' from water' },
  { name: 'Air Elemental (8 HD)',     hd: '8',  hp: 36, ac:  2, thac0: 13, attacks: '1', damage: '2d10',  mv: 'Fl 36',       tags: ['elemental'], notes: 'whirlwind (Small/Med creatures take 1d4/rd); cannot go underground' },
  { name: 'Fire Elemental (16 HD)',   hd: '16', hp: 72, ac:  2, thac0:  5, attacks: '1', damage: '5d8',   mv: '12',          tags: ['elemental'] },
  { name: 'Earth Elemental (16 HD)',  hd: '16', hp: 72, ac:  2, thac0:  5, attacks: '1', damage: '6d8+8', mv: '6',           tags: ['elemental'] },
  { name: 'Water Elemental (16 HD)',  hd: '16', hp: 72, ac:  2, thac0:  5, attacks: '1', damage: '8d6',   mv: '6, Sw 18',    tags: ['elemental'] },
  { name: 'Air Elemental (16 HD)',    hd: '16', hp: 72, ac:  2, thac0:  5, attacks: '1', damage: '4d10',  mv: 'Fl 36',       tags: ['elemental'] },

  // ── FIENDS ───────────────────────────────────────────────────────────────────
  { name: 'Imp',                  hd: '2+2',   hp: 11, ac:  2, thac0: 19, attacks: '1',   damage: '1d4+poison',     mv: '6, Fl 12',    tags: ['fiend'], notes: 'regenerate 1/rd; tail sting: save vs. poison or die in 1d4 turns; hit only by silver/+1 weapons' },
  { name: 'Quasit',               hd: '3',     hp: 14, ac:  2, thac0: 17, attacks: '3',   damage: '1d2/1d2/1d4',   mv: '15',           tags: ['fiend'], notes: 'claw: save vs. poison or Dex -1; regenerate 1/rd; hit only by cold iron/+1 weapons' },
  { name: 'Lemure',               hd: '3',     hp: 14, ac:  7, thac0: 17, attacks: '2',   damage: '1d3/1d3',        mv: '3',           tags: ['fiend'], notes: 'regenerate 1/rd; immune: fire, poison, mind effects' },
  { name: 'Erinyes',              hd: '6+6',   hp: 33, ac:  2, thac0: 13, attacks: '1',   damage: '2d4+1',          mv: '6, Fl 21',    tags: ['fiend'], notes: 'rope of entanglement; flaming arrows; charm person at will' },
  { name: 'Barbed Devil',         hd: '8',     hp: 36, ac: -1, thac0: 13, attacks: '3',   damage: '2d4/2d4/3d4',   mv: '12',           tags: ['fiend'], notes: 'fear aura; grabbers take 1d8 from barbs; immune to fire and poison' },
  { name: 'Bone Devil',           hd: '9',     hp: 41, ac: -1, thac0: 11, attacks: '3',   damage: '1d4+1/1d4+1/3d4+poison', mv: '12, Fl 18', tags: ['fiend'], notes: 'tail sting: save vs. poison or paralyzed; fear aura; immune to fire' },
  { name: 'Succubus / Incubus',   hd: '6',     hp: 27, ac:  0, thac0: 13, attacks: '2',   damage: '1d3+1/1d3+1',   mv: '12, Fl 18',   tags: ['fiend'], notes: 'energy drain (kiss); charm person at will; dimension door; telepathy' },
  { name: 'Ice Devil (Gelugon)',   hd: '11',    hp: 50, ac: -4, thac0:  7, attacks: '4',   damage: '1d4/1d4/3d4/2d6', mv: '6',          tags: ['fiend'], notes: 'spear: slow (save vs. spell 1d6 turns); wall of ice; ice storm; immune to cold/fire' },
  { name: 'Vrock',                hd: '8',     hp: 36, ac:  0, thac0: 11, attacks: '5',   damage: '1d4+4/1d4+4/1d6/1d6/1d4', mv: '12, Fl 18', tags: ['fiend'], notes: 'spores: grow in 1d4 rds (2d6 dmg, holy water stops); screech stuns 1 rd; +2 weapon to hit' },
  { name: 'Hezrou',               hd: '9',     hp: 41, ac: -2, thac0: 11, attacks: '3',   damage: '1d3/1d3/4d4',   mv: '6',            tags: ['fiend'], notes: 'stench (save vs. poison or -2 to hit); fear aura; +2 weapon to hit' },
  { name: 'Pit Fiend',            hd: '13',    hp: 59, ac: -3, thac0:  5, attacks: '2',   damage: '2d4/5d4',        mv: '9, Fl 15',    tags: ['fiend'], notes: 'constriction 2d4/rd; regenerate 2/rd; fear aura; spell abilities; +2 weapon to hit' },

  // ── CONSTRUCTS ───────────────────────────────────────────────────────────────
  { name: 'Animated Statue (Stone)', hd: '5', hp: 23, ac:  4, thac0: 15, attacks: '2', damage: '2d6/2d6',    mv: '9',           tags: ['construct'], notes: 'immune: fire, cold, electricity, poison, sleep, charm; blunt weapons deal full damage' },
  { name: 'Flesh Golem',          hd: '9',     hp: 41, ac:  9, thac0: 11, attacks: '2',   damage: '2d8/2d8',        mv: '9',           tags: ['construct'], notes: 'immune: non-magic weapons, mind effects, fire/cold (slowed); lightning heals it; +1 weapons to hit' },
  { name: 'Clay Golem',           hd: '12',    hp: 54, ac:  7, thac0:  9, attacks: '1',   damage: '3d10',           mv: '7',           tags: ['construct'], notes: 'cursed wounds; may berserk (1-in-20 per attack); immune: most spells; +2 weapons to hit' },
  { name: 'Stone Golem',          hd: '16',    hp: 72, ac:  5, thac0:  5, attacks: '1',   damage: '3d8+16',         mv: '6',           tags: ['construct'], notes: 'immune: all spells except rock-to-mud and stone-to-flesh; +2 weapons to hit' },
  { name: 'Iron Golem',           hd: '18',    hp: 81, ac:  3, thac0:  3, attacks: '1',   damage: '4d10',           mv: '6',           tags: ['construct'], notes: 'poison gas breath; immune: most spells; +3 weapons to hit; fire slows and lightning repairs it' },
];
