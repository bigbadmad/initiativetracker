-- Remove old online sessions. Not a migration: run it by hand in the Supabase SQL editor whenever
-- test sessions have piled up. The client cannot delete sessions (sessions is unreadable to it).
--
-- Deleting a session cascades to its session_views, players and declarations.
--
-- A session is removable when EITHER
--   * it was closed more than 1 day ago, or
--   * nothing has been published to it for 14 days (a DM can resume an old session from the same
--     browser, so "idle" is measured from the last publish, not from creation).
-- Change the two intervals below (in both statements) to taste.

-- 1. PREVIEW - run this first and read the list.
select
  s.code,
  s.created_at,
  s.closed_at,
  v.updated_at as last_published,
  (select count(*) from public.players p where p.session_id = s.id) as players,
  (select count(*) from public.declarations d where d.session_id = s.id) as declarations
from public.sessions s
join public.session_views v on v.session_id = s.id
where s.closed_at < now() - interval '1 day'
   or v.updated_at < now() - interval '14 days'
order by v.updated_at;

-- 2. DELETE - run this only once the preview looks right. Same condition as above.
delete from public.sessions
where id in (
  select s.id
  from public.sessions s
  join public.session_views v on v.session_id = s.id
  where s.closed_at < now() - interval '1 day'
     or v.updated_at < now() - interval '14 days'
);
