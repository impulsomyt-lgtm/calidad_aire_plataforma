// AIRE.BGA · Edge Function registrar-medicion
// Recibe una lectura del SEN55 por HTTPS y la almacena en Supabase.
// Requiere el secreto AIRE_BGA_INGEST_TOKEN en Edge Functions > Secrets.
// En Settings de esta funcion, desactivar Verify JWT (auth propia abajo).
import { withSupabase } from 'npm:@supabase/server@^1';

const campos = ['pm1', 'pm25', 'pm4', 'pm10', 'temperatura', 'humedad', 'voc_index', 'nox_index'] as const;

type Lectura = Record<string, unknown>;

function tokenCorrecto(recibido: string, esperado: string): boolean {
  const a = new TextEncoder().encode(recibido);
  const b = new TextEncoder().encode(esperado);
  let diferencia = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diferencia |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diferencia === 0;
}

function validar(d: Lectura): string | null {
  const fecha = d.fecha_hora;
  if (typeof fecha !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(fecha)) {
    return 'fecha_hora debe incluir zona horaria, por ejemplo -05:00';
  }
  const t = Date.parse(fecha);
  if (!Number.isFinite(t) || t > Date.now() + 300_000 || t < Date.now() - 86_400_000) {
    return 'fecha_hora invalida, futura o anterior a 24 horas';
  }
  for (const campo of campos) {
    if (typeof d[campo] !== 'number' || !Number.isFinite(d[campo])) {
      return `Campo numerico faltante o invalido: ${campo}`;
    }
  }
  for (const pm of ['pm1', 'pm25', 'pm4', 'pm10'] as const) {
    if ((d[pm] as number) < 0 || (d[pm] as number) > 100000) return `${pm} fuera de rango`;
  }
  if ((d.temperatura as number) < -40 || (d.temperatura as number) > 85) return 'temperatura fuera de rango';
  if ((d.humedad as number) < 0 || (d.humedad as number) > 100) return 'humedad fuera de rango';
  for (const indice of ['voc_index', 'nox_index'] as const) {
    if ((d[indice] as number) < 0 || (d[indice] as number) > 500) return `${indice} fuera de rango`;
  }
  return null;
}

const respuesta = (mensaje: object, status = 200): Response => Response.json(mensaje, { status });

export default {
  fetch: withSupabase({ auth: 'none', cors: 'disabled' }, async (req, ctx) => {
    if (req.method !== 'POST') return respuesta({ error: 'Solo POST' }, 405);

    const secreto = Deno.env.get('AIRE_BGA_INGEST_TOKEN');
    if (!secreto || secreto.length < 32) return respuesta({ error: 'Secret de ingesta no configurado' }, 503);
    if (!tokenCorrecto(req.headers.get('x-device-token') ?? '', secreto)) {
      return respuesta({ error: 'No autorizado' }, 401);
    }
    if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return respuesta({ error: 'Se requiere application/json' }, 415);
    }

    let dato: Lectura;
    try {
      const cuerpo = await req.text();
      if (cuerpo.length > 4096) return respuesta({ error: 'Mensaje demasiado grande' }, 413);
      const parseado: unknown = JSON.parse(cuerpo);
      if (!parseado || typeof parseado !== 'object' || Array.isArray(parseado)) throw Error('No es un objeto');
      dato = parseado as Lectura;
    } catch {
      return respuesta({ error: 'JSON invalido' }, 400);
    }

    const errorValidacion = validar(dato);
    if (errorValidacion) return respuesta({ error: errorValidacion }, 422);

    const { data: estacion, error: errorEstacion } = await ctx.supabaseAdmin
      .from('estaciones').select('id').eq('codigo', 'estacion01').single();
    if (errorEstacion || !estacion) return respuesta({ error: 'Estacion no encontrada' }, 500);

    const medicion = {
      estacion_id: estacion.id,
      fecha_medicion: new Date(Date.parse(dato.fecha_hora as string)).toISOString(),
      ...Object.fromEntries(campos.map(campo => [campo, dato[campo]])),
    };
    const { error } = await ctx.supabaseAdmin.from('mediciones').upsert(medicion, {
      onConflict: 'estacion_id,fecha_medicion',
      ignoreDuplicates: true,
    });
    if (error) {
      console.error('No se pudo guardar la medicion:', error.code, error.message);
      return respuesta({ error: 'Error al guardar la medicion' }, 500);
    }
    return respuesta({ ok: true, resultado: 'registrada_o_ya_existente', estacion: 'estacion01' }, 200);
  }),
};
