// AD&D 2e treasure generation — DMG Chapter 5 (Treasure Tables).
// Individual types P–V are per-monster body loot.
// Lair types A–I are rolled once for the monster's lair.
// Gem/jewelry tables are from the DMG gem and art object tables.

import type { LootResult, XPEntry } from '../types.ts';
import { MONSTERS } from './monsters.ts';
import type { MonsterTemplate } from './monsters.ts';
import { rollMagicItem } from './magicItems.ts';

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

function rollIndividualCode(code: string): { coins: Partial<Coins>; gems: string[]; jewelry: string[]; magic: string[] } {
  const result = { coins: {} as Partial<Coins>, gems: [] as string[], jewelry: [] as string[], magic: [] as string[] };
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
      if (pct(5)) result.magic.push(rollMagicItem());
      break;
    case 'V':
      if (pct(10)) result.coins.gp = (result.coins.gp ?? 0) + roll(1, 100);
      if (pct(5)) result.coins.pp = (result.coins.pp ?? 0) + roll(1, 100);
      if (pct(10)) for (let i = 0; i < roll(1, 4); i++) result.gems.push(randomGem());
      if (pct(5)) for (let i = 0; i < roll(1, 4); i++) result.jewelry.push(randomJewelry());
      if (pct(10)) result.magic.push(rollMagicItem());
      break;
  }
  return result;
}

/**
 * Parse and roll an individual treasure expression such as "Q", "Q×3", "P,Q×2".
 * Returns aggregated coins, gems, jewelry, magic items.
 */
function rollIndividual(expr: string): { coins: Coins; gems: string[]; jewelry: string[]; magic: string[] } {
  const out = { coins: zeros(), gems: [] as string[], jewelry: [] as string[], magic: [] as string[] };
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
      out.magic.push(...r.magic);
    }
  }
  return out;
}

// -- XP calculation (DMG Table 31 — Experience Points for Monsters) -----------

/** Parse an HD string into a base number and whether it has a positive bonus. */
function parseHD(hd: string): { num: number; bonus: boolean } {
  const s = hd.trim().toLowerCase();
  if (s.includes('hp')) {                     // fixed HP (e.g. "45 hp")
    const m = s.match(/(\d+)/);
    return { num: Math.round((m ? parseInt(m[1], 10) : 10) / 4.5), bonus: false };
  }
  if (s.includes('/')) return { num: 0, bonus: false };     // fractional (1/2, 1/4)
  const open = s.match(/^(\d+)\+$/);                        // open-ended "11+"
  if (open) return { num: parseInt(open[1], 10), bonus: true };
  const full = s.match(/^(\d+)([+-])(\d+)$/);
  if (full) return { num: parseInt(full[1], 10), bonus: full[2] === '+' };
  const plain = parseInt(s, 10);
  return { num: isNaN(plain) ? 1 : plain, bonus: false };
}

/** 2e DMG Table 31 XP lookup. */
function xpTable(num: number, bonus: boolean): { base: number; sa: number } {
  if (num < 1)              return { base: 7,     sa: 1 };
  if (num === 1 && !bonus)  return { base: 15,    sa: 3 };
  if (num === 1)            return { base: 35,    sa: 4 };
  if (num === 2 && !bonus)  return { base: 65,    sa: 8 };
  if (num === 2)            return { base: 120,   sa: 12 };
  if (num === 3 && !bonus)  return { base: 175,   sa: 14 };
  if (num === 3)            return { base: 270,   sa: 20 };
  if (num === 4 && !bonus)  return { base: 420,   sa: 30 };
  if (num === 4)            return { base: 650,   sa: 40 };
  if (num === 5 && !bonus)  return { base: 975,   sa: 50 };
  if (num === 5)            return { base: 1400,  sa: 75 };
  if (num === 6 && !bonus)  return { base: 2000,  sa: 100 };
  if (num === 6)            return { base: 2500,  sa: 175 };
  if (num === 7 && !bonus)  return { base: 3000,  sa: 250 };
  if (num === 7)            return { base: 3500,  sa: 275 };
  if (num === 8 && !bonus)  return { base: 4000,  sa: 300 };
  if (num === 8)            return { base: 5000,  sa: 400 };
  if (num <= 9 && !bonus)   return { base: 6000,  sa: 500 };
  if (num <= 10)            return { base: 7500,  sa: 600 };
  if (num <= 12)            return { base: 9000,  sa: 700 };
  if (num <= 16)            return { base: 11000, sa: 900 };
  if (num <= 20)            return { base: 13000, sa: 1100 };
  return                          { base: 15000,  sa: 1250 };
}

/** Special abilities that each add one SA bonus. */
const SA_PATTERNS = [
  /breath weapon/i, /energy drain/i, /level drain/i, /paralys/i,
  /\bpoison\b/i, /regenerat/i, /spell.abilit/i, /spell-like/i,
  /gaze/i, /petrif/i, /swallow/i, /constrict/i, /disease/i,
  /stench/i, /fear aura/i, /charm/i, /blood drain/i, /str drain/i,
  /mind blast/i, /\bweb\b/i, /wail/i, /eye ray/i,
];

function countSA(notes?: string): number {
  if (!notes) return 0;
  return SA_PATTERNS.filter((p) => p.test(notes)).length;
}

export function monsterXP(template: MonsterTemplate): number {
  const { num, bonus } = parseHD(template.hd);
  const { base, sa } = xpTable(num, bonus);
  return base + sa * countSA(template.notes);
}

// -- Treasure XP (GP-equivalent value → XP, per AD&D 2e optional treasure rules) --

/** Extract a gp value from descriptions like "Amber (100 gp)" or "Gold ring (1,200 gp)". */
function extractGP(desc: string): number {
  const m = desc.match(/\(([\d,]+)\s*gp\)/i);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
}

/** Convert coin totals to a GP equivalent (1 gp = 1 XP baseline). */
function coinsToGP(cp: number, sp: number, ep: number, gp: number, pp: number): number {
  return Math.floor(cp / 100 + sp / 10 + ep / 2 + gp + pp * 5);
}

function parsePlus(s: string): number {
  const m = s.match(/\+(\d)/);
  return m ? parseInt(m[1], 10) : 1;
}

/**
 * Estimate a magic item's GP/XP value from its name, using 2e DMG Table 60 values.
 * These are intentionally approximate — the DM can adjust.
 */
function magicItemGP(name: string): number {
  const s = name.toLowerCase();
  // Potions
  if (s.startsWith('potion of extra-healing'))  return 400;
  if (s.startsWith('potion of healing'))         return 200;
  if (s.startsWith('potion of super-heroism'))   return 750;
  if (s.startsWith('potion'))                    return 300;
  // Scrolls
  if (s.includes('protection'))                  return 750;
  if (s.startsWith('scroll'))                    return 500;
  // Rings
  if (s.includes('three wishes') || s.includes('multiple wishes')) return 45000;
  if (s.startsWith('ring of protection'))        return parsePlus(s) * 2000 + 1000;
  if (s.startsWith('ring'))                      return 5000;
  // Rods
  if (s.startsWith('rod'))                       return 15000;
  // Staves
  if (s.includes('staff of the magi'))           return 25000;
  if (s.includes('staff of power'))              return 20000;
  if (s.startsWith('staff'))                     return 12000;
  // Wands
  if (s.startsWith('wand'))                      return 4500;
  // Swords & blades
  if (/\b(sword|blade)\b/.test(s)) {
    const plus = parsePlus(s);
    let v = plus * 2000 + 2000;
    if (s.includes('vorpal'))       v += 12000;
    if (s.includes('holy avenger')) v = 30000;
    if (s.includes('dancing'))      v += 6000;
    if (s.includes('life stealing') || s.includes('sharpness')) v += 3000;
    return v;
  }
  // Misc weapons
  if (/\b(axe|hammer|mace|dagger|spear|arrow|bolt|trident|flail|morning star)\b/.test(s)) {
    return parsePlus(s) * 1000 + 1000;
  }
  // Armour
  if (/\b(mail|armour|armor|plate)\b/.test(s)) {
    if (s.includes('etherealness')) return 10000;
    return parsePlus(s) * 2500 + 1000;
  }
  if (s.startsWith('shield'))                    return parsePlus(s) * 1000 + 500;
  // Named misc magic (high-value items)
  if (s.includes('deck of many things'))         return 25000;
  if (s.includes('sphere of annihilation'))      return 25000;
  if (s.includes('orb of dragonkind'))           return 45000;
  if (s.includes('tome of') || s.includes('manual of')) return 20000;
  if (s.includes('helm of brilliance'))          return 12500;
  if (s.includes('robe of the archmagi'))        return 22000;
  if (s.includes('ioun stone'))                  return 4000;
  if (s.includes('carpet of flying'))            return 6000;
  if (s.includes('portable hole'))               return 5000;
  if (s.includes('bag of holding'))              return 3500;
  if (s.includes('girdle of'))                   return 6000;
  if (s.includes('cloak of displacement'))       return 5000;
  if (s.includes('cube of force'))               return 6000;
  if (s.includes('gauntlets of ogre'))           return 5000;
  // Misc magic average
  return 2000;
}

/** Sum all treasure XP for a set of loot items. */
export function calculateTreasureXP(
  cp: number, sp: number, ep: number, gp: number, pp: number,
  gems: string[], jewelry: string[], magicItems: string[],
): number {
  const coinXP  = coinsToGP(cp, sp, ep, gp, pp);
  const gemXP   = gems.reduce((s, g) => s + extractGP(g), 0);
  const jewXP   = jewelry.reduce((s, j) => s + extractGP(j), 0);
  const magicXP = magicItems.reduce((s, i) => s + magicItemGP(i), 0);
  return coinXP + gemXP + jewXP + magicXP;
}

// -- Lair treasure types (A–I, DMG p.137) -------------------------------------

function rollItems(count: number): string[] {
  return Array.from({ length: count }, rollMagicItem);
}

export function rollLairLoot(type: string): LootResult {
  let cp = 0, sp = 0, ep = 0, gp = 0, pp = 0;
  const gems: string[] = [];
  const jewelry: string[] = [];
  let magicItems: string[] = [];

  switch (type.toUpperCase()) {
    case 'A':
      if (pct(25)) cp = roll(1, 6) * 1000;
      if (pct(30)) sp = roll(1, 6) * 1000;
      if (pct(35)) ep = roll(1, 4) * 1000;
      if (pct(40)) gp = roll(2, 6) * 1000;
      if (pct(25)) pp = roll(1, 6) * 1000;
      if (pct(50)) for (let i = 0; i < roll(1, 6); i++) gems.push(randomGem());
      if (pct(50)) for (let i = 0; i < roll(1, 6); i++) jewelry.push(randomJewelry());
      if (pct(30)) magicItems = rollItems(3);
      break;
    case 'B':
      if (pct(50)) cp = roll(1, 8) * 1000;
      if (pct(25)) sp = roll(1, 6) * 1000;
      if (pct(25)) ep = roll(1, 4) * 1000;
      if (pct(25)) gp = roll(1, 6) * 1000;
      if (pct(25)) for (let i = 0; i < roll(1, 6); i++) gems.push(randomGem());
      if (pct(25)) for (let i = 0; i < roll(1, 6); i++) jewelry.push(randomJewelry());
      if (pct(10)) magicItems = rollItems(1);
      break;
    case 'C':
      if (pct(20)) cp = roll(1, 12) * 1000;
      if (pct(30)) sp = roll(1, 8) * 1000;
      if (pct(10)) ep = roll(1, 4) * 1000;
      if (pct(25)) for (let i = 0; i < roll(1, 4); i++) gems.push(randomGem());
      if (pct(25)) for (let i = 0; i < roll(1, 4); i++) jewelry.push(randomJewelry());
      if (pct(10)) magicItems = rollItems(2);
      break;
    case 'D':
      if (pct(10)) cp = roll(1, 8) * 1000;
      if (pct(15)) sp = roll(1, 12) * 1000;
      if (pct(15)) ep = roll(1, 8) * 1000;
      if (pct(50)) gp = roll(1, 12) * 1000;
      if (pct(30)) for (let i = 0; i < roll(1, 8); i++) gems.push(randomGem());
      if (pct(30)) for (let i = 0; i < roll(1, 8); i++) jewelry.push(randomJewelry());
      if (pct(20)) magicItems = rollItems(3);  // 2 items + 1 potion
      break;
    case 'E':
      if (pct(5))  cp = roll(1, 10) * 1000;
      if (pct(30)) sp = roll(1, 12) * 1000;
      if (pct(25)) ep = roll(1, 8) * 1000;
      if (pct(25)) gp = roll(1, 12) * 1000;
      if (pct(15)) for (let i = 0; i < roll(1, 10); i++) gems.push(randomGem());
      if (pct(15)) for (let i = 0; i < roll(1, 10); i++) jewelry.push(randomJewelry());
      if (pct(25)) magicItems = rollItems(4);  // 3 items + 1 scroll
      break;
    case 'F':
      if (pct(10)) sp = roll(2, 10) * 1000;
      if (pct(20)) ep = roll(1, 12) * 1000;
      if (pct(45)) gp = roll(1, 20) * 1000;
      if (pct(30)) for (let i = 0; i < roll(1, 12); i++) gems.push(randomGem());
      if (pct(10)) for (let i = 0; i < roll(1, 12); i++) jewelry.push(randomJewelry());
      if (pct(30)) magicItems = rollItems(4);  // 3 items + 1 potion (no arms/armour)
      break;
    case 'G':
      if (pct(50)) gp = roll(1, 4) * 10000;
      if (pct(50)) pp = roll(1, 3) * 1000;
      if (pct(30)) for (let i = 0; i < roll(1, 6); i++) gems.push(randomGem());
      if (pct(25)) for (let i = 0; i < roll(1, 3); i++) jewelry.push(randomJewelry());
      if (pct(35)) magicItems = rollItems(5);  // 4 items + 1 scroll
      break;
    case 'H':
      if (pct(25)) cp = roll(3, 8) * 1000;
      if (pct(40)) sp = roll(1, 20) * 1000;
      if (pct(40)) ep = roll(1, 16) * 1000;
      if (pct(55)) gp = roll(1, 40) * 1000;
      if (pct(25)) pp = roll(1, 20) * 1000;
      if (pct(50)) for (let i = 0; i < roll(1, 100); i++) gems.push(randomGem());
      if (pct(50)) for (let i = 0; i < roll(2, 20); i++) jewelry.push(randomJewelry());
      if (pct(15)) magicItems = rollItems(6);  // 4 items + 1 potion + 1 scroll
      break;
    case 'I':
      if (pct(30)) pp = roll(3, 10) * 100;
      if (pct(55)) for (let i = 0; i < roll(2, 6); i++) gems.push(randomGem());
      if (pct(50)) for (let i = 0; i < roll(2, 6); i++) jewelry.push(randomJewelry());
      if (pct(15)) magicItems = rollItems(1);
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
      if (pct(30)) magicItems = rollItems(2);
      break;
  }

  // Build a summary string for the lair roll
  const parts: string[] = [];
  if (cp) parts.push(`${cp.toLocaleString()} cp`);
  if (sp) parts.push(`${sp.toLocaleString()} sp`);
  if (ep) parts.push(`${ep.toLocaleString()} ep`);
  if (gp) parts.push(`${gp.toLocaleString()} gp`);
  if (pp) parts.push(`${pp.toLocaleString()} pp`);

  const treasureXP = calculateTreasureXP(cp, sp, ep, gp, pp, gems, jewelry, magicItems);

  return {
    encounterSummary: `Lair (Type ${type.toUpperCase()})`,
    cp, sp, ep, gp, pp, gems, jewelry, magicItems,
    lairTypes: [],
    xp: treasureXP,
    monsterXP: 0,
    treasureXP,
    xpBreakdown: [],
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
  defeated: Array<{ name: string; individualTreasure?: string; lairTreasure?: string; manualXP?: number }>,
): LootResult {
  const coins = zeros();
  const gems: string[] = [];
  const jewelry: string[] = [];
  let magicItems: string[] = [];
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

    const individualExpr = template?.individual ?? m.individualTreasure;
    if (individualExpr && individualExpr !== 'none') {
      const r = rollIndividual(individualExpr);
      Object.assign(coins, add(coins, r.coins));
      gems.push(...r.gems);
      jewelry.push(...r.jewelry);
      magicItems.push(...r.magic);
    }

    const lairType = template?.lairType ?? m.lairTreasure;
    if (lairType && lairType !== 'none') {
      lairTypeSet.add(lairType.toUpperCase());
    }
  }

  // -- Monster XP -----------------------------------------------------------
  const xpBreakdown: XPEntry[] = [];
  let monsterXPTotal = 0;
  for (const [name, count] of counts) {
    const template = MONSTERS.find((t) => t.name.toLowerCase() === name.toLowerCase());
    const sample = defeated.find((m) => stripNumber(m.name).toLowerCase() === name.toLowerCase());
    const xpEach = sample?.manualXP !== undefined ? sample.manualXP : (template ? monsterXP(template) : 0);
    const subtotal = xpEach * count;
    monsterXPTotal += subtotal;
    if (xpEach > 0) xpBreakdown.push({ name, count, xpEach, subtotal });
  }

  // -- Treasure XP (GP-equivalent value of individual loot) ----------------
  const treasureXP = calculateTreasureXP(
    coins.cp, coins.sp, coins.ep, coins.gp, coins.pp,
    gems, jewelry, magicItems,
  );

  return {
    encounterSummary,
    cp: coins.cp, sp: coins.sp, ep: coins.ep, gp: coins.gp, pp: coins.pp,
    gems, jewelry, magicItems,
    lairTypes: [...lairTypeSet].sort(),
    xp: monsterXPTotal + treasureXP,
    monsterXP: monsterXPTotal,
    treasureXP,
    xpBreakdown,
  };
}
