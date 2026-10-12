-- Review fix: set_declaration_totals now treats p_totals as the full set of totals for the round.
-- Previously it only touched the ids present in the payload, so a character who became hors de combat
-- or surprised after being given a total kept that stale total. An id that is absent now clears it.
-- Same signature as 0005, so this replaces the function in place.

create or replace function public.set_declaration_totals(p_code text, p_secret text, p_encounter_id text, p_round int, p_totals jsonb)
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
    set total = (p_totals ->> d.combatant_id)::int
    where d.session_id = sess.id
      and d.encounter_id = p_encounter_id
      and d.round = p_round;
end;
$$;
