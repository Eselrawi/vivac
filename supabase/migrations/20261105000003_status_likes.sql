-- Estado de acceso («¿Cómo estaba?») y «me gusta» compartidos con el grupo
alter table public.place_notes drop constraint if exists place_notes_kind_check;
alter table public.place_notes add constraint place_notes_kind_check
  check (kind in ('orientation', 'price', 'water', 'confirm', 'note', 'status', 'key', 'winter'));

create table public.place_likes (
  group_id uuid not null references public.groups (id) on delete cascade,
  place_ref text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, place_ref, user_id)
);
create index place_likes_ref_idx on public.place_likes (group_id, place_ref);
alter table public.place_likes enable row level security;
create policy likes_read on public.place_likes for select to authenticated using (public.is_member(group_id));
create policy likes_insert on public.place_likes for insert to authenticated with check (public.is_member(group_id) and user_id = auth.uid());
create policy likes_delete on public.place_likes for delete to authenticated using (user_id = auth.uid());

-- Nombres de los miembros del grupo (para ver quién ha dado «me gusta»)
create or replace function public.group_member_names(gid uuid)
returns table (user_id uuid, name text) language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(nullif(p.name, ''), 'Alguien') from group_members m left join profiles p on p.id = m.user_id
  where m.group_id = gid and public.is_member(gid);
$$;
revoke all on function public.group_member_names(uuid) from public, anon;
grant execute on function public.group_member_names(uuid) to authenticated;

-- Cada uno puede cambiar su nombre visible
create or replace function public.set_my_name(new_name text)
returns void language sql security definer set search_path = public as $$
  update profiles set name = left(new_name, 40) where id = auth.uid();
$$;
revoke all on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;
