# AD&D 2e Initiative Tracker

A segment-based initiative tracker for **Advanced Dungeons & Dragons 2nd Edition** combat. Built for DM use at the table.

## What It Does

AD&D 2e resolves initiative on a d10 + modifiers scale. Lower totals act first and the round is divided into numbered segments. This tool automates that process:

1. **Setup** — add players and monsters with standing modifiers (weapon speed, casting time, dex bonus, haste, slow)
2. **Initiative** — players enter their d10 rolls; monsters roll automatically; totals are calculated per the AD&D 2e formula
3. **Combat** — advance segment by segment; the tracker shows who acts each segment and manages monster HP

Surprise rounds, ties, and end-of-encounter cleanup (auto-returning to setup when all monsters are defeated) are handled automatically.

## Install & Run

```bash
npm install
npm run dev        # development server with hot reload
npm run build      # production build → dist/
npm run preview    # preview the production build
npm test           # run test suite
```

## AD&D 2e Initiative Rules Implemented

**Formula**: `d10 + weapon_speed + spell_casting + other + dex_reaction`, then haste halves (min 1), then slow adds 10

- **Lower total acts first**
- **Ties** = simultaneous action (both effects resolve in the same segment)
- **Surprise** — surprised combatants sit out all segments; the surprise phase is treated as Round 0 so that `startNewRound` advances to Round 1
- **Segments** — the tracker skips empty segments automatically; the segment bar ceiling adjusts to the highest active initiative total

## Modifier Reference

| Modifier | Effect |
|---|---|
| Weapon Speed | Added to initiative (slower weapons = higher number) |
| Spell Casting | Added to initiative (longer casting = higher number) |
| Dex Reaction | Added directly; negative values act sooner (better DEX) |
| Haste | Halves the linear total (floor, min 1), applied before slow |
| Slow | Adds 10 to the final total |
| Other | Custom numeric modifier |

## Project Structure

```
src/
├── main.ts          # Entry point; routes by app phase
├── types.ts         # TypeScript interfaces
├── state.ts         # Singleton state manager
├── combat.ts        # Pure AD&D 2e rules logic
├── styles.css       # All styles
└── ui/
    ├── components.ts  # DOM factory helpers
    ├── setup.ts       # Setup screen
    ├── initiative.ts  # Initiative entry screen
    └── tracker.ts     # Combat tracker screen
```

## Tech Stack

Vanilla TypeScript · Vite · no UI framework · Vitest for tests
