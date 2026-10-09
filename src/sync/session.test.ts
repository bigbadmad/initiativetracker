import { describe, it, expect } from 'vitest';
import { isPermanentPublishError, nextRevision } from './session.ts';

describe('nextRevision', () => {
  it('follows the clock when it moves forward', () => {
    expect(nextRevision(100, 500)).toBe(500);
  });

  it('still increases when two publishes land in the same millisecond', () => {
    expect(nextRevision(500, 500)).toBe(501);
  });

  it('never goes backwards if the clock does', () => {
    expect(nextRevision(900, 500)).toBe(901);
  });
});

describe('isPermanentPublishError', () => {
  it('treats auth and closed-session errors as final', () => {
    expect(isPermanentPublishError('session closed')).toBe(true);
    expect(isPermanentPublishError('invalid session or secret')).toBe(true);
  });

  it('retries network and server errors', () => {
    expect(isPermanentPublishError('Failed to fetch')).toBe(false);
    expect(isPermanentPublishError('upstream request timeout')).toBe(false);
  });
});
