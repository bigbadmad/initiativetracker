import type { AppState, Combatant } from './types.ts';
import { calcInitiative, rollD10 } from './combat.ts';

// -- Initial state -------------------------------------------------------------

const initialState: AppState = {
  phase: 'setup',
  combatants: [],
  roundNumber: 1,
  currentSegment: 1,
  inSurprisePhase: false,
};

// -- State singleton -----------------------------------------------------------

let state: AppState = structuredClone(initialState);

/** Registered render callback - set by main.ts. */
let onStateChange: (() => void) | null = null;

export function registerRenderer(fn: () => void): void {
  onStateChange = fn;
}

function notify(): void {
  onStateChange?.();
}

// -- Read ----------------------------------------------------------------------

export function getState(): Readonly<AppState> {
  return state;
}

// -- Mutations -----------------------------------------------------------------

export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  notify();
}

export function addCombatant(combatant: Combatant): void {
  state = { ...state, combatants: [...state.combatants, combatant] };
  notify();
}

export function updateCombatant(id: string, patch: Partial<Combatant>): void {
  state = {
    ...state,
    combatants: state.combatants.map((c) =>
      c.id === id ? { ...c, ...patch } : c,
    ),
  };
  notify();
}

/**
 * Update a combatant without triggering a re-render.
 * Use for transient edits (e.g. text fields mid-edit) where re-render would lose focus.
 */
export function updateCombatantSilent(id: string, patch: Partial<Combatant>): void {
  state = {
    ...state,
    combatants: state.combatants.map((c) =>
      c.id === id ? { ...c, ...patch } : c,
    ),
  };
}

export function removeCombatant(id: string): void {
  state = {
    ...state,
    combatants: state.combatants.filter((c) => c.id !== id),
  };
  notify();
}

/** Apply damage to a monster/NPC. Deactivates if hp drops to 0 or below.
 *  When all HP-tracked monsters/NPCs are defeated, automatically returns to
 *  the setup screen with player combatants pre-loaded for the next encounter. */
export function applyDamage(id: string, amount: number): void {
  const combatant = state.combatants.find((c) => c.id === id);
  if (!combatant || combatant.currentHp === null) return;

  const newHp = combatant.currentHp - amount;
  const newCombatants = state.combatants.map((c) =>
    c.id === id ? { ...c, currentHp: newHp, isActive: newHp > 0 } : c,
  );

  // Check if all HP-tracked monsters/NPCs are now defeated
  const monstersWithHp = newCombatants.filter((c) => c.type !== 'player' && c.maxHp !== null);
  if (monstersWithHp.length > 0 && monstersWithHp.every((c) => !c.isActive)) {
    // Return to setup keeping only players, reset their round state
    const players = newCombatants
      .filter((c) => c.type === 'player')
      .map((c) => ({ ...c, d10Roll: null, totalInitiative: null, isSurprised: false, isActive: true, action: '' }));
    state = { ...initialState, combatants: players };
  } else {
    state = { ...state, combatants: newCombatants };
  }
  notify();
}

/** Apply healing to a monster/NPC. Won't exceed maxHp. */
export function applyHealing(id: string, amount: number): void {
  const combatant = state.combatants.find((c) => c.id === id);
  if (!combatant || combatant.currentHp === null || combatant.maxHp === null)
    return;

  const newHp = Math.min(combatant.maxHp, combatant.currentHp + amount);
  updateCombatant(id, { currentHp: newHp, isActive: true });
}

// -- Internal helper ----------------------------------------------------------

function withAutoRolledMonsters(combatants: Combatant[]): Combatant[] {
  return combatants.map((c) => {
    if (c.isActive && c.type !== 'player') {
      const roll = rollD10();
      const total = calcInitiative(roll, c.modifiers);
      return { ...c, d10Roll: roll, totalInitiative: total };
    }
    return c;
  });
}

/**
 * Transition to the initiative phase, auto-rolling d10 for all monsters/NPCs.
 * Surprise is detected automatically: if any active combatant is marked surprised,
 * the first phase becomes a surprise round (1 segment) with roundNumber 0
 * so that startNewRound() brings it to Round 1.
 */
export function beginInitiativePhase(): void {
  const hasSurprise = state.combatants.some((c) => c.isActive && c.isSurprised);
  state = {
    ...state,
    phase: 'initiative',
    inSurprisePhase: hasSurprise,
    roundNumber: hasSurprise ? 0 : 1,
    combatants: withAutoRolledMonsters(state.combatants),
  };
  notify();
}

/** Reset rolls for a new round, bump roundNumber, auto-roll monsters, return to initiative phase. */
export function startNewRound(): void {
  const cleared = state.combatants.map((c) => ({
    ...c,
    d10Roll: null,
    totalInitiative: null,
    isSurprised: false, // Surprised only applies to the surprise phase
  }));
  state = {
    ...state,
    phase: 'initiative',
    roundNumber: state.roundNumber + 1,
    currentSegment: 1,
    inSurprisePhase: false,
    combatants: withAutoRolledMonsters(cleared),
  };
  notify();
}

/** Full reset - back to setup with a blank slate. */
export function resetEncounter(): void {
  state = structuredClone(initialState);
  notify();
}
