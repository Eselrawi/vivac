-- Noche dormida en un sitio de la app (el id del catálogo no es un uuid, por eso va como texto)
alter table public.vivacs add column place_ref text;
