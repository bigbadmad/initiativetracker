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
}

/** Everything players are allowed to see. Built field-by-field so new Combatant fields never leak by default. */
export interface PublicView {
  phase: AppPhase;
  roundNumber: number;
  currentSegment: number;
  inSurprisePhase: boolean;
  acting: PublicActor[];
  players: PublicPlayer[];
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
      }),
    );

  return {
    phase: state.phase,
    roundNumber: state.roundNumber,
    currentSegment: state.currentSegment,
    inSurprisePhase: state.inSurprisePhase,
    acting,
    players,
  };
}
