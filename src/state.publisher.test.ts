import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addCombatant, updateCombatant, updateCombatantSilent, registerPublisher, resetEncounter } from './state.ts';
import type { Combatant } from './types.ts';

const player: Combatant = {
  id: 'p1',
  name: 'Thorin',
  type: 'player',
  maxHp: null,
  currentHp: null,
  modifiers: [],
  d10Roll: null,
  totalInitiative: null,
  prevInitiative: null,
  isSurprised: false,
  isActive: true,
  isHorsDeCombat: false,
  atRange: false,
  targetId: null,
  action: '',
};

describe('publisher hook', () => {
  const publish = vi.fn();

  beforeEach(() => {
    resetEncounter();
    publish.mockClear();
    registerPublisher(publish);
  });

  afterEach(() => registerPublisher(null));

  it('fires on ordinary state changes', () => {
    addCombatant(player);
    expect(publish).toHaveBeenCalledTimes(1);
    updateCombatant('p1', { name: 'Thorin II' });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('fires on silent updates that skip the re-render', () => {
    addCombatant(player);
    publish.mockClear();
    updateCombatantSilent('p1', { d10Roll: 4 });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no publisher is registered', () => {
    registerPublisher(null);
    expect(() => updateCombatantSilent('missing', { d10Roll: 1 })).not.toThrow();
  });
});
