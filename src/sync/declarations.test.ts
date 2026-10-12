import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('./supabase.ts', () => ({
  getClient: () => ({ rpc }),
  ensureAnonymousUser: vi.fn(),
}));

type Declarations = typeof import('./declarations.ts');

const dm = { code: 'ABCDE', secret: 'secret-secret-secret' };
const target = { encounterId: 'enc-1', round: 2 };
const decl = { combatantId: 'p1', kind: 'weapon_speed', label: 'Axe', value: 5, d10: 4 };

function callsTo(name: string): unknown[][] {
  return rpc.mock.calls.filter((c) => c[0] === name);
}

describe('declaration polling', () => {
  let mod: Declarations;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    rpc.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mod = await import('./declarations.ts');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls on the interval and hands each batch to the callback with the target it asked for', async () => {
    rpc.mockResolvedValue({ data: [decl], error: null });
    const seen: unknown[] = [];
    const stop = mod.startDeclarationPolling({
      getSession: () => dm,
      getTarget: () => target,
      onDeclarations: (t, d) => seen.push([t, d]),
      intervalMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    expect(callsTo('get_declarations')).toHaveLength(2);
    expect(callsTo('get_declarations')[0][1]).toEqual({
      p_code: 'ABCDE',
      p_secret: dm.secret,
      p_encounter_id: 'enc-1',
      p_round: 2,
    });
    expect(seen[0]).toEqual([target, [decl]]);
  });

  it('does not call the server while declarations are not open or there is no session', async () => {
    let open: typeof target | null = null;
    let session: typeof dm | null = dm;
    const stop = mod.startDeclarationPolling({
      getSession: () => session,
      getTarget: () => open,
      onDeclarations: () => {},
      intervalMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(rpc).not.toHaveBeenCalled();

    session = null;
    open = target;
    await vi.advanceTimersByTimeAsync(3000);
    expect(rpc).not.toHaveBeenCalled();

    session = dm;
    rpc.mockResolvedValue({ data: [], error: null });
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    expect(callsTo('get_declarations')).toHaveLength(1);
  });

  it('never has two requests in flight, even when the server is slower than the interval', async () => {
    let resolve: (v: unknown) => void = () => {};
    rpc.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const stop = mod.startDeclarationPolling({
      getSession: () => dm,
      getTarget: () => target,
      onDeclarations: () => {},
      intervalMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(callsTo('get_declarations')).toHaveLength(1);
    resolve({ data: [], error: null });
    await vi.advanceTimersByTimeAsync(1000);
    expect(callsTo('get_declarations')).toHaveLength(2);
    stop();
  });

  it('keeps polling through a network error and reports it once', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    const stop = mod.startDeclarationPolling({
      getSession: () => dm,
      getTarget: () => target,
      onDeclarations: () => {},
      intervalMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(4000);
    stop();
    expect(callsTo('get_declarations').length).toBeGreaterThanOrEqual(4);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('stops for good when the session is closed', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'session closed' } });
    mod.startDeclarationPolling({
      getSession: () => dm,
      getTarget: () => target,
      onDeclarations: () => {},
      intervalMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(10000);
    expect(callsTo('get_declarations')).toHaveLength(1);
  });

  it('stops when asked, and discards a response that lands afterwards', async () => {
    let resolve: (v: unknown) => void = () => {};
    rpc.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const onDeclarations = vi.fn();
    const stop = mod.startDeclarationPolling({
      getSession: () => dm,
      getTarget: () => target,
      onDeclarations,
      intervalMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    resolve({ data: [decl], error: null });
    await vi.advanceTimersByTimeAsync(5000);
    expect(onDeclarations).not.toHaveBeenCalled();
    expect(callsTo('get_declarations')).toHaveLength(1);
  });
});

describe('totals write-back', () => {
  let mod: Declarations;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    rpc.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mod = await import('./declarations.ts');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces a burst into one write of the latest totals', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    mod.queueTotals(dm, target, { p1: 5 });
    mod.queueTotals(dm, target, { p1: 5, p2: 8 });
    await vi.advanceTimersByTimeAsync(400);
    const calls = callsTo('set_declaration_totals');
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({
      p_code: 'ABCDE',
      p_secret: dm.secret,
      p_encounter_id: 'enc-1',
      p_round: 2,
      p_totals: { p1: 5, p2: 8 },
    });
  });

  it('does not resend totals that already landed, whatever the key order', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    mod.queueTotals(dm, target, { p1: 5, p2: 8 });
    await vi.advanceTimersByTimeAsync(400);
    mod.queueTotals(dm, target, { p2: 8, p1: 5 });
    await vi.advanceTimersByTimeAsync(400);
    expect(callsTo('set_declaration_totals')).toHaveLength(1);
  });

  it('sends again when a totals value changes or the round moves on', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    mod.queueTotals(dm, target, { p1: 5 });
    await vi.advanceTimersByTimeAsync(400);
    mod.queueTotals(dm, target, { p1: 6 });
    await vi.advanceTimersByTimeAsync(400);
    mod.queueTotals(dm, { ...target, round: 3 }, { p1: 6 });
    await vi.advanceTimersByTimeAsync(400);
    expect(callsTo('set_declaration_totals')).toHaveLength(3);
  });

  it('retries identical totals after a failed write', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    rpc.mockResolvedValue({ data: null, error: null });
    mod.queueTotals(dm, target, { p1: 5 });
    await vi.advanceTimersByTimeAsync(400);
    mod.queueTotals(dm, target, { p1: 5 });
    await vi.advanceTimersByTimeAsync(400);
    expect(callsTo('set_declaration_totals')).toHaveLength(2);
  });

  it('is single-flight: a newer snapshot waits for the write in flight, and only the latest is sent after it', async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    rpc.mockImplementation(() => new Promise((r) => resolvers.push(r)));

    mod.queueTotals(dm, target, { p1: 1 });
    await vi.advanceTimersByTimeAsync(400);
    expect(callsTo('set_declaration_totals')).toHaveLength(1);

    // Two newer snapshots arrive while the first is still on the wire.
    mod.queueTotals(dm, target, { p1: 2 });
    await vi.advanceTimersByTimeAsync(400);
    mod.queueTotals(dm, target, { p1: 3 });
    await vi.advanceTimersByTimeAsync(400);
    expect(callsTo('set_declaration_totals')).toHaveLength(1);

    resolvers[0]({ data: null, error: null });
    await vi.advanceTimersByTimeAsync(0);
    const calls = callsTo('set_declaration_totals');
    expect(calls).toHaveLength(2);
    expect((calls[1][1] as { p_totals: unknown }).p_totals).toEqual({ p1: 3 });
  });

  it('keeps the server\'s snapshot as the last one sent, so a revert is not mistaken for a duplicate', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    mod.queueTotals(dm, target, { p1: 5 });
    await vi.advanceTimersByTimeAsync(400);
    mod.queueTotals(dm, target, { p1: 6 });
    await vi.advanceTimersByTimeAsync(400);
    mod.queueTotals(dm, target, { p1: 5 }); // back to the first value: the server now holds 6, so this must be sent
    await vi.advanceTimersByTimeAsync(400);
    const sent = callsTo('set_declaration_totals').map((c) => (c[1] as { p_totals: { p1: number } }).p_totals.p1);
    expect(sent).toEqual([5, 6, 5]);
  });

  it('skips a queued snapshot that matches the write that just landed', async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    rpc.mockImplementation(() => new Promise((r) => resolvers.push(r)));
    mod.queueTotals(dm, target, { p1: 1 });
    await vi.advanceTimersByTimeAsync(400);
    mod.queueTotals(dm, target, { p1: 1 });
    await vi.advanceTimersByTimeAsync(400);
    resolvers[0]({ data: null, error: null });
    await vi.advanceTimersByTimeAsync(400);
    expect(callsTo('set_declaration_totals')).toHaveLength(1);
  });

  it('keeps writing after a failed write', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    rpc.mockResolvedValue({ data: null, error: null });
    mod.queueTotals(dm, target, { p1: 1 });
    await vi.advanceTimersByTimeAsync(400);
    mod.queueTotals(dm, target, { p1: 2 });
    await vi.advanceTimersByTimeAsync(400);
    expect(callsTo('set_declaration_totals')).toHaveLength(2);
  });

  it('forgets what it sent when reset, so a new session starts clean', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    mod.queueTotals(dm, target, { p1: 5 });
    await vi.advanceTimersByTimeAsync(400);
    mod.resetTotals();
    mod.queueTotals(dm, target, { p1: 5 });
    await vi.advanceTimersByTimeAsync(400);
    expect(callsTo('set_declaration_totals')).toHaveLength(2);
  });
});
