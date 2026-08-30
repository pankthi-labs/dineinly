ALTER TABLE "station_devices" ADD COLUMN "active_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "station_devices" ADD COLUMN "active_staff_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "station_devices" ADD CONSTRAINT "station_devices_active_staff_id_staff_id_fk" FOREIGN KEY ("active_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;

-- Who's currently PIN-unlocked on this device (docs/architecture.md §
-- Station Account Provisioning) — attribution only, same as pin_hash
-- itself; grants no DB access on its own. Cleared on Switch User and
-- revoke, and treated as stale past STATION_SESSION_TTL_SECONDS (apps/web/
-- lib/station-session.ts, 12h) even if never explicitly cleared — a device
-- that goes dark mid-shift shouldn't keep blocking that person from
-- unlocking a different one indefinitely.

-- One person, one device at a time. Resolves the PIN exactly as before,
-- then refuses to hand out a second concurrent session for the same staff
-- member while another still-live device already holds one.
drop function if exists public.resolve_staff_by_pin(uuid, text);

create function public.resolve_staff_by_pin(
	p_restaurant_id uuid,
	p_pin text,
	p_device_id uuid
)
returns table (staff_id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_caller_active boolean;
	v_matches public.staff[];
	v_other_device_id uuid;
begin
	select exists (
		select 1 from public.staff s
		where s.restaurant_id = p_restaurant_id and s.user_id = auth.uid() and s.status = 'active'
	) into v_caller_active;

	if not v_caller_active then
		raise exception 'PIN not recognized';
	end if;

	select array_agg(s) into v_matches
	from public.staff s
	where s.restaurant_id = p_restaurant_id
		and s.role in ('waiter', 'manager', 'owner')
		and s.status = 'active'
		and s.pin_hash is not null
		and s.pin_hash = extensions.crypt(p_pin, s.pin_hash);

	if coalesce(array_length(v_matches, 1), 0) <> 1 then
		raise exception 'PIN not recognized';
	end if;

	select sd.id into v_other_device_id
	from public.station_devices sd
	where sd.active_staff_id = v_matches[1].id
		and sd.id <> p_device_id
		and sd.revoked_at is null
		and sd.active_staff_since is not null
		and now() - sd.active_staff_since < interval '12 hours';

	if v_other_device_id is not null then
		raise exception 'Already unlocked on another device';
	end if;

	update public.station_devices
	set active_staff_id = v_matches[1].id, active_staff_since = now()
	where public.station_devices.id = p_device_id;

	return query select v_matches[1].id, v_matches[1].name;
end;
$$;

revoke execute on function public.resolve_staff_by_pin(uuid, text, uuid) from public;
grant execute on function public.resolve_staff_by_pin(uuid, text, uuid) to authenticated;

-- Switch User (station/pin/route.ts's DELETE handler) clears this device's
-- own active_staff_id so the exclusivity check above doesn't keep blocking
-- this same person from unlocking elsewhere the moment they step away.
-- Caller must be an active staff member at this device's restaurant — same
-- posture as resolve_staff_by_pin's own caller check; the PIN session
-- cookie is the real security boundary, this only clears attribution state.
create or replace function public.clear_station_active_staff(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_device public.station_devices;
begin
	select * into v_device from public.station_devices where station_devices.id = p_device_id;
	if v_device is null then
		return;
	end if;

	if not exists (
		select 1 from public.staff s
		where s.restaurant_id = v_device.restaurant_id and s.user_id = auth.uid() and s.status = 'active'
	) then
		raise exception 'Not authorized';
	end if;

	update public.station_devices
	set active_staff_id = null, active_staff_since = null
	where public.station_devices.id = p_device_id;
end;
$$;

revoke execute on function public.clear_station_active_staff(uuid) from public;
grant execute on function public.clear_station_active_staff(uuid) to authenticated;

-- Revoking a device frees whoever was unlocked on it immediately, rather
-- than leaving them blocked from another tablet until the stale window
-- above lapses on its own.
create or replace function public.revoke_station_device(p_device_id uuid)
returns table (id uuid, revoked_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_is_admin boolean := public.is_dineinly_admin();
	v_device public.station_devices;
	v_caller_role public.staff_role;
begin
	select * into v_device from public.station_devices where station_devices.id = p_device_id;
	if v_device is null then
		raise exception 'Device not found';
	end if;

	v_caller_role := public.staff_role_for_restaurant(v_device.restaurant_id);
	if not v_is_admin and (v_caller_role is null or v_caller_role not in ('owner', 'manager')) then
		raise exception 'Only an active Owner or Manager may revoke a station device';
	end if;

	return query
		update public.station_devices
		set revoked_at = now(), active_staff_id = null, active_staff_since = null
		where station_devices.id = p_device_id
		returning station_devices.id, station_devices.revoked_at;
end;
$$;

-- Staff Roster's Floor Tablets panel needs to show who's currently
-- unlocked on each device, not just when it was paired. active_staff_name
-- is already resolved to null once stale (same 12h window as the
-- exclusivity check above), so the client never has to reason about
-- staleness itself.
drop function if exists public.list_station_devices(uuid);

create function public.list_station_devices(p_restaurant_id uuid)
returns table (
	id uuid,
	station_type public.station_type,
	created_at timestamptz,
	revoked_at timestamptz,
	active_staff_name text
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		sd.id,
		sd.station_type,
		sd.created_at,
		sd.revoked_at,
		case
			when sd.active_staff_id is not null
				and sd.active_staff_since is not null
				and now() - sd.active_staff_since < interval '12 hours'
			then (select s.name from public.staff s where s.id = sd.active_staff_id)
			else null
		end as active_staff_name
	from public.station_devices sd
	where sd.restaurant_id = p_restaurant_id
		and public.is_staff_manager_for_restaurant(p_restaurant_id)
	order by sd.created_at desc;
$$;

revoke execute on function public.list_station_devices(uuid) from public;
grant execute on function public.list_station_devices(uuid) to authenticated;
