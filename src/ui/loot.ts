import { getState, continueLoot } from '../state.ts';
import { rollLairLoot } from '../data/loot.ts';
import type { LootResult } from '../types.ts';
import { el, iconBtn, faIcon } from './components.ts';

// -- Render loot screen -------------------------------------------------------

export function renderLoot(): HTMLElement {
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
    pendingLoot.jewelry.length || pendingLoot.magicItems;

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

      const typeLabel = el('span', { cls: 'lair-type-badge', text: `Type ${type}` });
      lairWrap.appendChild(typeLabel);

      const rollBtn = iconBtn('fa-solid fa-dice', `Roll Type ${type}`, 'btn btn-secondary', () => {
        const result = rollLairLoot(type);
        rollBtn.style.display = 'none';
        lairResultEl.innerHTML = '';
        buildLairResult(result, lairResultEl);
        lairResultEl.style.display = '';

        // Reroll button
        const rerollBtn = iconBtn('fa-solid fa-rotate-right', 'Reroll', 'btn btn-secondary btn-sm', () => {
          const r2 = rollLairLoot(type);
          lairResultEl.innerHTML = '';
          buildLairResult(r2, lairResultEl);
        });
        lairResultEl.appendChild(rerollBtn);
      });
      lairWrap.appendChild(rollBtn);

      const lairResultEl = el('div', { cls: 'lair-result' });
      lairResultEl.style.display = 'none';
      lairWrap.appendChild(lairResultEl);

      lairSection.appendChild(lairWrap);
    });

    body.appendChild(lairSection);
  }

  // -- Continue button --------------------------------------------------------
  const footer = el('div', { cls: 'loot-footer' });
  footer.appendChild(
    iconBtn('fa-solid fa-arrow-right', 'Continue to Setup', 'btn btn-primary btn-loot-continue', () => {
      continueLoot();
    }),
  );
  root.appendChild(footer);

  return root;
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

function buildMagicBlock(count: number, parent: HTMLElement): void {
  if (count === 0) return;

  const row = el('div', { cls: 'loot-row loot-magic-row' });
  const icon = el('span', { cls: 'loot-row-icon' });
  icon.appendChild(faIcon('fa-solid fa-wand-sparkles'));
  row.appendChild(icon);
  row.appendChild(el('span', { cls: 'loot-row-label', text: 'Magic Items' }));
  const valueEl = el('span', { cls: 'loot-row-value loot-magic-value', text: `${count} item${count !== 1 ? 's' : ''}` });
  row.appendChild(valueEl);
  parent.appendChild(row);

  const hint = el('p', { cls: 'loot-magic-hint', text: 'Determine specifics using DMG random magic item tables.' });
  parent.appendChild(hint);
}

function buildLairResult(loot: LootResult, container: HTMLElement): void {
  buildCoinBlock(loot, container);
  buildGemBlock(loot.gems, container);
  buildJewelryBlock(loot.jewelry, container);
  buildMagicBlock(loot.magicItems, container);

  const hasAny = loot.cp || loot.sp || loot.ep || loot.gp || loot.pp ||
    loot.gems.length || loot.jewelry.length || loot.magicItems;

  if (!hasAny) {
    container.appendChild(
      el('p', { cls: 'loot-empty', text: 'No treasure present in this lair.' }),
    );
  }
}
