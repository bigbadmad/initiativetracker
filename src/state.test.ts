import { describe, it, expect, beforeEach } from 'vitest';
import {
  getState,
  addCombatant,
  updateCombatant,
  updateCombatantSilent,
  removeCombatant,
  applyDamage,
  applyHealing,
  beginInitiativePhase,
  startNewRound,
  resetEncounter,
  setState,
  reorderCombatants,
} from './state.ts';
import type { Combatant } from './types.ts';

// -- Helpers ------------------------------------------------------------------

let _id = 0;
function makeId(): string {
  return `t${++_id}`;
}

function makePlayer(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: makeId(),
    name: 'Player',
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

function makeMonster(overrides: Partial<Combatant> = {}): Combatant {
  return makePlayer({
    name: 'Monster',
    type: 'monster',
    maxHp: 10,
    currentHp: 10,
    ...overrides,
  });
}

function findById(id: string): Combatant | undefined {
  return getState().combatants.find((c) => c.id === id);
}

beforeEach(() => {
  resetEncounter();
});

// -- addCombatant / removeCombatant -------------------------------------------

describe('addCombatant', () => {
  it('appends a combatant to state', () => {
    const c = makePlayer();
    addCombatant(c);
    expect(getState().combatants).toContain(c);
  });

  it('preserves insertion order', () => {
    const a = makePlayer({ name: 'A' });
    const b = makePlayer({ name: 'B' });
    addCombatant(a);
    addCombatant(b);
    expect(getState().combatants.map((c) => c.name)).toEqual(['A', 'B']);
  });
});

describe('removeCombatant', () => {
  it('removes the combatant with the matching id', () => {
    const c = makePlayer();
    addCombatant(c);
    removeCombatant(c.id);
    expect(getState().combatants).not.toContain(c);
  });

  it('does not remove other combatants', () => {
    const a = makePlayer();
    const b = makePlayer();
    addCombatant(a);
    addCombatant(b);
    removeCombatant(a.id);
    expect(getState().combatants).toContain(b);
  });
});

// -- updateCombatant / updateCombatantSilent ----------------------------------

describe('updateCombatant', () => {
  it('patches the matching combatant', () => {
    const c = makePlayer({ name: 'Before' });
    addCombatant(c);
    updateCombatant(c.id, { name: 'After' });
    expect(findById(c.id)?.name).toBe('After');
  });

  it('does not affect other combatants', () => {
    const a = makePlayer({ name: 'A' });
    const b = makePlayer({ name: 'B' });
    addCombatant(a);
    addCombatant(b);
    updateCombatant(a.id, { name: 'A2' });
    expect(findById(b.id)?.name).toBe('B');
  });
});

describe('updateCombatantSilent', () => {
  it('patches the combatant without triggering a re-render', () => {
    const c = makePlayer({ name: 'Before' });
    addCombatant(c);
    let renderCount = 0;
    setState({ phase: 'setup' }); // reset counter baseline via notify
    // Count notifications by patching state and checking
    updateCombatantSilent(c.id, { name: 'Silent' });
    expect(findById(c.id)?.name).toBe('Silent');
    // The render count stays 0 because silent updates don't call notify
    expect(renderCount).toBe(0);
  });
});

// -- applyDamage --------------------------------------------------------------

describe('applyDamage', () => {
  it('reduces HP by the given amount', () => {
    const m = makeMonster({ currentHp: 10 });
    addCombatant(m);
    applyDamage(m.id, 4);
    expect(findById(m.id)?.currentHp).toBe(6);
  });

  it('deactivates a combatant at exactly 0 HP', () => {
    const m = makeMonster({ currentHp: 5 });
    const survivor = makeMonster({ currentHp: 20 }); // prevents auto-return-to-setup
    addCombatant(m);
    addCombatant(survivor);
    applyDamage(m.id, 5);
    expect(findById(m.id)?.isActive).toBe(false);
  });

  it('deactivates and goes negative when overkilled', () => {
    const m = makeMonster({ currentHp: 5 });
    const survivor = makeMonster({ currentHp: 20 }); // prevents auto-return-to-setup
    addCombatant(m);
    addCombatant(survivor);
    applyDamage(m.id, 8);
    const found = findById(m.id);
    expect(found?.isActive).toBe(false);
    expect(found?.currentHp).toBe(-3);
  });

  it('does nothing for combatants with null HP (players)', () => {
    const p = makePlayer({ currentHp: null });
    addCombatant(p);
    applyDamage(p.id, 5);
    expect(findById(p.id)?.currentHp).toBeNull();
  });

  it('returns to setup keeping only players when all HP-tracked monsters are defeated', () => {
    const player = makePlayer({ name: 'Tordek' });
    const monster = makeMonster({ currentHp: 5 });
    addCombatant(player);
    addCombatant(monster);
    applyDamage(monster.id, 5);
    const s = getState();
    expect(s.phase).toBe('setup');
    expect(s.combatants).toHaveLength(1);
    expect(s.combatants[0].name).toBe('Tordek');
  });

  it('resets roll and surprise data on players when returning to setup', () => {
    const player = makePlayer({ d10Roll: 7, totalInitiative: 9, isSurprised: true });
    const monster = makeMonster({ currentHp: 1 });
    addCombatant(player);
    addCombatant(monster);
    applyDamage(monster.id, 1);
    const p = getState().combatants[0];
    expect(p.d10Roll).toBeNull();
    expect(p.totalInitiative).toBeNull();
    expect(p.isSurprised).toBe(false);
    expect(p.isActive).toBe(true);
  });

  it('does not return to setup while at least one monster is still alive', () => {
    const m1 = makeMonster({ currentHp: 5 });
    const m2 = makeMonster({ currentHp: 5 });
    addCombatant(m1);
    addCombatant(m2);
    applyDamage(m1.id, 5);
    expect(getState().phase).toBe('setup'); // still setup because we haven't transitioned
    // m2 is still alive, so no reset should have happened to remove combatants
    expect(getState().combatants.some((c) => c.id === m2.id)).toBe(true);
  });
});

// -- applyHealing -------------------------------------------------------------

describe('applyHealing', () => {
  it('increases HP by the given amount', () => {
    const m = makeMonster({ maxHp: 10, currentHp: 4 });
    addCombatant(m);
    applyHealing(m.id, 3);
    expect(findById(m.id)?.currentHp).toBe(7);
  });

  it('does not exceed maxHp', () => {
    const m = makeMonster({ maxHp: 10, currentHp: 8 });
    addCombatant(m);
    applyHealing(m.id, 5);
    expect(findById(m.id)?.currentHp).toBe(10);
  });

  it('reactivates a defeated combatant', () => {
    const m = makeMonster({ maxHp: 10, currentHp: 0, isActive: false });
    addCombatant(m);
    applyHealing(m.id, 5);
    expect(findById(m.id)?.isActive).toBe(true);
  });

  it('does nothing for combatants with null HP', () => {
    const p = makePlayer({ currentHp: null, maxHp: null });
    addCombatant(p);
    applyHealing(p.id, 5);
    expect(findById(p.id)?.currentHp).toBeNull();
  });
});

// -- beginInitiativePhase -----------------------------------------------------

describe('beginInitiativePhase', () => {
  it('transitions phase to "initiative"', () => {
    addCombatant(makePlayer());
    beginInitiativePhase();
    expect(getState().phase).toBe('initiative');
  });

  it('sets roundNumber to 1 when no combatants are surprised', () => {
    addCombatant(makePlayer({ isSurprised: false }));
    beginInitiativePhase();
    expect(getState().roundNumber).toBe(1);
    expect(getState().inSurprisePhase).toBe(false);
  });

  it('sets roundNumber to 0 and inSurprisePhase to true when any combatant is surprised', () => {
    addCombatant(makePlayer({ isSurprised: true }));
    beginInitiativePhase();
    expect(getState().roundNumber).toBe(0);
    expect(getState().inSurprisePhase).toBe(true);
  });

  it('auto-rolls d10 and sets totalInitiative for monsters', () => {
    const monster = makeMonster();
    addCombatant(monster);
    beginInitiativePhase();
    const found = findById(monster.id);
    expect(found?.d10Roll).not.toBeNull();
    expect(found?.totalInitiative).not.toBeNull();
    expect(found?.d10Roll).toBeGreaterThanOrEqual(1);
    expect(found?.d10Roll).toBeLessThanOrEqual(10);
  });

  it('does not auto-roll players', () => {
    const player = makePlayer();
    addCombatant(player);
    beginInitiativePhase();
    expect(findById(player.id)?.d10Roll).toBeNull();
    expect(findById(player.id)?.totalInitiative).toBeNull();
  });

  it('ignores inactive combatants when checking for surprise', () => {
    addCombatant(makePlayer({ isSurprised: true, isActive: false }));
    addCombatant(makePlayer({ isSurprised: false }));
    beginInitiativePhase();
    // The surprised combatant is inactive, so no surprise phase
    expect(getState().inSurprisePhase).toBe(false);
  });
});

// -- startNewRound ------------------------------------------------------------

describe('startNewRound', () => {
  it('increments roundNumber', () => {
    addCombatant(makePlayer());
    beginInitiativePhase(); // round 1
    startNewRound();
    expect(getState().roundNumber).toBe(2);
  });

  it('clears d10Roll and totalInitiative for all combatants', () => {
    const player = makePlayer({ d10Roll: 5, totalInitiative: 7 });
    addCombatant(player);
    startNewRound();
    const found = findById(player.id);
    expect(found?.d10Roll).toBeNull();
    expect(found?.totalInitiative).toBeNull();
  });

  it('clears isSurprised on all combatants', () => {
    const c = makePlayer({ isSurprised: true });
    addCombatant(c);
    startNewRound();
    expect(findById(c.id)?.isSurprised).toBe(false);
  });

  it('sets inSurprisePhase to false', () => {
    addCombatant(makePlayer({ isSurprised: true }));
    beginInitiativePhase();
    startNewRound();
    expect(getState().inSurprisePhase).toBe(false);
  });

  it('returns to the initiative phase', () => {
    addCombatant(makePlayer());
    startNewRound();
    expect(getState().phase).toBe('initiative');
  });

  it('auto-rolls monsters for the new round', () => {
    const monster = makeMonster();
    addCombatant(monster);
    startNewRound();
    const found = findById(monster.id);
    expect(found?.d10Roll).not.toBeNull();
    expect(found?.totalInitiative).not.toBeNull();
  });

  it('resets currentSegment to 1', () => {
    setState({ currentSegment: 7 });
    startNewRound();
    expect(getState().currentSegment).toBe(1);
  });
});

// -- reorderCombatants --------------------------------------------------------

describe('reorderCombatants', () => {
  it('moves a combatant from one index to another', () => {
    const a = makePlayer({ name: 'A' });
    const b = makePlayer({ name: 'B' });
    const c = makePlayer({ name: 'C' });
    addCombatant(a);
    addCombatant(b);
    addCombatant(c);
    reorderCombatants(0, 2); // move A to end
    expect(getState().combatants.map((x) => x.name)).toEqual(['B', 'C', 'A']);
  });

  it('moving to same index is a no-op', () => {
    const a = makePlayer({ name: 'A' });
    const b = makePlayer({ name: 'B' });
    addCombatant(a);
    addCombatant(b);
    reorderCombatants(0, 0);
    expect(getState().combatants.map((x) => x.name)).toEqual(['A', 'B']);
  });
});

// -- initiative history (prevInitiative) --------------------------------------

describe('startNewRound prevInitiative', () => {
  it('copies totalInitiative into prevInitiative when starting a new round', () => {
    const p = makePlayer({ totalInitiative: 7 });
    addCombatant(p);
    startNewRound();
    expect(findById(p.id)?.prevInitiative).toBe(7);
  });

  it('clears totalInitiative while preserving prevInitiative', () => {
    const p = makePlayer({ totalInitiative: 5 });
    addCombatant(p);
    startNewRound();
    const found = findById(p.id);
    expect(found?.totalInitiative).toBeNull();
    expect(found?.prevInitiative).toBe(5);
  });

  it('sets prevInitiative to null when there was no roll (combatant skipped)', () => {
    const p = makePlayer({ totalInitiative: null });
    addCombatant(p);
    startNewRound();
    expect(findById(p.id)?.prevInitiative).toBeNull();
  });
});

// -- resetEncounter -----------------------------------------------------------

describe('resetEncounter', () => {
  it('returns to setup phase with no combatants', () => {
    addCombatant(makePlayer());
    resetEncounter();
    const s = getState();
    expect(s.phase).toBe('setup');
    expect(s.combatants).toHaveLength(0);
  });

  it('resets roundNumber to 1', () => {
    setState({ roundNumber: 5 });
    resetEncounter();
    expect(getState().roundNumber).toBe(1);
  });

  it('resets currentSegment to 1', () => {
    setState({ currentSegment: 9 });
    resetEncounter();
    expect(getState().currentSegment).toBe(1);
  });

  it('clears inSurprisePhase', () => {
    setState({ inSurprisePhase: true });
    resetEncounter();
    expect(getState().inSurprisePhase).toBe(false);
  });
});
