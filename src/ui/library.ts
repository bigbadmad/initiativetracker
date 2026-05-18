import type { MonsterTemplate, MonsterTag } from '../data/monsters.ts';
import { MONSTERS, ALL_TAGS, TAG_LABELS } from '../data/monsters.ts';
import { el, btn, iconBtn } from './components.ts';

/**
 * Open the monster library modal. Calls onSelect with the chosen template,
 * then closes itself. The caller is responsible for filling form fields.
 */
export function openMonsterLibrary(onSelect: (m: MonsterTemplate) => void): void {
  let search = '';
  let activeTag: MonsterTag | 'all' = 'all';

  // -- Backdrop + panel --------------------------------------------------------
  const backdrop = el('div', { cls: 'modal-backdrop' });
  const panel = el('div', { cls: 'modal-panel library-modal' });
  backdrop.appendChild(panel);

  function close() {
    document.removeEventListener('keydown', onKeyDown);
    document.body.removeChild(backdrop);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKeyDown);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  // -- Header ------------------------------------------------------------------
  const header = el('div', { cls: 'modal-header' });

  const titleEl = el('h2', { cls: 'modal-title', text: 'Monster Library' });
  header.appendChild(titleEl);

  const searchInput = el('input', {
    cls: 'modal-search',
    attrs: {
      type: 'text',
      placeholder: 'Search by name…',
      autocomplete: 'off',
      spellcheck: 'false',
    },
  }) as HTMLInputElement;
  header.appendChild(searchInput);

  header.appendChild(iconBtn('fa-solid fa-xmark', '', 'btn btn-ghost modal-close-btn', close, 'Close'));
  panel.appendChild(header);

  // -- Tag filters -------------------------------------------------------------
  const filtersRow = el('div', { cls: 'modal-filters' });

  const filterBtns = new Map<MonsterTag | 'all', HTMLButtonElement>();

  function makeFilterBtn(key: MonsterTag | 'all', label: string) {
    const b = btn(label, 'btn filter-btn', () => {
      activeTag = key;
      filterBtns.forEach((fb, k) => fb.classList.toggle('filter-active', k === activeTag));
      rebuildList();
    });
    if (key === activeTag) b.classList.add('filter-active');
    filterBtns.set(key, b);
    filtersRow.appendChild(b);
  }

  makeFilterBtn('all', 'All');
  ALL_TAGS.forEach((tag) => makeFilterBtn(tag, TAG_LABELS[tag]));
  panel.appendChild(filtersRow);

  // -- Monster list ------------------------------------------------------------
  const bodyEl = el('div', { cls: 'modal-body' });
  panel.appendChild(bodyEl);

  function getFiltered(): MonsterTemplate[] {
    const q = search.toLowerCase();
    return MONSTERS.filter((m) => {
      const tagMatch = activeTag === 'all' || m.tags.includes(activeTag);
      const nameMatch = !q || m.name.toLowerCase().includes(q);
      return tagMatch && nameMatch;
    });
  }

  let listEl = buildList();
  bodyEl.appendChild(listEl);

  function buildList(): HTMLElement {
    const filtered = getFiltered();
    const wrap = el('div', { cls: 'library-list' });

    if (filtered.length === 0) {
      wrap.appendChild(el('p', { cls: 'empty-hint library-empty', text: 'No monsters match.' }));
      return wrap;
    }

    filtered.forEach((m) => {
      const row = el('div', { cls: 'library-row' });

      const info = el('div', { cls: 'library-row-info' });

      const nameEl = el('span', { cls: 'lib-name', text: m.name });
      info.appendChild(nameEl);

      const stats = el('span', { cls: 'lib-stats' });
      stats.appendChild(el('span', { cls: 'lib-stat', text: `HD ${m.hd}` }));
      stats.appendChild(el('span', { cls: 'lib-stat', text: `HP ${m.hp}` }));
      stats.appendChild(el('span', { cls: 'lib-stat', text: `AC ${m.ac}` }));
      stats.appendChild(el('span', { cls: 'lib-stat', text: `THAC0 ${m.thac0}` }));
      stats.appendChild(el('span', { cls: 'lib-stat lib-stat--atk', text: `${m.attacks} att (${m.damage})` }));
      info.appendChild(stats);

      if (m.notes) {
        info.appendChild(el('span', { cls: 'lib-notes', text: m.notes }));
      }

      row.appendChild(info);

      row.appendChild(
        iconBtn('fa-solid fa-check', 'Select', 'btn btn-secondary btn-sm btn-lib-select', () => {
          onSelect(m);
          close();
        }),
      );

      wrap.appendChild(row);
    });

    return wrap;
  }

  function rebuildList() {
    bodyEl.removeChild(listEl);
    listEl = buildList();
    bodyEl.appendChild(listEl);
  }

  searchInput.addEventListener('input', () => {
    search = searchInput.value;
    rebuildList();
  });

  // -- Mount and focus ---------------------------------------------------------
  document.body.appendChild(backdrop);
  // Defer focus so the modal is in the DOM first
  requestAnimationFrame(() => searchInput.focus());
}
