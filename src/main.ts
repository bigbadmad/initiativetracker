import './styles.css';
import { registerRenderer, getState } from './state.ts';
import { renderSetup } from './ui/setup.ts';
import { renderInitiative } from './ui/initiative.ts';
import { renderTracker } from './ui/tracker.ts';
import { mount } from './ui/components.ts';

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
  }

  mount(appEl, screen);
}

registerRenderer(renderApp);
renderApp();
