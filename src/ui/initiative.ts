import type { Combatant, ModifierKind } from '../types.ts';
import { getState, setState, updateCombatant, updateCombatantSilent } from '../state.ts';
import { calcInitiative, rollD10, firstActiveSegment, maxInitiativeSegment } from '../combat.ts';
import { el, btn, fmtSign, uid } from './components.ts';

// -- Render initiative entry screen --------------------------------------------

export function renderInitiative(): HTMLElement {
  const state = getState();
  const activeCombatants = state.combatants.filter((c) => c.isActive);

  const root = el('div', { cls: 'screen initiative-screen' });

  // Header
  const header = el('header', { cls: 'screen-header' });
  const phaseTitle = state.inSurprisePhase ? 'Surprise Phase' : `Round ${state.roundNumber}`;
  header.appendChild(el('h1', { text: 'Initiative Entry' }));
  header.appendChild(el('p', { cls: 'subtitle', text: phaseTitle }));
  root.appendChild(header);

  if (state.inSurprisePhase) {
    root.appendChild(
      el('div', {
        cls: 'notice notice-warning',
        text: 'Surprise round active: surprised combatants cannot act.'
      }),
    );
  }

  const grid = el('div', { cls: 'initiative-grid' });
  root.appendChild(grid);

  // Render a card per active combatant
  activeCombatants.forEach((c) => {
    grid.appendChild(buildInitiativeCard(c, state.inSurprisePhase));
  });

  // -- Bottom action bar -------------------------------------------------------
  const bar = el('div', { cls: 'action-bar' });
  root.appendChild(bar);

  // Roll for all monsters/NPCs
  const rollMonstersBtn = btn('🎲 Roll Monsters & NPCs', 'btn btn-secondary', () => {
    getState()
      .combatants.filter((c) => c.isActive && c.type !== 'player')
      .forEach((c) => {
        const roll = rollD10();
        const total = calcInitiative(roll, c.modifiers);
        updateCombatant(c.id, { d10Roll: roll, totalInitiative: total });
        // Update the card's displayed roll value
        const rollInput = document.getElementById(`roll-${c.id}`) as HTMLInputElement | null;
        const totalEl = document.getElementById(`total-${c.id}`);
        if (rollInput) rollInput.value = String(roll);
        if (totalEl) totalEl.textContent = String(total);
      });
  });
  bar.appendChild(rollMonstersBtn);

  // Lock in and sort
  const lockBtn = btn('⚔ Lock In & Begin Combat →', 'btn btn-primary', () => {
    const current = getState();

    // Validate all active, non-surprised combatants have a roll
    const missing = current.combatants.filter(
      (c) => c.isActive && !(c.isSurprised && current.inSurprisePhase) && c.d10Roll === null,
    );
    if (missing.length > 0) {
      alert(`Missing d10 roll for: ${missing.map((c) => c.name).join(', ')}`);
      return;
    }

    // Batch: apply sentinel initiative for surprised combatants + find first live segment
    const updatedCombatants = current.combatants.map((c) =>
      c.isActive && c.isSurprised && current.inSurprisePhase
        ? { ...c, d10Roll: null, totalInitiative: 99 }
        : c,
    );

    const maxSeg = maxInitiativeSegment(updatedCombatants);
    const startSeg = firstActiveSegment(updatedCombatants, maxSeg, current.inSurprisePhase);

    setState({ phase: 'combat', currentSegment: startSeg, combatants: updatedCombatants });
  });
  bar.appendChild(lockBtn);

  // Back to setup
  bar.appendChild(
    btn('← Back to Setup', 'btn btn-ghost', () => {
      setState({ phase: 'setup' });
    }),
  );

  return root;
}

// -- Individual combatant card -------------------------------------------------

function buildInitiativeCard(c: Combatant, inSurprisePhase: boolean): HTMLElement {
  const isSurprised = c.isSurprised && inSurprisePhase;
  const card = el('div', {
    cls: ['initiative-card', `type-${c.type}`, isSurprised ? 'is-surprised' : ''].join(' ').trim(),
  });

  // Name + badges
  const nameRow = el('div', { cls: 'card-name-row' });
  nameRow.appendChild(el('span', { cls: 'card-name', text: c.name }));
  nameRow.appendChild(el('span', { cls: `badge badge-${c.type}`, text: c.type }));
  if (isSurprised) nameRow.appendChild(el('span', { cls: 'badge badge-surprised', text: 'SURPRISED' }));
  card.appendChild(nameRow);

  if (isSurprised) {
    card.appendChild(
      el('p', { cls: 'surprised-note', text: 'Cannot act during surprise segments.' }),
    );
    return card;
  }

  // -- Action declaration for this round -------------------------------------
  // Same 3-part control as setup: type dropdown · label · speed value.
  // Pre-filled from the primary weapon/spell modifier; editable each round.
  const primaryMod = c.modifiers.find(
    (m) => m.kind === 'weapon_speed' || m.kind === 'spell_casting',
  );

  const actionFormRow = el('div', { cls: 'action-form-row' });

  // Kind dropdown - all modifier types, matching the setup screen
  const actionKindSelect = el('select', { cls: 'action-kind-select' }) as HTMLSelectElement;
  const ACTION_KINDS: Array<{ kind: ModifierKind; label: string }> = [
    { kind: 'weapon_speed', label: 'Weapon Speed' },
    { kind: 'spell_casting', label: 'Spell Casting Time' },
    { kind: 'dex_reaction', label: 'Dex Reaction Adj' },
    { kind: 'haste', label: 'Haste' },
    { kind: 'slow', label: 'Slow' },
    { kind: 'other', label: 'Other' },
  ];
  const VALUELESS_ACTION_KINDS: ModifierKind[] = ['haste', 'slow'];
  ACTION_KINDS.forEach(({ kind, label }) => {
    const opt = el('option', { text: label, attrs: { value: kind } });
    actionKindSelect.appendChild(opt);
  });
  if (primaryMod) actionKindSelect.value = primaryMod.kind;

  // Action label (weapon/spell name)
  const actionLabelInput = el('input', {
    attrs: {
      type: 'text',
      placeholder: 'Label (e.g. Long Sword)',
      value: primaryMod?.label ?? c.action ?? '',
    },
  }) as HTMLInputElement;

  // Speed/casting time value
  const actionValueInput = el('input', {
    attrs: {
      type: 'number',
      placeholder: 'Speed',
      min: '0',
      max: '30',
      value: primaryMod !== undefined ? String(primaryMod.value) : '0',
    },
  }) as HTMLInputElement;

  function commitAction() {
    const newKind = actionKindSelect.value as ModifierKind;
    const newLabel = actionLabelInput.value.trim();
    const isValueless = VALUELESS_ACTION_KINDS.includes(newKind);
    const newValue = isValueless ? 0 : parseInt(actionValueInput.value, 10);
    if (!isValueless && isNaN(newValue)) return;

    let newMods = c.modifiers.map((m) => ({ ...m }));
    if (primaryMod) {
      newMods = newMods.map((m) =>
        m.id === primaryMod.id
          ? { ...m, kind: newKind, label: newLabel || m.label, value: newValue }
          : m,
      );
    } else {
      newMods.push({ id: uid(), kind: newKind, label: newLabel || 'Attack', value: newValue });
    }

    const newTotal = c.d10Roll !== null ? calcInitiative(c.d10Roll, newMods) : null;
    updateCombatant(c.id, {
      action: newLabel,
      modifiers: newMods,
      ...(newTotal !== null ? { totalInitiative: newTotal } : {}),
    });
  }

  // Kind or value change commits immediately (single interaction, re-render OK)
  // When kind changes, also toggle value input visibility (haste/slow have no value)
  function updateValueVisibility() {
    actionValueInput.style.display = VALUELESS_ACTION_KINDS.includes(
      actionKindSelect.value as ModifierKind,
    ) ? 'none' : '';
  }
  updateValueVisibility(); // set on initial render
  actionKindSelect.addEventListener('change', () => { updateValueVisibility(); commitAction(); });
  actionValueInput.addEventListener('change', commitAction);
  // Label blur: silent save so tabbing to the value input doesn't lose focus
  actionLabelInput.addEventListener('change', () => {
    updateCombatantSilent(c.id, { action: actionLabelInput.value.trim() });
  });

  actionFormRow.append(actionKindSelect, actionLabelInput, actionValueInput);
  card.appendChild(actionFormRow);

  // Background modifiers (dex, haste, slow) - static context, not action choices
  const bgMods = c.modifiers.filter(
    (m) => m.kind === 'dex_reaction' || m.kind === 'haste' || m.kind === 'slow',
  );
  if (bgMods.length > 0) {
    const parts = bgMods.map((m) => {
      if (m.kind === 'haste') return `${m.label} (\u00f72)`;
      if (m.kind === 'slow') return `${m.label} (+10)`;
      return `${m.label} ${fmtSign(m.value)}`;
    });
    card.appendChild(el('p', { cls: 'card-other-mods', text: parts.join(' \u00b7 ') }));
  }

  // d10 input + live total
  const rollRow = el('div', { cls: 'roll-row' });

  const rollLabel = el('label', {
    text: 'd10 roll:',
    attrs: { for: `roll-${c.id}` },
  });

  const rollInput = el('input', {
    attrs: {
      type: 'number',
      id: `roll-${c.id}`,
      min: '1',
      max: '10',
      placeholder: '1–10',
    },
  }) as HTMLInputElement;
  if (c.d10Roll !== null) rollInput.value = String(c.d10Roll);

  const totalEl = el('span', {
    cls: 'initiative-total',
    attrs: { id: `total-${c.id}` },
    text: c.totalInitiative !== null ? String(c.totalInitiative) : '-',
  });

  rollInput.addEventListener('input', () => {
    // Update the total preview locally without touching state (avoids focus loss)
    const raw = parseInt(rollInput.value, 10);
    if (isNaN(raw) || raw < 1 || raw > 10) {
      totalEl.textContent = '\u2014';
      return;
    }
    totalEl.textContent = String(calcInitiative(raw, c.modifiers));
  });

  rollInput.addEventListener('change', () => {
    const raw = parseInt(rollInput.value, 10);
    if (isNaN(raw) || raw < 1 || raw > 10) {
      updateCombatant(c.id, { d10Roll: null, totalInitiative: null });
      totalEl.textContent = '\u2014';
      return;
    }
    const total = calcInitiative(raw, c.modifiers);
    totalEl.textContent = String(total);
    updateCombatant(c.id, { d10Roll: raw, totalInitiative: total });
  });

  rollRow.append(rollLabel, rollInput, el('span', { cls: 'roll-arrow', text: '\u2192' }), totalEl);
  card.appendChild(rollRow);

  return card;
}
