import type { RosterEntry } from '../sync/session.ts';

/** How often a player's screen re-reads who has claimed which character. */
export const ROSTER_POLL_MS = 5000;

/**
 * A key that changes only when who is playing whom changes. Order does not matter, so a re-read that
 * returns the same seats in a different order never causes a redraw.
 */
export function rosterKey(roster: RosterEntry[]): string {
  return JSON.stringify(roster.map((r) => [r.id, r.name, r.combatantId]).sort());
}
