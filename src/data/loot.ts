// AD&D 2e treasure generation — DMG Chapter 5 (Treasure Tables).
// Individual types P–V are per-monster body loot.
// Lair types A–I are rolled once for the monster's lair.
// Gem/jewelry tables are from the DMG gem and art object tables.

import type { LootResult } from '../types.ts';
import { MONSTERS } from './monsters.ts';

// -- Dice helpers -------------------------------------------------------------

function d(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function roll(num: number, sides: number, bonus = 0): number {
  let t = 0;
  for (let i = 0; i < num; i++) t += d(sides);
  return Math.max(0, t + bonus);
}

function pct(chance: number): boolean {
  return Math.random() * 100 < chance;
}

// -- Gem tables (DMG, base values) -------------------------------------------

const GEMS_10: string[] = [
  'Azurite', 'Banded agate', 'Blue quartz', 'Eye agate',
  'Hematite', 'Lapis lazuli', 'Malachite', 'Moss agate',
  'Obsidian', 'Rhodonite', 'Tiger eye agate', 'Turquoise',
];
const GEMS_50: string[] = [
  'Bloodstone', 'Carnelian', 'Chalcedony', 'Chrysoprase',
  'Citrine', 'Jasper', 'Moonstone', 'Onyx',
  'Rock crystal', 'Sardonyx', 'Smoky quartz', 'Zircon',
];
const GEMS_100: string[] = [
  'Amber', 'Amethyst', 'Chrysoberyl', 'Coral',
  'Jade', 'Jet', 'Pearl', 'Spinel', 'Tourmaline',
];
const GEMS_500: string[] = [
  'Alexandrite', 'Aquamarine', 'Garnet', 'Black pearl',
  'Deep blue spinel', 'Golden yellow topaz',
];
const GEMS_1000: string[] = [
  'Emerald', 'White opal', 'Black opal', 'Fire opal',
  'Blue sapphire', 'Star ruby', 'Star sapphire',
];
const GEMS_5000: string[] = [
  'Black sapphire', 'Diamond', 'Jacinth', 'Oriental amethyst',
  'Oriental emerald', 'Ruby',
];

function randomGem(): string {
  const r = d(100);
  if (r <= 25) return `${pick(GEMS_10)} (10 gp)`;
  if (r <= 50) return `${pick(GEMS_50)} (50 gp)`;
  if (r <= 70) return `${pick(GEMS_100)} (100 gp)`;
  if (r <= 90) return `${pick(GEMS_500)} (500 gp)`;
  if (r <= 99) return `${pick(GEMS_1000)} (1,000 gp)`;
  return `${pick(GEMS_5000)} (5,000 gp)`;
}

// -- Jewelry / art objects ----------------------------------------------------

const JEWELRY_METAL  = ['Gold', 'Silver', 'Electrum', 'Platinum', 'Bronze', 'Brass'];
const JEWELRY_TYPE   = ['ring', 'necklace', 'bracelet', 'brooch', 'earrings', 'amulet', 'crown', 'diadem', 'pin', 'armband'];
const JEWELRY_DETAIL = ['set with pearls', 'engraved', 'with turquoise inlay', 'set with garnets', 'filigree work', 'enamelled', 'set with amethysts'];

function randomJewelry(): string {
  const value = roll(3, 6) * 100;  // 3d6×100 gp
  return `${pick(JEWELRY_METAL)} ${pick(JEWELRY_TYPE)} ${pick(JEWELRY_DETAIL)} (${value.toLocaleString()} gp)`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// -- Partial loot accumulator -------------------------------------------------

interface Coins { cp: number; sp: number; ep: number; gp: number; pp: number }

function zeros(): Coins { return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }; }

function add(a: Coins, b: Partial<Coins>): Coins {
  return {
    cp: a.cp + (b.cp ?? 0),
    sp: a.sp + (b.sp ?? 0),
    ep: a.ep + (b.ep ?? 0),
    gp: a.gp + (b.gp ?? 0),
    pp: a.pp + (b.pp ?? 0),
  };
}

// -- Individual treasure types (P–V, DMG p.138) --------------------------------

function rollIndividualCode(code: string): { coins: Partial<Coins>; gems: string[]; jewelry: string[]; magic: number } {
  const result = { coins: {} as Partial<Coins>, gems: [] as string[], jewelry: [] as string[], magic: 0 };
  switch (code.toUpperCase()) {
    case 'P': result.coins = { cp: roll(3, 8) }; break;
    case 'Q': result.coins = { sp: roll(1, 4) }; break;
    case 'R': result.coins = { ep: roll(1, 6) }; break;
    case 'S': result.coins = { gp: roll(1, 6) }; break;
    case 'T': result.coins = { pp: roll(1, 4) }; break;
    case 'U':
      if (pct(10)) result.coins.sp = (result.coins.sp ?? 0) + roll(1, 100);
      if (pct(10)) result.coins.gp = (result.coins.gp ?? 0) + roll(1, 100);
      if (pct(5)) for (let i = 0; i < roll(1, 4); i++) result.gems.push(randomGem());
      break;
    case 'V':
      if (pct(10)) result.coins.gp = (result.coins.gp ?? 0) + roll(1, 100);
      if (pct(5)) result.coins.pp = (result.coins.pp ?? 0) + roll(1, 100);
      if (pct(10)) for (let i = 0; i < roll(1, 4); i++) result.gems.push(randomGem());
      if (pct(5)) for (let i = 0; i < roll(1, 4); i++) result.jewelry.push(randomJewelry());
      break;
  }
  return result;
}

/**
 * Parse and roll an individual treasure expression such as "Q", "Q×3", "P,Q×2".
 * Returns aggregated coins, gems, jewelry, magic items.
 */
function rollIndividual(expr: string): { coins: Coins; gems: string[]; jewelry: string[]; magic: number } {
  const out = { coins: zeros(), gems: [] as string[], jewelry: [] as string[], magic: 0 };
  if (!expr || expr.toLowerCase() === 'none') return out;

  for (const part of expr.split(',').map((s) => s.trim())) {
    const m = part.match(/^([A-Z]+)(?:×(\d+))?$/i);
    if (!m) continue;
    const code = m[1].toUpperCase();
    const times = m[2] ? parseInt(m[2], 10) : 1;
    for (let i = 0; i < times; i++) {
      const r = rollIndividualCode(code);
      out.coins = add(out.coins, r.coins);
      out.gems.push(...r.gems);
      out.jewelry.push(...r.jewelry);
      out.magic += r.magic;
    }
  }
  return out;
}

// -- Lair treasure types (A–I, DMG p.137) -------------------------------------

export function rollLairLoot(type: string): LootResult {
  let cp = 0, sp = 0, ep = 0, gp = 0, pp = 0;
  const gems: string[] = [];
  const jewelry: string[] = [];
  let magicItems = 0;

  switch (type.toUpperCase()) {
    case 'A':
      if (pct(25)) cp = roll(1, 6) * 1000;
      if (pct(30)) sp = roll(1, 6) * 1000;
      if (pct(35)) ep = roll(1, 4) * 1000;
      if (pct(40)) gp = roll(2, 6) * 1000;
      if (pct(25)) pp = roll(1, 6) * 1000;
      if (pct(50)) for (let i = 0; i < roll(1, 6); i++) gems.push(randomGem());
      if (pct(50)) for (let i = 0; i < roll(1, 6); i++) jewelry.push(randomJewelry());
      if (pct(30)) magicItems = 3;
      break;
    case 'B':
      if (pct(50)) cp = roll(1, 8) * 1000;
      if (pct(25)) sp = roll(1, 6) * 1000;
      if (pct(25)) ep = roll(1, 4) * 1000;
      if (pct(25)) gp = roll(1, 6) * 1000;
      if (pct(25)) for (let i = 0; i < roll(1, 6); i++) gems.push(randomGem());
      if (pct(25)) for (let i = 0; i < roll(1, 6); i++) jewelry.push(randomJewelry());
      if (pct(10)) magicItems = 1;
      break;
    case 'C':
      if (pct(20)) cp = roll(1, 12) * 1000;
      if (pct(30)) sp = roll(1, 8) * 1000;
      if (pct(10)) ep = roll(1, 4) * 1000;
      if (pct(25)) for (let i = 0; i < roll(1, 4); i++) gems.push(randomGem());
      if (pct(25)) for (let i = 0; i < roll(1, 4); i++) jewelry.push(randomJewelry());
      if (pct(10)) magicItems = 2;
      break;
    case 'D':
      if (pct(10)) cp = roll(1, 8) * 1000;
      if (pct(15)) sp = roll(1, 12) * 1000;
      if (pct(15)) ep = roll(1, 8) * 1000;
      if (pct(50)) gp = roll(1, 12) * 1000;
      if (pct(30)) for (let i = 0; i < roll(1, 8); i++) gems.push(randomGem());
      if (pct(30)) for (let i = 0; i < roll(1, 8); i++) jewelry.push(randomJewelry());
      if (pct(20)) magicItems = 3;  // 2 items + 1 potion
      break;
    case 'E':
      if (pct(5))  cp = roll(1, 10) * 1000;
      if (pct(30)) sp = roll(1, 12) * 1000;
      if (pct(25)) ep = roll(1, 8) * 1000;
      if (pct(25)) gp = roll(1, 12) * 1000;
      if (pct(15)) for (let i = 0; i < roll(1, 10); i++) gems.push(randomGem());
      if (pct(15)) for (let i = 0; i < roll(1, 10); i++) jewelry.push(randomJewelry());
      if (pct(25)) magicItems = 4;  // 3 items + 1 scroll
      break;
    case 'F':
      if (pct(10)) sp = roll(2, 10) * 1000;
      if (pct(20)) ep = roll(1, 12) * 1000;
      if (pct(45)) gp = roll(1, 20) * 1000;
      if (pct(30)) for (let i = 0; i < roll(1, 12); i++) gems.push(randomGem());
      if (pct(10)) for (let i = 0; i < roll(1, 12); i++) jewelry.push(randomJewelry());
      if (pct(30)) magicItems = 4;  // 3 items + 1 potion (no arms/armour)
      break;
    case 'G':
      if (pct(50)) gp = roll(1, 4) * 10000;
      if (pct(50)) pp = roll(1, 3) * 1000;
      if (pct(30)) for (let i = 0; i < roll(1, 6); i++) gems.push(randomGem());
      if (pct(25)) for (let i = 0; i < roll(1, 3); i++) jewelry.push(randomJewelry());
      if (pct(35)) magicItems = 5;  // 4 items + 1 scroll
      break;
    case 'H':
      if (pct(25)) cp = roll(3, 8) * 1000;
      if (pct(40)) sp = roll(1, 20) * 1000;
      if (pct(40)) ep = roll(1, 16) * 1000;
      if (pct(55)) gp = roll(1, 40) * 1000;
      if (pct(25)) pp = roll(1, 20) * 1000;
      if (pct(50)) for (let i = 0; i < roll(1, 100); i++) gems.push(randomGem());
      if (pct(50)) for (let i = 0; i < roll(2, 20); i++) jewelry.push(randomJewelry());
      if (pct(15)) magicItems = 6;  // 4 items + 1 potion + 1 scroll
      break;
    case 'I':
      if (pct(30)) pp = roll(3, 10) * 100;
      if (pct(55)) for (let i = 0; i < roll(2, 6); i++) gems.push(randomGem());
      if (pct(50)) for (let i = 0; i < roll(2, 6); i++) jewelry.push(randomJewelry());
      if (pct(15)) magicItems = 1;
      break;
    case 'J':
      if (pct(25)) cp = roll(1, 4) * 1000;
      if (pct(10)) sp = roll(1, 3) * 1000;
      break;
    case 'K':
      if (pct(30)) sp = roll(1, 6) * 1000;
      if (pct(10)) ep = roll(1, 2) * 1000;
      break;
    case 'U':
      if (pct(20)) gp = roll(2, 6) * 1000;
      if (pct(45)) for (let i = 0; i < roll(3, 6); i++) gems.push(randomGem());
      if (pct(45)) for (let i = 0; i < roll(2, 6); i++) jewelry.push(randomJewelry());
      if (pct(30)) magicItems = 2;
      break;
  }

  // Build a summary string for the lair roll
  const parts: string[] = [];
  if (cp) parts.push(`${cp.toLocaleString()} cp`);
  if (sp) parts.push(`${sp.toLocaleString()} sp`);
  if (ep) parts.push(`${ep.toLocaleString()} ep`);
  if (gp) parts.push(`${gp.toLocaleString()} gp`);
  if (pp) parts.push(`${pp.toLocaleString()} pp`);

  return {
    encounterSummary: `Lair (Type ${type.toUpperCase()})`,
    cp, sp, ep, gp, pp, gems, jewelry, magicItems,
    lairTypes: [],
  };
}

// -- Main encounter loot generator --------------------------------------------

/** Strip a trailing number from a name so "Goblin 3" → "Goblin". */
function stripNumber(name: string): string {
  return name.replace(/\s+\d+$/, '').trim();
}

/**
 * Generate individual treasure for a list of defeated combatants.
 * Returns a LootResult with aggregated coin totals, gems, jewelry, magic items,
 * plus the unique set of lair types to prompt the DM to roll for lair treasure.
 */
export function generateLoot(
  defeated: Array<{ name: string }>,
): LootResult {
  const coins = zeros();
  const gems: string[] = [];
  const jewelry: string[] = [];
  let magicItems = 0;
  const lairTypeSet = new Set<string>();

  // Count for the summary string
  const counts = new Map<string, number>();
  for (const m of defeated) {
    const baseName = stripNumber(m.name);
    counts.set(baseName, (counts.get(baseName) ?? 0) + 1);
  }
  const encounterSummary = [...counts.entries()]
    .map(([name, n]) => (n === 1 ? name : `${n} × ${name}`))
    .join(', ');

  // Roll individual treasure for each monster
  for (const m of defeated) {
    const baseName = stripNumber(m.name);
    const template = MONSTERS.find(
      (t) => t.name.toLowerCase() === baseName.toLowerCase(),
    );
    if (!template) continue;

    if (template.individual && template.individual !== 'none') {
      const r = rollIndividual(template.individual);
      Object.assign(coins, add(coins, r.coins));
      gems.push(...r.gems);
      jewelry.push(...r.jewelry);
      magicItems += r.magic;
    }

    if (template.lairType && template.lairType !== 'none') {
      lairTypeSet.add(template.lairType.toUpperCase());
    }
  }

  return {
    encounterSummary,
    cp: coins.cp, sp: coins.sp, ep: coins.ep, gp: coins.gp, pp: coins.pp,
    gems, jewelry, magicItems,
    lairTypes: [...lairTypeSet].sort(),
  };
}
