// Live smoke test for the declaration functions (migrations 0005 + 0006), run against the real
// Supabase project named in .env.local:   node supabase/smoke/declarations.cjs
//
// - Creates one throwaway session and closes it at the end. Closed sessions are removed by
//   supabase/maintenance/cleanup_sessions.sql.
// - Uses two anonymous sign-ins. Supabase rate-limits those per IP, so do not run it in a loop.
// - The DM acts as the anon role with its secret, exactly as the app does.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const player = (id, name, over = {}) => ({ id, name, hasDeclared: false, isActive: true, isHorsDeCombat: false, isSurprised: false, ...over });

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
  const publish = async (v) => {
    const r = await dm.rpc('publish_view', { p_code: code, p_secret: secret, p_view: v, p_revision: ++rev });
    if (r.error) console.log('publish failed', r.error.message);
    return r;
  };
  const baseView = (over = {}) => ({
    phase: 'initiative', encounterId: 'enc-A', roundNumber: 1, currentSegment: 1, inSurprisePhase: false,
    acting: [],
    players: [player('c1', 'Thorin'), player('c2', 'Elf'), player('c3', 'Monk', { isHorsDeCombat: true }),
      player('c4', 'Rogue', { isSurprised: true }), player('c5', 'Cleric'), player('c6', 'Bard', { hasDeclared: true }),
      player('c7', 'Fighter', { isActive: false })],
    ...over,
  });
  await publish(baseView());

  const s1 = await p1.auth.signInAnonymously();
  const s2 = await p2.auth.signInAnonymously();
  if (s1.error || s2.error) { console.log('FAIL anonymous sign-in', (s1.error || s2.error).message); process.exit(1); }

  const j1 = await p1.rpc('join_session', { p_code: code, p_name: 'Sam' });
  const j2 = await p2.rpc('join_session', { p_code: code, p_name: 'Alex' });
  const sessionId = j1.data.session_id;
  const submit = (c, kind = 'weapon_speed', label = 'Long sword', value = 5) =>
    c.rpc('submit_declaration', { p_session_id: sessionId, p_kind: kind, p_label: label, p_value: value });

  // -- Input and membership checks ------------------------------------------------
  rejects('submit before choosing a character is rejected', await submit(p1), 'no character selected');
  await p1.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c1' });
  await p2.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c2' });
  rejects('invalid action kind is rejected', await submit(p1, 'haste'), 'invalid action kind');
  rejects('speed above 30 is rejected', await submit(p1, 'weapon_speed', 'x', 31), 'invalid speed');
  rejects('negative speed is rejected', await submit(p1, 'weapon_speed', 'x', -1), 'invalid speed');
  const outsider = await createClient(url, key, opts).rpc('submit_declaration', { p_session_id: sessionId, p_kind: 'weapon_speed', p_label: 'x', p_value: 1 });
  check('unauthenticated submit is rejected', !!outsider.error, errText(outsider));

  // -- A normal declaration ---------------------------------------------------------
  const d1 = await submit(p1);
  check('p1 declares and gets a server-rolled d10 in 1..10', !d1.error && d1.data.d10 >= 1 && d1.data.d10 <= 10, JSON.stringify(d1.data ?? d1.error.message));
  check('result carries the encounter and round', d1.data && d1.data.encounterId === 'enc-A' && d1.data.round === 1);
  rejects('declaring twice is rejected', await submit(p1), 'already declared');

  // -- Direct table access must be impossible ----------------------------------------
  const ins = await p1.from('declarations').insert({ session_id: sessionId, encounter_id: 'enc-A', round: 1, combatant_id: 'c9', kind: 'weapon_speed', label: 'x', value: 1, d10: 1 });
  check('direct insert is denied', !!ins.error, errText(ins));
  const upd = await p1.from('declarations').update({ d10: 1, total: 1 }).eq('session_id', sessionId).select();
  check('direct update changes nothing', !!upd.error || (upd.data ?? []).length === 0, upd.error ? upd.error.message : `${(upd.data ?? []).length} rows`);
  const del = await p1.from('declarations').delete().eq('session_id', sessionId).select();
  check('direct delete removes nothing', !!del.error || (del.data ?? []).length === 0, del.error ? del.error.message : `${(del.data ?? []).length} rows`);

  // -- Row-level security: own rows only ---------------------------------------------
  const r2empty = await p2.from('declarations').select('combatant_id');
  check('p2 sees none of p1\'s declaration', !r2empty.error && r2empty.data.length === 0, r2empty.error ? r2empty.error.message : `${r2empty.data.length} rows`);
  const d2 = await submit(p2, 'spell_casting', 'Magic missile', 3);
  check('p2 declares a spell', !d2.error, errText(d2));
  const r1 = await p1.from('declarations').select('combatant_id, d10, total');
  const r2 = await p2.from('declarations').select('combatant_id, d10, total');
  check('p1 sees exactly their own row', !r1.error && r1.data.length === 1 && r1.data[0].combatant_id === 'c1', JSON.stringify(r1.data));
  check('p2 sees exactly their own row', !r2.error && r2.data.length === 1 && r2.data[0].combatant_id === 'c2', JSON.stringify(r2.data));
  check('own total is empty until the DM writes it', r1.data && r1.data[0].total === null);

  // -- DM reads and totals --------------------------------------------------------------
  const get = (s, enc = 'enc-A', round = 1) => dm.rpc('get_declarations', { p_code: code, p_secret: s, p_encounter_id: enc, p_round: round });
  const g = await get(secret);
  check('DM gets both declarations', !g.error && g.data.length === 2, g.error ? g.error.message : String(g.data.length));
  check('DM rows carry action and d10', g.data && g.data.find((d) => d.combatantId === 'c2').kind === 'spell_casting' && g.data.find((d) => d.combatantId === 'c2').label === 'Magic missile');
  rejects('get_declarations with NULL secret is rejected', await get(null), 'invalid session or secret');
  rejects('get_declarations with wrong secret is rejected', await get('wrong-wrong-wrong-wrong'), 'invalid session or secret');
  const gOther = await get(secret, 'enc-B', 1);
  check('another encounter has no declarations', !gOther.error && gOther.data.length === 0);

  const tot = (s, totals) => dm.rpc('set_declaration_totals', { p_code: code, p_secret: s, p_encounter_id: 'enc-A', p_round: 1, p_totals: totals });
  rejects('set totals with NULL secret is rejected', await tot(null, { c1: 1 }), 'invalid session or secret');
  rejects('set totals with wrong secret is rejected', await tot('wrong-wrong-wrong-wrong', { c1: 1 }), 'invalid session or secret');
  rejects('set totals rejects a non-object', await tot(secret, [1, 2]), 'totals must be an object');

  // Realtime: p1 should hear about its own total being written.
  let heard = false;
  const channel = p1.channel('smoke-decl').on('postgres_changes', { event: '*', schema: 'public', table: 'declarations', filter: `session_id=eq.${sessionId}` }, () => { heard = true; });
  await new Promise((resolve) => channel.subscribe((s) => { if (s === 'SUBSCRIBED') resolve(); }));
  await sleep(4000);
  const t =await tot(secret, { c1: 12, c2: 9, nobody: 4 });
  check('DM writes totals (unknown ids are ignored)', !t.error, errText(t));
  for (let i = 0; i < 40 && !heard; i++) await sleep(250);
  check('p1 receives a realtime event for the total', heard);
  await p1.removeChannel(channel);

  const a1 = await p1.from('declarations').select('total');
  const a2 = await p2.from('declarations').select('total');
  check('p1 reads their own total (12)', a1.data && a1.data.length === 1 && a1.data[0].total === 12, JSON.stringify(a1.data));
  check('p2 reads their own total (9)', a2.data && a2.data.length === 1 && a2.data[0].total === 9, JSON.stringify(a2.data));

  // 0006: totals are the full set for the round, so an omitted character's stale total is cleared.
  const cleared = await tot(secret, { c1: 12 });
  const b1 = await p1.from('declarations').select('total');
  const b2 = await p2.from('declarations').select('total');
  check('omitting a character clears their stale total', !cleared.error && b2.data && b2.data.length === 1 && b2.data[0].total === null, JSON.stringify(b2.data));
  check('a character still in the payload keeps theirs', b1.data && b1.data[0].total === 12, JSON.stringify(b1.data));
  const restored = await tot(secret, { c1: 12, c2: 9 });
  check('a total can be written again afterwards', !restored.error);

  // -- Gating from the DM's published view ----------------------------------------------
  await p2.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c3' });
  rejects('hors de combat character cannot declare', await submit(p2), 'cannot act this round');
  await p2.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c7' });
  rejects('defeated character cannot declare', await submit(p2), 'cannot act this round');
  await p2.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c6' });
  rejects('character the DM already rolled for cannot declare', await submit(p2), 'already declared');
  await p2.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c4' });
  await publish(baseView({ inSurprisePhase: true, roundNumber: 0, encounterId: 'enc-S' }));
  rejects('surprised character cannot declare in the surprise phase', await submit(p2), 'cannot act this round');
  await publish(baseView({ inSurprisePhase: false, roundNumber: 1, encounterId: 'enc-S' }));
  const surprisedOk = await submit(p2);
  check('the same character can declare once the surprise phase is over', !surprisedOk.error, errText(surprisedOk));
  await p2.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c5' });
  await publish(baseView({ phase: 'combat' }));
  rejects('declarations are closed outside the initiative phase', await submit(p2), 'declarations are not open');
  await publish(baseView({ phase: 'setup' }));
  rejects('declarations are closed during setup', await submit(p2), 'declarations are not open');

  // -- A new encounter starts fresh; leaving cannot buy a re-roll --------------------------
  await publish(baseView({ encounterId: 'enc-B' }));
  const again = await submit(p1);
  check('same character declares again in a new encounter', !again.error && again.data.encounterId === 'enc-B', errText(again));
  const gA = await get(secret, 'enc-A', 1);
  const gB = await get(secret, 'enc-B', 1);
  check('first encounter\'s declarations are untouched', !gA.error && gA.data.length === 2, String(gA.data?.length));
  check('second encounter has only the new one', !gB.error && gB.data.length === 1 && gB.data[0].combatantId === 'c1', JSON.stringify(gB.data));

  await p1.rpc('leave_session', { p_session_id: sessionId });
  await p1.rpc('join_session', { p_code: code, p_name: 'Sam' });
  await p1.rpc('claim_combatant', { p_session_id: sessionId, p_combatant_id: 'c1' });
  rejects('leaving and rejoining does not allow a second roll', await submit(p1), 'already declared');

  // -- Closing the session ----------------------------------------------------------------
  await dm.rpc('close_session', { p_code: code, p_secret: secret });
  rejects('get_declarations on a closed session is rejected', await get(secret), 'session closed');
  rejects('totals on a closed session are rejected', await tot(secret, { c1: 1 }), 'session closed');
  rejects('submit on a closed session is rejected', await submit(p2), 'session closed');

  console.log(failures === 0 ? 'ALL PASSED' : `${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.log('SCRIPT ERROR', e); process.exit(1); });
