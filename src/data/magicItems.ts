// AD&D 2e magic item tables — DMG Appendix B / Table 88.
// Weights reflect relative frequencies from the source tables.
// (C) after a name = cursed item.

// -- Helpers ------------------------------------------------------------------

function d(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

type WEntry<T> = { w: number; v: T };

function wpick<T>(entries: WEntry<T>[]): T {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.v;
  }
  return entries[entries.length - 1].v;
}

function pickStr(entries: Array<{ w: number; v: string }>): string {
  return wpick(entries);
}

// -- Sword sub-types ----------------------------------------------------------

const SWORD_TYPE = [
  { w: 4, v: 'Long Sword' },
  { w: 3, v: 'Short Sword' },
  { w: 2, v: 'Broad Sword' },
  { w: 2, v: 'Bastard Sword' },
  { w: 1, v: 'Two-Handed Sword' },
];

const SWORD_BONUS = [
  { w: 10, v: '+1' }, { w: 6, v: '+2' }, { w: 4, v: '+3' },
  { w: 2, v: '+4' }, { w: 1, v: '+5' },
];

const WEAPON_BONUS = [
  { w: 10, v: '+1' }, { w: 5, v: '+2' }, { w: 3, v: '+3' },
];

const ARMOR_BONUS = [
  { w: 8, v: '+1' }, { w: 5, v: '+2' }, { w: 3, v: '+3' },
  { w: 1, v: '+4' }, { w: 1, v: '+5' },
];

const ARMOR_TYPE = [
  { w: 3, v: 'Leather Armour' },
  { w: 3, v: 'Studded Leather' },
  { w: 3, v: 'Ring Mail' },
  { w: 3, v: 'Chain Mail' },
  { w: 2, v: 'Splint Mail' },
  { w: 2, v: 'Banded Mail' },
  { w: 2, v: 'Field Plate' },
  { w: 1, v: 'Full Plate' },
];

const SWORD_VS = [
  { w: 4, v: 'undead' }, { w: 3, v: 'dragons' }, { w: 3, v: 'lycanthropes' },
  { w: 2, v: 'regenerating creatures' }, { w: 2, v: 'giant-class creatures' },
  { w: 2, v: 'magic-users' },
];

const ARROW_COUNT = [
  { w: 4, v: '2d6' }, { w: 3, v: '1d10+6' }, { w: 2, v: '1d4+2' },
];

function rollArrows(bonus: string): string {
  const n = wpick(ARROW_COUNT);
  const count = n === '2d6' ? d(6) + d(6) : n === '1d10+6' ? d(10) + 6 : d(4) + 2;
  return `${count} × Arrow ${bonus}`;
}

const IOUN_STONES = [
  'Clear spindle (sustains without food/water)',
  'Dusty rose prism (AC +1)',
  'Deep red sphere (Dex +2)',
  'Incandescent blue sphere (Wis +2)',
  'Pale blue rhomboid (Str +2)',
  'Pink and green sphere (Cha +2)',
  'Scarlet and blue sphere (Int +2)',
  'Dark blue rhomboid (alertness, never surprised)',
  'Vibrant purple prism (stores 3 spells)',
  'Iridescent spindle (sustains without air)',
  'Pale lavender ellipsoid (absorbs spells up to 4th level)',
  'Lavender and green ellipsoid (absorbs spells up to 8th level)',
];

const FIGURINES = [
  'Bronze Griffon', 'Ebony Fly', 'Golden Lions (pair)',
  'Ivory Goats (3)', 'Marble Elephant', 'Obsidian Steed', 'Onyx Dog',
  'Serpentine Owl',
];

const PRAYER_BEADS = [
  'Prayer Beads of Blessing', 'Prayer Beads of Curing',
  'Prayer Beads of Karma', 'Prayer Beads of Smiting',
  'Prayer Beads of Summons', 'Prayer Beads of Wind Walking',
];

const CLOAK_PROT = [
  { w: 5, v: '+1' }, { w: 3, v: '+2' }, { w: 2, v: '+3' },
];

const BRACERS_AC = [
  { w: 5, v: 'AC 8' }, { w: 4, v: 'AC 6' }, { w: 3, v: 'AC 4' },
  { w: 2, v: 'AC 2' },
];

const GIRDLE_STR = [
  { w: 4, v: 'Hill Giant Strength (19)' },
  { w: 3, v: 'Stone Giant Strength (20)' },
  { w: 2, v: 'Frost Giant Strength (21)' },
  { w: 2, v: 'Fire Giant Strength (22)' },
  { w: 1, v: 'Cloud Giant Strength (23)' },
  { w: 1, v: 'Storm Giant Strength (24)' },
];

// -- Sub-table functions -------------------------------------------------------

function potion(): string {
  return pickStr([
    { w: 10, v: 'Potion of Healing' },
    { w: 8,  v: 'Potion of Extra-Healing' },
    { w: 6,  v: 'Potion of Heroism' },
    { w: 6,  v: 'Potion of Invisibility' },
    { w: 5,  v: 'Potion of Flying' },
    { w: 5,  v: 'Potion of Giant Strength' },
    { w: 5,  v: 'Potion of ESP' },
    { w: 5,  v: 'Potion of Fire Resistance' },
    { w: 5,  v: 'Potion of Super-Heroism' },
    { w: 5,  v: 'Potion of Invulnerability' },
    { w: 4,  v: 'Potion of Climbing' },
    { w: 4,  v: 'Potion of Levitation' },
    { w: 4,  v: 'Potion of Diminution' },
    { w: 4,  v: 'Potion of Polymorph Self' },
    { w: 4,  v: 'Potion of Clairvoyance' },
    { w: 4,  v: 'Potion of Water Breathing' },
    { w: 4,  v: 'Potion of Speed' },
    { w: 3,  v: 'Potion of Dragon Control' },
    { w: 3,  v: 'Potion of Giant Control' },
    { w: 3,  v: 'Potion of Gaseous Form' },
    { w: 3,  v: 'Potion of Undead Control' },
    { w: 3,  v: 'Potion of Animal Control' },
    { w: 3,  v: 'Potion of Clairaudience' },
    { w: 2,  v: 'Potion of Growth' },
    { w: 2,  v: 'Potion of Longevity' },
    { w: 2,  v: 'Potion of Treasure Finding' },
    { w: 2,  v: 'Philtre of Love' },
    { w: 3,  v: 'Potion of Delusion (C)' },
    { w: 3,  v: 'Potion of Poison (C)' },
  ]);
}

function scroll(): string {
  return pickStr([
    { w: 12, v: `Spell Scroll — ${d(4)} spell${d(1) > 1 ? 's' : ''} (1st–3rd level)` },
    { w: 10, v: `Spell Scroll — ${d(3) + 1} spells (1st–4th level)` },
    { w: 7,  v: `Spell Scroll — ${d(3)} spells (3rd–6th level)` },
    { w: 4,  v: `Spell Scroll — ${d(2)} spells (5th–9th level)` },
    { w: 8,  v: 'Scroll of Protection from Magic' },
    { w: 8,  v: 'Scroll of Protection from Undead' },
    { w: 7,  v: 'Scroll of Protection from Lycanthropes' },
    { w: 6,  v: 'Scroll of Protection from Petrification' },
    { w: 6,  v: 'Scroll of Protection from Fire' },
    { w: 5,  v: 'Scroll of Protection from Cold' },
    { w: 5,  v: 'Scroll of Protection from Electricity' },
    { w: 5,  v: 'Scroll of Protection from Elementals' },
    { w: 4,  v: 'Scroll of Protection from Devils/Demons' },
    { w: 4,  v: 'Scroll of Protection from Gas' },
    { w: 5,  v: 'Cursed Scroll (C)' },
  ]);
}

function ring(): string {
  return pickStr([
    { w: 10, v: 'Ring of Protection +1' },
    { w: 7,  v: 'Ring of Protection +2' },
    { w: 4,  v: 'Ring of Protection +3' },
    { w: 7,  v: 'Ring of Invisibility' },
    { w: 6,  v: 'Ring of Feather Falling' },
    { w: 6,  v: 'Ring of Fire Resistance' },
    { w: 6,  v: 'Ring of Free Action' },
    { w: 6,  v: 'Ring of Sustenance' },
    { w: 5,  v: 'Ring of Animal Friendship' },
    { w: 5,  v: 'Ring of Blinking' },
    { w: 5,  v: 'Ring of Water Walking' },
    { w: 5,  v: 'Ring of Swimming' },
    { w: 5,  v: 'Ring of Warmth' },
    { w: 4,  v: 'Ring of Human Influence' },
    { w: 4,  v: 'Ring of Jumping' },
    { w: 4,  v: 'Ring of Chameleon Power' },
    { w: 3,  v: 'Ring of Spell Storing' },
    { w: 3,  v: 'Ring of Spell Turning' },
    { w: 3,  v: 'Ring of Telekinesis' },
    { w: 3,  v: 'Ring of X-Ray Vision' },
    { w: 2,  v: 'Ring of Regeneration' },
    { w: 2,  v: 'Ring of Wizardry' },
    { w: 2,  v: 'Ring of Djinni Summoning' },
    { w: 2,  v: 'Ring of Elemental Command' },
    { w: 1,  v: 'Ring of Three Wishes' },
    { w: 1,  v: 'Ring of Multiple Wishes' },
    { w: 4,  v: 'Ring of Contrariness (C)' },
    { w: 3,  v: 'Ring of Weakness (C)' },
  ]);
}

function rod(): string {
  return pickStr([
    { w: 10, v: 'Rod of Cancellation' },
    { w: 10, v: 'Rod of Smiting' },
    { w: 9,  v: 'Rod of the Python' },
    { w: 8,  v: 'Rod of Absorption' },
    { w: 8,  v: 'Rod of Terror' },
    { w: 8,  v: 'Rod of Withering' },
    { w: 6,  v: 'Rod of Beguiling' },
    { w: 6,  v: 'Rod of Rulership' },
    { w: 6,  v: 'Rod of Security' },
    { w: 6,  v: 'Rod of Splendor' },
    { w: 5,  v: 'Rod of Lordly Might' },
    { w: 5,  v: 'Rod of Resurrection' },
    { w: 4,  v: 'Rod of Flailing' },
    { w: 3,  v: 'Rod of Alertness' },
  ]);
}

function staff(): string {
  return pickStr([
    { w: 10, v: 'Staff of Striking' },
    { w: 10, v: 'Quarterstaff +2' },
    { w: 8,  v: 'Staff of Command' },
    { w: 8,  v: 'Staff of Curing' },
    { w: 8,  v: 'Staff of Thunder and Lightning' },
    { w: 8,  v: 'Staff of the Woodlands' },
    { w: 7,  v: 'Staff of Slithering Snake' },
    { w: 7,  v: 'Staff of Swarming Insects' },
    { w: 7,  v: 'Staff of Withering' },
    { w: 6,  v: 'Staff of the Serpent (Python)' },
    { w: 6,  v: 'Staff of Healing' },
    { w: 5,  v: 'Staff of Power' },
    { w: 3,  v: 'Staff of the Magi' },
  ]);
}

function wand(): string {
  return pickStr([
    { w: 10, v: 'Wand of Magic Missiles' },
    { w: 8,  v: 'Wand of Fear' },
    { w: 8,  v: 'Wand of Fire' },
    { w: 8,  v: 'Wand of Lightning' },
    { w: 8,  v: 'Wand of Illumination' },
    { w: 8,  v: 'Wand of Magic Detection' },
    { w: 7,  v: 'Wand of Illusion' },
    { w: 7,  v: 'Wand of Enemy Detection' },
    { w: 7,  v: 'Wand of Frost' },
    { w: 7,  v: 'Wand of Monster Detection' },
    { w: 6,  v: 'Wand of Paralyzation' },
    { w: 6,  v: 'Wand of Polymorphing' },
    { w: 6,  v: 'Wand of Cold' },
    { w: 5,  v: 'Wand of Negation' },
    { w: 5,  v: 'Wand of Metal/Mineral Detection' },
    { w: 5,  v: 'Wand of Trap Detection' },
    { w: 5,  v: 'Wand of Secret Door Detection' },
    { w: 2,  v: 'Wand of Wonder' },
  ]);
}

function armor(): string {
  // One-third chance of shield; otherwise armour
  if (d(3) === 1) {
    const bonus = wpick([
      { w: 5, v: '+1' }, { w: 3, v: '+2' }, { w: 2, v: '+3' },
    ]);
    return pickStr([
      { w: 5, v: `Shield ${bonus}` },
      { w: 3, v: `Large Shield ${bonus}` },
      { w: 2, v: `Buckler ${bonus}` },
      { w: 1, v: 'Shield of the Hidden Lord' },
      { w: 1, v: 'Shield +1, +4 vs. Missiles' },
    ]);
  }
  const special = pickStr([
    { w: 3, v: `${wpick(ARMOR_TYPE)} ${wpick(ARMOR_BONUS)}` },
    { w: 3, v: `${wpick(ARMOR_TYPE)} ${wpick(ARMOR_BONUS)}` },
    { w: 3, v: `${wpick(ARMOR_TYPE)} ${wpick(ARMOR_BONUS)}` },
    { w: 2, v: 'Elven Chain Mail +5' },
    { w: 2, v: 'Armour of Blinding +1 (C)' },
    { w: 1, v: 'Plate Mail of Etherealness' },
    { w: 1, v: 'Plate Mail of Fear' },
    { w: 1, v: 'Armour of Command' },
  ]);
  return special;
}

function sword(): string {
  const type = wpick(SWORD_TYPE);
  return pickStr([
    { w: 10, v: `${type} ${wpick(SWORD_BONUS)}` },
    { w: 6,  v: `${type} +1 / +3 vs. ${wpick(SWORD_VS)}` },
    { w: 4,  v: `${type} +1 / +4 vs. ${wpick(SWORD_VS)}` },
    { w: 4,  v: `Flame Tongue ${type} +1 / +3 vs. cold-using, +3 vs. undead` },
    { w: 4,  v: `${type} of Wounding +1` },
    { w: 3,  v: `${type} of Life Stealing +1` },
    { w: 3,  v: `${type} of Berserking +2 (C)` },
    { w: 3,  v: `${type} of the Planes +1` },
    { w: 2,  v: `Nine Lives Stealer ${type} +2` },
    { w: 2,  v: `${type} of Dancing +4` },
    { w: 2,  v: `${type} of Luck Blade +1 (1d4 wishes)` },
    { w: 2,  v: `${type} of Sharpness +3` },
    { w: 1,  v: 'Holy Avenger Long Sword +5 (paladin only)' },
    { w: 1,  v: 'Vorpal Long Sword +3' },
  ]);
}

function miscWeapon(): string {
  return pickStr([
    { w: 10, v: rollArrows('+1') },
    { w: 6,  v: rollArrows('+2') },
    { w: 4,  v: `${d(3)} × Arrow of Slaying (specify type)` },
    { w: 8,  v: `Battle Axe ${wpick(WEAPON_BONUS)}` },
    { w: 6,  v: `Hammer ${wpick(WEAPON_BONUS)}` },
    { w: 4,  v: `Hammer +2, Throwing` },
    { w: 7,  v: `Dagger ${wpick(WEAPON_BONUS)}` },
    { w: 4,  v: 'Dagger of Venom +1' },
    { w: 3,  v: 'Dagger of Returning +2' },
    { w: 7,  v: `Mace ${wpick(WEAPON_BONUS)}` },
    { w: 6,  v: `Spear ${wpick(WEAPON_BONUS)}` },
    { w: 3,  v: 'Trident +1' },
    { w: 3,  v: 'Javelin of Lightning' },
    { w: 3,  v: 'Javelin of Piercing' },
    { w: 3,  v: `Morning Star ${wpick(WEAPON_BONUS)}` },
    { w: 3,  v: `Flail ${wpick(WEAPON_BONUS)}` },
    { w: 2,  v: 'Net of Snaring' },
    { w: 2,  v: 'Crossbow of Accuracy +3' },
    { w: 2,  v: 'Short Bow +2' },
    { w: 2,  v: `${d(10)+5} × Bolt +2` },
  ]);
}

function miscMagic(): string {
  return pickStr([
    // Bags & containers
    { w: 5,  v: 'Bag of Holding' },
    { w: 4,  v: 'Bag of Tricks' },
    { w: 2,  v: 'Bag of Devouring (C)' },
    { w: 2,  v: 'Portable Hole' },
    { w: 2,  v: 'Heward\'s Handy Haversack' },
    // Cloaks & robes
    { w: 4,  v: `Cloak of Protection ${wpick(CLOAK_PROT)}` },
    { w: 4,  v: 'Cloak of Elvenkind' },
    { w: 3,  v: 'Cloak of Displacement' },
    { w: 2,  v: 'Cloak of the Bat' },
    { w: 2,  v: 'Robe of Useful Items' },
    { w: 2,  v: 'Robe of Eyes' },
    { w: 1,  v: 'Robe of the Archmagi' },
    { w: 1,  v: 'Robe of Stars' },
    // Boots & gloves
    { w: 4,  v: 'Boots of Elvenkind' },
    { w: 3,  v: 'Boots of Speed' },
    { w: 3,  v: 'Boots of Striding and Springing' },
    { w: 3,  v: 'Gauntlets of Dexterity' },
    { w: 3,  v: 'Gauntlets of Ogre Power' },
    { w: 2,  v: 'Boots of Levitation' },
    { w: 2,  v: 'Boots of Dancing (C)' },
    // Headgear
    { w: 3,  v: 'Helm of Telepathy' },
    { w: 3,  v: 'Helm of Comprehend Languages and Read Magic' },
    { w: 2,  v: 'Helm of Teleportation' },
    { w: 2,  v: 'Helm of Brilliance' },
    { w: 1,  v: 'Helm of Underwater Action' },
    // Bracers & amulets
    { w: 4,  v: `Bracers of Defence (${wpick(BRACERS_AC)})` },
    { w: 3,  v: 'Bracers of Archery' },
    { w: 3,  v: 'Amulet of Life Protection' },
    { w: 3,  v: 'Amulet of Proof against Detection and Location' },
    { w: 2,  v: 'Amulet of the Planes' },
    { w: 3,  v: 'Brooch of Shielding' },
    { w: 3,  v: 'Periapt of Wound Closure' },
    { w: 3,  v: 'Periapt of Proof against Poison' },
    { w: 3,  v: 'Periapt of Health' },
    // Necklaces
    { w: 3,  v: 'Necklace of Fireballs' },
    { w: 3,  v: PRAYER_BEADS[Math.floor(Math.random() * PRAYER_BEADS.length)] },
    { w: 2,  v: 'Necklace of Adaptation' },
    { w: 2,  v: 'Necklace of Strangulation (C)' },
    // Belts & girdles
    { w: 3,  v: `Girdle of ${wpick(GIRDLE_STR)}` },
    { w: 2,  v: 'Girdle of Femininity/Masculinity (C)' },
    // Eyes & gems
    { w: 3,  v: 'Eyes of the Eagle' },
    { w: 2,  v: 'Eyes of Charming' },
    { w: 2,  v: 'Eyes of Petrification (C)' },
    { w: 2,  v: 'Gem of Seeing' },
    { w: 2,  v: 'Gem of Brightness' },
    { w: 3,  v: `Ioun Stone — ${IOUN_STONES[Math.floor(Math.random() * IOUN_STONES.length)]}` },
    // Ropes & movement
    { w: 4,  v: 'Rope of Climbing' },
    { w: 2,  v: 'Rope of Entanglement' },
    { w: 2,  v: 'Broom of Flying' },
    { w: 2,  v: 'Carpet of Flying' },
    { w: 1,  v: 'Wings of Flying' },
    // Crystal & mirrors
    { w: 3,  v: 'Crystal Ball' },
    { w: 2,  v: 'Mirror of Mental Prowess' },
    { w: 1,  v: 'Mirror of Life Trapping' },
    // Combat / defence
    { w: 3,  v: 'Stone of Good Luck (Luckstone)' },
    { w: 3,  v: 'Keoghtom\'s Ointment (1d4+1 doses)' },
    { w: 3,  v: 'Scarab of Protection' },
    { w: 2,  v: 'Cube of Force' },
    { w: 2,  v: 'Cube of Frost Resistance' },
    { w: 2,  v: 'Chime of Opening' },
    { w: 2,  v: 'Drums of Panic' },
    { w: 2,  v: 'Lantern of Revealing' },
    { w: 2,  v: 'Dust of Appearance' },
    { w: 2,  v: 'Dust of Disappearance' },
    { w: 1,  v: 'Dust of Sneezing and Choking (C)' },
    // Figurines & special
    { w: 2,  v: `Figurine of Wondrous Power — ${FIGURINES[Math.floor(Math.random() * FIGURINES.length)]}` },
    { w: 2,  v: 'Efreeti Bottle' },
    { w: 2,  v: 'Iron Flask' },
    { w: 2,  v: 'Decanter of Endless Water' },
    { w: 2,  v: 'Pearl of Wisdom' },
    { w: 2,  v: 'Pipes of the Sewers' },
    { w: 2,  v: 'Pipes of Haunting' },
    // Tomes & manuals
    { w: 1,  v: 'Tome of Clear Thought (+1 Int)' },
    { w: 1,  v: 'Tome of Leadership and Influence (+1 Cha/Wis)' },
    { w: 1,  v: 'Tome of Understanding (+1 Wis)' },
    { w: 1,  v: 'Manual of Bodily Health (+1 Con)' },
    { w: 1,  v: 'Manual of Gainful Exercise (+1 Str)' },
    { w: 1,  v: 'Manual of Quickness of Action (+1 Dex)' },
    // Rare / legendary
    { w: 1,  v: 'Orb of Dragonkind' },
    { w: 1,  v: 'Deck of Many Things' },
    { w: 1,  v: 'Sphere of Annihilation' },
    { w: 1,  v: 'Cubic Gate' },
    { w: 1,  v: 'Daern\'s Instant Fortress' },
    { w: 1,  v: 'Well of Many Worlds' },
    { w: 1,  v: 'Apparatus of Kwalish' },
  ]);
}

// -- Main table ---------------------------------------------------------------

/** Roll one random magic item from the AD&D 2e DMG tables. */
export function rollMagicItem(): string {
  const category = wpick<() => string>([
    { w: 20, v: potion },
    { w: 15, v: scroll },
    { w: 6,  v: ring },
    { w: 5,  v: rod },
    { w: 5,  v: staff },
    { w: 7,  v: wand },
    { w: 8,  v: armor },
    { w: 11, v: sword },
    { w: 10, v: miscWeapon },
    { w: 13, v: miscMagic },
  ]);
  return category();
}
