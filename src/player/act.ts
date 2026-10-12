import type { PublicView } from '../sync/publicView.ts';
import type { DoneReceipt } from '../sync/session.ts';

/** What the "your turn" control on the player screen should show. */
export type ActStatus =
  | { kind: 'none' }
  /** The character acts this segment and has not yet tapped Done. */
  | { kind: 'act' }
  | { kind: 'done' };

/**
 * A Done tap made on this device: the server's receipt plus the character it was made as. Players can
 * switch characters, so the segment alone does not say who was marked done.
 */
export interface LocalDone extends DoneReceipt {
  combatantId: string;
}

/**
 * `tapped` is the receipt from this device's own Done tap. It makes the button flip at once instead of
 * waiting for the DM's next publish, and it only counts for the exact character and segment it was
 * recorded for.
 */
export function actStatus(view: PublicView | null, characterId: string | null, tapped: LocalDone | null): ActStatus {
  if (!view || !characterId || view.phase !== 'combat') return { kind: 'none' };
  const me = view.acting.find((a) => a.id === characterId && a.type === 'player');
  if (!me) return { kind: 'none' };
  const tappedHere =
    tapped !== null &&
    tapped.combatantId === characterId &&
    tapped.encounterId === view.encounterId &&
    tapped.round === view.roundNumber &&
    tapped.segment === view.currentSegment;
  return me.done || tappedHere ? { kind: 'done' } : { kind: 'act' };
}

/**
 * Changes only when the control needs different content. Includes the segment so each new segment
 * gets a fresh button, but not the rest of the view, so a DM update never rebuilds it mid-tap.
 */
export function actStatusKey(view: PublicView | null, status: ActStatus): string {
  if (status.kind === 'none' || !view) return 'none';
  return `${status.kind}:${view.encounterId}:${view.roundNumber}:${view.currentSegment}`;
}

export function doneErrorMessage(message: string): string {
  if (message.includes('not your turn')) return 'It is no longer your segment.';
  if (message.includes('combat is not running')) return 'Combat is not running.';
  if (message.includes('session closed')) return 'The session has ended.';
  return 'Could not send that. Check your connection and try again.';
}
