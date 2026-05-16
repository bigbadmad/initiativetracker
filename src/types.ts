// -- Modifier types ----------------------------------------------------------

export type ModifierKind =
  | 'weapon_speed'
  | 'spell_casting'
  | 'dex_reaction'
  | 'haste'
  | 'slow'
  | 'other';

export interface Modifier {
  id: string;
  kind: ModifierKind;
  /** Raw numeric value added directly to the initiative total.
   *  Positive = slower (adds to total); negative = faster (subtracts from total).
   *  For dex_reaction, a negative value means better DEX (acts sooner). */
  value: number;
  label: string;
}

// -- Combatant ----------------------------------------------------------------

export type CombatantType = 'player' | 'monster';

export interface Combatant {
  id: string;
  name: string;
  type: CombatantType;
  /** Only meaningful for monsters/NPCs; players track their own HP. */
  maxHp: number | null;
  currentHp: number | null;
  /** Standing modifiers that always apply (weapon, dex, etc.). */
  modifiers: Modifier[];
  /** The physical d10 result entered by the DM this round. */
  d10Roll: number | null;
  /** Computed: d10 + modifier sum, after haste/slow. */
  totalInitiative: number | null;
  /** Surprised combatants skip the surprise segments. */
  isSurprised: boolean;
  /** Set to false when currentHp reaches 0 or below. */
  isActive: boolean;
  /** Free-text label for what this combatant is doing this round (persists until changed). */
  action: string;
}

// -- Application phases -------------------------------------------------------

export type AppPhase = 'setup' | 'initiative' | 'combat';

// -- Top-level app state ------------------------------------------------------

export interface AppState {
  phase: AppPhase;
  combatants: Combatant[];
  roundNumber: number;
  currentSegment: number;
  /** Whether we are currently resolving the surprise phase. */
  inSurprisePhase: boolean;
}
