-- PR review fixes: ordered publishes, session close, combatant claims, narrower player reads.
-- Deploy the matching client at the same time: publish_view and join_session change signature.

alter table public.session_views add column revision bigint not null default 0;
alter table public.sessions      add column closed_at timestamptz;
alter table public.players       add column combatant_id text;

create unique index players_one_claim_per_combatant
  on public.players (session_id, combatant_id)
  where combatant_id is not null;

-- Members may read the roster, but never other members' auth_uid.
revoke select on public.players from authenticated;
grant select (id, session_id, name, combatant_id) on public.players to authenticated;

-- DM: publish a view. Stale (lower or equal revision) publishes are silently ignored.
drop function public.publish_view(text, text, jsonb);
create function public.publish_view(p_code text, p_secret text, p_view jsonb, p_revision bigint)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess sessions;
begin
  select * into sess from sessions where code = upper(p_code);
  if not found or sess.dm_secret_hash <> crypt(p_secret, sess.dm_secret_hash) then
    raise exception 'invalid session or secret';
  end if;
  if sess.closed_at is not null then
    raise exception 'session closed';
  end if;
  update session_views
    set view = p_view, revision = p_revision, updated_at = now()
    where session_id = sess.id and revision < p_revision;
end;
$$;

-- DM: close a session. Players receive a closed marker, and no one can join or publish afterwards.
create function public.close_session(p_code text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess sessions;
begin
  select * into sess from sessions where code = upper(p_code);
  if not found or sess.dm_secret_hash <> crypt(p_secret, sess.dm_secret_hash) then
    raise exception 'invalid session or secret';
  end if;
  update sessions set closed_at = coalesce(closed_at, now()) where id = sess.id;
  update session_views
    set view = '{"closed": true}'::jsonb, revision = revision + 1, updated_at = now()
    where session_id = sess.id;
end;
$$;

-- Player: join or reclaim a seat. Returns the seat so the client knows its player id and any claim.
drop function public.join_session(text, text);
create function public.join_session(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess sessions;
  seat players;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into sess from sessions where code = upper(p_code);
  if not found then
    raise exception 'unknown session code';
  end if;
  if sess.closed_at is not null then
    raise exception 'session closed';
  end if;
  insert into players (session_id, auth_uid, name)
    values (sess.id, auth.uid(), trim(p_name))
    on conflict (session_id, auth_uid) do update set name = excluded.name
    returning * into seat;
  return jsonb_build_object('session_id', sess.id, 'player_id', seat.id, 'combatant_id', seat.combatant_id);
end;
$$;

-- Player: claim one of the party combatants the DM has published. One player per combatant.
create function public.claim_combatant(p_session_id uuid, p_combatant_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from players where session_id = p_session_id and auth_uid = auth.uid()
  ) then
    raise exception 'not a member of this session';
  end if;
  if not exists (
    select 1
    from session_views sv, jsonb_array_elements(coalesce(sv.view->'players', '[]'::jsonb)) pl
    where sv.session_id = p_session_id and pl->>'id' = p_combatant_id
  ) then
    raise exception 'no such character in this session';
  end if;
  update players set combatant_id = p_combatant_id
    where session_id = p_session_id and auth_uid = auth.uid();
exception
  when unique_violation then
    raise exception 'character already taken';
end;
$$;

revoke all on function
  public.publish_view(text, text, jsonb, bigint),
  public.close_session(text, text),
  public.join_session(text, text),
  public.claim_combatant(uuid, text)
from public;
grant execute on function public.publish_view(text, text, jsonb, bigint), public.close_session(text, text) to anon, authenticated;
grant execute on function public.join_session(text, text), public.claim_combatant(uuid, text) to authenticated;
