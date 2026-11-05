-- Tablero NOVA — estructura en Supabase
-- nova_respuestas: una fila por respuesta del formulario. PRIVADA: contiene nombre de empresa
--   y datos de contacto (en `datos`). RLS activo y SIN políticas → solo la service_role lee/escribe.
-- nova_tablero: una sola fila con el agregado que ve el público (ya con la regla n<5 aplicada).
--   Lectura anónima + publicación Realtime para que las páginas abiertas se actualicen solas.

create table if not exists public.nova_respuestas (
  id               text primary key,          -- hash(marca temporal + empresa normalizada)
  fila             integer,                   -- fila en el Sheet (referencia)
  marca_temporal   timestamptz,
  excluida         boolean not null default false,
  motivo_exclusion text,                      -- fila resaltada en amarillo / prueba / cuenta interna
  pais             text,
  en_base          boolean,                   -- está en la base CCB convocada
  enriquecida      boolean,                   -- tamaño/sector tomados de registro oficial o fuente pública
  tamano           text,
  sector3          text,
  sector           text,
  region           text,
  cargo            text,
  responde         text,
  contrato         text,
  mujeres_dir      text,
  datos            jsonb not null,            -- la fila completa del formulario (encabezado → valor)
  sincronizado     timestamptz not null default now()
);
create index if not exists nova_respuestas_marca_idx on public.nova_respuestas (marca_temporal);
alter table public.nova_respuestas enable row level security;
revoke all on public.nova_respuestas from anon, authenticated;

create table if not exists public.nova_tablero (
  id          smallint primary key default 1 check (id = 1),
  datos       jsonb not null,
  actualizado timestamptz not null default now()
);
alter table public.nova_tablero enable row level security;
revoke insert, update, delete on public.nova_tablero from anon, authenticated;
grant select on public.nova_tablero to anon, authenticated;
drop policy if exists "nova_tablero lectura publica" on public.nova_tablero;
create policy "nova_tablero lectura publica" on public.nova_tablero
  for select to anon, authenticated using (true);

-- Realtime: avisa a las páginas abiertas cada vez que cambia el agregado
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'nova_tablero'
  ) then
    alter publication supabase_realtime add table public.nova_tablero;
  end if;
end $$;
