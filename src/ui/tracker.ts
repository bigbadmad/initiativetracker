import type { Combatant } from '../types.ts';
import {
  getState,
  setState,
  applyDamage,
  applyHealing,
  startNewRound,
  resetEncounter,
  updateCombatant,
  updateCombatantSilent,
} from '../state.ts';
import { sortByInitiative, getCombatantsAtSegment, nextActiveSegment, maxInitiativeSegment } from '../combat.ts';
import { el, btn } from './components.ts';

// -- Render combat tracker -----------------------------------------------------

export function renderTracker(): HTMLElement {
  const state = getState();
  const { combatants, currentSegment, roundNumber, inSurprisePhase } = state;

  const sorted = sortByInitiative(combatants);
  const active = sorted.filter((c) => c.isActive);
  const defeated = sorted.filter((c) => !c.isActive);

  const maxSegment = maxInitiativeSegment(combatants);
  const actingNow = getCombatantsAtSegment(combatants, currentSegment, inSurprisePhase);

  const root = el('div', { cls: 'screen tracker-screen' });

  // -- Header ------------------------------------------------------------------
  const header = el('header', { cls: 'screen-header' });
  const phaseLabel = inSurprisePhase ? 'Surprise Phase' : `Round ${roundNumber}`;
  header.appendChild(el('h1', { text: '⚔ Combat Tracker' }));
  header.appendChild(el('p', { cls: 'subtitle', text: phaseLabel }));
  root.appendChild(header);

  const layout = el('div', { cls: 'tracker-layout' });
  root.appendChild(layout);

  // -- Left column: combatant list ---------------------------------------------
  const leftCol = el('div', { cls: 'tracker-left' });
  layout.appendChild(leftCol);

  // Active combatants
  if (active.length === 0) {
    leftCol.appendChild(
      el('p', { cls: 'empty-hint', text: 'All enemies defeated!' }),
    );
  } else {
    active.forEach((c) => {
      const isActing = actingNow.some((a) => a.id === c.id);
      leftCol.appendChild(buildCombatantCard(c, isActing, inSurprisePhase));
    });
  }

  // Defeated section
  if (defeated.length > 0) {
    const defeatedSection = el('details', { cls: 'defeated-section' });
    defeatedSection.appendChild(
      el('summary', { text: `Defeated (${defeated.length})` }),
    );
    defeated.forEach((c) => {
      defeatedSection.appendChild(buildDefeatedRow(c));
    });
    leftCol.appendChild(defeatedSection);
  }

  // -- Right column: segment panel + actions -----------------------------------
  const rightCol = el('div', { cls: 'tracker-right' });
  layout.appendChild(rightCol);

  // Segment bar
  rightCol.appendChild(buildSegmentBar(currentSegment, maxSegment, actingNow));

  // Acting-now callout
  if (actingNow.length > 0) {
    const callout = el('div', { cls: 'acting-callout' });
    callout.appendChild(el('p', { cls: 'callout-label', text: `Segment ${currentSegment} - Acting` }));
    actingNow.forEach((c) => {
      const nameSpan = el('span', { cls: `callout-name type-${c.type}`, text: c.name });
      callout.appendChild(nameSpan);

      // Declared action label (weapon/spell name)
      const fallbackMod = c.modifiers.find(
        (m) => m.kind === 'weapon_speed' || m.kind === 'spell_casting',
      );
      const displayAction = c.action || fallbackMod?.label;
      if (displayAction) {
        callout.appendChild(el('span', { cls: 'callout-action', text: displayAction }));
      }

      // Combat reference stats — AC for players to know what they need to roll;
      // attacks/damage for the DM to know what to roll when the monster strikes.
      const combatParts: string[] = [];
      if (c.ac !== undefined) combatParts.push(`AC ${c.ac}`);
      if (c.attacks && c.damage) combatParts.push(`${c.attacks} att (${c.damage})`);
      else if (c.damage) combatParts.push(c.damage);
      if (c.thac0 !== undefined) combatParts.push(`THAC0 ${c.thac0}`);
      if (combatParts.length > 0) {
        callout.appendChild(
          el('span', { cls: 'callout-combat-info', text: combatParts.join(' · ') }),
        );
      }
    });
    rightCol.appendChild(callout);
  } else {
    rightCol.appendChild(
      el('div', {
        cls: 'acting-callout acting-empty',
        text: `Segment ${currentSegment}: No one acts.`,
      }),
    );
  }

  // Ties notice
  const tiedGroups = findTies(active.filter((c) => !c.isSurprised));
  if (tiedGroups.length > 0) {
    const tieNotice = el('div', { cls: 'notice notice-info' });
    tieNotice.appendChild(el('strong', { text: 'Simultaneous action: ' }));
    tieNotice.appendChild(
      document.createTextNode(
        tiedGroups.map((g) => g.map((c) => c.name).join(' & ')).join('; '),
      ),
    );
    rightCol.appendChild(tieNotice);
  }

  // Action buttons
  const actions = el('div', { cls: 'tracker-actions' });
  rightCol.appendChild(actions);

  // Advance segment - jump to next segment with actual activity, skipping empty ones
  const nextSeg = nextActiveSegment(combatants, currentSegment, maxSegment, inSurprisePhase);

  if (nextSeg !== null) {
    const advanceBtn = btn(`Next: Segment ${nextSeg} →`, 'btn btn-primary btn-advance', () => {
      setState({ currentSegment: nextSeg });
    });
    advanceBtn.dataset.advanceBtn = '1';
    actions.appendChild(advanceBtn);
  } else {
    const roundBtn = btn('Next Round →', 'btn btn-primary btn-advance', () => {
      startNewRound();
    });
    roundBtn.dataset.advanceBtn = '1';
    actions.appendChild(roundBtn);
  }

  actions.appendChild(
    btn('← Re-enter Initiative', 'btn btn-secondary', () => {
      setState({ phase: 'initiative' });
    }),
  );

  actions.appendChild(
    btn('End Encounter', 'btn btn-ghost', () => {
      if (confirm('End this encounter and return to setup?')) {
        resetEncounter();
      }
    }),
  );

  // Keyboard hint
  const kbHint = el('p', { cls: 'kb-hint', text: 'Space / → advances segments' });
  actions.appendChild(kbHint);

  return root;
}

// -- Combatant card ------------------------------------------------------------

function buildCombatantCard(
  c: Combatant,
  isActing: boolean,
  inSurprisePhase: boolean,
): HTMLElement {
  const isSurprisedThisPhase = inSurprisePhase && c.isSurprised;

  const card = el('div', {
    cls: [
      'tracker-card',
      `type-${c.type}`,
      isActing ? 'is-acting' : '',
      isSurprisedThisPhase ? 'is-surprised-inactive' : '',
    ]
      .filter(Boolean)
      .join(' '),
  });

  // Initiative badge column (current + previous round)
  const badgeCol = el('div', { cls: 'init-badge-col' });

  const initBadge = el('span', {
    cls: 'init-badge',
    text: c.totalInitiative !== null && c.totalInitiative < 99 ? String(c.totalInitiative) : '-',
  });
  badgeCol.appendChild(initBadge);

  if (c.prevInitiative !== null && c.prevInitiative < 99) {
    badgeCol.appendChild(el('span', { cls: 'prev-init-badge', text: `↑${c.prevInitiative}` }));
  }

  card.appendChild(badgeCol);

  // Name block — column layout: top row (name + indicators) + info rows
  const nameBlock = el('div', { cls: 'card-name-block' });

  // Top row: inline-editable name + acting indicator + surprised badge
  const nameRow = el('div', { cls: 'card-name-row' });

  const nameInput = el('input', {
    cls: 'card-name-input',
    attrs: { type: 'text', value: c.name, 'aria-label': 'Combatant name' },
  }) as HTMLInputElement;
  nameInput.addEventListener('input', () => {
    updateCombatantSilent(c.id, { name: nameInput.value });
  });
  nameInput.addEventListener('change', () => {
    updateCombatant(c.id, { name: nameInput.value });
  });
  // Prevent space from triggering global keyboard nav while typing
  nameInput.addEventListener('keydown', (e) => { e.stopPropagation(); });
  nameRow.appendChild(nameInput);

  if (isActing) nameRow.appendChild(el('span', { cls: 'acting-indicator', text: '⚔' }));
  if (isSurprisedThisPhase)
    nameRow.appendChild(el('span', { cls: 'badge badge-surprised', text: 'SURPRISED' }));
  nameBlock.appendChild(nameRow);

  // Weapon / spell modifier labels (e.g. "Longsword", "Magic Missile")
  const actionMods = c.modifiers.filter(
    (m) => m.kind === 'weapon_speed' || m.kind === 'spell_casting' || m.kind === 'other',
  );
  if (actionMods.length > 0) {
    nameBlock.appendChild(
      el('span', { cls: 'card-modifier-label', text: actionMods.map((m) => m.label).join(', ') }),
    );
  }

  // Combat reference line from library data: AC · attacks (damage) · THAC0
  if (c.ac !== undefined || c.attacks || c.damage || c.thac0 !== undefined) {
    const parts: string[] = [];
    if (c.ac !== undefined) parts.push(`AC ${c.ac}`);
    if (c.attacks && c.damage) parts.push(`${c.attacks} att (${c.damage})`);
    else if (c.attacks) parts.push(`${c.attacks} att`);
    else if (c.damage) parts.push(c.damage);
    if (c.thac0 !== undefined) parts.push(`THAC0 ${c.thac0}`);
    nameBlock.appendChild(el('span', { cls: 'card-combat-info', text: parts.join(' · ') }));
  }

  card.appendChild(nameBlock);

  // HP controls (monsters/NPCs only)
  if (c.type !== 'player' && c.currentHp !== null && c.maxHp !== null) {
    card.appendChild(buildHpControls(c));
  }

  return card;
}

// -- HP controls ---------------------------------------------------------------

function buildHpControls(c: Combatant): HTMLElement {
  const wrap = el('div', { cls: 'hp-controls' });

  const hpDisplay = el('span', {
    cls: ['hp-display', hpClass(c.currentHp!, c.maxHp!)],
    text: `${c.currentHp} / ${c.maxHp}`,
    attrs: { id: `hp-display-${c.id}` },
  });
  wrap.appendChild(hpDisplay);

  // Damage input + apply button
  const dmgWrap = el('div', { cls: 'dmg-wrap' });

  const dmgInput = el('input', {
    attrs: {
      type: 'number',
      min: '1',
      placeholder: 'dmg',
      id: `dmg-${c.id}`,
      'aria-label': 'Damage amount',
    },
  }) as HTMLInputElement;
  // Prevent space from advancing segments while typing a damage value
  dmgInput.addEventListener('keydown', (e) => e.stopPropagation());

  const dmgBtn = btn('−HP', 'btn btn-damage', () => {
    const amount = parseInt(dmgInput.value, 10);
    if (isNaN(amount) || amount <= 0) return;
    applyDamage(c.id, amount);
    dmgInput.value = '';
  });

  const healBtn = btn('+HP', 'btn btn-heal', () => {
    const amount = parseInt(dmgInput.value, 10);
    if (isNaN(amount) || amount <= 0) return;
    applyHealing(c.id, amount);
    dmgInput.value = '';
  });

  dmgWrap.append(dmgInput, dmgBtn, healBtn);
  wrap.appendChild(dmgWrap);

  return wrap;
}

// -- Segment bar ---------------------------------------------------------------

function buildSegmentBar(
  current: number,
  max: number,
  actingNow: Combatant[],
): HTMLElement {
  const wrap = el('div', { cls: 'segment-bar' });
  wrap.appendChild(el('p', { cls: 'segment-bar-label', text: 'Segments' }));

  const boxes = el('div', { cls: 'segment-boxes' });
  for (let i = 1; i <= max; i++) {
    const box = el('div', {
      cls: [
        'segment-box',
        i === current ? 'seg-current' : '',
        actingNow.length > 0 && i === current ? 'seg-has-actors' : '',
      ]
        .filter(Boolean)
        .join(' '),
      text: String(i),
    });
    boxes.appendChild(box);
  }
  wrap.appendChild(boxes);
  return wrap;
}

// -- Defeated row --------------------------------------------------------------

function buildDefeatedRow(c: Combatant): HTMLElement {
  const row = el('div', { cls: 'defeated-row' });
  row.appendChild(el('span', { cls: 'defeated-name', text: c.name }));
  if (c.currentHp !== null) {
    row.appendChild(el('span', { cls: 'defeated-hp', text: `HP: ${c.currentHp}` }));
  }
  return row;
}

// -- Helpers -------------------------------------------------------------------

function hpClass(current: number, max: number): string {
  const pct = current / max;
  if (pct <= 0.25) return 'hp-critical';
  if (pct <= 0.5) return 'hp-bloodied';
  return 'hp-healthy';
}

/** Find groups of active combatants with identical initiative totals (ties). */
function findTies(combatants: Combatant[]): Combatant[][] {
  const groups = new Map<number, Combatant[]>();
  for (const c of combatants) {
    if (c.totalInitiative === null || c.totalInitiative >= 99) continue;
    const existing = groups.get(c.totalInitiative) ?? [];
    existing.push(c);
    groups.set(c.totalInitiative, existing);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}
