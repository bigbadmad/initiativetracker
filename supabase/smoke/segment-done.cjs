// Live smoke test for the segment Done functions (migration 0007), run against the real Supabase
// project named in .env.local:   node supabase/smoke/segment-done.cjs
//
// - Creates one throwaway session and closes it at the end (see supabase/maintenance/cleanup_sessions.sql).
// - Uses two anonymous sign-ins. Supabase rate-limits those per IP, so do not run it in a loop.
// - Exits non-zero if any check fails.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const { createClient } = require(path.join(root, 'node_modules', '@supabase', 'supabase-js'));

const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}
const errText = (r) => (r.error ? r.error.message : 'no error');
function rejects(name, r, needle) {
  check(name, !!r.error && r.error.message.includes(needle), errText(r));
}
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

(async () => {
  const dm = createClient(url, key, opts);
  const p1 = createClient(url, key, opts);
  const p2 = createClient(url, key, opts);
  const secret = 'smoke-secret-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  const created = await dm.rpc('create_session', { p_secret: secret });
  if (created.error) { console.log('FAIL create_session', created.error.message); process.exit(1); }
  const code = created.data;
  console.log('session', code);

  let rev = Date.now();
  const publish = (v) => dm.rpc('publish_view', { p_code: code, p_secret: secret, p_view: v, p_revision: ++rev });
  const pl = (id, name) => ({ id, name, hasDeclared: true, isActive: true, isHorsDeCombat: false, isSurprised: false });
  const view = (over = {}) => ({
    phase: 'combat', encounterId: 'enc-A', roundNumber: 1, currentSegment: 5, inSurprisePhase: false,
    acting: [
      { id: 'c1', name: 'Thorin', type: 'player', done: false },
      { id: 'c2', name: 'Elf', type: 'player', done: false },
      { id: 'm1', name: 'Orc', type: 'monster', done: false },
    ],
    players: [pl('c1', 'Thorin'), pl('c2', 'Elf'), pl('c3', 'Monk'), pl('c9', 'Odd')],
    ...over,
  });
  await publish(view());

  const s1 = await p1.auth.signInAnonymously();
  const s2 = await p2.auth.signInAnonymously();
  if (s1.error || s2.error) { console.log('FAIL anonymous sign-in', (s1.error || s2.error).message); process.exit(1); }
  const j1 = await p1.rpc('join_session', { p_code: code, p_name: 'Sam' });
  await p2.rpc('join_session', { p_code: code, p_name: 'Alex' });
  const sessionId = j1.data.session_id;
  const done = (c) => c.rpc('mark_done', { p_session_id: sessionId });
  const getDone = (s, enc = 'enc-A', round = 1, seg = 5) =>
    dm.rpc('get_segment_done', { p_code: code, p_secret: s, p_encounter_id: enc, p_round: round, p_segment: seg });

  // -- Who may tap -------------------------------------------------------------------------
  const anon = await createClient(url, key, opts).rpc('mark_done', { p_session_id: sessionId });
  check('unauthenticated mark_done is rejected', !!anon.error, errText(anon));
  rejects('mark_done before choosing a character is rejected', await done(p1), 'no character selected');
  await p1.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c1' });
  await p2.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c2' });

  const d1 = await done(p1);
  check('an acting player can tap Done', !d1.error && d1.data.segment === 5 && d1.data.encounterId === 'enc-A', JSON.stringify(d1.data ?? d1.error.message));
  const again = await done(p1);
  check('tapping again is harmless', !again.error, errText(again));

  // -- What the DM sees ----------------------------------------------------------------------
  const g = await getDone(secret);
  check('DM sees exactly who has tapped', !g.error && sameSet(g.data.done, ['c1']), JSON.stringify(g.data));
  check('DM sees which characters have a player seated', !g.error && sameSet(g.data.remote, ['c1', 'c2']), JSON.stringify(g.data));
  rejects('get_segment_done with NULL secret is rejected', await getDone(null), 'invalid session or secret');
  rejects('get_segment_done with wrong secret is rejected', await getDone('wrong-wrong-wrong-wrong'), 'invalid session or secret');
  const other = await getDone(secret, 'enc-B');
  check('another encounter has no taps', !other.error && other.data.done.length === 0);

  // -- Gating from the DM's published view ------------------------------------------------------
  await p2.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c3' });
  rejects('a character who is not acting cannot tap', await done(p2), 'not your turn');
  await p2.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c2' });
  const ok2 = await done(p2);
  check('the second acting player can tap', !ok2.error, errText(ok2));
  const g2 = await getDone(secret);
  check('both taps are recorded', !g2.error && sameSet(g2.data.done, ['c1', 'c2']), JSON.stringify(g2.data));

  await publish(view({ acting: [{ id: 'c9', name: 'Odd', type: 'monster', done: false }] }));
  await p2.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c9' });
  rejects('a character listed as a monster cannot tap', await done(p2), 'not your turn');

  await publish(view({ phase: 'initiative' }));
  rejects('Done is closed outside combat', await done(p1), 'combat is not running');

  // -- Taps belong to their segment ----------------------------------------------------------------
  await publish(view({ currentSegment: 6, acting: [{ id: 'c1', name: 'Thorin', type: 'player', done: false }] }));
  const seg6before = await getDone(secret, 'enc-A', 1, 6);
  check('a new segment starts with no taps', !seg6before.error && seg6before.data.done.length === 0, JSON.stringify(seg6before.data));
  const t6 = await done(p1);
  check('the same player can tap in the next segment', !t6.error && t6.data.segment === 6, errText(t6));
  const seg6 = await getDone(secret, 'enc-A', 1, 6);
  const seg5 = await getDone(secret, 'enc-A', 1, 5);
  check('segment 6 has the new tap', !seg6.error && sameSet(seg6.data.done, ['c1']), JSON.stringify(seg6.data));
  check('segment 5 is untouched', !seg5.error && sameSet(seg5.data.done, ['c1', 'c2']), JSON.stringify(seg5.data));

  // -- No direct access ------------------------------------------------------------------------------
  const read = await p1.from('segment_done').select('*');
  check('players cannot read the table', !!read.error || (read.data ?? []).length === 0, read.error ? read.error.message : `${read.data.length} rows`);
  const ins = await p1.from('segment_done').insert({ session_id: sessionId, encounter_id: 'enc-A', round: 1, segment: 7, combatant_id: 'c1' });
  check('players cannot insert directly', !!ins.error, errText(ins));

  // -- Closing ---------------------------------------------------------------------------------------------
  await dm.rpc('close_session', { p_code: code, p_secret: secret });
  rejects('get_segment_done on a closed session is rejected', await getDone(secret), 'session closed');
  rejects('mark_done on a closed session is rejected', await done(p1), 'session closed');

  console.log(failures === 0 ? 'ALL PASSED' : `${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.log('SCRIPT ERROR', e); process.exit(1); });
