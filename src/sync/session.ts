import type { PublicView } from './publicView.ts';
import { ensureAnonymousUser, getClient } from './supabase.ts';

// -- DM side -------------------------------------------------------------------

const DM_SESSION_KEY = 'adnd-tracker-dm-session';
const PUBLISH_DEBOUNCE_MS = 250;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 15000;

export interface DmSession {
  code: string;
  secret: string;
}

export type PublishStatus =
  | { state: 'ok' }
  | { state: 'retrying'; message: string }
  | { state: 'failed'; message: string };

export function resumeDmSession(): DmSession | null {
  try {
    const raw = localStorage.getItem(DM_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DmSession>;
    return parsed.code && parsed.secret ? { code: parsed.code, secret: parsed.secret } : null;
  } catch {
    return null;
  }
}

export async function startDmSession(): Promise<DmSession> {
  const secret = crypto.randomUUID() + crypto.randomUUID();
  const { data, error } = await getClient().rpc('create_session', { p_secret: secret });
  if (error) throw error;
  const session: DmSession = { code: data as string, secret };
  try {
    localStorage.setItem(DM_SESSION_KEY, JSON.stringify(session));
  } catch { /* storage unavailable: session works until the tab closes */ }
  return session;
}

/** Closes the session on the server first; local state is only cleared once that succeeds. */
export async function endDmSession(session: DmSession): Promise<void> {
  cancelPublishing();
  const { error } = await getClient().rpc('close_session', { p_code: session.code, p_secret: session.secret });
  if (error) throw error;
  try {
    localStorage.removeItem(DM_SESSION_KEY);
  } catch { /* ignore */ }
}

interface PublishJob {
  session: DmSession;
  view: PublicView;
}

let pending: PublishJob | null = null;
let publishTimer: ReturnType<typeof setTimeout> | null = null;
let lastRevision = 0;
let retryDelay = RETRY_BASE_MS;
let statusListener: ((status: PublishStatus) => void) | null = null;

export function setPublishStatusListener(fn: ((status: PublishStatus) => void) | null): void {
  statusListener = fn;
}

function cancelPublishing(): void {
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = null;
  pending = null;
  retryDelay = RETRY_BASE_MS;
}

function schedule(ms: number): void {
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = setTimeout(() => void flush(), ms);
}

/** Strictly increasing and wall-clock based, so it also keeps increasing across page reloads. */
export function nextRevision(last: number, now: number): number {
  return Math.max(now, last + 1);
}

/** Errors a retry cannot fix; everything else (network, 5xx) is retried with backoff. */
export function isPermanentPublishError(message: string): boolean {
  return /session closed|invalid session/i.test(message);
}

/**
 * Debounced so bursts of state changes produce one write. Only the latest view is ever sent.
 * Each publish carries a revision and the server ignores anything older than what it holds, so overlapping
 * requests can never roll players back. A failed publish is retried until it lands or a newer view replaces it.
 */
export function publishView(session: DmSession, view: PublicView): void {
  pending = { session, view };
  schedule(PUBLISH_DEBOUNCE_MS);
}

async function flush(): Promise<void> {
  const job = pending;
  if (!job) return;

  const revision = nextRevision(lastRevision, Date.now());
  lastRevision = revision;
  const { data, error } = await getClient().rpc('publish_view', {
    p_code: job.session.code,
    p_secret: job.session.secret,
    p_view: job.view,
    p_revision: revision,
  });

  if (!error) lastRevision = Math.max(lastRevision, Number(data));
  if (pending !== job) return; // a newer view replaced this one while the request was in flight

  if (error) {
    if (isPermanentPublishError(error.message)) {
      pending = null;
      statusListener?.({ state: 'failed', message: error.message });
      return;
    }
    console.error('publish_view failed, retrying', error);
    statusListener?.({ state: 'retrying', message: error.message });
    schedule(retryDelay);
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    return;
  }

  // The server holds a newer revision than we sent (e.g. this machine's clock went backwards): not applied, resend.
  if (Number(data) > revision) {
    schedule(0);
    return;
  }

  pending = null;
  retryDelay = RETRY_BASE_MS;
  statusListener?.({ state: 'ok' });
}

// -- Player side ---------------------------------------------------------------

export interface Seat {
  sessionId: string;
  playerId: string;
  combatantId: string | null;
}

export interface RosterEntry {
  id: string;
  name: string;
  combatantId: string | null;
}

export async function joinSession(code: string, name: string): Promise<Seat> {
  await ensureAnonymousUser();
  const { data, error } = await getClient().rpc('join_session', {
    p_code: code.trim(),
    p_name: name,
  });
  if (error) throw error;
  const seat = data as { session_id: string; player_id: string; combatant_id: string | null };
  return { sessionId: seat.session_id, playerId: seat.player_id, combatantId: seat.combatant_id };
}

/** Deletes this player's seat so their character claim is freed for others. */
export async function leaveSession(sessionId: string): Promise<void> {
  const { error } = await getClient().rpc('leave_session', { p_session_id: sessionId });
  if (error) throw error;
}

export async function claimCombatant(sessionId: string, combatantId: string): Promise<void> {
  const { error } = await getClient().rpc('claim_combatant', {
    p_session_id: sessionId,
    p_combatant_id: combatantId,
  });
  if (error) throw error;
}

export async function fetchRoster(sessionId: string): Promise<RosterEntry[]> {
  const { data, error } = await getClient()
    .from('players')
    .select('id, name, combatant_id')
    .eq('session_id', sessionId);
  if (error) throw error;
  return (data as { id: string; name: string; combatant_id: string | null }[]).map((p) => ({
    id: p.id,
    name: p.name,
    combatantId: p.combatant_id,
  }));
}

type RawView = Partial<PublicView> & { closed?: boolean };

/**
 * Delivers the current view immediately, then every change. `onClosed` fires when the DM ends the session.
 * Views are ordered by revision, so a slow initial fetch can never replace a newer realtime update.
 * Returns an unsubscribe function; nothing is delivered after it is called.
 */
export function subscribeToView(
  sessionId: string,
  onView: (view: PublicView) => void,
  onClosed: () => void,
): () => void {
  const supabase = getClient();
  let active = true;
  let latestRevision = -1;

  const deliver = (raw: RawView | undefined, revision: number): void => {
    if (!active || revision <= latestRevision) return;
    latestRevision = revision;
    if (raw?.closed) onClosed();
    else if (raw?.phase) onView(raw as PublicView);
  };

  const channel = supabase
    .channel(`session-view-${sessionId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'session_views', filter: `session_id=eq.${sessionId}` },
      (payload) => {
        const row = payload.new as { view?: RawView; revision?: number | string };
        deliver(row.view, Number(row.revision ?? 0));
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void fetchView(sessionId).then((row) => row && deliver(row.view, row.revision));
      }
    });

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

async function fetchView(sessionId: string): Promise<{ view: RawView; revision: number } | undefined> {
  const { data, error } = await getClient()
    .from('session_views')
    .select('view, revision')
    .eq('session_id', sessionId)
    .single();
  if (error) {
    console.error('fetch view failed', error);
    return undefined;
  }
  const row = data as { view: RawView; revision: number | string };
  return { view: row.view, revision: Number(row.revision) };
}
