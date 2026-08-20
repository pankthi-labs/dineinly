CREATE TYPE "public"."station_type" AS ENUM('waiter');--> statement-breakpoint
CREATE TABLE "station_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"station_type" "station_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "station_pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"station_type" "station_type" NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"created_by_staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "station_devices" ADD CONSTRAINT "station_devices_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_pairing_codes" ADD CONSTRAINT "station_pairing_codes_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_pairing_codes" ADD CONSTRAINT "station_pairing_codes_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;

-- ============================================================================
-- Station account provisioning: pairing codes, per-device registry
-- ============================================================================
-- docs/architecture.md § Station Account Provisioning. Both tables are
-- server-only surfaces — no policy grants direct client read/write, every
-- access goes through a SECURITY DEFINER RPC below, same reasoning as
-- Staff Roster's invite/update/remove (20260816164344, § 15): the rules
-- ("only Owner/Manager may generate a code", "a code redeems exactly
-- once", "PIN lookup never reveals which rows it checked") don't reduce to
-- a single USING/WITH CHECK expression.

alter table "station_pairing_codes" enable row level security;
alter table "station_devices" enable row level security;

grant select, insert, update, delete on public.station_pairing_codes to authenticated;
grant select, insert, update, delete on public.station_devices to authenticated;

create policy "admin_all_station_pairing_codes" on public.station_pairing_codes
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

create policy "admin_all_station_devices" on public.station_devices
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

-- Owner/Manager mints a 6-digit, 10-minute-TTL code from Staff Roster.
-- Returns the plaintext code once — only the hash is ever stored, so this
-- is the caller's only chance to see it.
create or replace function public.generate_pairing_code(
	p_restaurant_id uuid,
	p_station_type public.station_type
)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_is_admin boolean := public.is_dineinly_admin();
	v_caller_role public.staff_role := public.staff_role_for_restaurant(p_restaurant_id);
	v_caller_staff_id uuid;
	v_code text;
	v_expires_at timestamptz := now() + interval '10 minutes';
begin
	if not v_is_admin and (v_caller_role is null or v_caller_role not in ('owner', 'manager')) then
		raise exception 'Only an active Owner or Manager may pair a station device';
	end if;

	select s.id into v_caller_staff_id
	from public.staff s
	where s.restaurant_id = p_restaurant_id and s.user_id = auth.uid() and s.status = 'active';

	if v_caller_staff_id is null then
		raise exception 'Only an active Owner or Manager may pair a station device';
	end if;

	v_code := lpad(floor(random() * 1000000)::text, 6, '0');

	insert into public.station_pairing_codes (
		restaurant_id, station_type, code_hash, expires_at, created_by_staff_id
	)
	values (
		p_restaurant_id, p_station_type, extensions.crypt(v_code, extensions.gen_salt('bf')), v_expires_at, v_caller_staff_id
	);

	return query select v_code, v_expires_at;
end;
$$;

revoke execute on function public.generate_pairing_code(uuid, public.station_type) from public;
grant execute on function public.generate_pairing_code(uuid, public.station_type) to authenticated;

-- Called by an unauthenticated device. Matches against unexpired,
-- unredeemed codes and burns the match — never distinguishes "wrong code"
-- from "expired" from "already used" in its response, same
-- anti-enumeration posture as resolve_staff_signin (20260730150634 § 10).
-- Does not create the station's auth.users identity — SQL can't call the
-- Auth Admin API, so apps/web/server/routers/station.ts does that step
-- right after this RPC succeeds.
create or replace function public.redeem_pairing_code(p_code text)
returns table (restaurant_id uuid, station_type public.station_type)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row public.station_pairing_codes;
begin
	select spc.* into v_row
	from public.station_pairing_codes spc
	where spc.redeemed_at is null
		and spc.expires_at > now()
		and spc.code_hash = extensions.crypt(p_code, spc.code_hash)
	limit 1;

	if v_row is null then
		raise exception 'Code not valid';
	end if;

	update public.station_pairing_codes
	set redeemed_at = now()
	where id = v_row.id;

	return query select v_row.restaurant_id, v_row.station_type;
end;
$$;

revoke execute on function public.redeem_pairing_code(text) from public;
grant execute on function public.redeem_pairing_code(text) to authenticated, anon;

-- Called from an already-paired station's own session (caller must already
-- hold an active Staff row at p_restaurant_id) to identify which named
-- waiter is now acting on the device. Never returns pin_hash, never
-- distinguishes "no match" from "ambiguous match" — both raise the same
-- generic error, same posture as every other auth check in this codebase.
-- Excludes the station's own row implicitly: a station account never has
-- pin_hash set (nothing sets one for it), so crypt() against a null
-- pin_hash never matches.
create or replace function public.resolve_staff_by_pin(
	p_restaurant_id uuid,
	p_pin text
)
returns table (staff_id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_caller_active boolean;
	v_matches public.staff[];
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
		and s.role = 'waiter'
		and s.status = 'active'
		and s.pin_hash is not null
		and s.pin_hash = extensions.crypt(p_pin, s.pin_hash);

	if coalesce(array_length(v_matches, 1), 0) <> 1 then
		raise exception 'PIN not recognized';
	end if;

	return query select v_matches[1].id, v_matches[1].name;
end;
$$;

revoke execute on function public.resolve_staff_by_pin(uuid, text) from public;
grant execute on function public.resolve_staff_by_pin(uuid, text) to authenticated;

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
		set revoked_at = now()
		where station_devices.id = p_device_id
		returning station_devices.id, station_devices.revoked_at;
end;
$$;

revoke execute on function public.revoke_station_device(uuid) from public;
grant execute on function public.revoke_station_device(uuid) to authenticated;

create or replace function public.list_station_devices(p_restaurant_id uuid)
returns table (id uuid, station_type public.station_type, created_at timestamptz, revoked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
	select sd.id, sd.station_type, sd.created_at, sd.revoked_at
	from public.station_devices sd
	where sd.restaurant_id = p_restaurant_id
		and public.is_staff_manager_for_restaurant(p_restaurant_id)
	order by sd.created_at desc;
$$;

revoke execute on function public.list_station_devices(uuid) from public;
grant execute on function public.list_station_devices(uuid) to authenticated;

-- Backs the Floor page's revocation check (Task 11) — the device itself
-- carries a plain, non-sensitive id cookie (Task 10), and this tells the
-- Floor page whether that specific device was revoked. Low-stakes by design:
-- revocation here is a courtesy redirect, not the security boundary — the
-- real one is the Supabase station session and the PIN check, neither of
-- which this bypasses.
create or replace function public.is_station_device_revoked(p_device_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(
			select sd.revoked_at is not null
			from public.station_devices sd
			where sd.id = p_device_id
				and public.is_active_staff_for_restaurant(sd.restaurant_id)
		),
		false
	);
$$;

revoke execute on function public.is_station_device_revoked(uuid) from public;
grant execute on function public.is_station_device_revoked(uuid) to authenticated;

-- Lets one active staff member resolve another active, floor-eligible
-- staff member's identity at the same restaurant — needed because a
-- station device's own session can't SELECT another staff row directly
-- (RLS only permits a caller's own row, or an Owner/Manager's roster
-- view). Used to resolve the PIN-unlocked waiter's name/id, both for
-- display (myStationStatus) and for re-verifying floor attribution
-- (requireOwnStaffId).
create or replace function public.resolve_active_floor_staff(
	p_restaurant_id uuid,
	p_staff_id uuid
)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
	select s.id, s.name
	from public.staff s
	where s.id = p_staff_id
		and s.restaurant_id = p_restaurant_id
		and s.status = 'active'
		and s.role in ('waiter', 'manager', 'owner')
		and public.is_active_staff_for_restaurant(p_restaurant_id);
$$;

revoke execute on function public.resolve_active_floor_staff(uuid, uuid) from public;
grant execute on function public.resolve_active_floor_staff(uuid, uuid) to authenticated;
