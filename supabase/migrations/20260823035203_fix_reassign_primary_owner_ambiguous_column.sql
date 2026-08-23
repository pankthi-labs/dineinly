-- Fixes reassign_primary_owner (§ 15c, supabase/migrations/
-- 20260816164344_add_staff_roster_rpcs.sql): the function's own
-- `returns table (..., is_primary_owner boolean)` clause implicitly
-- declares `is_primary_owner` as an OUT-parameter variable inside the
-- PL/pgSQL body, colliding with the identically-named `staff.is_primary_owner`
-- column in its first query — Postgres raises "column reference
-- 'is_primary_owner' is ambiguous" on every call, before any of the
-- function's actual business logic runs. `restaurant_id` isn't touched by
-- this — no OUT parameter shares that name — only `is_primary_owner` needs
-- table-qualifying, matching every other reference to this column already
-- schema-qualified elsewhere in the same function body. Same collision risk
-- on the second query's bare `id` (the OUT-parameter list also declares
-- `id uuid`) — qualified here too, even though it's unreached until the
-- first query above is fixed.
create or replace function public.reassign_primary_owner(
	p_restaurant_id uuid,
	p_new_owner_staff_id uuid
)
returns table (id uuid, role public.staff_role, is_primary_owner boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_is_admin boolean := public.is_dineinly_admin();
	v_current_owner public.staff;
	v_target public.staff;
begin
	select * into v_current_owner
	from public.staff
	where staff.restaurant_id = p_restaurant_id and staff.is_primary_owner;
	if v_current_owner is null then
		raise exception 'This restaurant has no primary owner to reassign';
	end if;

	-- Only the current primary owner themselves (not just any Owner-role
	-- staff — a non-primary co-owner is still just "owner" role, per the
	-- data model's single is_primary_owner-per-restaurant constraint) or
	-- Dineinly Admin may transfer ownership.
	if not v_is_admin and v_current_owner.user_id is distinct from auth.uid() then
		raise exception 'Only the current primary owner or Dineinly Admin may reassign ownership';
	end if;

	select * into v_target
	from public.staff
	where staff.id = p_new_owner_staff_id and staff.restaurant_id = p_restaurant_id;
	if v_target is null then
		raise exception 'Staff member not found';
	end if;
	if v_target.status <> 'active' then
		raise exception 'Only an active staff member can become the primary owner';
	end if;
	if v_target.id = v_current_owner.id then
		raise exception 'This staff member is already the primary owner';
	end if;
	if v_target.role <> 'owner' then
		raise exception 'Only an existing Owner can become the primary owner — promote them to Owner first';
	end if;

	-- Clear the outgoing owner's is_primary_owner before setting the new
	-- one — staff_restaurant_id_primary_owner_idx (packages/db/src/schema/
	-- staff.ts) allows at most one true per restaurant, checked per
	-- statement, so the old row must go false first or the new row's own
	-- update below would collide with it.
	update public.staff
	set is_primary_owner = false
	where staff.id = v_current_owner.id;

	return query
		update public.staff
		set is_primary_owner = true
		where staff.id = v_target.id
		returning staff.id, staff.role, staff.is_primary_owner;
end;
$$;
