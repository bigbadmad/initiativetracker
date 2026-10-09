import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PublicView } from './publicView.ts';

const rpc = vi.fn();

vi.mock('./supabase.ts', () => ({
  getClient: () => ({ rpc }),
  ensureAnonymousUser: vi.fn(),
}));

type Session = typeof import('./session.ts');

const dm = { code: 'ABCDE', secret: 'secret-secret-secret' };

function view(segment: number): PublicView {
  return { phase: 'combat', roundNumber: 1, currentSegment: segment, inSurprisePhase: false, acting: [], players: [] };
}

function sentSegments(): number[] {
  return rpc.mock.calls.filter((c) => c[0] === 'publish_view').map((c) => c[1].p_view.currentSegment);
}

function sentRevisions(): number[] {
  return rpc.mock.calls.filter((c) => c[0] === 'publish_view').map((c) => c[1].p_revision);
}

/** Echo the revision back, as the real server does when a publish is applied. */
function applied(): void {
  rpc.mockImplementation(async (name: string, args: { p_revision?: number }) => ({
    data: name === 'publish_view' ? args.p_revision : null,
    error: null,
  }));
}

describe('publishing', () => {
  let session: Session;
  let statuses: string[];

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    vi.resetModules();
    rpc.mockReset();
    session = await import('./session.ts');
    statuses = [];
    session.setPublishStatusListener((s) => statuses.push(s.state));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces a burst of changes into one publish of the latest view', async () => {
    applied();
    session.publishView(dm, view(1));
    session.publishView(dm, view(2));
    session.publishView(dm, view(3));
    await vi.advanceTimersByTimeAsync(300);
    expect(sentSegments()).toEqual([3]);
    expect(statuses).toEqual(['ok']);
  });

  it('retries a transient failure with doubling backoff, then recovers', async () => {
    let calls = 0;
    rpc.mockImplementation(async (_name: string, args: { p_revision: number }) =>
      ++calls <= 3 ? { data: null, error: { message: 'Failed to fetch' } } : { data: args.p_revision, error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    session.publishView(dm, view(1));
    await vi.advanceTimersByTimeAsync(250); // first attempt fails
    expect(rpc).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(rpc).toHaveBeenCalledTimes(1); // still waiting out the 1s backoff
    await vi.advanceTimersByTimeAsync(1);
    expect(rpc).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000); // second backoff is 2s
    expect(rpc).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4000); // third backoff is 4s, and this attempt succeeds
    expect(rpc).toHaveBeenCalledTimes(4);

    expect(statuses).toEqual(['retrying', 'retrying', 'retrying', 'ok']);
    expect(sentSegments()).toEqual([1, 1, 1, 1]);
  });

  it('stops retrying on a permanent error and reports failure', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'session closed' } });
    session.publishView(dm, view(1));
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(['failed']);
  });

  it('resends with a higher revision when the server already holds a newer one', async () => {
    const serverRevision = 5_000_000; // far ahead of this machine's clock
    rpc.mockImplementation(async (_name: string, args: { p_revision: number }) => ({
      data: Math.max(serverRevision, args.p_revision),
      error: null,
    }));
    session.publishView(dm, view(1));
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(10); // the resend is scheduled with a 0ms timer once the first response lands
    expect(rpc).toHaveBeenCalledTimes(2);
    const [first, second] = sentRevisions();
    expect(first).toBeLessThan(serverRevision);
    expect(second).toBeGreaterThan(serverRevision);
    expect(statuses).toEqual(['ok']);
  });

  it('drops an in-flight result when a newer view replaced it, and sends only the newer one next', async () => {
    let release: (() => void) | undefined;
    rpc.mockImplementationOnce(
      (_name: string, args: { p_revision: number }) =>
        new Promise((resolve) => {
          release = () => resolve({ data: null, error: { message: 'Failed to fetch' } });
          void args;
        }),
    );
    applied();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    session.publishView(dm, view(1));
    await vi.advanceTimersByTimeAsync(250); // request for view 1 is now in flight
    session.publishView(dm, view(2));
    release?.(); // the old request fails after being replaced
    await vi.advanceTimersByTimeAsync(300);

    expect(sentSegments()).toEqual([1, 2]);
    expect(statuses).toEqual(['ok']); // the stale failure never surfaced
  });

  describe('ending a session', () => {
    it('cancels pending publishing once the close succeeds', async () => {
      applied();
      rpc.mockImplementation(async () => ({ data: null, error: null }));
      session.publishView(dm, view(1));
      await session.endDmSession(dm);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(rpc.mock.calls.map((c) => c[0])).toEqual(['close_session']);
    });

    it('holds publishes during the close and resumes them if the close fails', async () => {
      rpc.mockImplementation(async (name: string, args: { p_revision?: number }) =>
        name === 'close_session' ? { data: null, error: { message: 'Failed to fetch' } } : { data: args.p_revision, error: null });

      session.publishView(dm, view(1));
      await expect(session.endDmSession(dm)).rejects.toMatchObject({ message: 'Failed to fetch' });
      await vi.advanceTimersByTimeAsync(300);

      expect(rpc.mock.calls.map((c) => c[0])).toEqual(['close_session', 'publish_view']);
      expect(sentSegments()).toEqual([1]);
      expect(statuses).toEqual(['ok']);
    });

    it('does not publish while the close is in flight', async () => {
      let finishClose: (() => void) | undefined;
      rpc.mockImplementation((name: string, args: { p_revision?: number }) =>
        name === 'close_session'
          ? new Promise((resolve) => { finishClose = () => resolve({ data: null, error: null }); })
          : Promise.resolve({ data: args.p_revision, error: null }));

      const ending = session.endDmSession(dm);
      session.publishView(dm, view(2)); // a state change lands mid-close
      await vi.advanceTimersByTimeAsync(1000);
      expect(rpc.mock.calls.map((c) => c[0])).toEqual(['close_session']);

      finishClose?.();
      await ending;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(rpc.mock.calls.map((c) => c[0])).toEqual(['close_session']);
    });
  });
});
