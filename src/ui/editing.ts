/**
 * True while the DM is typing in a field or has a button held down, when a re-render (or a state
 * transition that causes one) would eat their input or their click. Anything that arrives over
 * the network should wait for this to be false.
 */
export function dmIsMidEdit(): boolean {
  const app = document.getElementById('app');
  if (!app) return false;
  const active = document.activeElement;
  const typing =
    active !== null &&
    app.contains(active) &&
    (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
  return typing || app.querySelector(':active') !== null;
}
