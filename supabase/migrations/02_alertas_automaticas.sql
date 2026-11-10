-- AIRE.BGA | PASO 19 | Alertas centralizadas sin cambiar el firmware
-- Version 1.0 | 2026-11-08
-- Esquema esperado: estaciones, mediciones, alertas (script 01_esquema_inicial.sql)
-- SQL Editor (rol postgres). No elimina registros ni modifica las mediciones historicas.
-- Se aplica a NUEVAS inserciones en public.mediciones; sin reprocesamiento historico.
-- Regla PM: 4 lecturas consecutivas <= 90 s entre ellas para subir o bajar.
-- VOC >=150 y NOx >=20: solo indices relativos experimentales.
-- Una lectura 0 de VOC/NOx se excluye de la confirmacion de recuperación.

begin;

create or replace function public.aire_bga_alertas_tras_medicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
declare
  r record;
  n integer := 0;
  t_anterior timestamptz;
  consecutivas boolean := true;

  nivel_25 integer;
  nivel_10 integer;
  minimo integer := 3;
  maximo integer := 0;
  estado_previo text;
  grado_previo integer;
  nuevo_grado integer;
  nombre_nivel text;
  nombre_evento text;
  nombre_indicador text;

  voc_todas_altas boolean := true;
  voc_todas_bajas boolean := true;
  nox_todas_altas boolean := true;
  nox_todas_bajas boolean := true;
  estado_voc text;
  estado_nox text;
begin
  -- Serializar las evaluaciones concurrentes de una misma estacion.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('aire_bga_alertas:' || new.estacion_id::text, 0)
  );

  -- Una medicion insertada fuera de orden se guarda, pero no reescribe el
  -- estado de alertas como si fuera la lectura mas reciente.
  if exists (
    select 1 from public.mediciones m
    where m.estacion_id = new.estacion_id
      and m.fecha_medicion > new.fecha_medicion
  ) then
    return new;
  end if;

  -- Leer las ultimas cuatro mediciones de la misma estacion, en orden temporal.
  for r in
    select q.fecha_medicion, q.pm25, q.pm10, q.voc_index, q.nox_index
    from (
      select fecha_medicion, pm25, pm10, voc_index, nox_index
      from public.mediciones
      where estacion_id = new.estacion_id
      order by fecha_medicion desc
      limit 4
    ) q
    order by q.fecha_medicion asc
  loop
    n := n + 1;
    if t_anterior is not null and (
      r.fecha_medicion <= t_anterior or
      r.fecha_medicion - t_anterior > interval '90 seconds'
    ) then
      consecutivas := false;
    end if;
    t_anterior := r.fecha_medicion;

    nivel_25 := case
      when r.pm25 >= 56 then 3
      when r.pm25 >= 38 then 2
      when r.pm25 >= 13 then 1
      else 0 end;
    nivel_10 := case
      when r.pm10 >= 255 then 3
      when r.pm10 >= 155 then 2
      when r.pm10 >= 55 then 1
      else 0 end;
    minimo := least(minimo, greatest(nivel_25, nivel_10));
    maximo := greatest(maximo, greatest(nivel_25, nivel_10));

    voc_todas_altas := voc_todas_altas and coalesce(r.voc_index >= 150, false);
    voc_todas_bajas := voc_todas_bajas and coalesce(r.voc_index >= 1 and r.voc_index < 150, false);
    nox_todas_altas := nox_todas_altas and coalesce(r.nox_index >= 20, false);
    nox_todas_bajas := nox_todas_bajas and coalesce(r.nox_index >= 1 and r.nox_index < 20, false);
  end loop;

  if n <> 4 or not consecutivas then
    return new;
  end if;

  -- El ultimo evento PM representa el estado confirmado. El primer estado
  -- Normal no genera evento; volver a Normal tras un episodio SI lo genera.
  select a.nivel into estado_previo
  from public.alertas a
  where a.estacion_id = new.estacion_id and a.tipo = 'pm'
  order by a.fecha_evento desc, a.fecha_registro desc, a.id desc
  limit 1;

  grado_previo := case estado_previo
    when 'Normal' then 0
    when 'Atención' then 1
    when 'Elevada' then 2
    when 'Muy elevada' then 3
    else null end;

  nombre_evento := null;
  nuevo_grado := null;

  if grado_previo is null then
    if minimo > 0 then
      nuevo_grado := minimo;
      nombre_evento := 'Alerta confirmada';
    end if;
  elsif minimo > grado_previo then
    nuevo_grado := minimo;
    nombre_evento := 'Aumento confirmado';
  elsif maximo < grado_previo then
    nuevo_grado := maximo;
    nombre_evento := case when maximo = 0 then 'Normalización'
                          else 'Reducción de alerta' end;
  end if;

  if nombre_evento is not null then
    nombre_nivel := (array['Normal', 'Atención', 'Elevada', 'Muy elevada'])[nuevo_grado+1];
    nivel_25 := case when new.pm25 >= 56 then 3 when new.pm25 >= 38 then 2
                     when new.pm25 >= 13 then 1 else 0 end;
    nivel_10 := case when new.pm10 >= 255 then 3 when new.pm10 >= 155 then 2
                     when new.pm10 >= 55 then 1 else 0 end;
    nombre_indicador := case when nivel_25 > nivel_10 then 'PM2.5'
                             when nivel_10 > nivel_25 then 'PM10'
                             else 'PM2.5 y PM10' end;
    insert into public.alertas
      (estacion_id, medicion_id, fecha_evento, tipo, indicador, evento, nivel, valor)
    values
      (new.estacion_id, new.id, new.fecha_medicion, 'pm',
       nombre_indicador, nombre_evento, nombre_nivel, greatest(new.pm25, new.pm10))
    on conflict (estacion_id, tipo, evento, fecha_evento) do nothing;
  end if;

  -- VOC y NOx: solo se registra el cruce sostenido de umbral y su retorno.
  -- 0 se considera lectura no concluyente para la recuperacion.
  select a.nivel into estado_voc from public.alertas a
  where a.estacion_id = new.estacion_id and a.tipo = 'voc'
  order by a.fecha_evento desc, a.fecha_registro desc, a.id desc limit 1;

  if voc_todas_altas and estado_voc is distinct from 'Aviso' then
    insert into public.alertas
      (estacion_id, medicion_id, fecha_evento, tipo, indicador, evento, nivel, valor)
    values (new.estacion_id, new.id, new.fecha_medicion, 'voc', 'VOC Index',
            'Incremento relativo detectado', 'Aviso', new.voc_index)
    on conflict (estacion_id, tipo, evento, fecha_evento) do nothing;
  elsif voc_todas_bajas and estado_voc = 'Aviso' then
    insert into public.alertas
      (estacion_id, medicion_id, fecha_evento, tipo, indicador, evento, nivel, valor)
    values (new.estacion_id, new.id, new.fecha_medicion, 'voc', 'VOC Index',
            'Retorno a referencia operativa', 'Resuelto', new.voc_index)
    on conflict (estacion_id, tipo, evento, fecha_evento) do nothing;
  end if;

  select a.nivel into estado_nox from public.alertas a
  where a.estacion_id = new.estacion_id and a.tipo = 'nox'
  order by a.fecha_evento desc, a.fecha_registro desc, a.id desc limit 1;

  if nox_todas_altas and estado_nox is distinct from 'Aviso' then
    insert into public.alertas
      (estacion_id, medicion_id, fecha_evento, tipo, indicador, evento, nivel, valor)
    values (new.estacion_id, new.id, new.fecha_medicion, 'nox', 'NOx Index',
            'Incremento relativo detectado', 'Aviso', new.nox_index)
    on conflict (estacion_id, tipo, evento, fecha_evento) do nothing;
  elsif nox_todas_bajas and estado_nox = 'Aviso' then
    insert into public.alertas
      (estacion_id, medicion_id, fecha_evento, tipo, indicador, evento, nivel, valor)
    values (new.estacion_id, new.id, new.fecha_medicion, 'nox', 'NOx Index',
            'Retorno a referencia operativa', 'Resuelto', new.nox_index)
    on conflict (estacion_id, tipo, evento, fecha_evento) do nothing;
  end if;

  return new;
exception when others then
  -- Ante un error de alertas, NO perder la medicion que ya ha llegado.
  -- La advertencia queda en registros de PostgreSQL para diagnosticarla.
  raise warning 'AIRE.BGA: alerta no evaluada para medicion %, SQLSTATE %, error %',
    new.id, sqlstate, sqlerrm;
  return new;
end;
$func$;

-- Limitar invocacion directa de la funcion: se ejecuta como trigger.
revoke all on function public.aire_bga_alertas_tras_medicion() from public, anon, authenticated;

-- No duplicar el trigger cuando se vuelva a ejecutar este script.
drop trigger if exists trg_aire_bga_alertas on public.mediciones;
create trigger trg_aire_bga_alertas
  after insert on public.mediciones
  for each row
  execute function public.aire_bga_alertas_tras_medicion();

commit;

-- Verificacion segura: debe devolver una fila y enabled = O.
select t.tgname as trigger, t.tgenabled as enabled,
       pg_catalog.pg_get_triggerdef(t.oid) as definicion
from pg_catalog.pg_trigger t
where t.tgrelid = 'public.mediciones'::pg_catalog.regclass
  and t.tgname = 'trg_aire_bga_alertas';
