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

function renderBar(): void {
  if (!bar) return;
  bar.innerHTML = '';
  if (dmSession) {
    const code = dmSession.code;
    const endBtn = btn('End', 'btn btn-ghost', () => void end());
    endBtn.disabled = busy;
    bar.append(
      el('span', { cls: 'session-label', text: 'Online' }),
      el('span', { cls: 'session-code', text: code }),
      iconBtn('fa-solid fa-link', 'Copy link', 'btn btn-secondary', () => void copyLink(code)),
      endBtn,
    );
  } else {
    const startBtn = iconBtn('fa-solid fa-wifi', 'Start online session', 'btn btn-secondary', () => void start());
    startBtn.disabled = busy;
    bar.appendChild(startBtn);
  }
  if (message) bar.appendChild(el('span', { cls: 'session-message', text: message }));
  if (dmSession && syncStatus.state !== 'ok') {
    const text = syncStatus.state === 'retrying' ? 'Players are out of date - retrying...' : `Players are not updating: ${syncStatus.message}`;
    bar.appendChild(el('span', { cls: 'session-warning', text }));
  }
}

/** Mounted outside #app so screen re-renders never destroy it. */
export function mountSessionBar(): void {
  if (!syncAvailable) return;
  bar = el('div', { cls: 'session-bar' });
  document.body.appendChild(bar);
  setPublishStatusListener((status) => {
    syncStatus = status;
    renderBar();
  });
  renderBar();
}
