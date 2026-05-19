import type { AppState, Combatant } from './types.ts';
import { calcInitiative, rollD10 } from './combat.ts';
import { generateLoot } from './data/loot.ts';

// -- Initial state -------------------------------------------------------------

const initialState: AppState = {
  phase: 'setup',
  combatants: [],
  roundNumber: 1,
  currentSegment: 1,
  inSurprisePhase: false,
  pendingLoot: null,
};

// -- localStorage persistence --------------------------------------------------

const STORAGE_KEY = 'adnd-tracker';

function persistState(s: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* quota exceeded or unavailable */ }
}

function loadPersistedState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(initialState);
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (!parsed.phase || !Array.isArray(parsed.combatants)) return structuredClone(initialState);
    // Migrate: ensure fields added after initial release exist in old saves
    const combatants: Combatant[] = parsed.combatants.map((c) => ({
      ...c,
      prevInitiative: c.prevInitiative ?? null,
      isHorsDeCombat: (c.isHorsDeCombat as boolean | undefined) ?? false,
      atRange: (c.atRange as boolean | undefined) ?? false,
      targetId: (c.targetId as string | null | undefined) ?? null,
    }));
    return { ...structuredClone(initialState), ...parsed, combatants, pendingLoot: parsed.pendingLoot ?? null };
  } catch {
    return structuredClone(initialState);
  }
}

// -- State singleton -----------------------------------------------------------

let state: AppState = loadPersistedState();

/** Registered render callback - set by main.ts. */
let onStateChange: (() => void) | null = null;

export function registerRenderer(fn: () => void): void {
  onStateChange = fn;
}

function notify(): void {
  persistState(state);
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
  persistState(state);
}

export function removeCombatant(id: string): void {
  state = {
    ...state,
    combatants: state.combatants.filter((c) => c.id !== id),
  };
  notify();
}

/** Move a combatant from one position to another in the list. */
export function reorderCombatants(fromIndex: number, toIndex: number): void {
  const next = [...state.combatants];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  state = { ...state, combatants: next };
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
    c.id === id
      ? { ...c, currentHp: newHp, isActive: newHp > 0, targetId: newHp <= 0 ? null : c.targetId }
      : c,
  );

  // Check if all HP-tracked monsters/NPCs are now defeated
  const monstersWithHp = newCombatants.filter((c) => c.type !== 'player' && c.maxHp !== null);
  if (monstersWithHp.length > 0 && monstersWithHp.every((c) => !c.isActive)) {
    // All monsters defeated — generate loot and show the loot screen
    const loot = generateLoot(monstersWithHp);
    state = { ...state, combatants: newCombatants, phase: 'loot', pendingLoot: loot };
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

/** Replace the entire app state (used for JSON import). */
export function importState(newState: AppState): void {
  // Migrate: ensure fields added after initial release exist in imported files
  const combatants: Combatant[] = newState.combatants.map((c) => ({
    ...c,
    prevInitiative: c.prevInitiative ?? null,
    isHorsDeCombat: (c.isHorsDeCombat as boolean | undefined) ?? false,
    atRange: (c.atRange as boolean | undefined) ?? false,
    targetId: (c.targetId as string | null | undefined) ?? null,
  }));
  state = { ...newState, combatants };
  notify();
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
    prevInitiative: c.totalInitiative, // preserve for history display in the new round
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


/** Clear loot screen and return to setup with players pre-loaded. */
export function continueLoot(): void {
  const players = state.combatants
    .filter((c) => c.type === 'player')
    .map((c) => ({ ...c, d10Roll: null, totalInitiative: null, prevInitiative: null, isSurprised: false, isHorsDeCombat: false, atRange: false, targetId: null, isActive: true, action: '' }));
  state = { ...initialState, combatants: players };
  notify();
}

/** Full reset - back to setup with a blank slate. */
export function resetEncounter(): void {
  state = structuredClone(initialState);
  notify();
}
