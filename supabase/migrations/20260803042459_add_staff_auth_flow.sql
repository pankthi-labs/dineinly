-- Custom SQL migration file, put your code below! --

-- ============================================================================
-- 6. Staff auth: sign-in gate + post-verify linking
-- ============================================================================
-- Closes the invite-only sign-in gap flagged in apps/web/lib/auth.ts and
-- this file's own § 3 comment ("Every staff-side policy: lands with the
-- staff auth flow"). Two functions:
--
--   - resolve_staff_signin: called from apps/web/sign-in before
--     signInWithOtp, by an unauthenticated request (Postgres role `anon`
--     — there's no session yet). Decides whether GoTrue should be allowed
--     to create the auth.users row on first OTP verify (an email that
--     matches an invited Staff row with no user_id yet) or must not (any
--     other email) — unconditionally allowing it would turn sign-in into
--     open self-signup, breaking the invite-only model. Reading auth.users
--     needs elevated privilege no Postgres role but the table owner has,
--     hence SECURITY DEFINER.
--
--   - link_staff_account: called right after verifyOtp() succeeds, by the
--     now-authenticated user, to set staff.user_id/status on their own
--     invited row(s) (one person can be invited at more than one
--     restaurant) and hand back their name for the display_name copy the
--     caller makes via auth.updateUser(). Staff has no self-service RLS
--     policy yet (see § 3 header), so this too is SECURITY DEFINER — but
--     it only ever matches rows against the caller's own auth.uid()/email,
--     never a caller-supplied id, so it can't link an arbitrary Staff row.
--
-- Same hardening as every other function in this file: `set search_path =
-- ''` with fully schema-qualified references, and `execute` revoked from
-- `public`.

create or replace function public.resolve_staff_signin(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when exists (
			select 1 from auth.users where lower(email) = lower(p_email)
		) then 'existing'
		when exists (
			select 1 from public.staff
			where lower(email) = lower(p_email) and status = 'invited'
		) then 'invited'
		else 'unknown'
	end;
$$;

revoke execute on function public.resolve_staff_signin(text) from public;
-- Called from /sign-in before signInWithOtp — usually anon (no session yet),
-- but a still-valid leftover session cookie makes the same request arrive
-- as `authenticated` (e.g. a signed-in user reloading /sign-in, or a token
-- that hasn't expired despite the app treating the user as logged out).
-- Grant both; the check itself doesn't depend on the caller's identity.
grant execute on function public.resolve_staff_signin(text) to anon, authenticated;

create or replace function public.link_staff_account()
returns table (restaurant_id uuid, staff_id uuid, name text, role public.staff_role)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_email text := auth.jwt() ->> 'email';
begin
	if v_uid is null or v_email is null then
		raise exception 'link_staff_account requires an authenticated session';
	end if;

	return query
		update public.staff
		set user_id = v_uid, status = 'active'
		where lower(staff.email) = lower(v_email)
			and staff.status = 'invited'
			and staff.user_id is null
		returning staff.restaurant_id, staff.id, staff.name, staff.role;
end;
$$;

revoke execute on function public.link_staff_account() from public;
grant execute on function public.link_staff_account() to authenticated;
