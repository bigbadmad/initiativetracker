import type { PublicView } from './publicView.ts';
import { ensureAnonymousUser, getClient } from './supabase.ts';

// -- DM side -------------------------------------------------------------------

const DM_SESSION_KEY = 'adnd-tracker-dm-session';
const PUBLISH_DEBOUNCE_MS = 250;

export interface DmSession {
  code: string;
  secret: string;
}

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
  cancelPendingPublish();
  const { error } = await getClient().rpc('close_session', { p_code: session.code, p_secret: session.secret });
  if (error) throw error;
  try {
    localStorage.removeItem(DM_SESSION_KEY);
  } catch { /* ignore */ }
}

let publishTimer: ReturnType<typeof setTimeout> | null = null;
let lastRevision = 0;

function cancelPendingPublish(): void {
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = null;
}

/** Strictly increasing and wall-clock based, so it also keeps increasing across page reloads. */
export function nextRevision(last: number, now: number): number {
  return Math.max(now, last + 1);
}

/**
 * Debounced so bursts of state changes produce one write. Each publish carries a revision;
 * the server ignores any publish older than what it already holds, so overlapping requests
 * can never roll players back to stale state. Failures are logged, never thrown into the UI.
 */
export function publishView(session: DmSession, view: PublicView): void {
  cancelPendingPublish();
  publishTimer = setTimeout(async () => {
    lastRevision = nextRevision(lastRevision, Date.now());
    const { error } = await getClient().rpc('publish_view', {
      p_code: session.code,
      p_secret: session.secret,
      p_view: view,
      p_revision: lastRevision,
    });
    if (error) console.error('publish_view failed', error);
  }, PUBLISH_DEBOUNCE_MS);
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

/**
 * Delivers the current view immediately, then every change. `onClosed` fires when the DM ends the session.
 * Returns an unsubscribe function.
 */
export function subscribeToView(
  sessionId: string,
  onView: (view: PublicView) => void,
  onClosed: () => void,
): () => void {
  const supabase = getClient();
  const deliver = (raw: (Partial<PublicView> & { closed?: boolean }) | undefined): void => {
    if (raw?.closed) onClosed();
    else if (raw?.phase) onView(raw as PublicView);
  };

  const channel = supabase
    .channel(`session-view-${sessionId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'session_views', filter: `session_id=eq.${sessionId}` },
      (payload) => deliver((payload.new as { view?: PublicView }).view),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void fetchView(sessionId).then(deliver);
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

async function fetchView(sessionId: string): Promise<(Partial<PublicView> & { closed?: boolean }) | undefined> {
  const { data, error } = await getClient()
    .from('session_views')
    .select('view')
    .eq('session_id', sessionId)
    .single();
  if (error) {
    console.error('fetch view failed', error);
    return undefined;
  }
  return (data as { view: Partial<PublicView> & { closed?: boolean } }).view;
}
