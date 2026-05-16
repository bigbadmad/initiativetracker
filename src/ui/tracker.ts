import type { Combatant } from '../types.ts';
import {
  getState,
  setState,
  applyDamage,
  applyHealing,
  startNewRound,
  resetEncounter,
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
    callout.appendChild(el('p', { cls: 'callout-label', text: `Segment ${currentSegment}: Acting:` }));
    actingNow.forEach((c) => {
      const nameSpan = el('span', { cls: `callout-name type-${c.type}`, text: c.name });
      callout.appendChild(nameSpan);
      // Show declared action, falling back to the weapon/spell modifier label from setup
      const fallbackMod = c.modifiers.find(
        (m) => m.kind === 'weapon_speed' || m.kind === 'spell_casting',
      );
      const displayAction = c.action || fallbackMod?.label;
      if (displayAction) {
        callout.appendChild(el('span', { cls: 'callout-action', text: displayAction }));
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
    actions.appendChild(
      btn(`Next: Segment ${nextSeg} →`, 'btn btn-primary btn-advance', () => {
        setState({ currentSegment: nextSeg });
      }),
    );
  } else {
    const confirmMsg = inSurprisePhase
      ? 'End the surprise round and begin initiative for Round 1?'
      : `End round ${roundNumber} and begin initiative for round ${roundNumber + 1}?`;
    actions.appendChild(
      btn('Next Round →', 'btn btn-primary btn-advance', () => {
        if (confirm(confirmMsg)) {
          startNewRound();
        }
      }),
    );
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

  // Initiative badge
  const initBadge = el('span', {
    cls: 'init-badge',
    text: c.totalInitiative !== null && c.totalInitiative < 99 ? String(c.totalInitiative) : '-',
  });
  card.appendChild(initBadge);

  // Name + type + acting indicator
  const nameBlock = el('div', { cls: 'card-name-block' });
  nameBlock.appendChild(el('span', { cls: 'card-name', text: c.name }));
  if (isActing) nameBlock.appendChild(el('span', { cls: 'acting-indicator', text: '\u2694' }));
  if (isSurprisedThisPhase)
    nameBlock.appendChild(el('span', { cls: 'badge badge-surprised', text: 'SURPRISED' }));

  // Show weapon / spell modifier labels from setup (e.g. "Longsword", "Magic Missile")
  const actionMods = c.modifiers.filter(
    (m) => m.kind === 'weapon_speed' || m.kind === 'spell_casting' || m.kind === 'other',
  );
  if (actionMods.length > 0) {
    nameBlock.appendChild(
      el('span', { cls: 'card-modifier-label', text: actionMods.map((m) => m.label).join(', ') }),
    );
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
