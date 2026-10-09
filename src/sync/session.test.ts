import { describe, it, expect } from 'vitest';
import { nextRevision } from './session.ts';

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
