-- Explicit "Leave session" frees the player's seat and any character claim.
-- Plain disconnects and reloads never call this, so they still reclaim the same seat on rejoin.

create function public.leave_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from players where session_id = p_session_id and auth_uid = auth.uid();
end;
$$;

revoke all on function public.leave_session(uuid) from public;
grant execute on function public.leave_session(uuid) to authenticated;
