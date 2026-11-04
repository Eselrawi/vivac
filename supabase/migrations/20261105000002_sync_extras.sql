-- lat/lng legibles desde el cliente (la columna geography no se lee cómoda por la API)
alter table public.vivacs add column lat double precision generated always as (extensions.st_y(geom::extensions.geometry)) stored;
alter table public.vivacs add column lng double precision generated always as (extensions.st_x(geom::extensions.geometry)) stored;
alter table public.places add column lat double precision generated always as (extensions.st_y(geom::extensions.geometry)) stored;
alter table public.places add column lng double precision generated always as (extensions.st_x(geom::extensions.geometry)) stored;

-- Tracks grabados o importados, ligados a un vivac
create table public.tracks (
  id uuid primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  vivac_id uuid references public.vivacs (id) on delete set null,
  name text not null,
  coords jsonb not null,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
alter table public.tracks enable row level security;
create policy tracks_read on public.tracks for select to authenticated using (public.is_member(group_id));
create policy tracks_insert on public.tracks for insert to authenticated with check (public.is_member(group_id) and created_by = auth.uid());
create policy tracks_delete on public.tracks for delete to authenticated using (public.is_member(group_id) and created_by = auth.uid());

-- Correcciones del grupo sobre sitios del catálogo: orientación de un parapeto, precio, estado del agua, confirmaciones…
create table public.place_notes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  place_ref text not null,
  kind text not null check (kind in ('orientation', 'price', 'water', 'confirm', 'note')),
  data jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index place_notes_ref_idx on public.place_notes (group_id, place_ref);
alter table public.place_notes enable row level security;
create policy notes_read on public.place_notes for select to authenticated using (public.is_member(group_id));
create policy notes_insert on public.place_notes for insert to authenticated with check (public.is_member(group_id) and created_by = auth.uid());
create policy notes_delete on public.place_notes for delete to authenticated using (public.is_member(group_id) and created_by = auth.uid());
