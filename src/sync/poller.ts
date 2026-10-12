import type { DmSession } from './session.ts';
import { isPermanentPublishError } from './session.ts';

export interface PollerOptions<Target, Result> {
  getSession: () => DmSession | null;
  /** Null while there is nothing to ask the server about; no request is made then. */
  getTarget: () => Target | null;
  fetch: (session: DmSession, target: Target) => Promise<Result>;
  /** Receives the target the request was made for, so a stale response can be discarded. */
  onResult: (target: Target, result: Result) => void;
  intervalMs: number;
  /** Used only in the log line when a request fails. */
  label: string;
}

/**
 * Poll the server on behalf of the DM client. The DM has no Supabase identity (it is authorised by
 * its secret alone), so it polls rather than subscribing. Requests never overlap, a transient error
 * keeps the loop going and is reported once, and a closed or unknown session stops it for good.
 * Returns a stop function; nothing is delivered after it is called.
 */
export function startPoller<Target, Result>(opts: PollerOptions<Target, Result>): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastError = '';

  const tick = async (): Promise<void> => {
    if (stopped) return;
    const session = opts.getSession();
    const target = opts.getTarget();
    if (session && target) {
      try {
        const result = await opts.fetch(session, target);
        lastError = '';
        if (!stopped) opts.onResult(target, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
        if (isPermanentPublishError(message)) {
          stopped = true;
          return;
        }
        if (message !== lastError) console.error(`${opts.label} failed`, err);
        lastError = message;
      }
    }
    if (!stopped) timer = setTimeout(() => void tick(), opts.intervalMs);
  };

  timer = setTimeout(() => void tick(), opts.intervalMs);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
