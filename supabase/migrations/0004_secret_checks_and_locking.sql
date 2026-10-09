-- Security fix: a NULL secret made the secret comparison evaluate to NULL, which an IF treats as false,
-- so publish_view and close_session accepted it. Reject NULL explicitly and compare with IS DISTINCT FROM.
-- Also lock the session row so publish and close are ordered (the closed marker can't be overwritten),
-- and have publish_view return the stored revision so the client can recover from clock skew.

drop function public.publish_view(text, text, jsonb, bigint);
create function public.publish_view(p_code text, p_secret text, p_view jsonb, p_revision bigint)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess   sessions;
  stored bigint;
begin
  if p_secret is null or p_revision is null then
    raise exception 'invalid session or secret';
  end if;
  select * into sess from sessions where code = upper(p_code) for update;
  if not found or sess.dm_secret_hash is distinct from crypt(p_secret, sess.dm_secret_hash) then
    raise exception 'invalid session or secret';
  end if;
  if sess.closed_at is not null then
    raise exception 'session closed';
  end if;
  update session_views
    set view = p_view, revision = p_revision, updated_at = now()
    where session_id = sess.id and revision < p_revision;
  select revision into stored from session_views where session_id = sess.id;
  return stored;
end;
$$;

create or replace function public.close_session(p_code text, p_secret text)
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
  update sessions set closed_at = coalesce(closed_at, now()) where id = sess.id;
  update session_views
    set view = '{"closed": true}'::jsonb, revision = revision + 1, updated_at = now()
    where session_id = sess.id;
end;
$$;

revoke all on function public.publish_view(text, text, jsonb, bigint) from public;
grant execute on function public.publish_view(text, text, jsonb, bigint) to anon, authenticated;
