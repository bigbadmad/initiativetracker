import { toPlayerTotals, toPublicView } from '../sync/publicView.ts';
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
import { queueTotals, resetTotals, startDeclarationPolling, type DeclarationTarget } from '../sync/declarations.ts';
import { applyDeclarations, getState, lockInitiative } from '../state.ts';
import { el, btn, iconBtn } from './components.ts';

const AUTOLOCK_KEY = 'adnd-tracker-autolock';

let dmSession: DmSession | null = syncAvailable ? resumeDmSession() : null;
let message = '';
let syncStatus: PublishStatus = { state: 'ok' };
let busy = false;
let bar: HTMLElement | null = null;
let liveRegion: HTMLElement | null = null;
let stopPolling: (() => void) | null = null;
let autoLock = loadAutoLock();

function loadAutoLock(): boolean {
  try {
    return localStorage.getItem(AUTOLOCK_KEY) !== 'off';
  } catch {
    return true;
  }
}

function setAutoLock(on: boolean): void {
  autoLock = on;
  try {
    localStorage.setItem(AUTOLOCK_KEY, on ? 'on' : 'off');
  } catch { /* the choice just resets next load */ }
}

/** The round that is currently collecting declarations, or null when none is. */
function declarationTarget(): DeclarationTarget | null {
  const { phase, encounterId, roundNumber } = getState();
  return phase === 'initiative' && encounterId ? { encounterId, round: roundNumber } : null;
}

function beginPolling(): void {
  stopPolling?.();
  stopPolling = startDeclarationPolling({
    getSession: () => dmSession,
    getTarget: declarationTarget,
    onDeclarations: (target, declarations) => {
      const applied = applyDeclarations(target.encounterId, target.round, declarations);
      // Only a remote declaration triggers this, so the DM typing in the last roll by hand is never overridden.
      if (applied.length > 0 && autoLock) lockInitiative();
    },
  });
}

function endPolling(): void {
  stopPolling?.();
  stopPolling = null;
  resetTotals();
}

/** Push the current public view to players, and their computed totals to them privately. Called after every state change. */
export function publishCurrent(): void {
  if (!dmSession) return;
  const state = getState();
  publishView(dmSession, toPublicView(state));
  if ((state.phase === 'initiative' || state.phase === 'combat') && state.encounterId) {
    queueTotals(dmSession, { encounterId: state.encounterId, round: state.roundNumber }, toPlayerTotals(state));
  }
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
    beginPolling();
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
    endPolling();
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
    const autoLockBox = el('input', { attrs: { type: 'checkbox' } });
    autoLockBox.checked = autoLock;
    autoLockBox.addEventListener('change', () => setAutoLock(autoLockBox.checked));
    const autoLockLabel = el('label', {
      cls: 'session-autolock',
      attrs: { title: 'Begin combat automatically once every player has declared' },
    });
    autoLockLabel.append(autoLockBox, document.createTextNode(' Auto-lock'));
    nodes.push(
      el('span', { cls: 'session-label', text: 'Online' }),
      el('span', { cls: 'session-code', text: code }),
      iconBtn('fa-solid fa-link', 'Copy link', 'btn btn-secondary', () => void copyLink(code)),
      autoLockLabel,
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
  if (dmSession) beginPolling();
  setPublishStatusListener((status) => {
    syncStatus = status;
    renderBar();
  });
  renderBar();
}
