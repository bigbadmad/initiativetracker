# Initiative Tracker — AD&D 2e Combat Tool

## What This Is

A full-encounter management tool for AD&D 2nd Edition. Covers setup → initiative → combat → loot → back to setup. Designed for DM use at the table.

## Tech Stack

- **Language**: TypeScript (strict mode — `noUnusedLocals`, `noUnusedParameters`)
- **Build**: Vite 6 + `tsc`
- **Styling**: Vanilla CSS + Font Awesome 6 (CDN in `index.html`)
- **Icons**: `faIcon(cls)` and `iconBtn(iconCls, label, cls, onClick, ariaLabel?)` helpers in `ui/components.ts`
- **Framework**: None — pure DOM manipulation
- **Dev server**: `npm run dev` | Build: `npm run build` | Tests: `npm test`

## Architecture

```
src/
├── main.ts              # App router (switches on AppState.phase)
├── types.ts             # All TypeScript interfaces
├── state.ts             # Singleton state + localStorage persistence
├── combat.ts            # Pure game logic (no DOM, no state)
├── styles.css           # All styles — single file, sectioned by screen
├── data/
│   ├── monsters.ts      # MonsterTemplate[] + rollHD(hd) + ALL_TAGS
│   ├── encounters.ts    # TerrainTable[] + generateEncounter() + rollCount()
│   ├── loot.ts          # rollLairLoot() + generateLoot() + treasure type tables
│   └── magicItems.ts    # rollMagicItem() + all DMG magic item sub-tables
└── ui/
    ├── components.ts    # el(), btn(), iconBtn(), faIcon(), chip(), uid()…
    ├── library.ts       # openMonsterLibrary(onSelect) — modal, appends to body
    ├── setup.ts         # renderSetup() — phase: 'setup'
    ├── initiative.ts    # renderInitiative() — phase: 'initiative'
    ├── tracker.ts       # renderTracker() — phase: 'combat'
    └── loot.ts          # renderLoot() — phase: 'loot'
```

**Data flow**: mutation → `setState()/updateCombatant()/…` → `notify()` → `persistState()` + registered render callback → full screen re-render.

## App Phases

```
'setup' → 'initiative' → 'combat' → 'loot' → 'setup' (players preserved)
                ↓               ↓
          (surprised?)     (end round) → 'initiative'
          surprise phase
          (round 0, 1 seg)
```

`applyDamage` transitions to `'loot'` (not `'setup'`) when all monsters fall. `continueLoot()` completes the loot → setup transition.

## State Management (`state.ts`)

All app state in one singleton. Key exports:

| Function | Effect |
|---|---|
| `setState(patch)` | Batch update + re-render |
| `updateCombatant(id, patch)` | Patch + re-render |
| `updateCombatantSilent(id, patch)` | Patch + persist, no re-render (for text inputs) |
| `applyDamage(id, amount)` | Reduce HP; deactivate at 0; clear targetId; → loot phase when all monsters die |
| `applyHealing(id, amount)` | Heal up to maxHp, reactivate |
| `beginInitiativePhase()` | Auto-roll monsters; detect surprise → roundNumber=0 |
| `startNewRound()` | Preserve `prevInitiative`; clear rolls; bump round; auto-roll monsters |
| `continueLoot()` | Clear loot; reset players; → setup |
| `resetEncounter()` | Full blank-slate reset |
| `importState(s)` | Replace entire state (JSON import) |
| `generateLoot(…)` | Called internally by applyDamage; uses `data/loot.ts` |

localStorage key: `'adnd-tracker'`. Migration in `loadPersistedState` adds missing fields with defaults when loading old saves.

## AD&D 2e Initiative Formula

```
base = d10 + weapon_speed + spell_casting + other_mods + dex_reaction
if hasHaste:  base = max(1, floor(base / 2))
if hasSlow:   base += 10
```

Lower total acts first. Ties = simultaneous. Surprised combatants get sentinel 99 (excluded from all segments). HdC combatants also get sentinel 99 and are excluded.

## Combatant Fields (key ones)

| Field | Type | Notes |
|---|---|---|
| `modifiers` | `Modifier[]` | Standing initiative modifiers |
| `d10Roll` | `number \| null` | Raw die result this round |
| `totalInitiative` | `number \| null` | Computed (99 = sentinel for surprised/HdC) |
| `prevInitiative` | `number \| null` | Last round's total, shown for context |
| `isSurprised` | `boolean` | Cleared by `startNewRound` |
| `isHorsDeCombat` | `boolean` | Persists across rounds; DM clears manually |
| `atRange` | `boolean` | Display only; persists across rounds |
| `targetId` | `string \| null` | Monster's assigned target PC; cleared on defeat |
| `ac`, `attacks`, `damage`, `thac0` | optional | Populated from monster library for display in tracker |

## Data Layer (`src/data/`)

### `monsters.ts`
- `MonsterTemplate` interface includes `individual?` (treasure type expression e.g. `"Q×3"`) and `lairType?` (letter e.g. `"D"`)
- `rollHD(hd: string): number` — parses 2e HD notation: `"2"`, `"3+1"`, `"1-1"`, `"1/2"`, `"11+"`, `"45 hp"`, `"45-75 hp"`
- `MONSTERS: MonsterTemplate[]` — 100+ monsters; names must match encounter table `monster` strings exactly for loot/stat auto-fill

### `encounters.ts`
- `ENCOUNTER_TABLES: TerrainTable[]` — 14 terrain types from DMG Chapter 11
- `generateEncounter(terrainId): GeneratedEncounter | null` — weighted random pick; rolls count; looks up template in MONSTERS
- `rollEncounterHp(enc): number` — rolls HP from the matched or fallback HD

### `loot.ts`
- Individual types P–V: rolled per monster body; expression parser handles `"Q"`, `"Q×3"`, `"P,Q×2"` etc.
- Lair types A–I: `rollLairLoot(type): LootResult` — rolls all coin/gem/jewelry/magic for that type
- `generateLoot(defeated[]): LootResult` — aggregates individual treasure; collects unique lair types; called by `applyDamage`
- `LootResult.magicItems: string[]` — specific item names from `magicItems.ts`

### `magicItems.ts`
- `rollMagicItem(): string` — main table (10 categories, weighted); calls sub-table function
- Sub-tables: `potion()`, `scroll()`, `ring()`, `rod()`, `staff()`, `wand()`, `armor()`, `sword()`, `miscWeapon()`, `miscMagic()`
- Items ending in `(C)` are cursed; rendered in red on loot screen

## UI Conventions

- DOM creation through `components.ts` helpers — don't use `document.createElement` directly in screen files
- All icon buttons use `iconBtn(faClass, label, cls, handler, ariaLabel?)` — plain `btn()` is for text-only buttons
- Screen render functions return an `HTMLElement`; `main.ts` mounts them
- `updateCombatantSilent` for any input that fires on every keystroke (avoids re-renders killing focus)
- The `change` event on roll inputs in initiative.ts uses `updateCombatantSilent` intentionally — prevents the button-click double-tap bug where `change` + re-render destroys the Lock In button before `click` fires

## Adding a New Modifier Kind
Touch: `types.ts` (`ModifierKind`), `combat.ts` (`calcInitiative`), `ui/setup.ts` (`MOD_KIND_LABELS`, `VALUELESS_KINDS`), `ui/initiative.ts` (background mod display)

## Adding a New Monster
Add to `MONSTERS[]` in `monsters.ts`. Include `individual` and `lairType` for loot generation. If the monster appears in an encounter table entry, the `monster` string in the entry must match `name` exactly (after stripping trailing numbers).

## Coding Conventions
- TypeScript strict mode — no implicit any, unused locals/params are errors
- No external UI libraries
- No comments unless the WHY is non-obvious
- Pure game logic in `combat.ts`/`data/`; state in `state.ts`; DOM in `ui/`
