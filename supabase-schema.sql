-- WEBGEN LG - BASE DE DATOS + SEGURIDAD
-- Ejecutar UNA sola vez en Supabase > SQL Editor.
-- Este script puede volver a ejecutarse: usa IF EXISTS / IF NOT EXISTS donde corresponde.

create extension if not exists pgcrypto;

create table if not exists public.webgen_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  name text not null default 'Mi negocio',
  is_published boolean not null default false,
  site_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices para búsquedas y políticas RLS.
create index if not exists webgen_projects_user_id_idx
on public.webgen_projects (user_id);

create index if not exists webgen_projects_updated_at_idx
on public.webgen_projects (updated_at desc);

-- Solo una página PUBLICADA puede usar un slug determinado.
create unique index if not exists webgen_projects_published_slug_unique
on public.webgen_projects (slug)
where is_published = true;

-- El servidor controla updated_at.
create or replace function public.webgen_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists webgen_projects_set_updated_at on public.webgen_projects;
create trigger webgen_projects_set_updated_at
before update on public.webgen_projects
for each row execute function public.webgen_set_updated_at();

alter table public.webgen_projects enable row level security;

-- Permisos mínimos. Visitantes solo pueden LEER páginas publicadas.
revoke all on table public.webgen_projects from anon, authenticated;
grant select on table public.webgen_projects to anon;
grant select, insert, update, delete on table public.webgen_projects to authenticated;

-- El dueño puede leer todos sus proyectos.
drop policy if exists "owners read projects" on public.webgen_projects;
create policy "owners read projects"
on public.webgen_projects
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Cualquier visitante puede leer únicamente páginas publicadas.
drop policy if exists "public read published projects" on public.webgen_projects;
create policy "public read published projects"
on public.webgen_projects
for select
to anon, authenticated
using (is_published = true);

-- Solo un usuario autenticado puede insertar proyectos a su propio nombre.
drop policy if exists "owners insert projects" on public.webgen_projects;
create policy "owners insert projects"
on public.webgen_projects
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- Solo el dueño puede modificar sus proyectos.
drop policy if exists "owners update projects" on public.webgen_projects;
create policy "owners update projects"
on public.webgen_projects
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Solo el dueño puede eliminar sus proyectos.
drop policy if exists "owners delete projects" on public.webgen_projects;
create policy "owners delete projects"
on public.webgen_projects
for delete
to authenticated
using ((select auth.uid()) = user_id);
