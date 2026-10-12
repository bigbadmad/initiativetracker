-- Milestone 2: remote declarations. A player picks an action; the server rolls their d10.
-- The DM client polls get_declarations, folds them into its own state with calcInitiative, and writes the
-- resulting totals back so each player can see their own (and only their own) initiative.
--
-- Rounds restart at 1 for every encounter, so a declaration is keyed on (encounter_id, round, combatant_id).
-- Keying on the combatant, not the player, means leaving and rejoining can never buy a second roll.

create table public.declarations (
  session_id   uuid not null references public.sessions(id) on delete cascade,
  encounter_id text not null,
  round        int  not null,
  combatant_id text not null,
  player_id    uuid references public.players(id) on delete set null,
  kind         text not null check (kind in ('weapon_speed', 'spell_casting')),
  label        text not null check (char_length(label) <= 40),
  value        int  not null check (value between 0 and 30),
  d10          int  not null check (d10 between 1 and 10),
  total        int,
  created_at   timestamptz not null default now(),
  primary key (session_id, encounter_id, round, combatant_id)
);

alter table public.declarations enable row level security;
revoke all on public.declarations from anon, authenticated;
grant select on public.declarations to authenticated;

-- Security definer for the same reason as is_session_member: players.auth_uid is not readable by clients.
create function public.is_own_player(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from players where id = p_player_id and auth_uid = auth.uid());
$$;

revoke all on function public.is_own_player(uuid) from public;
grant execute on function public.is_own_player(uuid) to authenticated;

-- A player reads only their own declaration (which includes the DM-computed total). Nobody writes directly.
create policy "players read their own declarations" on public.declarations
  for select to authenticated
  using (public.is_own_player(player_id));

alter publication supabase_realtime add table public.declarations;

-- Player: declare an action for the current round and receive the server-rolled d10.
-- Everything that gates the declaration is read from the DM's published view, so the DM stays authoritative.
create function public.submit_declaration(p_session_id uuid, p_kind text, p_label text, p_value int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me       players;
  sess     sessions;
  v        jsonb;
  pl       jsonb;
  enc      text;
  rnd      int;
  surprise boolean;
  roll     int;
  v_label  text;
  inserted int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_kind is null or p_kind not in ('weapon_speed', 'spell_casting') then
    raise exception 'invalid action kind';
  end if;
  if p_value is null or p_value < 0 or p_value > 30 then
    raise exception 'invalid speed';
  end if;
  v_label := left(trim(coalesce(p_label, '')), 40);

  select * into me from players where session_id = p_session_id and auth_uid = auth.uid();
  if not found then
    raise exception 'not a member of this session';
  end if;
  if me.combatant_id is null then
    raise exception 'no character selected';
  end if;

  -- Share-lock the session so this runs strictly before or after a close_session / publish_view.
  select * into sess from sessions where id = p_session_id for share;
  if sess.closed_at is not null then
    raise exception 'session closed';
  end if;

  select view into v from session_views where session_id = p_session_id;
  enc := v->>'encounterId';
  rnd := (v->>'roundNumber')::int;
  surprise := coalesce((v->>'inSurprisePhase')::boolean, false);
  if v->>'phase' is distinct from 'initiative' or enc is null or rnd is null then
    raise exception 'declarations are not open';
  end if;

  select elem into pl
    from jsonb_array_elements(coalesce(v->'players', '[]'::jsonb)) elem
    where elem->>'id' = me.combatant_id
    limit 1;
  if pl is null then
    raise exception 'character is not in this encounter';
  end if;
  if not coalesce((pl->>'isActive')::boolean, false)
     or coalesce((pl->>'isHorsDeCombat')::boolean, false)
     or (surprise and coalesce((pl->>'isSurprised')::boolean, false)) then
    raise exception 'character cannot act this round';
  end if;
  if coalesce((pl->>'hasDeclared')::boolean, false) then
    raise exception 'already declared';
  end if;

  roll := 1 + floor(random() * 10)::int;
  insert into declarations (session_id, encounter_id, round, combatant_id, player_id, kind, label, value, d10)
    values (p_session_id, enc, rnd, me.combatant_id, me.id, p_kind, v_label, p_value, roll)
    on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    raise exception 'already declared';
  end if;

  return jsonb_build_object('encounterId', enc, 'round', rnd, 'd10', roll);
end;
$$;

-- DM: fetch the declarations made for one round of one encounter.
create function public.get_declarations(p_code text, p_secret text, p_encounter_id text, p_round int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess sessions;
begin
  if p_secret is null then
    raise exception 'invalid session or secret';
  end if;
  select * into sess from sessions where code = upper(p_code);
  if not found or sess.dm_secret_hash is distinct from crypt(p_secret, sess.dm_secret_hash) then
    raise exception 'invalid session or secret';
  end if;
  if sess.closed_at is not null then
    raise exception 'session closed';
  end if;
  return (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'combatantId', combatant_id, 'kind', kind, 'label', label, 'value', value, 'd10', d10
      )),
      '[]'::jsonb
    )
    from declarations
    where session_id = sess.id and encounter_id = p_encounter_id and round = p_round
  );
end;
$$;

-- DM: write back the initiative totals it computed, so each player can read their own.
-- p_totals is an object of { combatantId: total }. Rows that do not exist are simply not touched.
create function public.set_declaration_totals(p_code text, p_secret text, p_encounter_id text, p_round int, p_totals jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess sessions;
begin
  if p_secret is null then
    raise exception 'invalid session or secret';
  end if;
  select * into sess from sessions where code = upper(p_code) for update;
  if not found or sess.dm_secret_hash is distinct from crypt(p_secret, sess.dm_secret_hash) then
    raise exception 'invalid session or secret';
  end if;
  if sess.closed_at is not null then
    raise exception 'session closed';
  end if;
  if p_totals is null or jsonb_typeof(p_totals) <> 'object' then
    raise exception 'totals must be an object';
  end if;
  update declarations d
    set total = t.value::int
    from jsonb_each_text(p_totals) t
    where d.session_id = sess.id
      and d.encounter_id = p_encounter_id
      and d.round = p_round
      and d.combatant_id = t.key;
end;
$$;

revoke all on function
  public.submit_declaration(uuid, text, text, int),
  public.get_declarations(text, text, text, int),
  public.set_declaration_totals(text, text, text, int, jsonb)
from public;
grant execute on function public.submit_declaration(uuid, text, text, int) to authenticated;
grant execute on function
  public.get_declarations(text, text, text, int),
  public.set_declaration_totals(text, text, text, int, jsonb)
to anon, authenticated;
