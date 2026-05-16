import type { Combatant, CombatantType, Modifier, ModifierKind } from '../types.ts';
import {
  addCombatant,
  removeCombatant,
  updateCombatant,
  getState,
  beginInitiativePhase,
} from '../state.ts';
import { el, btn, uid, chip, fmtSign } from './components.ts';

// -- Modifier form data --------------------------------------------------------

const MOD_KIND_LABELS: Record<ModifierKind, string> = {
  weapon_speed: 'Weapon Speed',
  spell_casting: 'Spell Casting Time',
  dex_reaction: 'Dex Reaction Adj',
  haste: 'Haste',
  slow: 'Slow',
  other: 'Other',
};

// Kinds that have no numeric value (they're flags)
const VALUELESS_KINDS: ModifierKind[] = ['haste', 'slow'];

// -- Build the setup screen ----------------------------------------------------

export function renderSetup(): HTMLElement {
  const root = el('div', { cls: 'screen setup-screen' });

  // Header
  const header = el('header', { cls: 'screen-header' });
  header.appendChild(el('h1', { text: 'AD&D 2e Initiative Tracker' }));
  header.appendChild(el('p', { cls: 'subtitle', text: 'Encounter Setup' }));
  root.appendChild(header);

  const body = el('div', { cls: 'setup-body' });
  root.appendChild(body);

  // -- Combatant list ----------------------------------------------------------
  const listSection = el('section', { cls: 'combatant-list-section' });
  body.appendChild(listSection);

  listSection.appendChild(el('h2', { text: 'Combatants' }));

  const combatantList = el('div', { cls: 'combatant-list' });
  listSection.appendChild(combatantList);

  function refreshList() {
    combatantList.innerHTML = '';
    const current = getState().combatants;
    if (current.length === 0) {
      combatantList.appendChild(
        el('p', { cls: 'empty-hint', text: 'No combatants yet. Add players and monsters below.' }),
      );
    } else {
      current.forEach((c) => {
        combatantList.appendChild(buildCombatantRow(c, refreshList));
      });
    }
  }
  refreshList();

  // -- Add combatant forms -----------------------------------------------------
  const formsRow = el('div', { cls: 'add-forms-row' });
  body.appendChild(formsRow);

  formsRow.appendChild(buildAddForm('player', refreshList));
  formsRow.appendChild(buildAddForm('monster', refreshList));

  // -- Start button ------------------------------------------------------------
  const startBtn = btn('Start Encounter →', 'btn btn-primary btn-start', () => {
    const { combatants } = getState();
    if (combatants.length < 2) {
      alert('Add at least 2 combatants before starting.');
      return;
    }
    beginInitiativePhase();
  });
  body.appendChild(startBtn);

  return root;
}

// -- Combatant row in the setup list ------------------------------------------

function buildCombatantRow(c: Combatant, onUpdate: () => void): HTMLElement {
  const row = el('div', { cls: ['combatant-row', `type-${c.type}`] });

  const info = el('div', { cls: 'combatant-info' });
  info.appendChild(el('span', { cls: 'combatant-name', text: c.name }));
  info.appendChild(el('span', { cls: `badge badge-${c.type}`, text: c.type }));

  if (c.maxHp !== null) {
    info.appendChild(el('span', { cls: 'badge badge-hp', text: `HP: ${c.maxHp}` }));
  }

  const modChips = el('div', { cls: 'mod-chips' });
  if (c.modifiers.length > 0) {
    c.modifiers.forEach((m) => {
      const label = VALUELESS_KINDS.includes(m.kind)
        ? m.label
        : `${m.label}: ${fmtSign(m.kind === 'dex_reaction' ? -m.value : m.value)}`;
      modChips.appendChild(chip(label, `mod-${m.kind}`));
    });
  }
  info.appendChild(modChips);

  row.appendChild(info);

  // Surprised toggle
  const surpriseLabel = el('label', { cls: 'surprise-toggle' });
  const surpriseCheck = el('input', { attrs: { type: 'checkbox' } });
  (surpriseCheck as HTMLInputElement).checked = c.isSurprised;
  surpriseCheck.addEventListener('change', () => {
    updateCombatant(c.id, { isSurprised: (surpriseCheck as HTMLInputElement).checked });
    onUpdate();
  });
  surpriseLabel.appendChild(surpriseCheck);
  surpriseLabel.appendChild(document.createTextNode(' Surprised'));
  row.appendChild(surpriseLabel);

  // Remove button
  row.appendChild(
    btn('✕', 'btn btn-remove', () => {
      removeCombatant(c.id);
      onUpdate();
    }),
  );

  return row;
}

// -- Add-combatant form --------------------------------------------------------

function buildAddForm(type: CombatantType, onAdd: () => void): HTMLElement {
  const isMonster = type !== 'player';
  const title = type === 'player' ? 'Add Player' : 'Add Monster / NPC';

  const card = el('div', { cls: ['add-form-card', `add-form-${type}`] });
  card.appendChild(el('h3', { text: title }));

  // Name input
  const nameWrap = el('div', { cls: 'form-group' });
  const nameInput = el('input', {
    attrs: { type: 'text', placeholder: 'Name', id: `name-${type}` },
  });
  nameWrap.appendChild(nameInput);
  card.appendChild(nameWrap);

  // HP + Quantity inputs (monsters only)
  let hpInput: HTMLInputElement | null = null;
  let qtyInput: HTMLInputElement | null = null;
  if (isMonster) {
    const hpRow = el('div', { cls: 'form-row-inline' });
    hpInput = el('input', {
      attrs: { type: 'number', placeholder: 'Max HP', min: '1', id: `hp-${type}` },
    }) as HTMLInputElement;
    qtyInput = el('input', {
      attrs: { type: 'number', placeholder: 'Qty', min: '1', max: '20', value: '1', id: `qty-${type}` },
    }) as HTMLInputElement;
    const qtyLabel = el('label', { text: '\u00d7', attrs: { for: `qty-${type}`, title: 'Quantity' }, cls: 'qty-label' });
    hpRow.append(hpInput, qtyLabel, qtyInput);
    card.appendChild(hpRow);
  }

  // Modifiers builder
  const mods: Modifier[] = [];
  const modListEl = el('div', { cls: 'mod-list' });
  card.appendChild(el('p', { cls: 'form-label', text: 'Modifiers:' }));
  card.appendChild(modListEl);

  function refreshModList() {
    modListEl.innerHTML = '';
    mods.forEach((m, i) => {
      const row = el('div', { cls: 'mod-row' });
      const desc = VALUELESS_KINDS.includes(m.kind)
        ? m.label
        : `${m.label}: ${fmtSign(m.kind === 'dex_reaction' ? -m.value : m.value)}`;
      row.appendChild(el('span', { text: desc }));
      row.appendChild(
        btn('✕', 'btn btn-remove-sm', () => {
          mods.splice(i, 1);
          refreshModList();
        }),
      );
      modListEl.appendChild(row);
    });
  }

  // Add modifier sub-form
  const modForm = el('div', { cls: 'mod-form' });

  const kindSelect = el('select', { cls: 'mod-kind-select' }) as HTMLSelectElement;
  (Object.keys(MOD_KIND_LABELS) as ModifierKind[]).forEach((k) => {
    const opt = el('option', { text: MOD_KIND_LABELS[k], attrs: { value: k } });
    kindSelect.appendChild(opt);
  });

  const modLabelInput = el('input', {
    attrs: { type: 'text', placeholder: 'Label (e.g. Long Sword)' },
  }) as HTMLInputElement;

  const modValueInput = el('input', {
    attrs: { type: 'number', placeholder: 'Value', min: '-20', max: '20' },
  }) as HTMLInputElement;
  modValueInput.value = '0';

  // Hide value input for valueless kinds
  function updateValueVisibility() {
    modValueInput.style.display = VALUELESS_KINDS.includes(
      kindSelect.value as ModifierKind,
    )
      ? 'none'
      : '';
  }
  kindSelect.addEventListener('change', updateValueVisibility);
  updateValueVisibility();

  const addModBtn = btn('+', 'btn btn-secondary btn-add-mod', () => {
    const kind = kindSelect.value as ModifierKind;
    const label = modLabelInput.value.trim() || MOD_KIND_LABELS[kind];
    const value = VALUELESS_KINDS.includes(kind) ? 0 : parseInt(modValueInput.value, 10) || 0;
    mods.push({ id: uid(), kind, value, label });
    modLabelInput.value = '';
    modValueInput.value = '0';
    refreshModList();
  });

  modForm.append(kindSelect, modLabelInput, modValueInput, addModBtn);
  card.appendChild(modForm);

  // Submit
  const addBtn = btn(`Add ${type === 'player' ? 'Player' : 'Monster/NPC'}`, 'btn btn-primary', () => {
    const name = (nameInput as HTMLInputElement).value.trim();
    if (!name) {
      alert('Please enter a name.');
      return;
    }
    const maxHp = isMonster && hpInput ? parseInt(hpInput.value, 10) || null : null;
    const qty = isMonster && qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;

    for (let i = 0; i < qty; i++) {
      const combatant: Combatant = {
        id: uid(),
        name: qty > 1 ? `${name} ${i + 1}` : name,
        type,
        maxHp,
        currentHp: maxHp,
        modifiers: [...mods],
        d10Roll: null,
        totalInitiative: null,
        isSurprised: false,
        isActive: true,
        action: '',
      };
      addCombatant(combatant);
    }

    // Reset form
    (nameInput as HTMLInputElement).value = '';
    if (hpInput) hpInput.value = '';
    if (qtyInput) qtyInput.value = '1';
    mods.length = 0;
    refreshModList();
    onAdd();
  });
  card.appendChild(addBtn);

  return card;
}
