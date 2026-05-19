# AD&D 2e Initiative Tracker

A full-featured combat management tool for **Advanced Dungeons & Dragons 2nd Edition**, built for DM use at the table. Covers the complete encounter lifecycle: setup, initiative, combat, and loot.

## Install & Run

```bash
npm install
npm run dev        # development server with hot reload
npm run build      # production build → dist/
npm run preview    # preview the production build
npm test           # run test suite
```

> **Note:** The app requires an internet connection on first load to fetch Font Awesome icons from the CDN. Subsequent loads use the browser cache.

---

## Screen Flow

```
Setup → Initiative → Combat → Loot → Setup (players pre-loaded)
```

---

## Features

### Setup Screen
- Add players and monsters/NPCs individually; quantity multiplier for groups (e.g. "5 × Goblin")
- Assign standing modifiers per combatant: weapon speed, spell casting time, Dex reaction adjustment, Haste, Slow, or custom
- **Monster Library** — searchable catalogue of 100+ monsters from the 2e Monstrous Manual, filterable by type (Humanoid, Undead, Beast, Giant, Dragon, etc.); selecting a monster pre-fills name, HP (rolled from actual hit dice), AC, attacks, damage, THAC0, and weapon speed modifier
- **Random Encounter Generator** — choose terrain type and click Generate; rolls a weighted monster from 14 terrain tables drawn from DMG Chapter 11, rolls number appearing, and adds them to the encounter with full stats
- Drag-to-reorder combatants in the list
- Export encounter to JSON / Import encounter from JSON for session persistence
- Mark individual combatants as **Surprised**
- Inline edit panel to change name, HP, and modifiers

### Initiative Screen
- Players enter their d10 rolls; preview updates live
- Monsters auto-roll on "Roll Monsters & NPCs"
- Action declaration per combatant (weapon kind, label, speed value)
- Previous-round initiative shown as context
- Keyboard shortcut: **Space / →** advances segments (active throughout combat)
- Combatants marked **Hors de Combat** skip roll validation and are excluded from combat

### Combat Tracker
- Segment-by-segment resolution; tracker skips empty segments automatically
- **Acting Now** panel shows who acts each segment with their declared action, target, AC, attacks, and damage dice
- HP management per monster: damage and healing inputs; HP colour-coded by health state
- **Inline name editing** — click any combatant's name to rename mid-combat
- **Target assignment** — tap a player name on each monster card to record who it's attacking; player cards derive and show "Attacked by" from monster assignments
- **Range / Melee toggle** per combatant; Range badge shows in initiative and tracker
- **Hors de Combat** toggle — marks a combatant as incapacitated (dashed border, skipped in segments) without defeating them; recoverable mid-combat or at initiative entry
- Previous-round initiative shown below the current badge
- Ties detected and reported automatically
- Round history of initiative totals

### Loot Screen
Appears automatically when all monsters are defeated.

- **Individual treasure** rolled from 2e Monstrous Manual treasure types (P–V) for each defeated monster
- **Lair treasure** optional roll per type (A–I) from DMG Chapter 5 tables; generates specific coins, gems (with 2e gem names and gp values), jewelry/art objects (with descriptions and values), and **specific magic items** from the full DMG magic item tables:
  - Potions, Scrolls, Rings, Rods, Staves, Wands
  - Armour & Shields (type + bonus rolled)
  - Swords (type + bonus + special properties)
  - Miscellaneous Weapons
  - Miscellaneous Magic (Bag of Holding through Deck of Many Things)
- Cursed items highlighted in red
- Reroll button per lair type

---

## AD&D 2e Initiative Rules

**Formula**: `d10 + weapon_speed + spell_casting + other + dex_reaction`, then haste halves (floor, min 1), then slow adds 10

| Rule | Implementation |
|---|---|
| Lower total acts first | Combatants sorted ascending |
| Ties | Simultaneous — both effects resolve |
| Surprise | Round 0; surprised combatants excluded from all segments |
| Haste | Halves linear total before slow is applied |
| Slow | Adds 10 to final total |
| Segments | 1–10+ based on highest active initiative |

---

## Project Structure

```
src/
├── main.ts              # Entry point; routes by app phase
├── types.ts             # TypeScript interfaces (Combatant, AppState, LootResult…)
├── state.ts             # Singleton state manager + localStorage persistence
├── combat.ts            # Pure initiative rules logic
├── styles.css           # All styles
├── data/
│   ├── monsters.ts      # 100+ monster templates + rollHD()
│   ├── encounters.ts    # 14 terrain encounter tables + generator
│   ├── loot.ts          # Treasure type tables (P–V, A–I) + generator
│   └── magicItems.ts    # DMG magic item tables (10 categories)
└── ui/
    ├── components.ts    # DOM helpers: el(), btn(), iconBtn(), faIcon()
    ├── library.ts       # Monster library modal
    ├── setup.ts         # Setup screen
    ├── initiative.ts    # Initiative entry screen
    ├── tracker.ts       # Combat tracker screen
    └── loot.ts          # Loot screen
```

### App Phases

```
'setup' → 'initiative' → 'combat' → 'loot' → 'setup'
```

State is persisted to `localStorage` on every mutation. Exports and imports use JSON.

---

## Tech Stack

Vanilla TypeScript (strict) · Vite 6 · No UI framework · Font Awesome 6 (CDN) · Vitest
