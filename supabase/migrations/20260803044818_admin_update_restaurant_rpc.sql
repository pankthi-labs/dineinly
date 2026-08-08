-- Custom SQL migration file, put your code below! --

-- ============================================================================
-- 7. Dineinly Admin restaurant management: admin_update_restaurant
-- ============================================================================
-- Second sibling to admin_create_restaurant
-- (supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql §6).
-- The restaurants.update tRPC procedure previously did this restaurant +
-- staff write as two separate Supabase calls from application code, with a
-- select in between to enforce "the primary owner's details are immutable
-- once they've signed in" — a partial failure between the two writes could
-- leave the restaurant and its owner-contact row inconsistent, and the
-- lock rule was enforced only in that one call site, not the database.
-- Folding it into one SECURITY INVOKER function gives the same atomicity
-- §6's other function already has, and moves the rule next to the data it
-- protects.
--
-- Same hardening as every other function in that section: `set
-- search_path = ''` with fully schema-qualified references, `execute`
-- revoked from `public` and granted only to `authenticated`, and an
-- explicit `is_dineinly_admin()` check as the first statement.

create or replace function public.admin_update_restaurant(
	p_id uuid,
	p_name text,
	p_address text,
	p_city text,
	p_gst_number text,
	p_state text,
	p_pincode text,
	p_service_charge_rate numeric,
	p_owner_name text,
	p_owner_email text,
	p_owner_mobile text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_primary_owner_id uuid;
	v_primary_owner_status public.staff_status;
begin
	if not public.is_dineinly_admin() then
		raise exception 'Only Dineinly Admin may update restaurants';
	end if;

	if not exists (select 1 from public.restaurants where id = p_id) then
		raise exception 'Restaurant not found';
	end if;

	select id, status
	into v_primary_owner_id, v_primary_owner_status
	from public.staff
	where restaurant_id = p_id and is_primary_owner = true
	limit 1;

	update public.restaurants
	set
		name = p_name,
		address = p_address,
		city = p_city,
		gst_number = p_gst_number,
		state = p_state,
		pincode = p_pincode,
		service_charge_rate = p_service_charge_rate
	where id = p_id;

	-- Once the primary owner has signed in, their name/email/mobile are
	-- immutable through this function — reassigning who holds the role is
	-- the only way to change them. p_owner_* is simply ignored in that case.
	if v_primary_owner_id is null then
		insert into public.staff (restaurant_id, email, name, mobile, role, status, is_primary_owner)
		values (p_id, p_owner_email, p_owner_name, p_owner_mobile, 'owner', 'invited', true);
	elsif v_primary_owner_status <> 'active' then
		update public.staff
		set name = p_owner_name, email = p_owner_email, mobile = p_owner_mobile
		where id = v_primary_owner_id;
	end if;

	return p_id;
end;
$$;

revoke execute on function public.admin_update_restaurant(
	uuid, text, text, text, text, text, text, numeric, text, text, text
) from public;
grant execute on function public.admin_update_restaurant(
	uuid, text, text, text, text, text, text, numeric, text, text, text
) to authenticated;
