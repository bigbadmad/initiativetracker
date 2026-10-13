import type { PublicView } from '../sync/publicView.ts';
import type { DeclarationInput, MyDeclaration } from '../sync/session.ts';

/** What the declaration area of the player screen should show. */
export type DeclareStatus =
  | { kind: 'none' }
  | { kind: 'form' }
  | { kind: 'blocked'; reason: string }
  /** The DM entered this character's roll themselves (physical dice), so there is nothing to declare. */
  | { kind: 'dm-entered' }
  | { kind: 'declared'; declaration: MyDeclaration };

/**
 * What the declare form starts with. The DM's standing action for the character wins, because after a
 * declaration is applied it IS the player's last choice, and it also reflects anything the DM has
 * changed since. The remembered draft only fills in when the DM has set nothing up.
 */
export function declareDefaults(standing: DeclarationInput | null, draft: DeclarationInput): DeclarationInput {
  if (!standing) return draft;
  return {
    kind: standing.kind,
    label: standing.label.slice(0, 40),
    value: Math.min(30, Math.max(0, Math.trunc(standing.value))),
  };
}

export function declarationIsCurrent(view: PublicView, declaration: MyDeclaration | null): declaration is MyDeclaration {
  return declaration !== null && declaration.encounterId === view.encounterId && declaration.round === view.roundNumber;
}

export function declareStatus(
  view: PublicView | null,
  characterId: string | null,
  declaration: MyDeclaration | null,
): DeclareStatus {
  if (!view || !characterId) return { kind: 'none' };
  const me = view.players.find((p) => p.id === characterId);
  if (!me) return { kind: 'none' };

  if (view.phase === 'combat') {
    return declarationIsCurrent(view, declaration) ? { kind: 'declared', declaration } : { kind: 'none' };
  }
  if (view.phase !== 'initiative' || view.encounterId === null) return { kind: 'none' };

  if (declarationIsCurrent(view, declaration)) return { kind: 'declared', declaration };
  if (me.hasDeclared) return { kind: 'dm-entered' };
  if (!me.isActive) return { kind: 'blocked', reason: 'Your character is down and cannot act.' };
  if (me.isHorsDeCombat) return { kind: 'blocked', reason: 'Your character is hors de combat and sits this round out.' };
  if (view.inSurprisePhase && me.isSurprised) {
    return { kind: 'blocked', reason: 'You are surprised and cannot act in the surprise phase.' };
  }
  return { kind: 'form' };
}

/**
 * A key that changes only when the declaration area needs different content. The player screen
 * re-renders on every DM update, but must never rebuild a form the player is typing into.
 */
export function declareStatusKey(status: DeclareStatus): string {
  switch (status.kind) {
    case 'blocked':
      return `blocked:${status.reason}`;
    case 'declared':
      return `declared:${status.declaration.round}:${status.declaration.d10}:${status.declaration.total ?? ''}`;
    default:
      return status.kind;
  }
}

/** Turn a server error into something a player can act on. */
export function declareErrorMessage(message: string): string {
  if (message.includes('already declared')) return 'You have already declared this round.';
  if (message.includes('declarations are not open')) return 'The DM has not opened declarations yet.';
  if (message.includes('cannot act this round')) return 'Your character cannot act this round.';
  if (message.includes('no character selected')) return 'Pick your character first.';
  if (message.includes('session closed')) return 'The session has ended.';
  return 'Could not submit your action. Check your connection and try again.';
}
