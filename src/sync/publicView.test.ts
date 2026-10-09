import { describe, it, expect } from 'vitest';
import { toPublicView } from './publicView.ts';
import type { AppState, Combatant } from '../types.ts';

function makeCombatant(overrides: Partial<Combatant>): Combatant {
  return {
    id: 'c',
    name: 'X',
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
    ...overrides,
  };
}

function makeState(combatants: Combatant[], overrides: Partial<AppState> = {}): AppState {
  return {
    phase: 'combat',
    combatants,
    roundNumber: 2,
    currentSegment: 4,
    inSurprisePhase: false,
    pendingLoot: null,
    sessionLoot: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, gems: [], jewelry: [], magicItems: [], xp: 0 },
    ...overrides,
  };
}

describe('toPublicView', () => {
  const thorin = makeCombatant({ id: 'p1', name: 'Thorin', d10Roll: 3, totalInitiative: 4, action: 'Axe' });
  const orc = makeCombatant({
    id: 'm1',
    name: 'Orc Chieftain',
    type: 'monster',
    maxHp: 31,
    currentHp: 22,
    ac: 4,
    thac0: 13,
    damage: '1d8+2',
    totalInitiative: 4,
    targetId: 'p1',
    individualTreasure: 'Q×3',
    lairTreasure: 'D',
    manualXP: 500,
  });
  const goblin = makeCombatant({ id: 'm2', name: 'Goblin', type: 'monster', totalInitiative: 7 });

  it('lists who acts in the current segment, players and monsters', () => {
    const view = toPublicView(makeState([thorin, orc, goblin]));
    expect(view.acting.map((a) => a.name)).toEqual(['Thorin', 'Orc Chieftain']);
  });

  it('shows no one acting outside the combat phase', () => {
    const view = toPublicView(makeState([thorin, orc], { phase: 'initiative' }));
    expect(view.acting).toEqual([]);
  });

  it('excludes surprised combatants during the surprise phase', () => {
    const surprised = makeCombatant({ id: 'p2', name: 'Elf', totalInitiative: 4, isSurprised: true });
    const view = toPublicView(makeState([thorin, surprised], { inSurprisePhase: true }));
    expect(view.acting.map((a) => a.name)).toEqual(['Thorin']);
  });

  it('only lists players in the roster and flags who has declared', () => {
    const elf = makeCombatant({ id: 'p2', name: 'Elf' });
    const view = toPublicView(makeState([thorin, elf, orc]));
    expect(view.players.map((p) => [p.name, p.hasDeclared])).toEqual([
      ['Thorin', true],
      ['Elf', false],
    ]);
  });

  it('leaks no private monster or initiative data', () => {
    const json = JSON.stringify(toPublicView(makeState([thorin, orc, goblin])));
    for (const secret of ['maxHp', 'currentHp', 'thac0', 'damage', 'targetId', 'Q×3', 'lairTreasure', 'manualXP', 'totalInitiative', 'd10Roll', 'pendingLoot', 'sessionLoot', '"ac"']) {
      expect(json).not.toContain(secret);
    }
  });
});
