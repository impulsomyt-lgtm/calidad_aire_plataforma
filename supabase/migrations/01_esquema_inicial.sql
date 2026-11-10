-- AIRE.BGA — Esquema inicial para Supabase PostgreSQL
-- Proyecto de grado: monitoreo exterior de calidad del aire en Bucaramanga
-- Version: 1.0 | 2026-11-08
-- Ejecucion: Supabase > SQL Editor > New query > Run
-- Idempotente: puede ejecutarse de nuevo sin borrar registros existentes.

begin;

-- 1) Catalogo de estaciones IoT
create table if not exists public.estaciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  ciudad text not null default 'Bucaramanga',
  entorno text not null default 'Exterior',
  controlador text not null default 'ESP32',
  sensor text not null default 'Sensirion SEN55',
  intervalo_segundos integer not null default 30 check (intervalo_segundos > 0),
  activa boolean not null default true,
  creada_en timestamptz not null default now()
);

-- 2) Historico de mediciones del SEN55
create table if not exists public.mediciones (
  id uuid primary key default gen_random_uuid(),
  estacion_id uuid not null references public.estaciones(id) on delete restrict,
  fecha_medicion timestamptz not null,
  fecha_recepcion timestamptz not null default now(),
  pm1 numeric(10,2) not null check (pm1 >= 0),
  pm25 numeric(10,2) not null check (pm25 >= 0),
  pm4 numeric(10,2) not null check (pm4 >= 0),
  pm10 numeric(10,2) not null check (pm10 >= 0),
  temperatura numeric(6,2) not null check (temperatura between -40 and 85),
  humedad numeric(5,2) not null check (humedad between 0 and 100),
  voc_index numeric(6,2) check (voc_index between 0 and 500),
  nox_index numeric(6,2) check (nox_index between 0 and 500),
  constraint uq_medicion_estacion_fecha unique (estacion_id, fecha_medicion)
);

create index if not exists idx_mediciones_estacion_fecha
  on public.mediciones (estacion_id, fecha_medicion desc);

-- 3) Historial auditable de eventos de alerta y normalizacion
create table if not exists public.alertas (
  id uuid primary key default gen_random_uuid(),
  estacion_id uuid not null references public.estaciones(id) on delete restrict,
  medicion_id uuid references public.mediciones(id) on delete set null,
  fecha_evento timestamptz not null,
  fecha_registro timestamptz not null default now(),
  tipo text not null check (tipo in ('pm', 'voc', 'nox')),
  indicador text not null,
  evento text not null,
  nivel text not null check (nivel in ('Normal', 'Atención', 'Elevada', 'Muy elevada', 'Aviso', 'Resuelto')),
  valor numeric(12,2) not null,
  constraint uq_alerta_evento unique (estacion_id, tipo, evento, fecha_evento)
);

create index if not exists idx_alertas_estacion_fecha
  on public.alertas (estacion_id, fecha_evento desc);

-- Seguridad: RLS obligatorio en cada tabla.
-- No habilitamos lectura ni escritura publica en este paso.
alter table public.estaciones enable row level security;
alter table public.mediciones enable row level security;
alter table public.alertas enable row level security;

revoke all privileges on table
  public.estaciones, public.mediciones, public.alertas
from anon, authenticated;

-- La cuenta tecnica del servidor tendra los permisos necesarios.
-- Su clave se usara solo en un servicio backend, NUNCA en app.js/Vercel publico.
grant select, insert, update, delete on table
  public.estaciones, public.mediciones, public.alertas
  to service_role;

-- Alta de la primera estacion (no contiene lecturas artificiales).
insert into public.estaciones
  (codigo, nombre, ciudad, entorno, controlador, sensor, intervalo_segundos)
values
  ('estacion01', 'Estación 01', 'Bucaramanga', 'Exterior', 'ESP32', 'Sensirion SEN55', 30)
on conflict (codigo) do nothing;

commit;

-- Comprobacion: debe devolver una fila, codigo = estacion01.
select codigo, nombre, ciudad, entorno, sensor, intervalo_segundos
from public.estaciones
order by codigo;
