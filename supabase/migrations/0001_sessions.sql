-- Milestone 1: sessions, join, read-only public view.
-- All table access from clients goes through the security-definer RPCs below.

create extension if not exists pgcrypto with schema extensions;

-- Private: holds the DM secret hash. RLS on, no policies => unreadable by clients.
create table public.sessions (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  dm_secret_hash text not null,
  created_at     timestamptz not null default now()
);

-- Readable by members of the session; this is what players subscribe to.
create table public.session_views (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  view       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.players (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  auth_uid   uuid not null,
  name       text not null check (char_length(name) between 1 and 40),
  joined_at  timestamptz not null default now(),
  unique (session_id, auth_uid)
);

alter table public.sessions      enable row level security;
alter table public.session_views enable row level security;
alter table public.players       enable row level security;

revoke all on public.sessions, public.session_views, public.players from anon, authenticated;
grant select on public.session_views, public.players to authenticated;

-- Security definer so the policy on players can check membership without recursing into itself.
create function public.is_session_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from players where session_id = p_session_id and auth_uid = auth.uid()
  );
$$;

revoke all on function public.is_session_member(uuid) from public;
grant execute on function public.is_session_member(uuid) to authenticated;

create policy "members read their session view" on public.session_views
  for select to authenticated
  using (public.is_session_member(session_id));

create policy "members read their session roster" on public.players
  for select to authenticated
  using (public.is_session_member(session_id));

alter publication supabase_realtime add table public.session_views;

-- DM: create a session. Returns the join code. The secret never leaves the DM's browser.
create function public.create_session(p_secret text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  new_id   uuid;
begin
  if p_secret is null or char_length(p_secret) < 16 then
    raise exception 'secret too short';
  end if;
  loop
    new_code := '';
    for i in 1..5 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * char_length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from sessions where code = new_code);
  end loop;
  insert into sessions (code, dm_secret_hash)
    values (new_code, crypt(p_secret, gen_salt('bf')))
    returning id into new_id;
  insert into session_views (session_id) values (new_id);
  return new_code;
end;
$$;

-- DM: publish the current public view.
create function public.publish_view(p_code text, p_secret text, p_view jsonb)
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
  update session_views set view = p_view, updated_at = now() where session_id = sess.id;
end;
$$;

-- Player: join (or reclaim a seat in) a session. Requires an anonymous-auth user.
create function public.join_session(p_code text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess_id uuid;
  player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select id into sess_id from sessions where code = upper(p_code);
  if sess_id is null then
    raise exception 'unknown session code';
  end if;
  insert into players (session_id, auth_uid, name)
    values (sess_id, auth.uid(), trim(p_name))
    on conflict (session_id, auth_uid) do update set name = excluded.name
    returning id into player_id;
  return sess_id;
end;
$$;

revoke all on function public.create_session(text), public.publish_view(text, text, jsonb), public.join_session(text, text) from public;
grant execute on function public.create_session(text), public.publish_view(text, text, jsonb) to anon, authenticated;
grant execute on function public.join_session(text, text) to authenticated;
