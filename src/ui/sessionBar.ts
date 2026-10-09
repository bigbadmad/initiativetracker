import { toPublicView } from '../sync/publicView.ts';
import { syncAvailable } from '../sync/supabase.ts';
import {
  endDmSession,
  publishView,
  resumeDmSession,
  setPublishStatusListener,
  startDmSession,
  type DmSession,
  type PublishStatus,
} from '../sync/session.ts';
import { getState } from '../state.ts';
import { el, btn, iconBtn } from './components.ts';

let dmSession: DmSession | null = syncAvailable ? resumeDmSession() : null;
let message = '';
let syncStatus: PublishStatus = { state: 'ok' };
let busy = false;
let bar: HTMLElement | null = null;
let liveRegion: HTMLElement | null = null;

/** Push the current public view to players. Called after every state change. */
export function publishCurrent(): void {
  if (!dmSession) return;
  publishView(dmSession, toPublicView(getState()));
}

function playerLink(code: string): string {
  return `${location.origin}/play.html?code=${code}`;
}

async function start(): Promise<void> {
  if (busy || dmSession) return;
  busy = true;
  message = 'Starting...';
  renderBar();
  try {
    dmSession = await startDmSession();
    message = '';
    syncStatus = { state: 'ok' };
    publishCurrent();
  } catch (err) {
    message = err instanceof Error ? err.message : 'Could not start session.';
  } finally {
    busy = false;
  }
  renderBar();
}

async function end(): Promise<void> {
  if (busy || !dmSession) return;
  busy = true;
  message = 'Ending...';
  renderBar();
  try {
    await endDmSession(dmSession);
    dmSession = null;
    message = '';
    syncStatus = { state: 'ok' };
  } catch (err) {
    message = err instanceof Error ? `Could not end session: ${err.message}` : 'Could not end session.';
  } finally {
    busy = false;
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

function syncWarning(): string {
  if (!dmSession || syncStatus.state === 'ok') return '';
  return syncStatus.state === 'retrying'
    ? 'Players are out of date - retrying...'
    : `Players are not updating: ${syncStatus.message}`;
}

function renderBar(): void {
  if (!bar || !liveRegion) return;
  const nodes: HTMLElement[] = [];
  if (dmSession) {
    const code = dmSession.code;
    const endBtn = btn('End', 'btn btn-ghost', () => void end());
    endBtn.disabled = busy;
    nodes.push(
      el('span', { cls: 'session-label', text: 'Online' }),
      el('span', { cls: 'session-code', text: code }),
      iconBtn('fa-solid fa-link', 'Copy link', 'btn btn-secondary', () => void copyLink(code)),
      endBtn,
    );
  } else {
    const startBtn = iconBtn('fa-solid fa-wifi', 'Start online session', 'btn btn-secondary', () => void start());
    startBtn.disabled = busy;
    nodes.push(startBtn);
  }
  if (message) nodes.push(el('span', { cls: 'session-message', text: message }));

  // Everything but the live region is rebuilt; the live region persists so screen readers announce text changes.
  Array.from(bar.children).forEach((child) => { if (child !== liveRegion) child.remove(); });
  bar.prepend(...nodes);
  const warning = syncWarning();
  if (liveRegion.textContent !== warning) liveRegion.textContent = warning;
}

/** Mounted outside #app so screen re-renders never destroy it. */
export function mountSessionBar(): void {
  if (!syncAvailable) return;
  bar = el('div', { cls: 'session-bar' });
  liveRegion = el('span', { cls: 'session-warning', attrs: { role: 'status', 'aria-live': 'polite' } });
  bar.appendChild(liveRegion);
  document.body.appendChild(bar);
  setPublishStatusListener((status) => {
    syncStatus = status;
    renderBar();
  });
  renderBar();
}
