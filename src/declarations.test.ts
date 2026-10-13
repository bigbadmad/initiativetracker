import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyDeclaredAction, canActThisRound } from './combat.ts';
import {
  addCombatant,
  applyDeclarations,
  beginInitiativePhase,
  getState,
  lockInitiative,
  registerRenderer,
  resetEncounter,
  setState,
  startNewRound,
  updateCombatant,
} from './state.ts';
import { toPlayerTotals, toPublicView } from './sync/publicView.ts';
import { declareDefaults, declareErrorMessage, declareStatus, declareStatusKey } from './player/declare.ts';
import type { PublicView } from './sync/publicView.ts';
import type { MyDeclaration } from './sync/session.ts';
import type { Combatant, Modifier } from './types.ts';

function combatant(overrides: Partial<Combatant>): Combatant {
  return {
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
    ...overrides,
  };
}

const mod = (id: string, kind: Modifier['kind'], value: number, label = kind): Modifier => ({ id, kind, value, label });

// -- combat.ts helpers ---------------------------------------------------------

describe('applyDeclaredAction', () => {
  it('replaces the primary weapon modifier and keeps the standing ones', () => {
    const mods = [mod('w', 'weapon_speed', 7, 'Sword'), mod('d', 'dex_reaction', -2, 'Dex'), mod('h', 'haste', 0, 'Haste')];
    const out = applyDeclaredAction(mods, { kind: 'spell_casting', label: 'Fireball', value: 3 }, 'new');
    expect(out).toEqual([
      { id: 'w', kind: 'spell_casting', label: 'Fireball', value: 3 },
      mods[1],
      mods[2],
    ]);
  });

  it('adds a modifier when the combatant has none, and falls back to a default label', () => {
    const out = applyDeclaredAction([mod('d', 'dex_reaction', -1)], { kind: 'weapon_speed', label: '  ', value: 4 }, 'new');
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ id: 'new', kind: 'weapon_speed', label: 'Attack', value: 4 });
  });

  it('keeps the existing label when the declared one is blank', () => {
    const out = applyDeclaredAction([mod('w', 'weapon_speed', 7, 'Sword')], { kind: 'weapon_speed', label: '', value: 5 }, 'x');
    expect(out[0].label).toBe('Sword');
  });

  it('does not mutate its input', () => {
    const mods = [mod('w', 'weapon_speed', 7)];
    applyDeclaredAction(mods, { kind: 'weapon_speed', label: 'Axe', value: 9 }, 'x');
    expect(mods[0].value).toBe(7);
  });
});

describe('canActThisRound', () => {
  it('excludes defeated, hors de combat, and surprised-in-the-surprise-phase combatants', () => {
    expect(canActThisRound(combatant({}), false)).toBe(true);
    expect(canActThisRound(combatant({ isActive: false }), false)).toBe(false);
    expect(canActThisRound(combatant({ isHorsDeCombat: true }), false)).toBe(false);
    expect(canActThisRound(combatant({ isSurprised: true }), true)).toBe(false);
    expect(canActThisRound(combatant({ isSurprised: true }), false)).toBe(true);
  });
});

// -- state: encounter id, merge, lock ------------------------------------------

describe('encounter id', () => {
  beforeEach(() => resetEncounter());

  it('is assigned when initiative begins and is new for each encounter', () => {
    addCombatant(combatant({}));
    beginInitiativePhase();
    const first = getState().encounterId;
    expect(first).toBeTruthy();
    setState({ phase: 'setup' });
    beginInitiativePhase();
    expect(getState().encounterId).not.toBe(first);
  });

  it('is unchanged when a round ends', () => {
    addCombatant(combatant({}));
    beginInitiativePhase();
    const id = getState().encounterId;
    startNewRound();
    expect(getState().roundNumber).toBe(2);
    expect(getState().encounterId).toBe(id);
  });
});

describe('applyDeclarations', () => {
  const decl = (over: Partial<{ combatantId: string; d10: number; value: number; label: string; kind: 'weapon_speed' | 'spell_casting' }> = {}) => ({
    combatantId: 'p1',
    kind: 'weapon_speed' as const,
    label: 'Long sword',
    value: 5,
    d10: 4,
    ...over,
  });

  function start(extra: Combatant[] = []): { encounterId: string; round: number } {
    resetEncounter();
    addCombatant(combatant({ modifiers: [mod('d', 'dex_reaction', -1, 'Dex')] }));
    extra.forEach(addCombatant);
    beginInitiativePhase();
    const s = getState();
    return { encounterId: s.encounterId!, round: s.roundNumber };
  }

  it('sets the roll, action and total using the standing modifiers', () => {
    const { encounterId, round } = start();
    const applied = applyDeclarations(encounterId, round, [decl()]);
    expect(applied).toEqual(['p1']);
    const p = getState().combatants.find((c) => c.id === 'p1')!;
    expect(p.d10Roll).toBe(4);
    expect(p.action).toBe('Long sword');
    expect(p.totalInitiative).toBe(4 + 5 - 1);
  });

  it('applies haste held by the DM to a declared action', () => {
    resetEncounter();
    addCombatant(combatant({ modifiers: [mod('h', 'haste', 0, 'Haste')] }));
    beginInitiativePhase();
    const s = getState();
    applyDeclarations(s.encounterId!, s.roundNumber, [decl({ d10: 6, value: 4 })]);
    expect(getState().combatants[0].totalInitiative).toBe(5); // floor((6 + 4) / 2)
  });

  it('never overwrites a roll the DM already entered', () => {
    const { encounterId, round } = start();
    updateCombatant('p1', { d10Roll: 9, totalInitiative: 9 });
    expect(applyDeclarations(encounterId, round, [decl()])).toEqual([]);
    expect(getState().combatants[0].d10Roll).toBe(9);
  });

  it('ignores a batch for another encounter, another round, or another phase', () => {
    const { encounterId, round } = start();
    expect(applyDeclarations('some-other-encounter', round, [decl()])).toEqual([]);
    expect(applyDeclarations(encounterId, round + 1, [decl()])).toEqual([]);
    setState({ phase: 'combat' });
    expect(applyDeclarations(encounterId, round, [decl()])).toEqual([]);
    expect(getState().combatants[0].d10Roll).toBeNull();
  });

  it('skips surprised, hors de combat and defeated characters, and anything that is not a player', () => {
    const { encounterId, round } = start([
      combatant({ id: 'p2', name: 'Elf', isHorsDeCombat: true }),
      combatant({ id: 'p3', name: 'Dwarf', isActive: false }),
      combatant({ id: 'm1', name: 'Orc', type: 'monster' }),
    ]);
    const everyone = ['p2', 'p3', 'm1'].map((id) => decl({ combatantId: id }));
    expect(applyDeclarations(encounterId, round, everyone)).toEqual([]);
    expect(getState().combatants.find((c) => c.id === 'p2')!.d10Roll).toBeNull();
  });

  it('skips a surprised character during the surprise phase only', () => {
    resetEncounter();
    addCombatant(combatant({ isSurprised: true }));
    beginInitiativePhase();
    const s = getState();
    expect(s.inSurprisePhase).toBe(true);
    expect(applyDeclarations(s.encounterId!, s.roundNumber, [decl()])).toEqual([]);
  });

  it('rejects an out-of-range d10 rather than trusting it', () => {
    const { encounterId, round } = start();
    expect(applyDeclarations(encounterId, round, [decl({ d10: 11 })])).toEqual([]);
    expect(applyDeclarations(encounterId, round, [decl({ d10: 0 })])).toEqual([]);
  });

  describe('render requests', () => {
    const render = vi.fn();
    beforeEach(() => render.mockClear());
    afterEach(() => registerRenderer(() => {}));

    it('flags the render as remote so the DM is not interrupted mid-edit', () => {
      const { encounterId, round } = start();
      registerRenderer(render);
      applyDeclarations(encounterId, round, [decl()]);
      expect(render).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledWith({ remote: true });
    });

    it('does not render at all when nothing was applied', () => {
      const { encounterId, round } = start();
      registerRenderer(render);
      applyDeclarations(encounterId, round, []);
      expect(render).not.toHaveBeenCalled();
    });
  });
});

describe('lockInitiative', () => {
  beforeEach(() => resetEncounter());

  it('refuses, changing nothing, while a player who can act has no roll', () => {
    addCombatant(combatant({ id: 'p1', name: 'Thorin', d10Roll: 3, totalInitiative: 3 }));
    addCombatant(combatant({ id: 'p2', name: 'Elf' }));
    beginInitiativePhase();
    const result = lockInitiative();
    expect(result).toEqual({ ok: false, reason: 'missing', missing: ['Elf'] });
    expect(getState().phase).toBe('initiative');
  });

  it('does nothing outside the initiative phase, so a late call cannot reset a combat in progress', () => {
    addCombatant(combatant({ id: 'p1', d10Roll: 6, totalInitiative: 6 }));
    addCombatant(combatant({ id: 'p2', name: 'Elf', d10Roll: 2, totalInitiative: 2 }));
    beginInitiativePhase();
    expect(lockInitiative().ok).toBe(true);
    setState({ currentSegment: 6 });
    expect(lockInitiative()).toEqual({ ok: false, reason: 'phase' });
    expect(getState().currentSegment).toBe(6);
  });

  it('starts combat on the first live segment once everyone has rolled', () => {
    addCombatant(combatant({ id: 'p1', d10Roll: 6, totalInitiative: 6 }));
    beginInitiativePhase();
    updateCombatantRoll('p1', 6);
    expect(lockInitiative()).toEqual({ ok: true });
    expect(getState().phase).toBe('combat');
    expect(getState().currentSegment).toBe(6);
  });

  it('gives hors de combat characters the 99 sentinel and does not wait for them', () => {
    addCombatant(combatant({ id: 'p1', d10Roll: 2, totalInitiative: 2 }));
    addCombatant(combatant({ id: 'p2', name: 'Elf', isHorsDeCombat: true }));
    beginInitiativePhase();
    updateCombatantRoll('p1', 2);
    expect(lockInitiative().ok).toBe(true);
    expect(getState().combatants.find((c) => c.id === 'p2')!.totalInitiative).toBe(99);
  });

  function updateCombatantRoll(id: string, roll: number): void {
    updateCombatant(id, { d10Roll: roll, totalInitiative: roll });
  }
});

// -- public view ---------------------------------------------------------------

describe('public view for declarations', () => {
  it('carries the encounter id and who is surprised, but no totals', () => {
    resetEncounter();
    addCombatant(combatant({ isSurprised: true, d10Roll: 5, totalInitiative: 8 }));
    beginInitiativePhase();
    const view = toPublicView(getState());
    expect(view.encounterId).toBe(getState().encounterId);
    expect(view.players[0].isSurprised).toBe(true);
    expect(JSON.stringify(view)).not.toContain('totalInitiative');
  });

  it('computes private totals for real rolls only, leaving out the 99 sentinels', () => {
    const state = {
      ...getState(),
      combatants: [
        combatant({ id: 'p1', totalInitiative: 7 }),
        combatant({ id: 'p2', totalInitiative: 99 }),
        combatant({ id: 'p3' }),
        combatant({ id: 'm1', type: 'monster', totalInitiative: 3 }),
      ],
    };
    expect(toPlayerTotals(state)).toEqual({ p1: 7 });
  });
});

// -- player declare panel ------------------------------------------------------

describe('declareDefaults', () => {
  const draft = { kind: 'weapon_speed' as const, label: '', value: 5 };

  it('starts from the weapon the DM set up, not the generic default', () => {
    const out = declareDefaults({ kind: 'weapon_speed', label: 'Long sword', value: 3 }, draft);
    expect(out).toEqual({ kind: 'weapon_speed', label: 'Long sword', value: 3 });
  });

  it('follows a spell too', () => {
    const out = declareDefaults({ kind: 'spell_casting', label: 'Fireball', value: 3 }, draft);
    expect(out.kind).toBe('spell_casting');
  });

  it('falls back to the remembered draft only when the DM set nothing up', () => {
    const remembered = { kind: 'spell_casting' as const, label: 'Bless', value: 1 };
    expect(declareDefaults(null, remembered)).toEqual(remembered);
  });

  it('keeps the value inside what the server accepts', () => {
    expect(declareDefaults({ kind: 'weapon_speed', label: 'x', value: 99 }, draft).value).toBe(30);
    expect(declareDefaults({ kind: 'weapon_speed', label: 'x', value: -4 }, draft).value).toBe(0);
    expect(declareDefaults({ kind: 'weapon_speed', label: 'x', value: 4.7 }, draft).value).toBe(4);
  });

  it('trims a label longer than the server allows', () => {
    const out = declareDefaults({ kind: 'weapon_speed', label: 'x'.repeat(60), value: 5 }, draft);
    expect(out.label).toHaveLength(40);
  });
});

describe('declareStatus', () => {
  const player = { id: 'p1', name: 'Thorin', hasDeclared: false, isActive: true, isHorsDeCombat: false, isSurprised: false, action: null };
  const view = (over: Partial<PublicView> = {}, p: Partial<typeof player> = {}): PublicView => ({
    phase: 'initiative',
    encounterId: 'enc-1',
    roundNumber: 2,
    currentSegment: 1,
    inSurprisePhase: false,
    acting: [],
    players: [{ ...player, ...p }],
    ...over,
  });
  const declaration = (over: Partial<MyDeclaration> = {}): MyDeclaration => ({
    encounterId: 'enc-1',
    round: 2,
    kind: 'weapon_speed',
    label: 'Axe',
    value: 5,
    d10: 6,
    total: null,
    ...over,
  });

  it('shows nothing without a character or outside initiative and combat', () => {
    expect(declareStatus(null, 'p1', null).kind).toBe('none');
    expect(declareStatus(view(), null, null).kind).toBe('none');
    expect(declareStatus(view({ phase: 'setup' }), 'p1', null).kind).toBe('none');
    expect(declareStatus(view({ phase: 'loot' }), 'p1', null).kind).toBe('none');
  });

  it('offers the form to a character who can act and has not declared', () => {
    expect(declareStatus(view(), 'p1', null).kind).toBe('form');
  });

  it('explains why a character cannot declare', () => {
    expect(declareStatus(view({}, { isActive: false }), 'p1', null).kind).toBe('blocked');
    expect(declareStatus(view({}, { isHorsDeCombat: true }), 'p1', null).kind).toBe('blocked');
    expect(declareStatus(view({ inSurprisePhase: true }, { isSurprised: true }), 'p1', null).kind).toBe('blocked');
    expect(declareStatus(view({ inSurprisePhase: false }, { isSurprised: true }), 'p1', null).kind).toBe('form');
  });

  it('shows the declaration once made, and the DM-entered notice when the DM rolled for them', () => {
    expect(declareStatus(view(), 'p1', declaration()).kind).toBe('declared');
    expect(declareStatus(view({}, { hasDeclared: true }), 'p1', null).kind).toBe('dm-entered');
  });

  it('ignores a declaration from another round or encounter', () => {
    expect(declareStatus(view(), 'p1', declaration({ round: 1 })).kind).toBe('form');
    expect(declareStatus(view(), 'p1', declaration({ encounterId: 'old' })).kind).toBe('form');
  });

  it('keeps showing the result during combat', () => {
    expect(declareStatus(view({ phase: 'combat' }), 'p1', declaration({ total: 11 })).kind).toBe('declared');
    expect(declareStatus(view({ phase: 'combat' }), 'p1', null).kind).toBe('none');
  });

  it('gives the form a stable key so typing is never interrupted, and the result a new one when the total lands', () => {
    const a = declareStatusKey(declareStatus(view(), 'p1', null));
    const b = declareStatusKey(declareStatus(view({ currentSegment: 4 }), 'p1', null));
    expect(a).toBe(b);
    const before = declareStatusKey(declareStatus(view(), 'p1', declaration()));
    const after = declareStatusKey(declareStatus(view(), 'p1', declaration({ total: 11 })));
    expect(after).not.toBe(before);
  });

  it('translates server errors', () => {
    expect(declareErrorMessage('already declared')).toMatch(/already declared/);
    expect(declareErrorMessage('declarations are not open')).toMatch(/not opened/);
    expect(declareErrorMessage('Failed to fetch')).toMatch(/connection/);
  });
});
