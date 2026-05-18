import type { Combatant, Modifier } from './types.ts';

// -- Initiative calculation ----------------------------------------------------

/**
 * Compute the total initiative for a combatant given their d10 roll.
 *
 * AD&D 2e formula:
 *   base = d10 + weapon_speed (or spell_casting) + other modifiers
 *   dex_reaction bonus is SUBTRACTED (higher Dex = acts sooner)
 *   haste: halves base (round down, minimum 1)
 *   slow:  adds 10
 *
 * Lower result = acts first.
 */
export function calcInitiative(d10: number, modifiers: Modifier[]): number {
  let total = d10;
  let hasHaste = false;
  let hasSlow = false;

  for (const mod of modifiers) {
    switch (mod.kind) {
      case 'weapon_speed':
      case 'spell_casting':
      case 'other':
        total += mod.value;
        break;
      case 'dex_reaction':
        // Entered as a direct delta: negative = faster (reduces initiative), positive = slower
        total += mod.value;
        break;
      case 'haste':
        hasHaste = true;
        break;
      case 'slow':
        hasSlow = true;
        break;
    }
  }

  if (hasHaste) {
    total = Math.max(1, Math.floor(total / 2));
  }
  if (hasSlow) {
    total += 10;
  }

  return total;
}

/**
 * Roll a random d10 (1–10).
 */
export function rollD10(): number {
  return Math.floor(Math.random() * 10) + 1;
}

/**
 * Returns combatants sorted by totalInitiative ascending (lowest acts first).
 * Combatants without a roll yet, or inactive ones, are placed last.
 */
export function sortByInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    if (!a.isActive && b.isActive) return 1;
    if (a.isActive && !b.isActive) return -1;
    if (a.totalInitiative === null && b.totalInitiative === null) return 0;
    if (a.totalInitiative === null) return 1;
    if (b.totalInitiative === null) return -1;
    return a.totalInitiative - b.totalInitiative;
  });
}

/**
 * Returns active combatants whose totalInitiative matches the given segment.
 * During surprise phase, surprised combatants are excluded.
 */
export function getCombatantsAtSegment(
  combatants: Combatant[],
  segment: number,
  inSurprisePhase: boolean,
): Combatant[] {
  return combatants.filter((c) => {
    if (!c.isActive) return false;
    if (c.isHorsDeCombat) return false;
    if (inSurprisePhase && c.isSurprised) return false;
    return c.totalInitiative === segment;
  });
}

/**
 * Returns the highest initiative total among active combatants, used as the
 * dynamic ceiling for the segment bar. Minimum value returned is 10.
 */
export function maxInitiativeSegment(combatants: Combatant[]): number {
  let max = 10;
  for (const c of combatants) {
    if (c.isActive && c.totalInitiative !== null && c.totalInitiative < 99) {
      max = Math.max(max, c.totalInitiative);
    }
  }
  return max;
}

/**
 * Returns the next segment number (after currentSegment) that has at least one
 * active combatant acting. Returns null when no further activity exists within
 * maxSegment - signalling end of round.
 */
export function nextActiveSegment(
  combatants: Combatant[],
  currentSegment: number,
  maxSegment: number,
  inSurprisePhase: boolean,
): number | null {
  for (let s = currentSegment + 1; s <= maxSegment; s++) {
    if (getCombatantsAtSegment(combatants, s, inSurprisePhase).length > 0) {
      return s;
    }
  }
  return null;
}

/**
 * Returns the first segment (starting from 1) that has activity - used when
 * entering the combat phase so the tracker opens on the first live segment.
 */
export function firstActiveSegment(
  combatants: Combatant[],
  maxSegment: number,
  inSurprisePhase: boolean,
): number {
  for (let s = 1; s <= maxSegment; s++) {
    if (getCombatantsAtSegment(combatants, s, inSurprisePhase).length > 0) {
      return s;
    }
  }
  return 1;
}

/**
 * Returns a human-readable summary of a combatant's modifier stack.
 */
export function describeModifiers(modifiers: Modifier[]): string {
  if (modifiers.length === 0) return 'None';
  return modifiers.map((m) => `${m.label} (${modifierSign(m)})`).join(', ');
}

function modifierSign(mod: Modifier): string {

  if (mod.kind === 'haste') return 'Haste ÷2';
  if (mod.kind === 'slow') return 'Slow +10';
  return mod.value >= 0 ? `+${mod.value}` : `${mod.value}`;
}

/**
 * Returns the net numeric modifier offset for display purposes
 * (excludes haste/slow which are non-linear).
 */
export function netModifierOffset(modifiers: Modifier[]): number {
  let offset = 0;
  for (const mod of modifiers) {
    switch (mod.kind) {
      case 'weapon_speed':
      case 'spell_casting':
      case 'other':
        offset += mod.value;
        break;
      case 'dex_reaction':
        offset += mod.value;
        break;
    }
  }
  return offset;
}
