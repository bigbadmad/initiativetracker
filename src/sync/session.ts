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

export function endDmSession(): void {
  cancelPendingPublish();
  try {
    localStorage.removeItem(DM_SESSION_KEY);
  } catch { /* ignore */ }
}

let publishTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingPublish(): void {
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = null;
}

/** Debounced so bursts of state changes produce one write. Failures are logged, never thrown into the UI. */
export function publishView(session: DmSession, view: PublicView): void {
  cancelPendingPublish();
  publishTimer = setTimeout(async () => {
    const { error } = await getClient().rpc('publish_view', {
      p_code: session.code,
      p_secret: session.secret,
      p_view: view,
    });
    if (error) console.error('publish_view failed', error);
  }, PUBLISH_DEBOUNCE_MS);
}

// -- Player side ---------------------------------------------------------------

export async function joinSession(code: string, name: string): Promise<string> {
  await ensureAnonymousUser();
  const { data, error } = await getClient().rpc('join_session', {
    p_code: code.trim(),
    p_name: name,
  });
  if (error) throw error;
  return data as string;
}

/** Delivers the current view immediately, then every change. Returns an unsubscribe function. */
export function subscribeToView(sessionId: string, onView: (view: PublicView) => void): () => void {
  const supabase = getClient();
  const deliver = (view: PublicView | undefined): void => {
    if (view?.phase) onView(view);
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

async function fetchView(sessionId: string): Promise<PublicView | undefined> {
  const { data, error } = await getClient()
    .from('session_views')
    .select('view')
    .eq('session_id', sessionId)
    .single();
  if (error) {
    console.error('fetch view failed', error);
    return undefined;
  }
  return (data as { view: PublicView }).view;
}
