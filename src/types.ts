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
  /** The totalInitiative from the previous round — displayed as context during the current round. */
  prevInitiative: number | null;
  /** Whether this combatant is at range rather than in melee. Persists across rounds. */
  atRange: boolean;
  /** For monsters: the ID of the PC they are currently assigned to attack. Null = unassigned. */
  targetId: string | null;
  /**
   * Hors de combat: combatant is temporarily incapacitated (unconscious, stunned, paralysed, etc.)
   * but may recover. They are shown in the tracker but do not act on any segment. Unlike isActive,
   * this does NOT remove them from the active list and is NOT cleared at the start of a new round —
   * only the DM can clear it manually.
   */
  isHorsDeCombat: boolean;
  // -- Combat reference fields (populated from the monster library) -------------
  /** Armor Class — shown during combat so players know what they need to hit. */
  ac?: number;
  /** Attack count/description, e.g. "3" or "2/1". */
  attacks?: string;
  /** Damage expression per attack, e.g. "1d4/1d4/2d6". */
  damage?: string;
  /** THAC0 — shown during combat so the DM knows the monster's to-hit baseline. */
  thac0?: number;
}

// -- Application phases -------------------------------------------------------

export type AppPhase = 'setup' | 'initiative' | 'combat' | 'loot';

// -- Loot result ---------------------------------------------------------------

export interface XPEntry {
  name: string;
  count: number;
  xpEach: number;
  subtotal: number;
}

export interface LootResult {
  /** Human-readable summary of which monsters were defeated. */
  encounterSummary: string;
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  /** Gem descriptions with gp value, e.g. "Amber (100 gp)". */
  gems: string[];
  /** Jewelry / art object descriptions. */
  jewelry: string[];
  /** Specific magic items found, rolled from the 2e DMG tables. */
  magicItems: string[];
  /** Lair treasure type letter(s) for each monster type encountered, e.g. ["C","D"]. */
  lairTypes: string[];
  /** Total XP = monster XP + treasure XP. */
  xp: number;
  /** XP from monster defeats alone (2e DMG Table 31). */
  monsterXP: number;
  /** XP from the GP value of coins, gems, jewelry, and magic items. */
  treasureXP: number;
  /** Per-monster-type XP breakdown. */
  xpBreakdown: XPEntry[];
}

// -- Session totals (cumulative across encounters in one session) --------------

export interface SessionLoot {
  cp: number; sp: number; ep: number; gp: number; pp: number;
  gems: string[];
  jewelry: string[];
  magicItems: string[];
  xp: number;
}

// -- Top-level app state ------------------------------------------------------

export interface AppState {
  phase: AppPhase;
  combatants: Combatant[];
  roundNumber: number;
  currentSegment: number;
  /** Whether we are currently resolving the surprise phase. */
  inSurprisePhase: boolean;
  /** Populated when transitioning to the 'loot' phase; null otherwise. */
  pendingLoot: LootResult | null;
  /** Running session totals, accumulated by "Save Loot" on the loot screen. */
  sessionLoot: SessionLoot;
}
