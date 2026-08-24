-- resolve_active_floor_staff gains role alongside id/name: the station
-- header's "Profile" action needs to show who's acting and what they can do
-- (Waiter/Manager/Owner) without exposing the shared station account's own
-- Staff row for editing. Postgres can't change a function's return shape via
-- create or replace, so the old signature is dropped first.
drop function if exists public.resolve_active_floor_staff(uuid, uuid);

create function public.resolve_active_floor_staff(
	p_restaurant_id uuid,
	p_staff_id uuid
)
returns table (id uuid, name text, role public.staff_role)
language sql
stable
security definer
set search_path = ''
as $$
	select s.id, s.name, s.role
	from public.staff s
	where s.id = p_staff_id
		and s.restaurant_id = p_restaurant_id
		and s.status = 'active'
		and s.role in ('waiter', 'manager', 'owner')
		and public.is_active_staff_for_restaurant(p_restaurant_id);
$$;

revoke execute on function public.resolve_active_floor_staff(uuid, uuid) from public;
grant execute on function public.resolve_active_floor_staff(uuid, uuid) to authenticated;
