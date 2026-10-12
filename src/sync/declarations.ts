import type { RemoteDeclaration } from '../state.ts';
import type { DmSession } from './session.ts';
import { startPoller } from './poller.ts';
import { getClient } from './supabase.ts';

const POLL_INTERVAL_MS = 2500;
const TOTALS_DEBOUNCE_MS = 300;

/** Which round of which encounter is currently collecting declarations. */
export interface DeclarationTarget {
  encounterId: string;
  round: number;
}

export async function fetchDeclarations(
  session: DmSession,
  target: DeclarationTarget,
): Promise<RemoteDeclaration[]> {
  const { data, error } = await getClient().rpc('get_declarations', {
    p_code: session.code,
    p_secret: session.secret,
    p_encounter_id: target.encounterId,
    p_round: target.round,
  });
  if (error) throw error;
  return (data ?? []) as RemoteDeclaration[];
}

async function pushTotals(
  session: DmSession,
  target: DeclarationTarget,
  totals: Record<string, number>,
): Promise<void> {
  const { error } = await getClient().rpc('set_declaration_totals', {
    p_code: session.code,
    p_secret: session.secret,
    p_encounter_id: target.encounterId,
    p_round: target.round,
    p_totals: totals,
  });
  if (error) throw error;
}

// -- DM polling ----------------------------------------------------------------

export interface PollOptions {
  getSession: () => DmSession | null;
  /** Null while declarations are not open (setup, combat, loot, or no encounter yet). */
  getTarget: () => DeclarationTarget | null;
  /** Receives the target the request was made for, so a stale response can be discarded. */
  onDeclarations: (target: DeclarationTarget, declarations: RemoteDeclaration[]) => void;
  intervalMs?: number;
}

/**
 * Poll for declarations while the DM is collecting them (see `startPoller` for why this polls).
 * Returns a stop function.
 */
export function startDeclarationPolling(opts: PollOptions): () => void {
  return startPoller<DeclarationTarget, RemoteDeclaration[]>({
    getSession: opts.getSession,
    getTarget: opts.getTarget,
    fetch: fetchDeclarations,
    onResult: opts.onDeclarations,
    intervalMs: opts.intervalMs ?? POLL_INTERVAL_MS,
    label: 'get_declarations',
  });
}

// -- Totals write-back ---------------------------------------------------------

interface TotalsJob {
  session: DmSession;
  target: DeclarationTarget;
  totals: Record<string, number>;
  key: string;
}

let totalsTimer: ReturnType<typeof setTimeout> | null = null;
/** The newest snapshot not yet sent. A newer one simply replaces it; only the latest ever matters. */
let queued: TotalsJob | null = null;
let inFlight = false;
/** The key of the snapshot the server last accepted, used to skip resending an identical one. */
let lastTotalsKey = '';
/** Bumped by resetTotals so a write that finishes after the session ended records nothing. */
let generation = 0;

/**
 * Tell the server each remote player's computed initiative so they can see it.
 *
 * Writes are single-flight: the next one is only sent once the previous has returned, so two
 * snapshots can never reach the server out of order and an older one can never overwrite a newer.
 * Bursts are debounced, and a snapshot identical to the one the server last accepted is not
 * re-sent. A failed write is logged and superseded by the next state change.
 */
export function queueTotals(
  session: DmSession,
  target: DeclarationTarget,
  totals: Record<string, number>,
): void {
  const sorted = Object.keys(totals).sort().map((k) => [k, totals[k]]);
  const key = JSON.stringify([session.code, target.encounterId, target.round, sorted]);
  if (key === lastTotalsKey && !inFlight && !queued) return;
  queued = { session, target, totals, key };
  if (totalsTimer) clearTimeout(totalsTimer);
  totalsTimer = setTimeout(() => {
    totalsTimer = null;
    sendQueued();
  }, TOTALS_DEBOUNCE_MS);
}

function sendQueued(): void {
  if (inFlight || !queued) return;
  const job = queued;
  queued = null;
  if (job.key === lastTotalsKey) return; // the write that just landed already says this
  inFlight = true;
  const gen = generation;
  pushTotals(job.session, job.target, job.totals)
    .then(() => {
      if (gen === generation) lastTotalsKey = job.key;
    })
    .catch((err) => console.error('set_declaration_totals failed', err))
    .finally(() => {
      inFlight = false;
      sendQueued();
    });
}

/** Forget what was sent, e.g. when the session ends, so a new session starts from scratch. */
export function resetTotals(): void {
  if (totalsTimer) clearTimeout(totalsTimer);
  totalsTimer = null;
  queued = null;
  lastTotalsKey = '';
  generation++;
}
