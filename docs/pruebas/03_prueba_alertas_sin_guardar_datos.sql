-- AIRE.BGA - Prueba reversible del trigger de alertas (2026-11-08)
-- Ejecutar completo en Supabase > SQL Editor como rol postgres.
-- Inserta una estacion temporal y 8 mediciones SOLO dentro de una
-- subtransaccion que siempre se revierte. NO altera datos reales.
-- Esperado: "Success" y aviso "PRUEBA AIRE.BGA OK" en mensajes.

DO $prueba$
DECLARE
  id_prueba uuid;
  t_inicio timestamptz := now() - interval '10 minutes';
  n integer;
  eventos_rojos integer;
  eventos_normales integer;
BEGIN
  BEGIN
    INSERT INTO public.estaciones (codigo, nombre)
    VALUES ('prueba_temporal_' || replace(gen_random_uuid()::text, '-', ''),
            'PRUEBA TEMPORAL - NO REAL')
    RETURNING id INTO id_prueba;

    -- Cuatro lecturas rojas a 30 s; cuatro normales para recuperación.
    FOR n IN 0..7 LOOP
      INSERT INTO public.mediciones
        (estacion_id, fecha_medicion,
         pm1, pm25, pm4, pm10, temperatura, humedad, voc_index, nox_index)
      VALUES
        (id_prueba, t_inicio + n * interval '30 seconds',
         CASE WHEN n < 4 THEN 50 ELSE 4 END,
         CASE WHEN n < 4 THEN 60 ELSE 5 END,
         CASE WHEN n < 4 THEN 60 ELSE 5 END,
         CASE WHEN n < 4 THEN 60 ELSE 5 END,
         26, 60, 100, 1);
    END LOOP;

    SELECT
      count(*) FILTER (WHERE evento = 'Alerta confirmada' AND nivel = 'Muy elevada'),
      count(*) FILTER (WHERE evento = 'Normalización' AND nivel = 'Normal')
    INTO eventos_rojos, eventos_normales
    FROM public.alertas
    WHERE estacion_id = id_prueba AND tipo = 'pm';

    IF eventos_rojos <> 1 OR eventos_normales <> 1 THEN
      RAISE EXCEPTION 'PRUEBA FALLIDA: alertas rojas %, normalizaciones % (se revierten datos)',
        eventos_rojos, eventos_normales;
    END IF;

    RAISE NOTICE 'PRUEBA AIRE.BGA OK: 1 alerta roja, 1 normalizacion. Ningun dato de prueba quedara guardado.';

    -- Lanzar y capturar una excepcion controlada: revierte toda la prueba.
    RAISE EXCEPTION 'AIRE_BGA_REVERTIR_PRUEBA';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'AIRE_BGA_REVERTIR_PRUEBA' THEN
      RAISE;
    END IF;
  END;
END;
$prueba$;
