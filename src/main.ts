import './styles.css';
import { registerRenderer, getState, setState, startNewRound } from './state.ts';
import { renderSetup } from './ui/setup.ts';
import { renderInitiative } from './ui/initiative.ts';
import { renderTracker } from './ui/tracker.ts';
import { renderLoot } from './ui/loot.ts';
import { mount } from './ui/components.ts';
import { maxInitiativeSegment, nextActiveSegment } from './combat.ts';

const appEl = document.getElementById('app')!;

function renderApp(): void {
  const { phase } = getState();
  let screen: HTMLElement;

  switch (phase) {
    case 'setup':
      screen = renderSetup();
      break;
    case 'initiative':
      screen = renderInitiative();
      break;
    case 'combat':
      screen = renderTracker();
      break;
    case 'loot':
      screen = renderLoot();
      break;
  }

  mount(appEl, screen);
}

registerRenderer(renderApp);
renderApp();

// -- Keyboard navigation (combat phase only) -----------------------------------
// Space or → advances to the next segment; when the round is over, starts the next round.
// Ignored when focus is inside any text input so typing is never intercepted.

document.addEventListener('keydown', (e: KeyboardEvent) => {
  const { phase, combatants, currentSegment, inSurprisePhase } = getState();
  if (phase !== 'combat') return;

  const target = e.target as HTMLElement;
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  ) return;

  if (e.key === ' ' || e.key === 'ArrowRight') {
    e.preventDefault();
    const maxSeg = maxInitiativeSegment(combatants);
    const nextSeg = nextActiveSegment(combatants, currentSegment, maxSeg, inSurprisePhase);
    if (nextSeg !== null) {
      setState({ currentSegment: nextSeg });
    } else {
      startNewRound();
    }
  }
});
