import { describe, it, expect, beforeEach, vi } from 'vitest';
import { remotePlayersAllDone, segmentDoneFor } from './combat.ts';
import {
  addCombatant,
  applySegmentDone,
  beginInitiativePhase,
  getState,
  lockInitiative,
  registerRenderer,
  resetEncounter,
  setState,
  updateCombatant,
} from './state.ts';
import { toPublicView } from './sync/publicView.ts';
import { actStatus, actStatusKey, doneErrorMessage } from './player/act.ts';
import type { PublicView } from './sync/publicView.ts';
import type { Combatant } from './types.ts';

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

/** Two players and a monster all acting on segment 5, in combat. */
function startCombat(): { encounterId: string; round: number; segment: number } {
  resetEncounter();
  addCombatant(combatant({ id: 'p1', name: 'Thorin', d10Roll: 5, totalInitiative: 5 }));
  addCombatant(combatant({ id: 'p2', name: 'Elf', d10Roll: 5, totalInitiative: 5 }));
  addCombatant(combatant({ id: 'm1', name: 'Orc', type: 'monster', d10Roll: 5, totalInitiative: 5 }));
  beginInitiativePhase();
  // beginInitiativePhase re-rolls monsters, so pin the orc to the same segment before locking.
  updateCombatant('m1', { d10Roll: 5, totalInitiative: 5 });
  expect(lockInitiative().ok).toBe(true);
  const s = getState();
  return { encounterId: s.encounterId!, round: s.roundNumber, segment: s.currentSegment };
}

describe('segmentDoneFor', () => {
  const base = { phase: 'combat' as const, encounterId: 'e', roundNumber: 2, currentSegment: 5 };
  const marks = { encounterId: 'e', round: 2, segment: 5, done: ['p1'], remote: ['p1'] };

  it('returns the marks only for the exact encounter, round and segment on screen', () => {
    expect(segmentDoneFor({ ...base, segmentDone: marks })).toBe(marks);
    expect(segmentDoneFor({ ...base, segmentDone: { ...marks, segment: 4 } })).toBeNull();
    expect(segmentDoneFor({ ...base, segmentDone: { ...marks, round: 1 } })).toBeNull();
    expect(segmentDoneFor({ ...base, segmentDone: { ...marks, encounterId: 'other' } })).toBeNull();
  });

  it('is null outside combat or when nothing has been recorded', () => {
    expect(segmentDoneFor({ ...base, segmentDone: undefined })).toBeNull();
    expect(segmentDoneFor({ ...base, phase: 'initiative', segmentDone: marks })).toBeNull();
  });
});

describe('remotePlayersAllDone', () => {
  const thorin = combatant({ id: 'p1', name: 'Thorin' });
  const elf = combatant({ id: 'p2', name: 'Elf' });
  const dwarf = combatant({ id: 'p3', name: 'Dwarf' });
  const orc = combatant({ id: 'm1', name: 'Orc', type: 'monster' });

  it('is ready once every seated acting player has tapped Done', () => {
    const r = remotePlayersAllDone([thorin, elf, orc], { done: ['p1', 'p2'], remote: ['p1', 'p2'] });
    expect(r.ready).toBe(true);
    expect(r.waitingOn).toEqual([]);
  });

  it('is not ready while a seated player is still to tap, and says who', () => {
    const r = remotePlayersAllDone([thorin, elf], { done: ['p1'], remote: ['p1', 'p2'] });
    expect(r.ready).toBe(false);
    expect(r.waitingOn.map((c) => c.name)).toEqual(['Elf']);
    expect(r.done.map((c) => c.name)).toEqual(['Thorin']);
  });

  it('does not wait on a player who has no seat (dice at the table)', () => {
    const r = remotePlayersAllDone([thorin, dwarf], { done: ['p1'], remote: ['p1'] });
    expect(r.ready).toBe(true);
    expect(r.waitingOn).toEqual([]);
  });

  it('never claims ready when no acting player is seated, or when there are no marks', () => {
    expect(remotePlayersAllDone([dwarf, orc], { done: [], remote: ['p1'] }).ready).toBe(false);
    expect(remotePlayersAllDone([thorin], null).ready).toBe(false);
  });

  it('ignores monsters even if their id appears in the lists', () => {
    const r = remotePlayersAllDone([orc], { done: [], remote: ['m1'] });
    expect(r.ready).toBe(false);
    expect(r.waitingOn).toEqual([]);
  });
});

describe('applySegmentDone', () => {
  const render = vi.fn();
  beforeEach(() => {
    registerRenderer(() => {});
    render.mockClear();
  });

  it('records the taps for the segment on screen and asks for a remote render', () => {
    const t = startCombat();
    registerRenderer(render);
    render.mockClear();
    expect(applySegmentDone(t, { done: ['p2', 'p1'], remote: ['p1', 'p2'] })).toBe(true);
    expect(getState().segmentDone).toEqual({ ...t, done: ['p1', 'p2'], remote: ['p1', 'p2'] });
    expect(render).toHaveBeenCalledWith({ remote: true });
  });

  it('does nothing, and does not render, when the batch has not changed', () => {
    const t = startCombat();
    applySegmentDone(t, { done: ['p1'], remote: ['p1'] });
    registerRenderer(render);
    render.mockClear();
    expect(applySegmentDone(t, { done: ['p1'], remote: ['p1'] })).toBe(false);
    expect(render).not.toHaveBeenCalled();
  });

  it('ignores a batch for a segment the DM has already left', () => {
    const t = startCombat();
    setState({ currentSegment: t.segment + 1 });
    expect(applySegmentDone(t, { done: ['p1'], remote: ['p1'] })).toBe(false);
    expect(getState().segmentDone).toBeUndefined();
  });

  it('ignores a batch for another round or encounter', () => {
    const t = startCombat();
    expect(applySegmentDone({ ...t, round: t.round + 1 }, { done: ['p1'], remote: [] })).toBe(false);
    expect(applySegmentDone({ ...t, encounterId: 'old' }, { done: ['p1'], remote: [] })).toBe(false);
  });

  it('ignores a batch outside combat', () => {
    const t = startCombat();
    setState({ phase: 'initiative' });
    expect(applySegmentDone(t, { done: ['p1'], remote: [] })).toBe(false);
  });

  it('lapses by itself when the segment advances, with nothing to reset', () => {
    const t = startCombat();
    applySegmentDone(t, { done: ['p1'], remote: ['p1'] });
    setState({ currentSegment: t.segment + 1 });
    expect(segmentDoneFor(getState())).toBeNull();
  });
});

describe('public view', () => {
  it('flags acting players who have tapped Done, and never a monster', () => {
    const t = startCombat();
    applySegmentDone(t, { done: ['p1', 'm1'], remote: ['p1', 'p2'] });
    const acting = toPublicView(getState()).acting;
    expect(acting.map((a) => [a.name, a.done])).toEqual([
      ['Thorin', true],
      ['Elf', false],
      ['Orc', false],
    ]);
  });

  it('shows no one as done once the segment has moved on', () => {
    const t = startCombat();
    applySegmentDone(t, { done: ['p1'], remote: ['p1'] });
    setState({ currentSegment: t.segment + 1 });
    updateCombatant('p1', { totalInitiative: t.segment + 1 });
    expect(toPublicView(getState()).acting.every((a) => !a.done)).toBe(true);
  });
});

describe('actStatus', () => {
  const view = (over: Partial<PublicView> = {}, acting: PublicView['acting'] = [{ id: 'p1', name: 'Thorin', type: 'player', done: false }]): PublicView => ({
    phase: 'combat',
    encounterId: 'e',
    roundNumber: 2,
    currentSegment: 5,
    inSurprisePhase: false,
    acting,
    players: [],
    ...over,
  });
  const receipt = { combatantId: 'p1', encounterId: 'e', round: 2, segment: 5 };

  it('offers Done to a player whose character is acting', () => {
    expect(actStatus(view(), 'p1', null).kind).toBe('act');
  });

  it('shows nothing when not acting, outside combat, or without a character', () => {
    expect(actStatus(view({}, []), 'p1', null).kind).toBe('none');
    expect(actStatus(view({ phase: 'initiative' }), 'p1', null).kind).toBe('none');
    expect(actStatus(view(), null, null).kind).toBe('none');
    expect(actStatus(null, 'p1', null).kind).toBe('none');
  });

  it('never offers Done for a monster that shares the id', () => {
    expect(actStatus(view({}, [{ id: 'p1', name: 'Orc', type: 'monster', done: false }]), 'p1', null).kind).toBe('none');
  });

  it('shows done from the DM\'s view, or from this device\'s own tap for the same segment', () => {
    expect(actStatus(view({}, [{ id: 'p1', name: 'Thorin', type: 'player', done: true }]), 'p1', null).kind).toBe('done');
    expect(actStatus(view(), 'p1', receipt).kind).toBe('done');
  });

  it('does not let a tap from another segment, round or encounter count', () => {
    expect(actStatus(view(), 'p1', { ...receipt, segment: 4 }).kind).toBe('act');
    expect(actStatus(view(), 'p1', { ...receipt, round: 1 }).kind).toBe('act');
    expect(actStatus(view(), 'p1', { ...receipt, encounterId: 'old' }).kind).toBe('act');
  });

  it('does not carry a tap over to a different character acting in the same segment', () => {
    // Tapped Done as p1, then switched to p2 via the claim picker; both act on segment 5.
    const both = view({}, [
      { id: 'p1', name: 'Thorin', type: 'player', done: false },
      { id: 'p2', name: 'Elf', type: 'player', done: false },
    ]);
    expect(actStatus(both, 'p1', receipt).kind).toBe('done');
    expect(actStatus(both, 'p2', receipt).kind).toBe('act');
  });

  it('still shows a character as done when the DM\'s view says so, whoever tapped on this device', () => {
    const both = view({}, [
      { id: 'p1', name: 'Thorin', type: 'player', done: false },
      { id: 'p2', name: 'Elf', type: 'player', done: true },
    ]);
    expect(actStatus(both, 'p2', receipt).kind).toBe('done');
  });

  it('keeps the button when only unrelated parts of the view change, but gives each segment a new one', () => {
    const a = actStatusKey(view(), actStatus(view(), 'p1', null));
    const sameSegment = view({ players: [{ id: 'p1', name: 'T', hasDeclared: true, isActive: true, isHorsDeCombat: false, isSurprised: false }] });
    expect(actStatusKey(sameSegment, actStatus(sameSegment, 'p1', null))).toBe(a);
    const next = view({ currentSegment: 6 });
    expect(actStatusKey(next, actStatus(next, 'p1', null))).not.toBe(a);
  });

  it('translates server errors', () => {
    expect(doneErrorMessage('not your turn')).toMatch(/no longer your segment/);
    expect(doneErrorMessage('Failed to fetch')).toMatch(/connection/);
  });
});
