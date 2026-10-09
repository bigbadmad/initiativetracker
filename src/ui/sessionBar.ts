import { toPublicView } from '../sync/publicView.ts';
import { syncAvailable } from '../sync/supabase.ts';
import { endDmSession, publishView, resumeDmSession, startDmSession, type DmSession } from '../sync/session.ts';
import { getState } from '../state.ts';
import { el, btn, iconBtn } from './components.ts';

let dmSession: DmSession | null = syncAvailable ? resumeDmSession() : null;
let message = '';
let bar: HTMLElement | null = null;

/** Push the current public view to players. Called after every app render. */
export function publishCurrent(): void {
  if (!dmSession) return;
  publishView(dmSession, toPublicView(getState()));
}

function playerLink(code: string): string {
  return `${location.origin}/play.html?code=${code}`;
}

async function start(): Promise<void> {
  message = 'Starting...';
  renderBar();
  try {
    dmSession = await startDmSession();
    message = '';
    publishCurrent();
  } catch (err) {
    message = err instanceof Error ? err.message : 'Could not start session.';
  }
  renderBar();
}

async function end(): Promise<void> {
  if (!dmSession) return;
  message = 'Ending...';
  renderBar();
  try {
    await endDmSession(dmSession);
    dmSession = null;
    message = '';
  } catch (err) {
    message = err instanceof Error ? `Could not end session: ${err.message}` : 'Could not end session.';
  }
  renderBar();
}

async function copyLink(code: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(playerLink(code));
    message = 'Link copied';
  } catch {
    message = playerLink(code);
  }
  renderBar();
}

function renderBar(): void {
  if (!bar) return;
  bar.innerHTML = '';
  if (dmSession) {
    const code = dmSession.code;
    bar.append(
      el('span', { cls: 'session-label', text: 'Online' }),
      el('span', { cls: 'session-code', text: code }),
      iconBtn('fa-solid fa-link', 'Copy link', 'btn btn-secondary', () => void copyLink(code)),
      btn('End', 'btn btn-ghost', () => void end()),
    );
  } else {
    bar.appendChild(iconBtn('fa-solid fa-wifi', 'Start online session', 'btn btn-secondary', () => void start()));
  }
  if (message) bar.appendChild(el('span', { cls: 'session-message', text: message }));
}

/** Mounted outside #app so screen re-renders never destroy it. */
export function mountSessionBar(): void {
  if (!syncAvailable) return;
  bar = el('div', { cls: 'session-bar' });
  document.body.appendChild(bar);
  renderBar();
}
