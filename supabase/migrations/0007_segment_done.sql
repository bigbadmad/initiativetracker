-- Milestone 3: the segment "Done" loop. An acting player taps Done; the DM sees who has finished.
-- Done is information for the DM, never a gate: nothing here can block advancing.
--
-- The table is unreadable by clients. The DM reads it through a secret-gated function and republishes
-- a `done` flag on each acting player in the public view, so players see it through the view they
-- already receive, with no player-facing read policy or realtime table.

create table public.segment_done (
  session_id   uuid not null references public.sessions(id) on delete cascade,
  encounter_id text not null,
  round        int  not null,
  segment      int  not null,
  combatant_id text not null,
  created_at   timestamptz not null default now(),
  primary key (session_id, encounter_id, round, segment, combatant_id)
);

alter table public.segment_done enable row level security;
revoke all on public.segment_done from anon, authenticated;

-- Player: tell the DM this character has finished acting in the segment on screen.
-- Gated on the DM's published view, so only a player whose character is acting right now can mark done.
create function public.mark_done(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me   players;
  sess sessions;
  v    jsonb;
  enc  text;
  rnd  int;
  seg  int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select * into me from players where session_id = p_session_id and auth_uid = auth.uid();
  if not found then
    raise exception 'not a member of this session';
  end if;
  if me.combatant_id is null then
    raise exception 'no character selected';
  end if;

  -- Share-lock so this runs strictly before or after a close_session / publish_view.
  select * into sess from sessions where id = p_session_id for share;
  if sess.closed_at is not null then
    raise exception 'session closed';
  end if;

  select view into v from session_views where session_id = p_session_id;
  enc := v->>'encounterId';
  rnd := (v->>'roundNumber')::int;
  seg := (v->>'currentSegment')::int;
  if v->>'phase' is distinct from 'combat' or enc is null or rnd is null or seg is null then
    raise exception 'combat is not running';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(v->'acting', '[]'::jsonb)) a
    where a->>'id' = me.combatant_id and a->>'type' = 'player'
  ) then
    raise exception 'not your turn';
  end if;

  insert into segment_done (session_id, encounter_id, round, segment, combatant_id)
    values (p_session_id, enc, rnd, seg, me.combatant_id)
    on conflict do nothing;

  return jsonb_build_object('encounterId', enc, 'round', rnd, 'segment', seg);
end;
$$;

-- DM: who has tapped Done for one segment, and which characters have a player seated on them.
-- `remote` lets the DM tell "waiting on a player" from "plays with dice at the table".
create function public.get_segment_done(p_code text, p_secret text, p_encounter_id text, p_round int, p_segment int)
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
  return jsonb_build_object(
    'done', (
      select coalesce(jsonb_agg(combatant_id), '[]'::jsonb)
      from segment_done
      where session_id = sess.id and encounter_id = p_encounter_id and round = p_round and segment = p_segment
    ),
    'remote', (
      select coalesce(jsonb_agg(combatant_id), '[]'::jsonb)
      from players
      where session_id = sess.id and combatant_id is not null
    )
  );
end;
$$;

revoke all on function
  public.mark_done(uuid),
  public.get_segment_done(text, text, text, int, int)
from public;
grant execute on function public.mark_done(uuid) to authenticated;
grant execute on function public.get_segment_done(text, text, text, int, int) to anon, authenticated;
