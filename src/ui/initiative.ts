import type { Combatant } from '../types.ts';
import { getState, setState, updateCombatant } from '../state.ts';
import { calcInitiative, rollD10, netModifierOffset, describeModifiers } from '../combat.ts';
import { el, btn, fmtSign } from './components.ts';

// ── Render initiative entry screen ────────────────────────────────────────────

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
        text: `Surprise round active — ${state.surpriseSegments} segment(s). Surprised combatants cannot act.`,
      }),
    );
  }

  const grid = el('div', { cls: 'initiative-grid' });
  root.appendChild(grid);

  // Render a card per active combatant
  activeCombatants.forEach((c) => {
    grid.appendChild(buildInitiativeCard(c));
  });

  // ── Bottom action bar ───────────────────────────────────────────────────────
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
      (c) => c.isActive && !c.isSurprised && c.d10Roll === null,
    );
    if (missing.length > 0) {
      alert(`Missing d10 roll for: ${missing.map((c) => c.name).join(', ')}`);
      return;
    }

    // Surprised combatants get a sentinel initiative (acts after everything)
    current.combatants
      .filter((c) => c.isActive && c.isSurprised)
      .forEach((c) => {
        updateCombatant(c.id, { d10Roll: null, totalInitiative: 99 });
      });

    setState({ phase: 'combat', currentSegment: 1 });
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

// ── Individual combatant card ─────────────────────────────────────────────────

function buildInitiativeCard(c: Combatant): HTMLElement {
  const isSurprised = c.isSurprised;
  const card = el('div', {
    cls: ['initiative-card', `type-${c.type}`, isSurprised ? 'is-surprised' : ''].join(' ').trim(),
  });

  // Name + badges
  const nameRow = el('div', { cls: 'card-name-row' });
  nameRow.appendChild(el('span', { cls: 'card-name', text: c.name }));
  nameRow.appendChild(el('span', { cls: `badge badge-${c.type}`, text: c.type }));
  if (isSurprised) nameRow.appendChild(el('span', { cls: 'badge badge-surprised', text: 'SURPRISED' }));
  card.appendChild(nameRow);

  // Modifier summary
  const modOffset = netModifierOffset(c.modifiers);
  const hasHaste = c.modifiers.some((m) => m.kind === 'haste');
  const hasSlow = c.modifiers.some((m) => m.kind === 'slow');
  let modSummary = `Modifier: ${fmtSign(modOffset)}`;
  if (hasHaste) modSummary += ' + Haste (÷2)';
  if (hasSlow) modSummary += ' + Slow (+10)';
  card.appendChild(el('p', { cls: 'card-mods', text: modSummary }));

  // Modifier detail tooltip
  card.appendChild(
    el('p', { cls: 'card-mod-detail', text: describeModifiers(c.modifiers) }),
  );

  if (isSurprised) {
    card.appendChild(
      el('p', { cls: 'surprised-note', text: 'Cannot act during surprise segments.' }),
    );
    return card;
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
    text: c.totalInitiative !== null ? String(c.totalInitiative) : '—',
  });

  rollInput.addEventListener('input', () => {
    const raw = parseInt(rollInput.value, 10);
    if (isNaN(raw) || raw < 1 || raw > 10) {
      totalEl.textContent = '—';
      updateCombatant(c.id, { d10Roll: null, totalInitiative: null });
      return;
    }
    const total = calcInitiative(raw, c.modifiers);
    totalEl.textContent = String(total);
    updateCombatant(c.id, { d10Roll: raw, totalInitiative: total });
  });

  rollRow.append(rollLabel, rollInput, el('span', { cls: 'roll-arrow', text: '→' }), totalEl);
  card.appendChild(rollRow);

  return card;
}
