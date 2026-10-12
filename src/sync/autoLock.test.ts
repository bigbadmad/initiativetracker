import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAutoLocker } from './autoLock.ts';

const round2 = { encounterId: 'enc-1', round: 2 };

describe('auto-lock', () => {
  let midEdit: boolean;
  let target: { encounterId: string; round: number } | null;
  const lock = vi.fn();

  const make = () =>
    createAutoLocker({ isMidEdit: () => midEdit, getTarget: () => target, lock, retryMs: 100 });

  beforeEach(() => {
    vi.useFakeTimers();
    lock.mockClear();
    midEdit = false;
    target = round2;
  });

  afterEach(() => vi.useRealTimers());

  it('locks straight away when the DM is idle', () => {
    make().request(round2);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('waits while the DM is mid-edit, then locks once, not before', async () => {
    midEdit = true;
    make().request(round2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(lock).not.toHaveBeenCalled();
    midEdit = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(lock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('drops the request if the DM locked or the round moved on while it waited', async () => {
    midEdit = true;
    const locker = make();
    locker.request(round2);
    target = null; // the DM pressed Lock In themselves, so declarations are no longer open
    midEdit = false;
    await vi.advanceTimersByTimeAsync(500);
    expect(lock).not.toHaveBeenCalled();

    midEdit = true;
    target = round2;
    locker.request(round2);
    target = { encounterId: 'enc-1', round: 3 };
    midEdit = false;
    await vi.advanceTimersByTimeAsync(500);
    expect(lock).not.toHaveBeenCalled();
  });

  it('does nothing after being cancelled', async () => {
    midEdit = true;
    const locker = make();
    locker.request(round2);
    locker.cancel();
    midEdit = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(lock).not.toHaveBeenCalled();
  });

  it('does not stack: several requests while waiting produce a single lock', async () => {
    midEdit = true;
    const locker = make();
    locker.request(round2);
    locker.request(round2);
    locker.request(round2);
    midEdit = false;
    await vi.advanceTimersByTimeAsync(500);
    expect(lock).toHaveBeenCalledTimes(1);
  });
});
