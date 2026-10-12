import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('./supabase.ts', () => ({
  getClient: () => ({ rpc }),
  ensureAnonymousUser: vi.fn(),
}));

type Mod = typeof import('./segmentDone.ts');

const dm = { code: 'ABCDE', secret: 'secret-secret-secret' };
const target = { encounterId: 'enc-1', round: 2, segment: 5 };

describe('segment done polling', () => {
  let mod: Mod;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    rpc.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mod = await import('./segmentDone.ts');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('asks the server about the segment on screen and passes the result back with that target', async () => {
    rpc.mockResolvedValue({ data: { done: ['p1'], remote: ['p1', 'p2'] }, error: null });
    const seen: unknown[] = [];
    const stop = mod.startSegmentDonePolling({
      getSession: () => dm,
      getTarget: () => target,
      onResult: (t, r) => seen.push([t, r]),
      intervalMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    expect(rpc).toHaveBeenCalledWith('get_segment_done', {
      p_code: 'ABCDE',
      p_secret: dm.secret,
      p_encounter_id: 'enc-1',
      p_round: 2,
      p_segment: 5,
    });
    expect(seen).toEqual([[target, { done: ['p1'], remote: ['p1', 'p2'] }]]);
  });

  it('tolerates an empty answer', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const seen: unknown[] = [];
    const stop = mod.startSegmentDonePolling({
      getSession: () => dm,
      getTarget: () => target,
      onResult: (_t, r) => seen.push(r),
      intervalMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    expect(seen).toEqual([{ done: [], remote: [] }]);
  });

  it('makes no request outside combat', async () => {
    const stop = mod.startSegmentDonePolling({
      getSession: () => dm,
      getTarget: () => null,
      onResult: () => {},
      intervalMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(5000);
    stop();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('stops for good when the session has ended', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'session closed' } });
    mod.startSegmentDonePolling({
      getSession: () => dm,
      getTarget: () => target,
      onResult: () => {},
      intervalMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(10000);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('polls faster by default than declarations do', async () => {
    rpc.mockResolvedValue({ data: { done: [], remote: [] }, error: null });
    const stop = mod.startSegmentDonePolling({ getSession: () => dm, getTarget: () => target, onResult: () => {} });
    await vi.advanceTimersByTimeAsync(1600);
    stop();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
