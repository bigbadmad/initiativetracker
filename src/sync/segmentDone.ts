import type { SegmentDoneTarget } from '../state.ts';
import type { DmSession } from './session.ts';
import { startPoller } from './poller.ts';
import { getClient } from './supabase.ts';

/** Faster than declarations: a table waiting on a tap notices a slow poll. */
const POLL_INTERVAL_MS = 1500;

export interface SegmentDoneResult {
  done: string[];
  remote: string[];
}

export async function fetchSegmentDone(
  session: DmSession,
  target: SegmentDoneTarget,
): Promise<SegmentDoneResult> {
  const { data, error } = await getClient().rpc('get_segment_done', {
    p_code: session.code,
    p_secret: session.secret,
    p_encounter_id: target.encounterId,
    p_round: target.round,
    p_segment: target.segment,
  });
  if (error) throw error;
  const result = (data ?? {}) as Partial<SegmentDoneResult>;
  return { done: result.done ?? [], remote: result.remote ?? [] };
}

export interface SegmentDonePollOptions {
  getSession: () => DmSession | null;
  /** Null outside combat. */
  getTarget: () => SegmentDoneTarget | null;
  onResult: (target: SegmentDoneTarget, result: SegmentDoneResult) => void;
  intervalMs?: number;
}

/** Poll for Done taps while combat is running. Returns a stop function. */
export function startSegmentDonePolling(opts: SegmentDonePollOptions): () => void {
  return startPoller<SegmentDoneTarget, SegmentDoneResult>({
    getSession: opts.getSession,
    getTarget: opts.getTarget,
    fetch: fetchSegmentDone,
    onResult: opts.onResult,
    intervalMs: opts.intervalMs ?? POLL_INTERVAL_MS,
    label: 'get_segment_done',
  });
}
