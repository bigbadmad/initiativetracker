import { getState, continueLoot, saveAndContinueLoot } from '../state.ts';
import { rollLairLoot } from '../data/loot.ts';
import type { LootResult } from '../types.ts';
import { el, iconBtn, faIcon } from './components.ts';

// Accumulates lair rolls made during the current loot screen visit.
// Keyed by lair type letter so rerolls replace the previous result.
// Reset each time renderLoot() runs (= each time the loot screen opens).
const rolledLairByType = new Map<string, LootResult>();

// -- Render loot screen -------------------------------------------------------

export function renderLoot(): HTMLElement {
  // Fresh loot screen — clear any rolls from a previous visit
  rolledLairByType.clear();

  const { pendingLoot } = getState();
  if (!pendingLoot) {
    // Shouldn't happen, but handle gracefully
    const fallback = el('div', { cls: 'screen loot-screen' });
    fallback.appendChild(el('p', { text: 'No loot data.' }));
    return fallback;
  }

  const root = el('div', { cls: 'screen loot-screen' });

  // -- Victory header ---------------------------------------------------------
  const header = el('header', { cls: 'loot-header' });
  const h1 = el('h1', { cls: 'loot-title' });
  h1.appendChild(faIcon('fa-solid fa-trophy'));
  h1.appendChild(document.createTextNode(' Encounter Complete'));
  header.appendChild(h1);
  header.appendChild(el('p', { cls: 'loot-subtitle', text: pendingLoot.encounterSummary }));
  root.appendChild(header);

  const body = el('div', { cls: 'loot-body' });
  root.appendChild(body);

  // -- Individual treasure ----------------------------------------------------
  const individualSection = el('section', { cls: 'loot-section' });
  individualSection.appendChild(el('h2', { cls: 'loot-section-title', text: 'Individual Treasure' }));
  individualSection.appendChild(el('p', { cls: 'loot-section-hint', text: 'Found on the bodies of the slain.' }));

  buildCoinBlock(pendingLoot, individualSection);
  buildGemBlock(pendingLoot.gems, individualSection);
  buildJewelryBlock(pendingLoot.jewelry, individualSection);
  buildMagicBlock(pendingLoot.magicItems, individualSection);

  const hasIndividual = pendingLoot.cp || pendingLoot.sp || pendingLoot.ep ||
    pendingLoot.gp || pendingLoot.pp || pendingLoot.gems.length ||
    pendingLoot.jewelry.length || pendingLoot.magicItems.length;

  if (!hasIndividual) {
    individualSection.appendChild(
      el('p', { cls: 'loot-empty', text: 'No individual treasure — these monsters carry nothing of value.' }),
    );
  }
  body.appendChild(individualSection);

  // -- Lair treasure ----------------------------------------------------------
  if (pendingLoot.lairTypes.length > 0) {
    const lairSection = el('section', { cls: 'loot-section loot-lair-section' });
    lairSection.appendChild(el('h2', { cls: 'loot-section-title', text: 'Lair Treasure' }));
    lairSection.appendChild(
      el('p', { cls: 'loot-section-hint', text: 'Roll if the party searches the monster\'s lair.' }),
    );

    pendingLoot.lairTypes.forEach((type) => {
      const lairWrap = el('div', { cls: 'lair-type-wrap' });

      // Header row: badge + saved indicator (shown after rolling)
      const headerRow = el('div', { cls: 'lair-header-row' });
      headerRow.appendChild(el('span', { cls: 'lair-type-badge', text: `Type ${type}` }));
      const savedBadge = el('span', { cls: 'lair-saved-badge' });
      savedBadge.appendChild(faIcon('fa-solid fa-check'));
      savedBadge.appendChild(document.createTextNode(' included in save'));
      savedBadge.style.display = 'none';
      headerRow.appendChild(savedBadge);
      lairWrap.appendChild(headerRow);

      const lairResultEl = el('div', { cls: 'lair-result' });
      lairResultEl.style.display = 'none';
      lairWrap.appendChild(lairResultEl);

      function applyRoll(result: LootResult) {
        // Store in accumulator (replaces any previous roll for this type)
        rolledLairByType.set(type, result);
        // Update DOM
        lairResultEl.innerHTML = '';
        buildLairResult(result, lairResultEl);

        const rerollBtn = iconBtn('fa-solid fa-rotate-right', 'Reroll', 'btn btn-secondary btn-sm', () => {
          applyRoll(rollLairLoot(type));
        });
        lairResultEl.appendChild(rerollBtn);
        lairResultEl.style.display = '';
        savedBadge.style.display = '';
        rollBtn.style.display = 'none';
      }

      const rollBtn = iconBtn('fa-solid fa-dice', `Roll Type ${type}`, 'btn btn-secondary', () => {
        applyRoll(rollLairLoot(type));
      });
      // Insert roll button before the result element
      lairWrap.insertBefore(rollBtn, lairResultEl);

      lairSection.appendChild(lairWrap);
    });

    body.appendChild(lairSection);
  }

  // -- XP section -------------------------------------------------------------
  if (pendingLoot.xp > 0) {
    body.appendChild(buildXPSection(pendingLoot));
  }

  // -- Footer: Save or Skip ---------------------------------------------------
  const footer = el('div', { cls: 'loot-footer' });

  footer.appendChild(
    iconBtn('fa-solid fa-floppy-disk', 'Save Loot & XP to Session', 'btn btn-primary btn-loot-continue', () => {
      saveAndContinueLoot(pendingLoot!, [...rolledLairByType.values()]);
    }),
  );

  footer.appendChild(
    iconBtn('fa-solid fa-arrow-right', 'Continue without Saving', 'btn btn-secondary', () => {
      continueLoot();
    }),
  );

  root.appendChild(footer);

  return root;
}

// -- XP section builder -------------------------------------------------------

function buildXPSection(loot: LootResult): HTMLElement {
  const section = el('section', { cls: 'loot-section loot-xp-section' });
  const title = el('h2', { cls: 'loot-section-title loot-xp-title' });
  title.appendChild(faIcon('fa-solid fa-star'));
  title.appendChild(document.createTextNode(' Experience Points'));
  section.appendChild(title);

  // Total row
  const totalRow = el('div', { cls: 'loot-row loot-xp-total-row' });
  const totalIcon = el('span', { cls: 'loot-row-icon' });
  totalIcon.appendChild(faIcon('fa-solid fa-star'));
  totalRow.appendChild(totalIcon);
  totalRow.appendChild(el('span', { cls: 'loot-row-label', text: 'Total XP' }));
  totalRow.appendChild(el('span', { cls: 'loot-row-value loot-xp-value', text: `${loot.xp.toLocaleString()} xp` }));
  section.appendChild(totalRow);

  const breakdown = el('ul', { cls: 'loot-item-list loot-xp-list' });

  // Monster XP breakdown
  if (loot.monsterXP > 0) {
    loot.xpBreakdown.forEach(({ name, count, xpEach, subtotal }) => {
      const line = count === 1
        ? `${name}: ${xpEach.toLocaleString()} xp`
        : `${count} × ${name}: ${count} × ${xpEach.toLocaleString()} = ${subtotal.toLocaleString()} xp`;
      breakdown.appendChild(el('li', { text: line }));
    });
  }

  // Treasure XP line
  if (loot.treasureXP > 0) {
    breakdown.appendChild(el('li', {
      cls: 'loot-xp-treasure',
      text: `Treasure value: ${loot.treasureXP.toLocaleString()} xp`,
    }));
  }

  if (breakdown.children.length > 0) section.appendChild(breakdown);

  section.appendChild(el('p', { cls: 'loot-section-hint', text: 'Divide equally among surviving party members.' }));
  return section;
}

// -- Section builders ----------------------------------------------------------

function buildCoinBlock(loot: LootResult, parent: HTMLElement): void {
  const coins: string[] = [];
  if (loot.cp) coins.push(`${loot.cp.toLocaleString()} cp`);
  if (loot.sp) coins.push(`${loot.sp.toLocaleString()} sp`);
  if (loot.ep) coins.push(`${loot.ep.toLocaleString()} ep`);
  if (loot.gp) coins.push(`${loot.gp.toLocaleString()} gp`);
  if (loot.pp) coins.push(`${loot.pp.toLocaleString()} pp`);
  if (coins.length === 0) return;

  const row = el('div', { cls: 'loot-row' });
  const icon = el('span', { cls: 'loot-row-icon' });
  icon.appendChild(faIcon('fa-solid fa-coins'));
  row.appendChild(icon);
  row.appendChild(el('span', { cls: 'loot-row-label', text: 'Coins' }));
  row.appendChild(el('span', { cls: 'loot-row-value', text: coins.join(' · ') }));
  parent.appendChild(row);
}

function buildGemBlock(gems: string[], parent: HTMLElement): void {
  if (gems.length === 0) return;

  const wrap = el('div', { cls: 'loot-list-wrap' });
  const header = el('div', { cls: 'loot-row' });
  const icon = el('span', { cls: 'loot-row-icon' });
  icon.appendChild(faIcon('fa-solid fa-gem'));
  header.appendChild(icon);
  header.appendChild(el('span', { cls: 'loot-row-label', text: `Gems (${gems.length})` }));
  wrap.appendChild(header);

  const list = el('ul', { cls: 'loot-item-list' });
  gems.forEach((g) => list.appendChild(el('li', { text: g })));
  wrap.appendChild(list);
  parent.appendChild(wrap);
}

function buildJewelryBlock(jewelry: string[], parent: HTMLElement): void {
  if (jewelry.length === 0) return;

  const wrap = el('div', { cls: 'loot-list-wrap' });
  const header = el('div', { cls: 'loot-row' });
  const icon = el('span', { cls: 'loot-row-icon' });
  icon.appendChild(faIcon('fa-solid fa-ring'));
  header.appendChild(icon);
  header.appendChild(el('span', { cls: 'loot-row-label', text: `Jewelry / Art (${jewelry.length})` }));
  wrap.appendChild(header);

  const list = el('ul', { cls: 'loot-item-list' });
  jewelry.forEach((j) => list.appendChild(el('li', { text: j })));
  wrap.appendChild(list);
  parent.appendChild(wrap);
}

function buildMagicBlock(items: string[], parent: HTMLElement, rerollable = false): void {
  if (items.length === 0) return;

  const wrap = el('div', { cls: 'loot-list-wrap' });
  const header = el('div', { cls: 'loot-row' });
  const icon = el('span', { cls: 'loot-row-icon' });
  icon.appendChild(faIcon('fa-solid fa-wand-sparkles'));
  header.appendChild(icon);
  header.appendChild(el('span', { cls: 'loot-row-label', text: `Magic Items (${items.length})` }));
  wrap.appendChild(header);

  const list = el('ul', { cls: 'loot-item-list loot-magic-list' });
  items.forEach((item) => {
    const li = el('li', { text: item });
    if (item.endsWith('(C)')) li.classList.add('loot-item-cursed');
    list.appendChild(li);
  });
  wrap.appendChild(list);

  if (rerollable) {
    wrap.appendChild(
      el('p', { cls: 'loot-magic-hint', text: 'Items marked (C) are cursed.' }),
    );
  }

  parent.appendChild(wrap);
}

function buildLairResult(loot: LootResult, container: HTMLElement): void {
  buildCoinBlock(loot, container);
  buildGemBlock(loot.gems, container);
  buildJewelryBlock(loot.jewelry, container);
  buildMagicBlock(loot.magicItems, container, true);
  if (loot.treasureXP > 0) {
    const xpRow = el('div', { cls: 'loot-row loot-xp-total-row' });
    const icon = el('span', { cls: 'loot-row-icon' });
    icon.appendChild(faIcon('fa-solid fa-star'));
    xpRow.appendChild(icon);
    xpRow.appendChild(el('span', { cls: 'loot-row-label', text: 'Treasure XP' }));
    xpRow.appendChild(el('span', { cls: 'loot-row-value loot-xp-value', text: `${loot.treasureXP.toLocaleString()} xp` }));
    container.appendChild(xpRow);
  }

  const hasAny = loot.cp || loot.sp || loot.ep || loot.gp || loot.pp ||
    loot.gems.length || loot.jewelry.length || loot.magicItems;

  if (!hasAny) {
    container.appendChild(
      el('p', { cls: 'loot-empty', text: 'No treasure present in this lair.' }),
    );
  }
}
