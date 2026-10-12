import '../styles.css';
import type { PublicView } from '../sync/publicView.ts';
import { syncAvailable } from '../sync/supabase.ts';
import {
  claimCombatant,
  fetchMyDeclaration,
  fetchRoster,
  joinSession,
  leaveSession,
  markSegmentDone,
  submitDeclaration,
  subscribeToMyDeclarations,
  subscribeToView,
  type DeclarationInput,
  type DoneReceipt,
  type MyDeclaration,
  type RosterEntry,
  type Seat,
} from '../sync/session.ts';
import { el, btn, labeledInput, mount, faIcon } from '../ui/components.ts';
import { declareErrorMessage, declareStatus, declareStatusKey, type DeclareStatus } from './declare.ts';
import { actStatus, actStatusKey, doneErrorMessage, type ActStatus } from './act.ts';

const appEl = document.getElementById('app')!;
const SAVED_KEY = 'adnd-tracker-player';
const DRAFT_KEY = 'adnd-tracker-player-action';

interface SavedSeat {
  code: string;
  name: string;
}

/** The persistent regions of the live screen. Each is updated in place so a form is never rebuilt under a typing player. */
interface LiveUi {
  root: HTMLElement;
  subtitle: HTMLElement;
  identity: HTMLElement;
  declare: HTMLElement;
  phase: HTMLElement;
  party: HTMLElement;
  notice: HTMLElement;
  /** Identifies what the declare region currently shows; it is only rebuilt when this changes. */
  declareKey: string | null;
  /** The Done button area. Kept apart from `phase` so a DM update never rebuilds a button mid-tap. */
  act: HTMLElement;
  actKey: string | null;
}

/** Everything the live screen renders from. */
interface Live {
  saved: SavedSeat;
  seat: Seat;
  view: PublicView | null;
  roster: RosterEntry[];
  notice: string;
  declaration: MyDeclaration | null;
  /** The action last typed or submitted; pre-fills the form and survives reloads. */
  draft: DeclarationInput;
  /** This device's own Done tap, so the button flips at once rather than after the DM's next publish. */
  tapped: DoneReceipt | null;
  ui: LiveUi;
}

let teardown: Array<() => void> = [];
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

function loadDraft(): DeclarationInput {
  const fallback: DeclarationInput = { kind: 'weapon_speed', label: '', value: 5 };
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DeclarationInput>;
    return {
      kind: parsed.kind === 'spell_casting' ? 'spell_casting' : 'weapon_speed',
      label: typeof parsed.label === 'string' ? parsed.label.slice(0, 40) : '',
      value: Number.isInteger(parsed.value) ? Math.min(30, Math.max(0, parsed.value as number)) : fallback.value,
    };
  } catch {
    return fallback;
  }
}

function saveDraft(draft: DeclarationInput): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* the form simply starts blank next time */ }
}

/** Supabase errors are plain objects with a message, not always Error instances. */
function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : '';
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

function stopListening(): void {
  teardown.forEach((stop) => stop());
  teardown = [];
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
    stopListening();
    const live = createLive(saved, seat);
    current = live;
    mount(appEl, live.ui.root);
    renderLive(live);
    teardown = [
      subscribeToView(
        seat.sessionId,
        (view) => void onView(live, view),
        () => leave('The DM ended the session.'),
      ),
      subscribeToMyDeclarations(seat.sessionId, () => void onDeclarationChange(live)),
    ];
  } catch (err) {
    const message = errorText(err) || 'Could not join.';
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
  await refreshDeclaration(live);
  renderLive(live);
}

async function onDeclarationChange(live: Live): Promise<void> {
  if (current !== live) return;
  await refreshDeclaration(live);
  renderLive(live);
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

/** Load this character's declaration for the round on screen. A stale response for an earlier round is discarded. */
async function refreshDeclaration(live: Live): Promise<void> {
  const view = live.view;
  const characterId = live.seat.combatantId;
  if (!view || !characterId || view.encounterId === null || (view.phase !== 'initiative' && view.phase !== 'combat')) {
    live.declaration = null;
    return;
  }
  const { encounterId, roundNumber } = view;
  try {
    const found = await fetchMyDeclaration(live.seat.sessionId, encounterId, roundNumber, characterId);
    const now = live.view;
    if (current === live && now && now.encounterId === encounterId && now.roundNumber === roundNumber) {
      live.declaration = found;
    }
  } catch (err) {
    console.error('declaration fetch failed', err);
  }
}

async function claim(live: Live, combatantId: string): Promise<void> {
  try {
    await claimCombatant(live.seat.sessionId, combatantId);
    live.notice = '';
  } catch (err) {
    live.notice = errorText(err).includes('already taken') ? 'Someone else already picked that character.' : 'Could not pick that character.';
  }
  await refreshRoster(live);
  await refreshDeclaration(live);
  renderLive(live);
}

/** Deliberate leave: free the seat (and its character claim) on the server before forgetting it locally. */
async function leaveAndRelease(live: Live): Promise<void> {
  try {
    await leaveSession(live.seat.sessionId);
  } catch (err) {
    console.error('leave_session failed', err);
    live.notice = 'Could not leave the session. Check your connection and try again.';
    renderLive(live);
    return;
  }
  leave();
}

function leave(message = ''): void {
  stopListening();
  current = null;
  saveSeat(null);
  renderJoin(message);
}

// -- Live screen ---------------------------------------------------------------

function createLive(saved: SavedSeat, seat: Seat): Live {
  const { root, body } = shell('');
  const ui: LiveUi = {
    root,
    subtitle: root.querySelector('.subtitle') as HTMLElement,
    identity: el('div'),
    declare: el('div'),
    phase: el('div'),
    party: el('div'),
    notice: el('p', { cls: 'player-error', attrs: { role: 'status' } }),
    declareKey: null,
    act: el('div'),
    actKey: null,
  };
  const live: Live = { saved, seat, view: null, roster: [], notice: '', declaration: null, draft: loadDraft(), tapped: null, ui };
  body.append(
    ui.identity,
    ui.declare,
    ui.phase,
    ui.act,
    ui.party,
    ui.notice,
    btn('Leave session', 'btn btn-ghost', () => void leaveAndRelease(live)),
  );
  return live;
}

function renderLive(live: Live): void {
  if (current !== live) return;
  const { view, seat, saved, ui } = live;

  ui.subtitle.textContent = view?.inSurprisePhase
    ? 'Surprise Phase'
    : view && view.phase !== 'setup'
      ? `Round ${view.roundNumber}`
      : `Session ${saved.code}`;

  const myId = view?.players.some((p) => p.id === seat.combatantId) ? seat.combatantId : null;
  const me = view?.players.find((p) => p.id === myId);

  if (me) ui.identity.replaceChildren(el('p', { cls: 'player-you', text: `Playing as ${me.name}` }));
  else if (view) ui.identity.replaceChildren(buildClaimPicker(live, view));
  else ui.identity.replaceChildren();

  renderDeclare(live, declareStatus(view, myId, live.declaration));
  ui.phase.replaceChildren(buildPhase(view, myId));
  renderAct(live, actStatus(view, myId, live.tapped));
  ui.party.replaceChildren(...buildParty(view));
  ui.notice.textContent = live.notice;
}

function buildPhase(view: PublicView | null, myId: string | null): HTMLElement {
  const box = el('div');
  if (!view) {
    box.appendChild(el('p', { cls: 'empty-hint', text: 'Waiting for the DM...' }));
  } else if (view.phase === 'setup') {
    box.appendChild(el('p', { cls: 'empty-hint', text: 'The DM is setting up the encounter.' }));
  } else if (view.phase === 'initiative') {
    box.appendChild(el('p', { cls: 'player-status', text: 'Initiative is being rolled.' }));
  } else if (view.phase === 'loot') {
    box.appendChild(el('p', { cls: 'player-status', text: 'The encounter is over.' }));
  } else {
    box.appendChild(el('div', { cls: 'player-segment', text: `Segment ${view.currentSegment}` }));
    const actingMe = myId !== null && view.acting.some((a) => a.id === myId);
    const acting = el('div', { cls: ['player-acting', actingMe ? 'is-me' : ''] });
    acting.appendChild(el('p', { cls: 'callout-label', text: actingMe ? 'Your turn to act' : 'Acting now' }));
    if (view.acting.length === 0) {
      acting.appendChild(el('p', { cls: 'empty-hint', text: 'No one acts this segment.' }));
    } else {
      view.acting.forEach((a) => {
        acting.appendChild(el('span', { cls: `callout-name type-${a.type}`, text: a.name }));
        if (a.done) acting.appendChild(el('span', { cls: 'chip chip-done', text: 'Done' }));
      });
    }
    box.appendChild(acting);
  }
  return box;
}

function buildParty(view: PublicView | null): HTMLElement[] {
  if (!view || view.players.length === 0) return [];
  const party = el('div', { cls: 'player-party' });
  party.appendChild(el('h3', { text: 'Party' }));
  view.players.forEach((p) => {
    const row = el('div', { cls: ['player-party-row', p.isActive ? '' : 'is-down'] });
    row.appendChild(el('span', { text: p.name }));
    if (p.isHorsDeCombat) row.appendChild(el('span', { cls: 'chip', text: 'Hors de combat' }));
    party.appendChild(row);
  });
  return [party];
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

// -- Segment Done --------------------------------------------------------------

function renderAct(live: Live, status: ActStatus): void {
  const key = actStatusKey(live.view, status);
  if (key === live.ui.actKey) return;
  live.ui.actKey = key;

  switch (status.kind) {
    case 'act':
      live.ui.act.replaceChildren(buildDoneButton(live));
      break;
    case 'done':
      live.ui.act.replaceChildren(
        el('p', { cls: 'player-status player-done', text: 'Done - waiting for the DM to move on.' }),
      );
      break;
    default:
      live.ui.act.replaceChildren();
  }
}

function buildDoneButton(live: Live): HTMLElement {
  const wrap = el('div', { cls: 'player-act' });
  const error = el('p', { cls: 'player-error', attrs: { role: 'alert' } });
  let sending = false;
  const doneBtn = btn('Done', 'btn btn-primary btn-start btn-done', () => void send());

  async function send(): Promise<void> {
    if (sending) return;
    sending = true;
    doneBtn.disabled = true;
    error.textContent = '';
    try {
      live.tapped = await markSegmentDone(live.seat.sessionId);
    } catch (err) {
      error.textContent = doneErrorMessage(errorText(err));
      doneBtn.disabled = false;
    }
    sending = false;
    renderLive(live);
  }

  wrap.append(doneBtn, error);
  return wrap;
}

// -- Declaration ---------------------------------------------------------------

function renderDeclare(live: Live, status: DeclareStatus): void {
  const key = declareStatusKey(status);
  if (key === live.ui.declareKey) return;
  live.ui.declareKey = key;

  switch (status.kind) {
    case 'form':
      live.ui.declare.replaceChildren(buildDeclareForm(live));
      break;
    case 'blocked':
      live.ui.declare.replaceChildren(el('p', { cls: 'player-status', text: status.reason }));
      break;
    case 'dm-entered':
      live.ui.declare.replaceChildren(
        el('p', { cls: 'player-status', text: 'The DM has recorded your roll for this round.' }),
      );
      break;
    case 'declared':
      live.ui.declare.replaceChildren(buildDeclared(status.declaration));
      break;
    default:
      live.ui.declare.replaceChildren();
  }
}

function buildDeclared(d: MyDeclaration): HTMLElement {
  const box = el('div', { cls: 'player-declared' });
  box.appendChild(el('p', { cls: 'callout-label', text: `Your action - round ${d.round}` }));
  const kindName = d.kind === 'spell_casting' ? 'casting time' : 'speed';
  box.appendChild(el('p', { cls: 'player-declared-action', text: `${d.label || 'Action'} (${kindName} ${d.value})` }));
  box.appendChild(el('p', { text: `You rolled a ${d.d10} on the d10.` }));
  box.appendChild(
    d.total === null
      ? el('p', { cls: 'empty-hint', text: 'Waiting for the DM to add it up...' })
      : el('p', { cls: 'player-total', text: `Your initiative: ${d.total}` }),
  );
  return box;
}

function buildDeclareForm(live: Live): HTMLElement {
  const form = el('div', { cls: 'player-declare' });
  form.appendChild(el('h3', { text: 'Declare your action' }));

  const kindGroup = el('div', { cls: 'form-group' });
  kindGroup.appendChild(el('label', { text: 'Type', attrs: { for: 'decl-kind' } }));
  const kindSelect = el('select', { attrs: { id: 'decl-kind', name: 'decl-kind' } });
  kindSelect.appendChild(el('option', { text: 'Weapon (speed factor)', attrs: { value: 'weapon_speed' } }));
  kindSelect.appendChild(el('option', { text: 'Spell (casting time)', attrs: { value: 'spell_casting' } }));
  kindSelect.value = live.draft.kind;
  kindGroup.appendChild(kindSelect);

  const labelGroup = labeledInput({ label: 'Action', id: 'decl-label', type: 'text', value: live.draft.label, placeholder: 'e.g. Long sword' });
  const labelInput = labelGroup.querySelector('input')!;
  labelInput.maxLength = 40;
  labelInput.autocomplete = 'off';

  const valueGroup = labeledInput({ label: 'Speed / casting time', id: 'decl-value', type: 'number', value: String(live.draft.value), min: '0', max: '30' });
  const valueInput = valueGroup.querySelector('input')!;
  valueInput.inputMode = 'numeric';

  const error = el('p', { cls: 'player-error', attrs: { role: 'alert' } });
  const rollBtn = btn('Roll d10 and lock in', 'btn btn-primary btn-start', () => void submit());

  const readInput = (): DeclarationInput | null => {
    const value = Number.parseInt(valueInput.value, 10);
    if (!Number.isInteger(value) || value < 0 || value > 30) return null;
    return { kind: kindSelect.value === 'spell_casting' ? 'spell_casting' : 'weapon_speed', label: labelInput.value.trim(), value };
  };

  // Keep what has been typed so a screen refresh or reload never costs the player their entry.
  const rememberDraft = (): void => {
    const input = readInput();
    if (input) {
      live.draft = input;
      saveDraft(input);
    }
  };
  [kindSelect, labelInput, valueInput].forEach((control) => control.addEventListener('change', rememberDraft));

  async function submit(): Promise<void> {
    const input = readInput();
    if (!input) {
      error.textContent = 'Enter a speed between 0 and 30.';
      return;
    }
    live.draft = input;
    saveDraft(input);
    error.textContent = '';
    rollBtn.disabled = true;
    rollBtn.textContent = 'Rolling...';
    try {
      const res = await submitDeclaration(live.seat.sessionId, input);
      live.declaration = { ...input, encounterId: res.encounterId, round: res.round, d10: res.d10, total: null };
    } catch (err) {
      const message = errorText(err);
      error.textContent = declareErrorMessage(message);
      rollBtn.disabled = false;
      rollBtn.textContent = 'Roll d10 and lock in';
      if (message.includes('already declared')) await refreshDeclaration(live);
    }
    renderLive(live);
  }

  form.append(kindGroup, labelGroup, valueGroup, rollBtn, error);
  return form;
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
