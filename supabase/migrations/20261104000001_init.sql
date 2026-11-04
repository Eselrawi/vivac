create extension if not exists postgis with schema extensions;

-- Perfiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  home_lat double precision not null default 40.4436,
  home_lng double precision not null default -3.9944,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Sitios (group_id null = catálogo público de solo lectura)
create table public.places (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups (id) on delete cascade,
  kind text not null,
  name text not null,
  geom extensions.geography(point, 4326) not null,
  ele integer,
  shelter text,
  props jsonb not null default '{}'::jsonb,
  verified boolean not null default false,
  source text,
  secret boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index places_geom_idx on public.places using gist (geom);
create index places_group_idx on public.places (group_id);

-- Noches dormidas
create table public.vivacs (
  id uuid primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  place_id uuid references public.places (id) on delete set null,
  name text not null,
  geom extensions.geography(point, 4326) not null,
  ele integer,
  slept_at timestamptz not null default now(),
  sleep_rating smallint check (sleep_rating between 1 and 3),
  notes text,
  photo_path text,
  weather jsonb,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index vivacs_group_idx on public.vivacs (group_id, slept_at desc);

-- Ayudantes
create or replace function public.is_member(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.join_group(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select id into gid from groups where invite_code = code;
  if gid is null then raise exception 'Código de invitación no válido'; end if;
  insert into group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end $$;

create or replace function public.create_group(gname text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  insert into groups (name, created_by) values (gname, auth.uid()) returning id into gid;
  insert into group_members (group_id, user_id, role) values (gid, auth.uid(), 'admin');
  return gid;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name) values (new.id, split_part(new.email, '@', 1)) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS estricta
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.places enable row level security;
alter table public.vivacs enable row level security;

create policy profiles_own on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy groups_read on public.groups for select to authenticated using (public.is_member(id));
create policy groups_update on public.groups for update to authenticated
  using (exists (select 1 from group_members m where m.group_id = id and m.user_id = auth.uid() and m.role = 'admin'));

create policy members_read on public.group_members for select to authenticated using (public.is_member(group_id));
create policy members_leave on public.group_members for delete to authenticated using (user_id = auth.uid());

create policy places_read on public.places for select to authenticated
  using (group_id is null or public.is_member(group_id));
create policy places_insert on public.places for insert to authenticated
  with check (group_id is not null and public.is_member(group_id));
create policy places_update on public.places for update to authenticated
  using (group_id is not null and public.is_member(group_id));
create policy places_delete on public.places for delete to authenticated
  using (group_id is not null and public.is_member(group_id) and created_by = auth.uid());

create policy vivacs_read on public.vivacs for select to authenticated using (public.is_member(group_id));
create policy vivacs_insert on public.vivacs for insert to authenticated
  with check (public.is_member(group_id) and created_by = auth.uid());
create policy vivacs_update on public.vivacs for update to authenticated using (public.is_member(group_id));
create policy vivacs_delete on public.vivacs for delete to authenticated
  using (public.is_member(group_id) and created_by = auth.uid());

revoke all on function public.join_group(text), public.create_group(text) from public, anon;
grant execute on function public.join_group(text), public.create_group(text) to authenticated;

-- Fotos: bucket privado; la primera carpeta del path es el id del grupo
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and owner = auth.uid());
