import { describe, it, expect } from 'vitest';
import {
  calcInitiative,
  rollD10,
  sortByInitiative,
  getCombatantsAtSegment,
  maxInitiativeSegment,
  nextActiveSegment,
  firstActiveSegment,
  describeModifiers,
  netModifierOffset,
} from './combat.ts';
import type { Combatant, Modifier, ModifierKind } from './types.ts';

// -- Helpers ------------------------------------------------------------------

function mod(kind: ModifierKind, value: number, label = 'test'): Modifier {
  return { id: 'x', kind, value, label };
}

let _id = 0;
function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: String(++_id),
    name: 'C',
    type: 'player',
    maxHp: null,
    currentHp: null,
    modifiers: [],
    d10Roll: null,
    totalInitiative: null,
    prevInitiative: null,
    isSurprised: false,
    isActive: true,
    action: '',
    ...overrides,
  };
}

// -- calcInitiative -----------------------------------------------------------

describe('calcInitiative', () => {
  it('returns the d10 with no modifiers', () => {
    expect(calcInitiative(5, [])).toBe(5);
  });

  it('adds weapon_speed', () => {
    expect(calcInitiative(3, [mod('weapon_speed', 4)])).toBe(7);
  });

  it('adds spell_casting', () => {
    expect(calcInitiative(2, [mod('spell_casting', 5)])).toBe(7);
  });

  it('adds dex_reaction (negative = faster)', () => {
    expect(calcInitiative(7, [mod('dex_reaction', -2)])).toBe(5);
  });

  it('adds dex_reaction (positive = slower)', () => {
    expect(calcInitiative(5, [mod('dex_reaction', 1)])).toBe(6);
  });

  it('adds other modifier', () => {
    expect(calcInitiative(5, [mod('other', 3)])).toBe(8);
  });

  it('halves with haste, flooring odd totals', () => {
    expect(calcInitiative(9, [mod('haste', 0)])).toBe(4); // floor(9/2) = 4
  });

  it('halves with haste, even totals', () => {
    expect(calcInitiative(10, [mod('haste', 0)])).toBe(5);
  });

  it('enforces minimum 1 with haste on very low totals', () => {
    expect(calcInitiative(1, [mod('haste', 0)])).toBe(1); // max(1, floor(1/2)=0) = 1
  });

  it('adds 10 with slow', () => {
    expect(calcInitiative(5, [mod('slow', 0)])).toBe(15);
  });

  it('applies haste before slow: 10 → ÷2=5 → +10=15', () => {
    expect(calcInitiative(10, [mod('haste', 0), mod('slow', 0)])).toBe(15);
  });

  it('stacks multiple linear modifiers', () => {
    // 5 + 3 (weapon) - 2 (dex) = 6
    expect(calcInitiative(5, [mod('weapon_speed', 3), mod('dex_reaction', -2)])).toBe(6);
  });

  it('haste applied after all linear modifiers', () => {
    // 5 + 3 (weapon) = 8 → haste → floor(8/2) = 4
    expect(calcInitiative(5, [mod('weapon_speed', 3), mod('haste', 0)])).toBe(4);
  });
});

// -- rollD10 ------------------------------------------------------------------

describe('rollD10', () => {
  it('always returns an integer between 1 and 10', () => {
    for (let i = 0; i < 200; i++) {
      const r = rollD10();
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(10);
      expect(Number.isInteger(r)).toBe(true);
    }
  });
});

// -- sortByInitiative ---------------------------------------------------------

describe('sortByInitiative', () => {
  it('sorts ascending by totalInitiative (lower acts first)', () => {
    const a = makeCombatant({ totalInitiative: 8 });
    const b = makeCombatant({ totalInitiative: 3 });
    const c = makeCombatant({ totalInitiative: 6 });
    expect(sortByInitiative([a, b, c]).map((x) => x.totalInitiative)).toEqual([3, 6, 8]);
  });

  it('places inactive combatants after active ones', () => {
    const active = makeCombatant({ totalInitiative: 9 });
    const inactive = makeCombatant({ totalInitiative: 1, isActive: false });
    const sorted = sortByInitiative([inactive, active]);
    expect(sorted[0]).toBe(active);
    expect(sorted[1]).toBe(inactive);
  });

  it('places null initiative after numeric values', () => {
    const rolled = makeCombatant({ totalInitiative: 5 });
    const noRoll = makeCombatant({ totalInitiative: null });
    const sorted = sortByInitiative([noRoll, rolled]);
    expect(sorted[0]).toBe(rolled);
    expect(sorted[1]).toBe(noRoll);
  });

  it('does not mutate the original array', () => {
    const arr = [makeCombatant({ totalInitiative: 5 }), makeCombatant({ totalInitiative: 2 })];
    const first = arr[0];
    sortByInitiative(arr);
    expect(arr[0]).toBe(first);
  });
});

// -- getCombatantsAtSegment ---------------------------------------------------

describe('getCombatantsAtSegment', () => {
  it('returns combatants whose initiative matches the segment', () => {
    const a = makeCombatant({ totalInitiative: 5 });
    const b = makeCombatant({ totalInitiative: 7 });
    expect(getCombatantsAtSegment([a, b], 5, false)).toEqual([a]);
  });

  it('excludes inactive combatants', () => {
    const c = makeCombatant({ totalInitiative: 5, isActive: false });
    expect(getCombatantsAtSegment([c], 5, false)).toEqual([]);
  });

  it('excludes surprised combatants during the surprise phase', () => {
    const surprised = makeCombatant({ totalInitiative: 5, isSurprised: true });
    const normal = makeCombatant({ totalInitiative: 5, isSurprised: false });
    expect(getCombatantsAtSegment([surprised, normal], 5, true)).toEqual([normal]);
  });

  it('includes surprised combatants outside the surprise phase', () => {
    const surprised = makeCombatant({ totalInitiative: 5, isSurprised: true });
    expect(getCombatantsAtSegment([surprised], 5, false)).toEqual([surprised]);
  });

  it('returns empty array when no combatants match', () => {
    const c = makeCombatant({ totalInitiative: 8 });
    expect(getCombatantsAtSegment([c], 5, false)).toEqual([]);
  });
});

// -- maxInitiativeSegment -----------------------------------------------------

describe('maxInitiativeSegment', () => {
  it('returns 10 as the minimum for an empty list', () => {
    expect(maxInitiativeSegment([])).toBe(10);
  });

  it('returns the highest active initiative total', () => {
    const a = makeCombatant({ totalInitiative: 7 });
    const b = makeCombatant({ totalInitiative: 14 });
    expect(maxInitiativeSegment([a, b])).toBe(14);
  });

  it('ignores the surprised-combatant sentinel value (99)', () => {
    const surprised = makeCombatant({ totalInitiative: 99 });
    const normal = makeCombatant({ totalInitiative: 8 });
    expect(maxInitiativeSegment([surprised, normal])).toBe(10); // 8 < 10 minimum
  });

  it('ignores inactive combatants', () => {
    const inactive = makeCombatant({ totalInitiative: 20, isActive: false });
    expect(maxInitiativeSegment([inactive])).toBe(10);
  });

  it('returns 10 when the highest active total is below 10', () => {
    const a = makeCombatant({ totalInitiative: 4 });
    expect(maxInitiativeSegment([a])).toBe(10);
  });
});

// -- nextActiveSegment --------------------------------------------------------

describe('nextActiveSegment', () => {
  it('returns the next segment with activity', () => {
    const c = makeCombatant({ totalInitiative: 7 });
    expect(nextActiveSegment([c], 5, 10, false)).toBe(7);
  });

  it('skips segments with no activity', () => {
    const c = makeCombatant({ totalInitiative: 9 });
    expect(nextActiveSegment([c], 3, 10, false)).toBe(9);
  });

  it('returns null when there is no further activity this round', () => {
    const c = makeCombatant({ totalInitiative: 3 });
    expect(nextActiveSegment([c], 5, 10, false)).toBeNull();
  });

  it('does not return the current segment itself', () => {
    const c = makeCombatant({ totalInitiative: 5 });
    expect(nextActiveSegment([c], 5, 10, false)).toBeNull();
  });

  it('respects maxSegment boundary', () => {
    const c = makeCombatant({ totalInitiative: 12 });
    expect(nextActiveSegment([c], 1, 10, false)).toBeNull(); // 12 > maxSegment 10
  });
});

// -- firstActiveSegment -------------------------------------------------------

describe('firstActiveSegment', () => {
  it('returns the first segment with activity', () => {
    const c = makeCombatant({ totalInitiative: 4 });
    expect(firstActiveSegment([c], 10, false)).toBe(4);
  });

  it('returns 1 when there is no activity', () => {
    expect(firstActiveSegment([], 10, false)).toBe(1);
  });

  it('skips surprised combatants during the surprise phase', () => {
    const surprised = makeCombatant({ totalInitiative: 2, isSurprised: true });
    const normal = makeCombatant({ totalInitiative: 6 });
    expect(firstActiveSegment([surprised, normal], 10, true)).toBe(6);
  });
});

// -- describeModifiers --------------------------------------------------------

describe('describeModifiers', () => {
  it('returns "None" for an empty modifier list', () => {
    expect(describeModifiers([])).toBe('None');
  });

  it('formats haste as "Haste ÷2"', () => {
    expect(describeModifiers([mod('haste', 0, 'Haste')])).toBe('Haste (Haste ÷2)');
  });

  it('formats slow as "Slow +10"', () => {
    expect(describeModifiers([mod('slow', 0, 'Slow')])).toBe('Slow (Slow +10)');
  });

  it('formats positive modifiers with a + prefix', () => {
    expect(describeModifiers([mod('weapon_speed', 3, 'Sword')])).toBe('Sword (+3)');
  });

  it('formats negative modifiers with a - prefix', () => {
    expect(describeModifiers([mod('dex_reaction', -2, 'High DEX')])).toBe('High DEX (-2)');
  });

  it('joins multiple modifiers with commas', () => {
    const result = describeModifiers([
      mod('weapon_speed', 3, 'Sword'),
      mod('dex_reaction', -1, 'DEX'),
    ]);
    expect(result).toBe('Sword (+3), DEX (-1)');
  });
});

// -- netModifierOffset --------------------------------------------------------

describe('netModifierOffset', () => {
  it('returns 0 for no modifiers', () => {
    expect(netModifierOffset([])).toBe(0);
  });

  it('sums weapon_speed, spell_casting, other, and dex_reaction', () => {
    expect(
      netModifierOffset([
        mod('weapon_speed', 3),
        mod('dex_reaction', -2),
        mod('other', 1),
      ]),
    ).toBe(2);
  });

  it('excludes haste and slow from the sum', () => {
    expect(
      netModifierOffset([
        mod('weapon_speed', 3),
        mod('haste', 0),
        mod('slow', 0),
      ]),
    ).toBe(3);
  });

  it('returns a negative sum when dex bonuses dominate', () => {
    expect(netModifierOffset([mod('dex_reaction', -3), mod('weapon_speed', 1)])).toBe(-2);
  });
});
