-- ============================================================================
-- 15. Staff Roster: manager-visible roster, invite/edit/remove RPCs
-- ============================================================================
-- Owner/Manager self-service staff management (docs/product.md § RBAC
-- "Manage Staff"). staff_select_own_row (§ 5) only ever let a caller see
-- their own row; Owner/Manager need the whole restaurant's roster. All three
-- mutations are SECURITY DEFINER, same reasoning as § 6/§ 10: there is still
-- no general staff insert/update/delete RLS policy (only admin_all_staff,
-- § 4), so a plain policy can't express "invited only by Owner/Manager,
-- Owner role only touchable by Owner, primary owner row untouchable" as one
-- rule per action — a function keeps each rule in one readable place instead
-- of split across a policy and a WITH CHECK.
--
-- Deliberately out of scope, per Tbd.md: PIN station login (Kitchen/Floor
-- device pairing) and primary-owner reassignment — both flagged as their own
-- follow-up efforts, neither shown in this feature's design. The primary
-- owner's row is locked here (see is_primary_owner checks below), same as
-- it already is in admin_update_restaurant (§ 6).
--
-- Same hardening as every other function in this file: `set search_path =
-- ''` with fully schema-qualified references, `execute` revoked from
-- `public` and granted only to `authenticated`.

-- Caller's own active role at a restaurant, or null if they have no active
-- Staff row there (including Dineinly Admin, who has none by design).
-- SECURITY DEFINER, unlike is_active_staff_for_restaurant (§ 5): that helper
-- is never called from a policy ON staff itself, so its own read of staff
-- only ever needs staff_select_own_row's ordinary RLS. This one backs
-- staff_roster_select below, a policy ON staff — running as SECURITY
-- INVOKER would re-trigger staff_roster_select on its own internal read,
-- which calls this function again, infinitely. It's still safe to bypass
-- RLS here: the query only ever matches the caller's own auth.uid(), never
-- an arbitrary row.
create or replace function public.staff_role_for_restaurant(
	p_restaurant_id uuid
)
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
	select s.role
	from public.staff s
	where s.restaurant_id = p_restaurant_id
		and s.user_id = auth.uid()
		and s.status = 'active'
	limit 1;
$$;

revoke execute on function public.staff_role_for_restaurant(uuid) from public;
grant execute on function public.staff_role_for_restaurant(uuid) to authenticated;

create or replace function public.is_staff_manager_for_restaurant(
	p_restaurant_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
	select public.staff_role_for_restaurant(p_restaurant_id) in ('owner', 'manager');
$$;

revoke execute on function public.is_staff_manager_for_restaurant(uuid) from public;
grant execute on function public.is_staff_manager_for_restaurant(uuid) to authenticated;

-- Owner/Manager read the full roster of their own restaurant. Additive to
-- staff_select_own_row (§ 5) — a Waiter/Kitchen still only ever sees their
-- own row through that policy.
create policy "staff_roster_select" on public.staff
	for select
	to authenticated
	using (public.is_staff_manager_for_restaurant(restaurant_id));

create or replace function public.invite_staff(
	p_restaurant_id uuid,
	p_name text,
	p_email text,
	p_role public.staff_role
)
returns table (
	id uuid,
	name text,
	email text,
	role public.staff_role,
	status public.staff_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_caller_role public.staff_role := public.staff_role_for_restaurant(p_restaurant_id);
begin
	if v_caller_role is null or v_caller_role not in ('owner', 'manager') then
		raise exception 'Only an active Owner or Manager may invite staff';
	end if;

	if v_caller_role = 'manager' and p_role = 'owner' then
		raise exception 'Managers may not invite Owners';
	end if;

	return query
		insert into public.staff (restaurant_id, name, email, role, status)
		values (p_restaurant_id, p_name, p_email, p_role, 'invited')
		returning staff.id, staff.name, staff.email, staff.role, staff.status;
end;
$$;

revoke execute on function public.invite_staff(uuid, text, text, public.staff_role) from public;
grant execute on function public.invite_staff(uuid, text, text, public.staff_role) to authenticated;

-- Name/role are always editable by an authorized caller; email only while
-- still 'invited'. Once linked (status = active) auth.uid() is what actually
-- identifies the row from then on (link_staff_account, § 10) — email drifting
-- from the real sign-in address wouldn't break auth, only mislead the
-- roster, so it's silently ignored past that point rather than rejected —
-- same "ignore the field once locked" shape as admin_update_restaurant (§ 6).
create or replace function public.update_staff(
	p_staff_id uuid,
	p_name text,
	p_email text,
	p_role public.staff_role
)
returns table (
	id uuid,
	name text,
	email text,
	role public.staff_role,
	status public.staff_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_target public.staff;
	v_caller_role public.staff_role;
begin
	select * into v_target from public.staff where staff.id = p_staff_id;
	if v_target is null then
		raise exception 'Staff member not found';
	end if;

	v_caller_role := public.staff_role_for_restaurant(v_target.restaurant_id);
	if v_caller_role is null or v_caller_role not in ('owner', 'manager') then
		raise exception 'Only an active Owner or Manager may edit staff';
	end if;

	if v_target.is_primary_owner then
		raise exception 'The primary owner is only changed by reassigning ownership';
	end if;

	if v_caller_role = 'manager' and (v_target.role = 'owner' or p_role = 'owner') then
		raise exception 'Managers may not manage Owners';
	end if;

	return query
		update public.staff
		set
			name = p_name,
			role = p_role,
			email = case when v_target.status = 'active' then v_target.email else p_email end
		where staff.id = p_staff_id
		returning staff.id, staff.name, staff.email, staff.role, staff.status;
end;
$$;

revoke execute on function public.update_staff(uuid, text, text, public.staff_role) from public;
grant execute on function public.update_staff(uuid, text, text, public.staff_role) to authenticated;

-- Soft-delete only (status -> removed, staff.ts's one lifecycle terminus) —
-- frees the row's email/user_id for re-invite via the partial unique
-- indexes on staff (packages/db/src/schema/staff.ts).
create or replace function public.remove_staff(p_staff_id uuid)
returns table (id uuid, status public.staff_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_target public.staff;
	v_caller_role public.staff_role;
begin
	select * into v_target from public.staff where staff.id = p_staff_id;
	if v_target is null then
		raise exception 'Staff member not found';
	end if;

	v_caller_role := public.staff_role_for_restaurant(v_target.restaurant_id);
	if v_caller_role is null or v_caller_role not in ('owner', 'manager') then
		raise exception 'Only an active Owner or Manager may remove staff';
	end if;

	if v_target.is_primary_owner then
		raise exception 'The primary owner can only be removed by reassigning ownership';
	end if;

	if v_caller_role = 'manager' and v_target.role = 'owner' then
		raise exception 'Managers may not manage Owners';
	end if;

	return query
		update public.staff
		set status = 'removed'
		where staff.id = p_staff_id
		returning staff.id, staff.status;
end;
$$;

revoke execute on function public.remove_staff(uuid) from public;
grant execute on function public.remove_staff(uuid) to authenticated;
