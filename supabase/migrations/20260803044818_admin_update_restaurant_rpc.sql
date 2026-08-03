-- Custom SQL migration file, put your code below! --

-- ============================================================================
-- 7. Dineinly Admin restaurant management: admin_update_restaurant
-- ============================================================================
-- Third sibling to admin_create_restaurant/admin_reassign_primary_owner
-- (supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql §5).
-- The restaurants.update tRPC procedure previously did this restaurant +
-- staff write as two separate Supabase calls from application code, with a
-- select in between to enforce "the primary admin's email is immutable
-- once they've signed in" — a partial failure between the two writes could
-- leave the restaurant and its admin-contact row inconsistent, and the
-- email-lock rule was enforced only in that one call site, not the
-- database. Folding it into one SECURITY INVOKER function gives the same
-- atomicity §5's other two functions already have, and moves the rule
-- next to the data it protects.
--
-- Same hardening as every other function in that section: `set
-- search_path = ''` with fully schema-qualified references, `execute`
-- revoked from `public` and granted only to `authenticated`, and an
-- explicit `is_dineinly_admin()` check as the first statement.

create or replace function public.admin_update_restaurant(
	p_id uuid,
	p_name text,
	p_address text,
	p_gst_number text,
	p_state text,
	p_pincode text,
	p_service_charge_rate numeric,
	p_admin_name text,
	p_admin_email text,
	p_admin_mobile text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_primary_owner_id uuid;
	v_primary_owner_status public.staff_status;
	v_primary_owner_email text;
begin
	if not public.is_dineinly_admin() then
		raise exception 'Only Dineinly Admin may update restaurants';
	end if;

	if not exists (select 1 from public.restaurants where id = p_id) then
		raise exception 'Restaurant not found';
	end if;

	select id, status, email
	into v_primary_owner_id, v_primary_owner_status, v_primary_owner_email
	from public.staff
	where restaurant_id = p_id and is_primary_owner = true
	limit 1;

	if v_primary_owner_id is not null
		and v_primary_owner_status = 'active'
		and v_primary_owner_email <> p_admin_email
	then
		raise exception 'This admin has already signed in — their email is their login identity. Use Reassign Primary Admin to change it.';
	end if;

	update public.restaurants
	set
		name = p_name,
		address = p_address,
		gst_number = p_gst_number,
		state = p_state,
		pincode = p_pincode,
		service_charge_rate = p_service_charge_rate
	where id = p_id;

	if v_primary_owner_id is not null then
		update public.staff
		set name = p_admin_name, email = p_admin_email, mobile = p_admin_mobile
		where id = v_primary_owner_id;
	else
		-- Edge case: a restaurant with no primary owner (shouldn't happen via
		-- admin_create_restaurant's own insert, but tolerate it rather than
		-- leaving the admin stuck with an uneditable directory row).
		insert into public.staff (restaurant_id, email, name, mobile, role, status, is_primary_owner)
		values (p_id, p_admin_email, p_admin_name, p_admin_mobile, 'owner', 'invited', true);
	end if;

	return p_id;
end;
$$;

revoke execute on function public.admin_update_restaurant(
	uuid, text, text, text, text, text, numeric, text, text, text
) from public;
grant execute on function public.admin_update_restaurant(
	uuid, text, text, text, text, text, numeric, text, text, text
) to authenticated;
