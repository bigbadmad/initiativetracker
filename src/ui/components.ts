// Shared DOM helpers used across all screens.

/** Create an element with optional class names and inner text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: {
    cls?: string | string[];
    text?: string;
    html?: string;
    attrs?: Record<string, string>;
  } = {},
): HTMLElementTagNameMap[K] {
  const elem = document.createElement(tag);
  if (opts.cls) {
    const classes = Array.isArray(opts.cls)
      ? opts.cls.flatMap((c) => c.split(' ').filter(Boolean))
      : opts.cls.split(' ').filter(Boolean);
    elem.classList.add(...classes);
  }
  if (opts.text !== undefined) elem.textContent = opts.text;
  if (opts.html !== undefined) elem.innerHTML = opts.html;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      elem.setAttribute(k, v);
    }
  }
  return elem;
}

/** Create a button element. */
export function btn(
  text: string,
  cls: string,
  onClick: (e: MouseEvent) => void,
): HTMLButtonElement {
  const b = el('button', { cls, text });
  b.addEventListener('click', onClick);
  return b;
}

/** Create a labeled text/number input. */
export function labeledInput(opts: {
  label: string;
  id: string;
  type: string;
  value?: string;
  min?: string;
  max?: string;
  placeholder?: string;
  cls?: string;
}): HTMLDivElement {
  const wrap = el('div', { cls: ['form-group', opts.cls ?? ''].join(' ').trim() });
  const lbl = el('label', { text: opts.label, attrs: { for: opts.id } });
  const inp = el('input', {
    attrs: {
      type: opts.type,
      id: opts.id,
      name: opts.id,
      ...(opts.value !== undefined ? { value: opts.value } : {}),
      ...(opts.min !== undefined ? { min: opts.min } : {}),
      ...(opts.max !== undefined ? { max: opts.max } : {}),
      ...(opts.placeholder !== undefined ? { placeholder: opts.placeholder } : {}),
    },
  });
  wrap.append(lbl, inp);
  return wrap;
}

/** Render a small chip badge. */
export function chip(text: string, extraCls = ''): HTMLSpanElement {
  return el('span', { cls: ['chip', extraCls].join(' ').trim(), text });
}

/** Empty and re-render a container. */
export function mount(container: HTMLElement, child: HTMLElement): void {
  container.innerHTML = '';
  container.appendChild(child);
}

/** Generate a short unique ID. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Format a modifier value with sign for display. */
export function fmtSign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** Create a Font Awesome icon element (aria-hidden — purely decorative). */
export function faIcon(cls: string): HTMLElement {
  const i = document.createElement('i');
  i.className = cls;
  i.setAttribute('aria-hidden', 'true');
  return i;
}

/**
 * Create a button with a Font Awesome icon.
 * Pass an empty `label` for icon-only buttons; supply `ariaLabel` for accessibility.
 */
export function iconBtn(
  iconCls: string,
  label: string,
  cls: string,
  onClick: (e: MouseEvent) => void,
  ariaLabel?: string,
): HTMLButtonElement {
  const b = el('button', { cls });
  b.appendChild(faIcon(iconCls));
  if (label) b.appendChild(document.createTextNode(' ' + label));
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', onClick);
  return b;
}
