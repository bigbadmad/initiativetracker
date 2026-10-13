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

  it('carries a player\'s weapon or spell so their declare form can start from it', () => {
    const fighter = makeCombatant({
      id: 'p3',
      name: 'Fighter',
      modifiers: [{ id: 'w', kind: 'weapon_speed', value: 3, label: 'Long sword' }],
    });
    const mage = makeCombatant({
      id: 'p4',
      name: 'Mage',
      modifiers: [{ id: 's', kind: 'spell_casting', value: 4, label: 'Magic missile' }],
    });
    const none = makeCombatant({ id: 'p5', name: 'Cleric' });
    const view = toPublicView(makeState([fighter, mage, none]));
    expect(view.players.map((p) => p.action)).toEqual([
      { kind: 'weapon_speed', label: 'Long sword', value: 3 },
      { kind: 'spell_casting', label: 'Magic missile', value: 4 },
      null,
    ]);
  });

  it('publishes the label the DM sees: a renamed action wins over the modifier\'s own label', () => {
    const renamed = makeCombatant({
      id: 'p7',
      name: 'Fighter',
      action: 'Battle axe',
      modifiers: [{ id: 'w', kind: 'weapon_speed', value: 7, label: 'Long sword' }],
    });
    const untouched = makeCombatant({
      id: 'p8',
      name: 'Rogue',
      action: '   ',
      modifiers: [{ id: 'd', kind: 'weapon_speed', value: 2, label: 'Dagger' }],
    });
    const view = toPublicView(makeState([renamed, untouched]));
    expect(view.players[0].action).toEqual({ kind: 'weapon_speed', label: 'Battle axe', value: 7 });
    expect(view.players[1].action).toEqual({ kind: 'weapon_speed', label: 'Dagger', value: 2 });
  });

  it('publishes no action for a free-text label alone, since it has no speed to start from', () => {
    const labelOnly = makeCombatant({ id: 'p9', name: 'Monk', action: 'Quarterstaff' });
    expect(toPublicView(makeState([labelOnly])).players[0].action).toBeNull();
  });

  it('never publishes dex, haste or slow, even though they sit beside the weapon', () => {
    const rogue = makeCombatant({
      id: 'p6',
      name: 'Rogue',
      modifiers: [
        { id: 'w', kind: 'weapon_speed', value: 2, label: 'Dagger' },
        { id: 'd', kind: 'dex_reaction', value: -3, label: 'Dex 18' },
        { id: 'h', kind: 'haste', value: 0, label: 'Hasted' },
        { id: 's', kind: 'slow', value: 0, label: 'Slowed' },
      ],
    });
    const json = JSON.stringify(toPublicView(makeState([rogue])));
    for (const hidden of ['Dex 18', 'Hasted', 'Slowed', 'dex_reaction', '"haste"', '"slow"', '-3']) {
      expect(json).not.toContain(hidden);
    }
    expect(json).toContain('Dagger');
  });

  it('leaks no private monster or initiative data', () => {
    const json = JSON.stringify(toPublicView(makeState([thorin, orc, goblin])));
    for (const secret of ['maxHp', 'currentHp', 'thac0', 'damage', 'targetId', 'Q×3', 'lairTreasure', 'manualXP', 'totalInitiative', 'd10Roll', 'pendingLoot', 'sessionLoot', '"ac"']) {
      expect(json).not.toContain(secret);
    }
  });
});
