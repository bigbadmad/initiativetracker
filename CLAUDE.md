# Initiative Tracker — AD&D 2e Combat Tool

## What This Is

A segment-based initiative tracker for AD&D 2nd Edition. Implements the AD&D 2e initiative system where combatants roll d10 and add modifiers; lower total = acts first; combat resolves segment-by-segment (1–10). Designed for DM use at the table.

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Build**: Vite 6 + `tsc`
- **Styling**: Vanilla CSS with CSS custom properties (dark D&D parchment theme)
- **Framework**: None — pure DOM manipulation
- **Dev server**: `npm run dev` | Build: `npm run build` | Preview: `npm run preview`

## Architecture

```
src/
├── main.ts          # App entry point; routes by phase; registers re-render callback
├── types.ts         # All TypeScript interfaces (Combatant, AppState, Modifier, etc.)
├── state.ts         # Singleton state manager + observer pattern
├── combat.ts        # Pure AD&D 2e rules logic (no DOM, no state)
├── styles.css       # All styles — single file, sectioned by screen
└── ui/
    ├── components.ts  # DOM factory helpers (el, btn, labeledInput, chip, etc.)
    ├── setup.ts       # Phase: "setup" — add combatants, assign modifiers/HP
    ├── initiative.ts  # Phase: "initiative" — enter d10 rolls, declare actions
    └── tracker.ts     # Phase: "combat" — segment-by-segment tracking, HP management
```

**Data flow**: State mutation → `setState()` → registered callback fires → full re-render of current screen. No virtual DOM; screens are rebuilt from scratch on each state change.

## State Management

All app state lives in the singleton in `state.ts`. Mutation functions:

| Function | Effect |
|---|---|
| `setState(patch)` | Batch update + re-render |
| `addCombatant(c)` | Append to combatants array |
| `updateCombatant(id, patch)` | Patch + re-render |
| `updateCombatantSilent(id, patch)` | Patch without re-render (used for text inputs to avoid focus loss) |
| `applyDamage(id, amount)` | Reduce HP; auto-deactivate at 0; triggers return-to-setup when all monsters defeated |
| `applyHealing(id, amount)` | Heal up to maxHp |
| `beginInitiativePhase()` | Auto-roll monsters, detect surprise, transition to "initiative" |
| `startNewRound()` | Clear rolls, bump roundNumber, auto-roll monsters |
| `resetEncounter()` | Full reset to blank slate |

## AD&D 2e Initiative Formula

```
base = d10 + weapon_speed + spell_casting + other_mods + dex_reaction
if hasHaste:  base = max(1, floor(base / 2))
if hasSlow:   base += 10
```

Lower total acts first. Ties = simultaneous action. Surprised combatants get sentinel value 99 (excluded from normal segments). Surprise phase = Round 0, 1 segment only.

## Modifier Kinds

| Kind | Behaviour | Notes |
|---|---|---|
| `weapon_speed` | Adds to initiative | From weapon speed factor |
| `spell_casting` | Adds to initiative | Casting time in segments |
| `dex_reaction` | Adds to initiative | Usually negative (bonus) |
| `haste` | Halves total (min 1), then other mods applied | Non-linear |
| `slow` | Adds 10 to final total | Non-linear |
| `other` | Numeric, adds linearly | Catch-all |

`haste` and `slow` are valueless (boolean flags); others have a numeric value.

## App Phases

```
setup → initiative → combat → (all monsters dead) → setup (players preserved)
                  ↓               ↓
           (surprised?)     (end round) → initiative
           surprise phase
           (round 0, 1 seg)
```

## Key Files to Know

- **Adding a new modifier kind**: `types.ts` (`ModifierKind`), `combat.ts` (`calcInitiative`), `ui/setup.ts` (`MOD_KIND_LABELS`, `VALUELESS_KINDS`), `ui/initiative.ts` (background mod display)
- **Initiative formula change**: `combat.ts:calcInitiative`
- **HP logic**: `state.ts:applyDamage` / `applyHealing`; display colours in `styles.css` (`.hp-healthy`, `.hp-bloodied`, `.hp-critical`)
- **Segment navigation**: `combat.ts:nextActiveSegment`, `combat.ts:firstActiveSegment`
- **Surprise handling**: `state.ts:beginInitiativePhase`, `ui/tracker.ts:renderTracker`

## Coding Conventions

- DOM creation goes through `ui/components.ts` helpers — don't use `document.createElement` directly in screen files
- Screen render functions (`renderSetup`, `renderInitiative`, `renderTracker`) are called by `main.ts`; they return a DOM node
- Pure game logic stays in `combat.ts`; state mutations stay in `state.ts`; DOM stays in `ui/`
- TypeScript strict mode is on — no implicit any, unused locals/params are errors
- No external UI libraries; keep it dependency-free
