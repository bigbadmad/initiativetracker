# Initiative Tracker — AD&D 2e Combat Tool

## What This Is

A full-encounter management tool for AD&D 2nd Edition. Covers setup → initiative → combat → loot → back to setup. Designed for DM use at the table.

It can also run an **online session** (see "Online Play" below): players join from their own devices, declare an action and have the server roll their d10, and follow the segments live. With no session open the app is exactly the offline DM tool and needs no network.

## Tech Stack

- **Language**: TypeScript (strict mode — `noUnusedLocals`, `noUnusedParameters`)
- **Build**: Vite 6 + `tsc`, two HTML entry points (`index.html` DM app, `play.html` player app)
- **Styling**: Vanilla CSS + Font Awesome 6 (CDN in `index.html`)
- **Icons**: `faIcon(cls)` and `iconBtn(iconCls, label, cls, onClick, ariaLabel?)` helpers in `ui/components.ts`
- **Framework**: None — pure DOM manipulation
- **Backend (online play only)**: Supabase (Postgres + Realtime + anonymous auth), `@supabase/supabase-js`. Hosted on Netlify (Node 22, see `netlify.toml`).
- **Dev server**: `npm run dev` | Build: `npm run build` | Tests: `npm test`

## Architecture

```
index.html / play.html   # DM app entry / player app entry (both built by vite.config.ts)
supabase/migrations/     # Numbered SQL, applied BY HAND in the Supabase SQL editor
src/
├── main.ts              # App router (switches on AppState.phase); defers remote renders while the DM is mid-edit
├── types.ts             # All TypeScript interfaces
├── state.ts             # Singleton state + localStorage persistence
├── combat.ts            # Pure game logic (no DOM, no state)
├── styles.css           # All styles — single file, sectioned by screen
├── data/
│   ├── monsters.ts      # MonsterTemplate[] + rollHD(hd) + ALL_TAGS
│   ├── encounters.ts    # TerrainTable[] + generateEncounter() + rollCount()
│   ├── loot.ts          # rollLairLoot() + generateLoot() + treasure type tables
│   └── magicItems.ts    # rollMagicItem() + all DMG magic item sub-tables
├── sync/                # Online play. Nothing outside this folder talks to Supabase
│   ├── supabase.ts      # Client init from VITE_SUPABASE_*; `syncAvailable` is false without env vars
│   ├── publicView.ts    # toPublicView(state) — the ONLY data players may see; toPlayerTotals(state)
│   ├── session.ts       # DM: create/close/publish (revisioned, retried). Player: join/leave/claim/declare/subscribe
│   ├── poller.ts        # Shared DM poll loop (no overlap, error de-dup, stops on closed session)
│   ├── declarations.ts  # DM: poll declarations, single-flight totals write-back
│   ├── segmentDone.ts   # DM: poll who has tapped Done for the segment on screen
│   └── autoLock.ts      # Deferred auto-lock (waits until the DM is not mid-edit)
├── player/
│   ├── main.ts          # Player app: join → claim character → declare → follow segments → Done
│   ├── declare.ts       # Pure: what the declare panel shows (unit tested)
│   └── act.ts           # Pure: whether to show the Done button (unit tested)
└── ui/
    ├── components.ts    # el(), btn(), iconBtn(), faIcon(), chip(), uid()…
    ├── library.ts       # openMonsterLibrary(onSelect) — modal, appends to body
    ├── setup.ts         # renderSetup() — phase: 'setup'
    ├── initiative.ts    # renderInitiative() — phase: 'initiative'
    ├── tracker.ts       # renderTracker() — phase: 'combat'
    ├── loot.ts          # renderLoot() — phase: 'loot'
    ├── sessionBar.ts    # Online session bar (start/end, code, auto-lock); mounted outside #app
    └── editing.ts       # dmIsMidEdit() — true while typing or holding a button
```

**Data flow**: mutation → `setState()/updateCombatant()/…` → `notify()` → `persistState()` + registered render callback → full screen re-render, then the registered publisher pushes the public view to players (silent updates publish too).

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
| `beginInitiativePhase()` | Auto-roll monsters; detect surprise → roundNumber=0; assigns a new `encounterId` |
| `lockInitiative()` | Initiative → combat. Refuses (changes nothing) outside the initiative phase or while a roll is missing; returns `{ok}` / `{reason}` |
| `applyDeclarations(enc, round, decls)` | Merge remote declarations into the matching round; never overwrites a roll the DM already has; returns applied ids |
| `applySegmentDone(target, result)` | Record which acting players tapped Done; ignores a batch for a segment already left; no-op (no render) if unchanged |
| `startNewRound()` | Preserve `prevInitiative`; clear rolls; bump round; auto-roll monsters |
| `continueLoot()` | Clear loot; reset players; → setup |
| `resetEncounter()` | Full blank-slate reset |
| `importState(s)` | Replace entire state (JSON import) |
| `generateLoot(…)` | Called internally by applyDamage; uses `data/loot.ts` |

localStorage key: `'adnd-tracker'`. Migration in `loadPersistedState` adds missing fields with defaults when loading old saves.

`AppState.encounterId` is assigned by `beginInitiativePhase()`. Round numbers restart at 1 for every encounter, so anything keyed by round (remote declarations) must be keyed by `(encounterId, roundNumber)`.

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

## Online Play (`src/sync/`, `src/player/`, `supabase/`)

### Principles
- **The DM client is authoritative.** Full `AppState` (monster HP, AC, loot, targets) stays in the DM's browser. Nothing private is synced.
- **Players see only `toPublicView(state)`**, which is built field by field so a new `Combatant` field never leaks by default. `publicView.test.ts` fails if a private field appears in the serialised view. Keep it that way when adding to `PublicView`.
- **Players never write tables.** Every player action is a `security definer` RPC that checks membership and the DM's published view. Clients have no insert/update/delete grants.
- **Sync is optional.** `syncAvailable` is false without env vars; the DM session bar is not mounted and `play.html` says online play is not configured.
- **The d10 is rolled by the server.** The DM client folds a declaration into state with the same `calcInitiative` the offline flow uses. Players can declare only weapon speed or casting time; dex, haste and slow stay DM-held.

### Round loop
1. DM starts a round → `phase: 'initiative'`, published with `encounterId` + `roundNumber`.
2. Player calls `submit_declaration` → one row per `(encounter, round, character)`, d10 rolled server-side.
3. DM polls `get_declarations` (~2.5s), `applyDeclarations()` merges them, totals go back via `set_declaration_totals` so each player can read only their own.
4. When the last remote declaration lands and Auto-lock is on, `lockInitiative()` runs once the DM is not mid-edit.
5. Combat: DM stepping segments republishes the view; players see segment and who acts.
6. An acting player taps **Done** (`mark_done`). The DM polls `get_segment_done` (~1.5s), `applySegmentDone()` stores it, and the public view carries `done` on each acting player. The tracker shows Done/Waiting chips and highlights Next once every *seated* acting player is done.

**Done is information, never a gate.** Next is never disabled, so an absent player cannot stall the table. `AppState.segmentDone` names the `(encounter, round, segment)` it belongs to and lapses by itself when combat moves on, so nothing resets it. "Seated" means a player has claimed that character; players with dice at the table are not waited on.

### Database objects
| Object | Purpose |
|---|---|
| `sessions` | Code + DM secret hash, `closed_at`. Unreadable by clients |
| `session_views` | The published public view + `revision`. Members read; players subscribe via Realtime |
| `players` | Seat per anonymous user, `combatant_id` claim. Members read `id, session_id, name, combatant_id` only (never `auth_uid`) |
| `declarations` | Remote declarations + DM-written `total`. Players read own rows only |
| `segment_done` | Done taps per `(encounter, round, segment, combatant)`. Unreadable by clients; the DM reads it via RPC and republishes `done` in the view |
| DM RPCs (secret-gated) | `create_session`, `publish_view`, `close_session`, `get_declarations`, `set_declaration_totals`, `get_segment_done` |
| Player RPCs | `join_session`, `leave_session`, `claim_combatant`, `submit_declaration`, `mark_done` |

### Changing the database
- **Migrations are applied by hand** in the Supabase SQL editor and are immutable once run. Never edit an applied file; add the next number. `create or replace` is fine for an unchanged signature; `drop function` first when the signature changes (and say so at the top of the file, because the deployed client must match).
- **Secret checks**: reject a NULL secret explicitly and compare with `is distinct from`. `crypt(...) <> hash` evaluates to NULL for a NULL secret and an `if` treats that as false — that bug shipped once and let anyone close any session.
- **Ordering**: DM functions lock the session row (`for update`), and `submit_declaration` takes it `for share`, so publish, close and declare run strictly one after another.
- **Publishes are revisioned**: the server ignores a revision at or below what it holds. Don't bypass `publishView()`.
- The deployed client must match the database. Apply additive migrations first; for a signature change, apply and deploy together.

### Environment
- `.env.local` (gitignored): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (a publishable or legacy anon key). Never use the secret or `service_role` key in browser code.
- Netlify needs the same two variables. Vite bakes them in at build time, so changing them needs a new deploy.
- Free-tier Supabase pauses a project after about a week idle; unpause it in the dashboard before a session.

### Testing
- **Unit tests** (`npm test`) mock the Supabase client and use fake timers. Module-level sync state means tests `vi.resetModules()` and re-import.
- **Live smoke tests**: `supabase/smoke/declarations.cjs` (migrations 0005–0006) and `supabase/smoke/segment-done.cjs` (0007) run against the real project from `.env.local`. Each leaves one closed test session behind and uses two anonymous sign-ins (Supabase rate-limits those per IP, so don't loop them). Run the matching one after applying a migration, before deploying.
- **Realtime**: `SUBSCRIBED` fires before the server-side subscription is live. Tests must wait several seconds after it, and clients re-read once on `SUBSCRIBED` to close the gap (see `subscribeToView`, `subscribeToMyDeclarations`).
- `supabase/maintenance/cleanup_sessions.sql` removes old test sessions; run it in the SQL editor.

### Gotchas
- A change that arrives over the network must call `notify({ remote: true })` so `main.ts` holds the render until `dmIsMidEdit()` is false. A plain `notify()` rebuilds the screen under the DM's cursor.
- The player screen updates persistent regions in place. Never rebuild the declare form on every view update; `declareStatusKey()` decides when it may change.
- `lockInitiative()` is guarded to the initiative phase. A deferred call must never be able to reset a combat in progress.
- Claiming a character is trust-based: a player can switch characters via the claim picker.
- Done taps persist per segment on the server. After "Re-enter Initiative" and a second lock, a player who already tapped Done for a segment shows as done on reaching it again. It is only a hint, and nothing resets it.
- A player who closes the tab without pressing Leave keeps their seat, so the DM keeps "waiting" on them for Done until they leave or the DM presses Next.

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
