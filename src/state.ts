import type { AppState, Combatant } from './types.ts';

// ── Initial state ─────────────────────────────────────────────────────────────

const initialState: AppState = {
  phase: 'setup',
  combatants: [],
  roundNumber: 1,
  currentSegment: 1,
  surpriseSegments: 0,
  inSurprisePhase: false,
};

// ── State singleton ───────────────────────────────────────────────────────────

let state: AppState = structuredClone(initialState);

/** Registered render callback — set by main.ts. */
let onStateChange: (() => void) | null = null;

export function registerRenderer(fn: () => void): void {
  onStateChange = fn;
}

function notify(): void {
  onStateChange?.();
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getState(): Readonly<AppState> {
  return state;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

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

export function removeCombatant(id: string): void {
  state = {
    ...state,
    combatants: state.combatants.filter((c) => c.id !== id),
  };
  notify();
}

/** Apply damage to a monster/NPC. Deactivates if hp drops to 0 or below. */
export function applyDamage(id: string, amount: number): void {
  const combatant = state.combatants.find((c) => c.id === id);
  if (!combatant || combatant.currentHp === null) return;

  const newHp = combatant.currentHp - amount;
  updateCombatant(id, {
    currentHp: newHp,
    isActive: newHp > 0,
  });
}

/** Apply healing to a monster/NPC. Won't exceed maxHp. */
export function applyHealing(id: string, amount: number): void {
  const combatant = state.combatants.find((c) => c.id === id);
  if (!combatant || combatant.currentHp === null || combatant.maxHp === null)
    return;

  const newHp = Math.min(combatant.maxHp, combatant.currentHp + amount);
  updateCombatant(id, { currentHp: newHp, isActive: true });
}

/** Reset rolls for a new round, bump roundNumber, return to initiative phase. */
export function startNewRound(): void {
  state = {
    ...state,
    phase: 'initiative',
    roundNumber: state.roundNumber + 1,
    currentSegment: 1,
    inSurprisePhase: false,
    combatants: state.combatants.map((c) => ({
      ...c,
      d10Roll: null,
      totalInitiative: null,
    })),
  };
  notify();
}

/** Full reset — back to setup with a blank slate. */
export function resetEncounter(): void {
  state = structuredClone(initialState);
  notify();
}
