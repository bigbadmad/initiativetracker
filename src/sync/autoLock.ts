import type { DeclarationTarget } from './declarations.ts';

const RETRY_MS = 400;

export interface AutoLockOptions {
  /** True while the DM is typing or holding a button; the lock waits so it never lands under their hands. */
  isMidEdit: () => boolean;
  /** The round currently collecting declarations, or null when none is. */
  getTarget: () => DeclarationTarget | null;
  lock: () => void;
  retryMs?: number;
}

/**
 * Starts combat once every player is in, but only when the DM is not mid-edit and only for the
 * round that completed. If the DM has locked, gone back, or the round has moved on while waiting,
 * the request is dropped rather than applied to the wrong round.
 */
export function createAutoLocker(opts: AutoLockOptions): {
  request: (target: DeclarationTarget) => void;
  cancel: () => void;
} {
  const retryMs = opts.retryMs ?? RETRY_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let wanted: DeclarationTarget | null = null;

  const attempt = (): void => {
    timer = null;
    const now = opts.getTarget();
    if (!wanted || !now || now.encounterId !== wanted.encounterId || now.round !== wanted.round) {
      wanted = null;
      return;
    }
    if (opts.isMidEdit()) {
      timer = setTimeout(attempt, retryMs);
      return;
    }
    wanted = null;
    opts.lock();
  };

  return {
    request(target) {
      wanted = target;
      if (!timer) attempt();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      wanted = null;
    },
  };
}
