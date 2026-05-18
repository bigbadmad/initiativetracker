import type { Combatant, CombatantType, Modifier, ModifierKind } from '../types.ts';
import type { AppState } from '../types.ts';
import { openMonsterLibrary } from './library.ts';
import type { MonsterTemplate } from '../data/monsters.ts';
import { rollHD } from '../data/monsters.ts';
import {
  addCombatant,
  removeCombatant,
  updateCombatant,
  updateCombatantSilent,
  getState,
  beginInitiativePhase,
  reorderCombatants,
  importState,
} from '../state.ts';
import { el, uid, chip, fmtSign, iconBtn, faIcon } from './components.ts';

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

// -- Drag state ---------------------------------------------------------------

let dragId: string | null = null;

// -- Last library selection (used in submit handler for per-monster HP rolling) -

let lastLibraryTemplate: MonsterTemplate | null = null;

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

  // Section header with export/import toolbar
  const sectionHeader = el('div', { cls: 'section-header-row' });
  sectionHeader.appendChild(el('h2', { text: 'Combatants' }));
  sectionHeader.appendChild(buildExportImportToolbar());
  listSection.appendChild(sectionHeader);

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
  const startBtn = iconBtn('fa-solid fa-play', 'Start Encounter', 'btn btn-primary btn-start', () => {
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

// -- Export / Import toolbar ---------------------------------------------------

function buildExportImportToolbar(): HTMLElement {
  const toolbar = el('div', { cls: 'setup-toolbar' });

  // Export
  toolbar.appendChild(
    iconBtn('fa-solid fa-file-export', 'Export', 'btn btn-secondary btn-toolbar', () => {
      const json = JSON.stringify(getState(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'encounter.json';
      a.click();
      URL.revokeObjectURL(url);
    }),
  );

  // Import — hidden file input triggered by a visible button
  const fileInput = el('input', {
    attrs: { type: 'file', accept: '.json' },
    cls: 'import-file-input',
  }) as HTMLInputElement;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as AppState;
        if (!parsed.phase || !Array.isArray(parsed.combatants)) {
          alert('Invalid encounter file.');
          return;
        }
        importState(parsed);
      } catch {
        alert('Could not read encounter file.');
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  const importBtn = iconBtn('fa-solid fa-file-import', 'Import', 'btn btn-secondary btn-toolbar', () => {
    fileInput.click();
  });

  toolbar.appendChild(fileInput);
  toolbar.appendChild(importBtn);

  return toolbar;
}

// -- Track which combatant has its edit panel open ----------------------------

let editingCombatantId: string | null = null;

// -- Combatant row in the setup list ------------------------------------------

function buildCombatantRow(c: Combatant, onUpdate: () => void): HTMLElement {
  const isEditing = c.id === editingCombatantId;
  const wrapper = el('div', { cls: 'combatant-row-wrap' });

  // -- Drag-to-reorder ----------------------------------------------------------
  wrapper.setAttribute('draggable', 'true');

  wrapper.addEventListener('dragstart', (e) => {
    dragId = c.id;
    wrapper.classList.add('is-dragging');
    (e as DragEvent).dataTransfer!.effectAllowed = 'move';
  });

  wrapper.addEventListener('dragend', () => {
    dragId = null;
    wrapper.classList.remove('is-dragging');
    document.querySelectorAll<HTMLElement>('.drag-over').forEach((el) =>
      el.classList.remove('drag-over'),
    );
  });

  wrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    (e as DragEvent).dataTransfer!.dropEffect = 'move';
    wrapper.classList.add('drag-over');
  });

  wrapper.addEventListener('dragleave', (e) => {
    if (!wrapper.contains((e as DragEvent).relatedTarget as Node | null)) {
      wrapper.classList.remove('drag-over');
    }
  });

  wrapper.addEventListener('drop', (e) => {
    e.preventDefault();
    wrapper.classList.remove('drag-over');
    const fromId = dragId;
    dragId = null;
    if (fromId === null || fromId === c.id) return;
    const combatants = getState().combatants;
    const fromIndex = combatants.findIndex((x) => x.id === fromId);
    const toIndex = combatants.findIndex((x) => x.id === c.id);
    if (fromIndex === -1 || toIndex === -1) return;
    reorderCombatants(fromIndex, toIndex);
  });

  // -- Main row -----------------------------------------------------------------
  const mainRow = el('div', {
    cls: ['combatant-row', `type-${c.type}`, c.isSurprised ? 'is-surprised-row' : ''],
  });

  // Drag handle
  const dragHandle = el('span', { cls: 'drag-handle', attrs: { 'aria-hidden': 'true' } });
  dragHandle.appendChild(faIcon('fa-solid fa-grip-vertical'));
  mainRow.appendChild(dragHandle);

  const info = el('div', { cls: 'combatant-info' });
  info.appendChild(el('span', { cls: 'combatant-name', text: c.name }));
  info.appendChild(el('span', { cls: `badge badge-${c.type}`, text: c.type }));

  if (c.maxHp !== null) {
    info.appendChild(el('span', { cls: 'badge badge-hp', text: `HP: ${c.maxHp}` }));
  }
  if (c.isSurprised) {
    info.appendChild(el('span', { cls: 'badge badge-surprised', text: 'Surprised' }));
  }

  const modChips = el('div', { cls: 'mod-chips' });
  c.modifiers.forEach((m) => {
    const label = VALUELESS_KINDS.includes(m.kind)
      ? m.label
      : `${m.label}: ${fmtSign(m.value)}`;
    modChips.appendChild(chip(label, `mod-${m.kind}`));
  });
  info.appendChild(modChips);

  mainRow.appendChild(info);

  // Right-side controls
  const controls = el('div', { cls: 'combatant-controls' });

  const surpriseLabel = el('label', { cls: 'surprise-toggle' });
  const surpriseCheck = el('input', { attrs: { type: 'checkbox' } });
  (surpriseCheck as HTMLInputElement).checked = c.isSurprised;
  surpriseCheck.addEventListener('change', () => {
    updateCombatant(c.id, { isSurprised: (surpriseCheck as HTMLInputElement).checked });
  });
  surpriseLabel.appendChild(surpriseCheck);
  surpriseLabel.appendChild(document.createTextNode(' Surprised'));
  controls.appendChild(surpriseLabel);

  controls.appendChild(
    iconBtn('fa-solid fa-pencil', '', `btn btn-icon${isEditing ? ' btn-icon-active' : ''}`, () => {
      editingCombatantId = isEditing ? null : c.id;
      onUpdate();
    }, 'Edit combatant'),
  );

  controls.appendChild(
    iconBtn('fa-solid fa-xmark', '', 'btn btn-remove', () => {
      editingCombatantId = null;
      removeCombatant(c.id);
    }, 'Remove combatant'),
  );

  mainRow.appendChild(controls);
  wrapper.appendChild(mainRow);

  if (isEditing) {
    wrapper.appendChild(buildEditPanel(c));
  }

  return wrapper;
}

// -- Inline edit panel --------------------------------------------------------

function buildEditPanel(c: Combatant): HTMLElement {
  const panel = el('div', { cls: 'edit-panel' });

  // Name + HP fields
  const fieldsRow = el('div', { cls: 'edit-fields-row' });

  const nameGroup = el('div', { cls: 'edit-field-group' });
  nameGroup.appendChild(el('label', { text: 'Name' }));
  const nameInput = el('input', {
    attrs: { type: 'text', value: c.name, placeholder: 'Name' },
  }) as HTMLInputElement;
  nameInput.addEventListener('input', () => {
    updateCombatantSilent(c.id, { name: nameInput.value });
  });
  nameGroup.appendChild(nameInput);
  fieldsRow.appendChild(nameGroup);

  if (c.maxHp !== null) {
    const hpGroup = el('div', { cls: 'edit-field-group' });
    hpGroup.appendChild(el('label', { text: 'Max HP' }));
    const hpInput = el('input', {
      attrs: { type: 'number', min: '1', value: String(c.maxHp), placeholder: 'Max HP' },
    }) as HTMLInputElement;
    hpInput.addEventListener('change', () => {
      const hp = parseInt(hpInput.value, 10);
      if (!isNaN(hp) && hp > 0) {
        updateCombatant(c.id, {
          maxHp: hp,
          currentHp: c.currentHp !== null ? Math.min(c.currentHp, hp) : hp,
        });
      }
    });
    hpGroup.appendChild(hpInput);
    fieldsRow.appendChild(hpGroup);
  }

  panel.appendChild(fieldsRow);

  // Modifiers
  const modSection = el('div', { cls: 'edit-mod-section' });
  modSection.appendChild(el('p', { cls: 'form-label', text: 'Modifiers:' }));

  const modList = el('div', { cls: 'mod-list' });
  c.modifiers.forEach((m) => {
    const modRow = el('div', { cls: 'mod-row' });
    const desc = VALUELESS_KINDS.includes(m.kind)
      ? m.label
      : `${m.label}: ${fmtSign(m.value)}`;
    modRow.appendChild(el('span', { text: desc }));
    modRow.appendChild(
      iconBtn('fa-solid fa-xmark', '', 'btn btn-remove-sm', () => {
        updateCombatant(c.id, { modifiers: c.modifiers.filter((x) => x.id !== m.id) });
      }, 'Remove modifier'),
    );
    modList.appendChild(modRow);
  });
  modSection.appendChild(modList);

  const addModForm = el('div', { cls: 'mod-form' });

  const epKindSelect = el('select', { cls: 'mod-kind-select' }) as HTMLSelectElement;
  (Object.keys(MOD_KIND_LABELS) as ModifierKind[]).forEach((k) => {
    epKindSelect.appendChild(el('option', { text: MOD_KIND_LABELS[k], attrs: { value: k } }));
  });

  const epLabelInput = el('input', {
    attrs: { type: 'text', placeholder: 'Label (e.g. Long Sword)' },
  }) as HTMLInputElement;

  const epValueInput = el('input', {
    attrs: { type: 'number', placeholder: 'Value', min: '-20', max: '20' },
  }) as HTMLInputElement;
  epValueInput.value = '0';

  function updateValVis() {
    epValueInput.style.display = VALUELESS_KINDS.includes(epKindSelect.value as ModifierKind) ? 'none' : '';
  }
  epKindSelect.addEventListener('change', updateValVis);
  updateValVis();

  addModForm.append(
    epKindSelect,
    epLabelInput,
    epValueInput,
    iconBtn('fa-solid fa-plus', '', 'btn btn-secondary btn-add-mod', () => {
      const kind = epKindSelect.value as ModifierKind;
      const label = epLabelInput.value.trim() || MOD_KIND_LABELS[kind];
      const value = VALUELESS_KINDS.includes(kind) ? 0 : parseInt(epValueInput.value, 10) || 0;
      updateCombatant(c.id, {
        modifiers: [...c.modifiers, { id: uid(), kind, value, label }],
      });
    }, 'Add modifier'),
  );

  modSection.appendChild(addModForm);
  panel.appendChild(modSection);

  return panel;
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
  // Browse Library button — monsters only, placed after the name input
  if (isMonster) {
    card.appendChild(
      iconBtn('fa-solid fa-book-open', 'Browse Monster Library', 'btn btn-secondary btn-library', () => {
        openMonsterLibrary((template) => {
          lastLibraryTemplate = template;
          (nameInput as HTMLInputElement).value = template.name;
          // Roll HP from actual dice rather than using the average
          if (hpInput) hpInput.value = String(rollHD(template.hd));
        });
      }),
    );
  }
  let qtyInput: HTMLInputElement | null = null;
  if (isMonster) {
    const hpRow = el('div', { cls: 'form-row-inline' });
    hpInput = el('input', {
      attrs: { type: 'number', placeholder: 'Max HP', min: '1', id: `hp-${type}` },
    }) as HTMLInputElement;
    qtyInput = el('input', {
      attrs: { type: 'number', placeholder: 'Qty', min: '1', max: '20', value: '1', id: `qty-${type}` },
    }) as HTMLInputElement;
    const qtyLabel = el('label', { text: '×', attrs: { for: `qty-${type}`, title: 'Quantity' }, cls: 'qty-label' });
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
        : `${m.label}: ${fmtSign(m.value)}`;
      row.appendChild(el('span', { text: desc }));
      row.appendChild(
        iconBtn('fa-solid fa-xmark', '', 'btn btn-remove-sm', () => {
          mods.splice(i, 1);
          refreshModList();
        }, 'Remove modifier'),
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

  const addModBtn = iconBtn('fa-solid fa-plus', '', 'btn btn-secondary btn-add-mod', () => {
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
  const addBtnIcon = type === 'player' ? 'fa-solid fa-user-plus' : 'fa-solid fa-dragon';
  const addBtnLabel = type === 'player' ? 'Add Player' : 'Add Monster/NPC';
  const addBtn = iconBtn(addBtnIcon, addBtnLabel, 'btn btn-primary', () => {
    const name = (nameInput as HTMLInputElement).value.trim();
    if (!name) {
      alert('Please enter a name.');
      return;
    }
    const qty = isMonster && qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;
    const libTemplate = isMonster ? lastLibraryTemplate : null;

    // Base HP from the form field (used for qty=1 or manual entry)
    const formHp = isMonster && hpInput ? parseInt(hpInput.value, 10) || null : null;

    for (let i = 0; i < qty; i++) {
      // When adding multiple from library, roll HP independently for each
      const maxHp = libTemplate && qty > 1
        ? rollHD(libTemplate.hd)
        : formHp;

      // Build the modifier list, auto-adding speed factor from library if present
      const combatantMods: Modifier[] = [...mods];
      if (libTemplate?.speed !== undefined) {
        combatantMods.push({
          id: uid(),
          kind: 'weapon_speed',
          value: libTemplate.speed,
          label: 'Atk Speed',
        });
      }

      const combatant: Combatant = {
        id: uid(),
        name: qty > 1 ? `${name} ${i + 1}` : name,
        type,
        maxHp,
        currentHp: maxHp,
        modifiers: combatantMods,
        d10Roll: null,
        totalInitiative: null,
        prevInitiative: null,
        isSurprised: false,
        isHorsDeCombat: false,
        atRange: false,
        targetId: null,
        isActive: true,
        action: '',
        // Combat reference stats from the library (displayed in the tracker)
        ...(libTemplate ? {
          ac: libTemplate.ac,
          attacks: libTemplate.attacks,
          damage: libTemplate.damage,
          thac0: libTemplate.thac0,
        } : {}),
      };
      addCombatant(combatant);
    }

    // Reset form and library state
    lastLibraryTemplate = null;
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
