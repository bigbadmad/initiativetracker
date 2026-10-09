import '../styles.css';
import type { PublicView } from '../sync/publicView.ts';
import { syncAvailable } from '../sync/supabase.ts';
import { joinSession, subscribeToView } from '../sync/session.ts';
import { el, btn, labeledInput, mount, faIcon } from '../ui/components.ts';

const appEl = document.getElementById('app')!;
const SAVED_KEY = 'adnd-tracker-player';

interface SavedSeat {
  code: string;
  name: string;
}

let unsubscribe: (() => void) | null = null;

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
  const nameGroup = labeledInput({ label: 'Character name', id: 'join-name', type: 'text', value: savedName, placeholder: 'Thorin' });
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
      status.textContent = 'Enter the 5-letter code and your character name.';
      return;
    }
    void enter({ code, name });
  };
  const joinBtn = btn('Join', 'btn btn-primary btn-start', submit);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  body.append(codeGroup, nameGroup, joinBtn, status);
  mount(appEl, root);
}

async function enter(seat: SavedSeat): Promise<void> {
  const { root, body } = shell('Connecting...');
  body.appendChild(el('p', { cls: 'empty-hint', text: 'Joining session...' }));
  mount(appEl, root);

  try {
    const sessionId = await joinSession(seat.code, seat.name);
    saveSeat(seat);
    unsubscribe?.();
    renderWaiting(seat, null);
    unsubscribe = subscribeToView(sessionId, (view) => renderWaiting(seat, view));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not join.';
    saveSeat(null);
    renderJoin(message.includes('unknown session code') ? 'No session with that code.' : message);
  }
}

function leave(): void {
  unsubscribe?.();
  unsubscribe = null;
  saveSeat(null);
  renderJoin();
}

// -- Live view -----------------------------------------------------------------

function renderWaiting(seat: SavedSeat, view: PublicView | null): void {
  const subtitle = view?.inSurprisePhase ? 'Surprise Phase' : view && view.phase !== 'setup' ? `Round ${view.roundNumber}` : `Session ${seat.code}`;
  const { root, body } = shell(subtitle);

  body.appendChild(el('p', { cls: 'player-you', text: `Playing as ${seat.name}` }));

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
    const actingMe = view.acting.some((a) => a.type === 'player' && a.name === seat.name);
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

  body.appendChild(btn('Leave session', 'btn btn-ghost', leave));
  mount(appEl, root);
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
