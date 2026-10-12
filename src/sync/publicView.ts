import type { AppPhase, AppState } from '../types.ts';
import { getCombatantsAtSegment } from '../combat.ts';

export interface PublicActor {
  id: string;
  name: string;
  type: 'player' | 'monster';
}

export interface PublicPlayer {
  id: string;
  name: string;
  hasDeclared: boolean;
  isActive: boolean;
  isHorsDeCombat: boolean;
  /** Only matters during the surprise phase; the server uses it to refuse a declaration. */
  isSurprised: boolean;
}

/** Everything players are allowed to see. Built field-by-field so new Combatant fields never leak by default. */
export interface PublicView {
  phase: AppPhase;
  /** With roundNumber, identifies which round a declaration belongs to (rounds restart every encounter). */
  encounterId: string | null;
  roundNumber: number;
  currentSegment: number;
  inSurprisePhase: boolean;
  acting: PublicActor[];
  players: PublicPlayer[];
}

/**
 * Each remote player's computed initiative, keyed by combatant id. This is deliberately NOT part of
 * the shared view: it is written to the declaration row that only that player can read.
 * Surprised and hors-de-combat sentinels (99) are not real totals and are left out.
 */
export function toPlayerTotals(state: Readonly<AppState>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const c of state.combatants) {
    if (c.type === 'player' && c.totalInitiative !== null && c.totalInitiative < 99) {
      totals[c.id] = c.totalInitiative;
    }
  }
  return totals;
}

export function toPublicView(state: Readonly<AppState>): PublicView {
  const acting =
    state.phase === 'combat'
      ? getCombatantsAtSegment(state.combatants, state.currentSegment, state.inSurprisePhase).map(
          (c): PublicActor => ({
            id: c.id,
            name: c.name,
            type: c.type === 'player' ? 'player' : 'monster',
          }),
        )
      : [];

  const players = state.combatants
    .filter((c) => c.type === 'player')
    .map(
      (c): PublicPlayer => ({
        id: c.id,
        name: c.name,
        hasDeclared: c.d10Roll !== null,
        isActive: c.isActive,
        isHorsDeCombat: c.isHorsDeCombat,
        isSurprised: c.isSurprised,
      }),
    );

  return {
    phase: state.phase,
    encounterId: state.encounterId ?? null,
    roundNumber: state.roundNumber,
    currentSegment: state.currentSegment,
    inSurprisePhase: state.inSurprisePhase,
    acting,
    players,
  };
}
