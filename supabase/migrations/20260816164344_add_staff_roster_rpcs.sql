-- ============================================================================
-- 15. Staff Roster: manager-visible roster, invite/edit/remove RPCs
-- ============================================================================
-- Owner/Manager (and Dineinly Admin) self-service staff management
-- (docs/product.md § RBAC "Manage Staff", where Admin carries the same ✅ as
-- Owner). staff_select_own_row (§ 5) only ever let a caller see their own
-- row; Owner/Manager need the whole restaurant's roster. All three mutations
-- are SECURITY DEFINER, same reasoning as § 6/§ 10: there is still no
-- general staff insert/update/delete RLS policy (only admin_all_staff, § 4),
-- so a plain policy can't express "invited only by Owner/Manager, Owner role
-- only touchable by Owner/Admin, primary owner row untouchable" as one rule
-- per action — a function keeps each rule in one readable place instead of
-- split across a policy and a WITH CHECK. Admin has no Staff row of its own
-- (is_dineinly_admin(), § 4), so each function checks that claim directly
-- rather than through staff_role_for_restaurant, which only ever resolves a
-- role from an actual row.
--
-- PIN station login (Kitchen/Floor device pairing: synthetic station
-- identities, pairing codes, per-device sessions) stays deliberately out of
-- scope — its own future effort. set_staff_pin below (§ 15b) ships the
-- narrower, self-contained piece Tbd.md called out separately: pin_hash
-- storage + verification infra, usable once station login exists but not
-- dependent on it. Primary-owner reassignment ships in this migration too
-- (§ 15c) — the primary owner's row otherwise stays locked in update_staff/
-- remove_staff below (see is_primary_owner checks), same as it already is
-- in admin_update_restaurant (§ 6).
--
-- staff_role_for_restaurant and is_staff_manager_for_restaurant now live in
-- supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql § 5 —
-- moved there so that migration's own menu/table RLS split (staff_write_
-- menu_items etc.) can use them too, since that file runs first.
--
-- Same hardening as every other function in this file: `set search_path =
-- ''` with fully schema-qualified references, `execute` revoked from
-- `public` and granted only to `authenticated`.

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
	v_is_admin boolean := public.is_dineinly_admin();
	v_caller_role public.staff_role := public.staff_role_for_restaurant(p_restaurant_id);
begin
	if not v_is_admin and (v_caller_role is null or v_caller_role not in ('owner', 'manager')) then
		raise exception 'Only an active Owner or Manager may invite staff';
	end if;

	if not v_is_admin and v_caller_role = 'manager' and p_role = 'owner' then
		raise exception 'Managers may not invite Owners';
	end if;

	return query
		insert into public.staff (restaurant_id, name, email, role, status, invited_at)
		values (p_restaurant_id, p_name, p_email, p_role, 'invited', now())
		returning staff.id, staff.name, staff.email, staff.role, staff.status;
end;
$$;

revoke execute on function public.invite_staff(uuid, text, text, public.staff_role) from public;
grant execute on function public.invite_staff(uuid, text, text, public.staff_role) to authenticated;

-- Resends an invite by restarting its 24h sign-in window (invited_at =
-- now()) — resolve_staff_signin (supabase/migrations/
-- 20260730150634_add_auth_fk_and_rls_policies.sql § 10) rejects the row
-- once invited_at is more than 24h old. No email is actually sent here or
-- anywhere else in this flow: an "invite" is just this row existing, and
-- the OTP email fires only when the invitee submits /sign-in — resending
-- just makes that submission work again. Same caller authorization as
-- invite_staff (Admin, or Owner/Manager — a Manager still can't touch an
-- Owner-role row), since resending is the same trust boundary as inviting.
create or replace function public.resend_staff_invite(p_staff_id uuid)
returns table (
	id uuid,
	name text,
	email text,
	role public.staff_role,
	status public.staff_status,
	invited_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_is_admin boolean := public.is_dineinly_admin();
	v_restaurant_id uuid;
	v_target_role public.staff_role;
	v_caller_role public.staff_role;
begin
	select restaurant_id, role into v_restaurant_id, v_target_role
	from public.staff
	where id = p_staff_id and status = 'invited';

	if v_restaurant_id is null then
		raise exception 'No pending invite found for that staff member';
	end if;

	v_caller_role := public.staff_role_for_restaurant(v_restaurant_id);

	if not v_is_admin and (v_caller_role is null or v_caller_role not in ('owner', 'manager')) then
		raise exception 'Only an active Owner or Manager may resend an invite';
	end if;

	if not v_is_admin and v_caller_role = 'manager' and v_target_role = 'owner' then
		raise exception 'Managers may not resend an Owner invite';
	end if;

	return query
		update public.staff
		set invited_at = now()
		where staff.id = p_staff_id
		returning staff.id, staff.name, staff.email, staff.role, staff.status, staff.invited_at;
end;
$$;

revoke execute on function public.resend_staff_invite(uuid) from public;
grant execute on function public.resend_staff_invite(uuid) to authenticated;

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
	v_is_admin boolean := public.is_dineinly_admin();
	v_target public.staff;
	v_caller_role public.staff_role;
begin
	select * into v_target from public.staff where staff.id = p_staff_id;
	if v_target is null then
		raise exception 'Staff member not found';
	end if;

	v_caller_role := public.staff_role_for_restaurant(v_target.restaurant_id);
	if not v_is_admin and (v_caller_role is null or v_caller_role not in ('owner', 'manager')) then
		raise exception 'Only an active Owner or Manager may edit staff';
	end if;

	if v_target.is_primary_owner then
		raise exception 'The primary owner is only changed by reassigning ownership';
	end if;

	if v_target.status = 'removed' then
		raise exception 'A removed staff member can only be re-added as a new invite';
	end if;

	if not v_is_admin and v_caller_role = 'manager' and (v_target.role = 'owner' or p_role = 'owner') then
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
	v_is_admin boolean := public.is_dineinly_admin();
	v_target public.staff;
	v_caller_role public.staff_role;
begin
	select * into v_target from public.staff where staff.id = p_staff_id;
	if v_target is null then
		raise exception 'Staff member not found';
	end if;

	v_caller_role := public.staff_role_for_restaurant(v_target.restaurant_id);
	if not v_is_admin and (v_caller_role is null or v_caller_role not in ('owner', 'manager')) then
		raise exception 'Only an active Owner or Manager may remove staff';
	end if;

	if v_target.is_primary_owner then
		raise exception 'The primary owner can only be removed by reassigning ownership';
	end if;

	if not v_is_admin and v_caller_role = 'manager' and v_target.role = 'owner' then
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

-- ============================================================================
-- 15b. Staff PIN: self-service set/change
-- ============================================================================
-- Tbd.md "PIN station login for Kitchen/Floor" split in two: pin_hash
-- storage + verification (here) versus the pairing-code device-onboarding
-- UI (still deferred, its own future effort — no station accounts exist
-- yet, so nothing consumes this PIN for login today). Self-scoped from
-- auth.uid() rather than a staff_id parameter — a caller can only ever set
-- their own PIN, so there's no separate ownership check to get wrong, and
-- no Manager-sets-someone-else's-PIN path to guard against. Any active role
-- may set one (not restricted to Kitchen/Waiter, the eventual station
-- users) — cheap to allow, and docs/product.md never restricts who may hold
-- a PIN, only who's ever prompted for one at a shared device.
-- Kiosk-mode redemption (Task 5, apps/web/server/routers/station.ts) now
-- depends on the PIN uniqueness this function enforces.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_staff_pin(
	p_restaurant_id uuid,
	p_pin text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_updated int;
	v_collision boolean;
begin
	if p_pin !~ '^[0-9]{4,6}$' then
		raise exception 'PIN must be 4 to 6 digits';
	end if;

	perform pg_advisory_xact_lock(hashtext(p_restaurant_id::text));

	-- pin_hash is salted bcrypt, so this can't be a DB unique index — a PIN
	-- must resolve to exactly one person on a shared device
	-- (resolve_staff_by_pin), so check for a collision the app-level way:
	-- compare the candidate against every other active waiter/kitchen row's
	-- hash. Restaurant staff counts are small, so this stays cheap.
	select exists (
		select 1
		from public.staff s
		where s.restaurant_id = p_restaurant_id
			and s.role in ('waiter', 'kitchen')
			and s.status = 'active'
			and s.user_id is distinct from auth.uid()
			and s.pin_hash is not null
			and s.pin_hash = extensions.crypt(p_pin, s.pin_hash)
	) into v_collision;

	if v_collision then
		raise exception 'That PIN is already in use at this restaurant — choose a different one';
	end if;

	update public.staff
	set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), updated_at = now()
	where restaurant_id = p_restaurant_id
		and user_id = auth.uid()
		and status = 'active';

	get diagnostics v_updated = row_count;
	if v_updated = 0 then
		raise exception 'No active staff row found for this restaurant';
	end if;
end;
$$;

revoke execute on function public.set_staff_pin(uuid, text) from public;
grant execute on function public.set_staff_pin(uuid, text) to authenticated;

-- Dineinly Admin override: reset any staff member's PIN (e.g. a forgotten
-- PIN, with no self-service recovery flow since a PIN is never tied to an
-- inbox). Same hash path as set_staff_pin, just admin-checked and
-- staff_id-scoped instead of self-scoped — no restaurant_id parameter, since
-- Admin's reach isn't tenant-scoped and staff.id alone already names one row.
create or replace function public.admin_reset_staff_pin(
	p_staff_id uuid,
	p_pin text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_updated int;
begin
	if not public.is_dineinly_admin() then
		raise exception 'Only Dineinly Admin may reset another staff member''s PIN';
	end if;

	if p_pin !~ '^[0-9]{4,6}$' then
		raise exception 'PIN must be 4 to 6 digits';
	end if;

	update public.staff
	set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), updated_at = now()
	where staff.id = p_staff_id
		and status = 'active';

	get diagnostics v_updated = row_count;
	if v_updated = 0 then
		raise exception 'Staff member not found';
	end if;
end;
$$;

revoke execute on function public.admin_reset_staff_pin(uuid, text) from public;
grant execute on function public.admin_reset_staff_pin(uuid, text) to authenticated;

-- Self-service profile: a staff member edits their own name. Same self-scope
-- reasoning as set_staff_pin — auth.uid() match, no staff_id parameter, so
-- there's no separate ownership check to get wrong and no Manager-edits-
-- someone-else's-name path to guard against. Unlike update_staff (Owner/
-- Manager only, edits anyone within their reach), this is the "Profile"
-- surface every staff role reaches regardless of what else they can manage.
create or replace function public.update_own_staff_profile(
	p_restaurant_id uuid,
	p_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_updated int;
begin
	if length(trim(p_name)) < 2 then
		raise exception 'Name must be at least 2 characters';
	end if;

	update public.staff
	set name = trim(p_name), updated_at = now()
	where restaurant_id = p_restaurant_id
		and user_id = auth.uid()
		and status = 'active';

	get diagnostics v_updated = row_count;
	if v_updated = 0 then
		raise exception 'No active staff row found for this restaurant';
	end if;
end;
$$;

revoke execute on function public.update_own_staff_profile(uuid, text) from public;
grant execute on function public.update_own_staff_profile(uuid, text) to authenticated;

-- ============================================================================
-- 15c. Owner reassignment
-- ============================================================================
-- Moves is_primary_owner from the current holder to another existing
-- Owner-role staff row — a pure handoff, not a demotion: both rows keep
-- role = 'owner' throughout. Target must already hold role = 'owner' — a
-- Waiter/Kitchen/Manager has to be promoted to Owner via update_staff
-- first, and any role downgrade for the outgoing owner is update_staff's
-- job too, a separate action the caller takes afterward if they want it.
-- The current primary owner themselves (or Dineinly Admin) only —
-- stricter than "any Owner-role staff", since a non-primary co-owner is
-- still just role = 'owner' and shouldn't be able to transfer someone
-- else's ownership out from under them.
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
	where restaurant_id = p_restaurant_id and is_primary_owner;
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
	where id = p_new_owner_staff_id and restaurant_id = p_restaurant_id;
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

revoke execute on function public.reassign_primary_owner(uuid, uuid) from public;
grant execute on function public.reassign_primary_owner(uuid, uuid) to authenticated;
