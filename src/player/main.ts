import '../styles.css';
import type { PublicView } from '../sync/publicView.ts';
import { syncAvailable } from '../sync/supabase.ts';
import { claimCombatant, fetchRoster, joinSession, leaveSession, subscribeToView, type RosterEntry, type Seat } from '../sync/session.ts';
import { el, btn, labeledInput, mount, faIcon } from '../ui/components.ts';

const appEl = document.getElementById('app')!;
const SAVED_KEY = 'adnd-tracker-player';

interface SavedSeat {
  code: string;
  name: string;
}

/** Everything the live screen renders from. */
interface Live {
  saved: SavedSeat;
  seat: Seat;
  view: PublicView | null;
  roster: RosterEntry[];
  notice: string;
}

let unsubscribe: (() => void) | null = null;
/** The live session on screen. Async handlers compare against it so a late response never redraws a screen the player has left. */
let current: Live | null = null;

function loadSeat(): SavedSeat | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSeat>;
    return parsed.code && parsed.name ? { code: parsed.code, name: parsed.name } : null;
  } catch {
    return null;
  }
}

function saveSeat(seat: SavedSeat | null): void {
  try {
    if (seat) localStorage.setItem(SAVED_KEY, JSON.stringify(seat));
    else localStorage.removeItem(SAVED_KEY);
  } catch { /* storage unavailable: player rejoins manually next time */ }
}

function shell(subtitle: string): { root: HTMLElement; body: HTMLElement } {
  const root = el('div', { cls: 'screen player-screen' });
  const header = el('header', { cls: 'screen-header' });
  const h1 = el('h1');
  h1.append(faIcon('fa-solid fa-dice-d20'), document.createTextNode(' Initiative'));
  header.append(h1, el('p', { cls: 'subtitle', text: subtitle }));
  const body = el('div', { cls: 'player-body' });
  root.append(header, body);
  return { root, body };
}

// -- Join screen ---------------------------------------------------------------

function renderJoin(error = ''): void {
  const { root, body } = shell('Join a session');
  const prefill = new URLSearchParams(location.search).get('code') ?? loadSeat()?.code ?? '';
  const savedName = loadSeat()?.name ?? '';

  const codeGroup = labeledInput({ label: 'Session code', id: 'join-code', type: 'text', value: prefill.toUpperCase(), placeholder: 'ABCDE' });
  const nameGroup = labeledInput({ label: 'Your name', id: 'join-name', type: 'text', value: savedName, placeholder: 'Sam' });
  const codeInput = codeGroup.querySelector('input')!;
  const nameInput = nameGroup.querySelector('input')!;
  codeInput.maxLength = 5;
  codeInput.autocomplete = 'off';
  nameInput.maxLength = 40;

  const status = el('p', { cls: 'player-error', text: error });

  const submit = (): void => {
    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();
    if (code.length !== 5 || !name) {
      status.textContent = 'Enter the 5-character code and your name.';
      return;
    }
    void enter({ code, name });
  };
  const joinBtn = btn('Join', 'btn btn-primary btn-start', submit);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  body.append(codeGroup, nameGroup, joinBtn, status);
  mount(appEl, root);
}

async function enter(saved: SavedSeat): Promise<void> {
  const { root, body } = shell('Connecting...');
  body.appendChild(el('p', { cls: 'empty-hint', text: 'Joining session...' }));
  mount(appEl, root);

  try {
    const seat = await joinSession(saved.code, saved.name);
    saveSeat(saved);
    unsubscribe?.();
    const live: Live = { saved, seat, view: null, roster: [], notice: '' };
    current = live;
    renderLive(live);
    unsubscribe = subscribeToView(
      seat.sessionId,
      (view) => void onView(live, view),
      () => leave('The DM ended the session.'),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not join.';
    saveSeat(null);
    if (message.includes('unknown session code')) renderJoin('No session with that code.');
    else if (message.includes('session closed')) renderJoin('That session has ended.');
    else renderJoin(message);
  }
}

async function onView(live: Live, view: PublicView): Promise<void> {
  if (current !== live) return;
  live.view = view;
  await refreshRoster(live);
  if (current === live) renderLive(live);
}

async function refreshRoster(live: Live): Promise<void> {
  try {
    live.roster = await fetchRoster(live.seat.sessionId);
    const me = live.roster.find((r) => r.id === live.seat.playerId);
    live.seat = { ...live.seat, combatantId: me?.combatantId ?? null };
  } catch (err) {
    console.error('roster fetch failed', err);
  }
}

async function claim(live: Live, combatantId: string): Promise<void> {
  try {
    await claimCombatant(live.seat.sessionId, combatantId);
    live.notice = '';
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    live.notice = message.includes('already taken') ? 'Someone else already picked that character.' : 'Could not pick that character.';
  }
  await refreshRoster(live);
  if (current === live) renderLive(live);
}

/** Deliberate leave: free the seat (and its character claim) on the server before forgetting it locally. */
async function leaveAndRelease(live: Live): Promise<void> {
  try {
    await leaveSession(live.seat.sessionId);
  } catch (err) {
    console.error('leave_session failed', err);
    live.notice = 'Could not leave the session. Check your connection and try again.';
    if (current === live) renderLive(live);
    return;
  }
  leave();
}

function leave(message = ''): void {
  unsubscribe?.();
  unsubscribe = null;
  current = null;
  saveSeat(null);
  renderJoin(message);
}

// -- Live view -----------------------------------------------------------------

function renderLive(live: Live): void {
  const { view, seat, saved } = live;
  const subtitle = view?.inSurprisePhase ? 'Surprise Phase' : view && view.phase !== 'setup' ? `Round ${view.roundNumber}` : `Session ${saved.code}`;
  const { root, body } = shell(subtitle);

  const myId = view?.players.some((p) => p.id === seat.combatantId) ? seat.combatantId : null;
  const me = view?.players.find((p) => p.id === myId);

  if (me) {
    body.appendChild(el('p', { cls: 'player-you', text: `Playing as ${me.name}` }));
  } else if (view) {
    body.appendChild(buildClaimPicker(live, view));
  }

  if (!view) {
    body.appendChild(el('p', { cls: 'empty-hint', text: 'Waiting for the DM...' }));
  } else if (view.phase === 'setup') {
    body.appendChild(el('p', { cls: 'empty-hint', text: 'The DM is setting up the encounter.' }));
  } else if (view.phase === 'initiative') {
    body.appendChild(el('p', { cls: 'player-status', text: 'Initiative is being rolled.' }));
  } else if (view.phase === 'loot') {
    body.appendChild(el('p', { cls: 'player-status', text: 'The encounter is over.' }));
  } else {
    body.appendChild(el('div', { cls: 'player-segment', text: `Segment ${view.currentSegment}` }));
    const actingMe = myId !== null && view.acting.some((a) => a.id === myId);
    const box = el('div', { cls: ['player-acting', actingMe ? 'is-me' : ''] });
    box.appendChild(el('p', { cls: 'callout-label', text: actingMe ? 'Your turn to act' : 'Acting now' }));
    if (view.acting.length === 0) {
      box.appendChild(el('p', { cls: 'empty-hint', text: 'No one acts this segment.' }));
    } else {
      view.acting.forEach((a) => box.appendChild(el('span', { cls: `callout-name type-${a.type}`, text: a.name })));
    }
    body.appendChild(box);
  }

  if (view && view.players.length > 0) {
    const party = el('div', { cls: 'player-party' });
    party.appendChild(el('h3', { text: 'Party' }));
    view.players.forEach((p) => {
      const row = el('div', { cls: ['player-party-row', p.isActive ? '' : 'is-down'] });
      row.appendChild(el('span', { text: p.name }));
      if (p.isHorsDeCombat) row.appendChild(el('span', { cls: 'chip', text: 'Hors de combat' }));
      party.appendChild(row);
    });
    body.appendChild(party);
  }

  if (live.notice) body.appendChild(el('p', { cls: 'player-error', text: live.notice }));
  body.appendChild(btn('Leave session', 'btn btn-ghost', () => void leaveAndRelease(live)));
  mount(appEl, root);
}

function buildClaimPicker(live: Live, view: PublicView): HTMLElement {
  const takenByOthers = new Set(
    live.roster.filter((r) => r.id !== live.seat.playerId && r.combatantId).map((r) => r.combatantId),
  );
  const free = view.players.filter((p) => !takenByOthers.has(p.id));

  const box = el('div', { cls: 'player-claim' });
  box.appendChild(el('h3', { text: 'Which character are you?' }));
  if (free.length === 0) {
    box.appendChild(el('p', { cls: 'empty-hint', text: 'No characters available yet. Ask the DM to add yours.' }));
  } else {
    free.forEach((p) => box.appendChild(btn(p.name, 'btn btn-secondary', () => void claim(live, p.id))));
  }
  return box;
}

// -- Boot ----------------------------------------------------------------------

if (!syncAvailable) {
  const { root, body } = shell('Unavailable');
  body.appendChild(el('p', { cls: 'player-error', text: 'Online play is not configured for this deployment.' }));
  mount(appEl, root);
} else {
  const saved = loadSeat();
  const urlCode = new URLSearchParams(location.search).get('code');
  if (saved && (!urlCode || urlCode.toUpperCase() === saved.code)) void enter(saved);
  else renderJoin();
}
