/*
 AIRE.BGA — Capa de consulta del historial centralizado.
 Arquitectura: frontend de solo lectura -> Supabase Data API -> PostgreSQL (RLS).
 Nunca guarda datos directamente en Supabase desde el navegador.
 */
(function (global) {
  'use strict';
  const CAMPOS = ['pm1','pm25','pm4','pm10','temperatura','humedad','voc_index','nox_index'];
  const COLUMNAS = ['fecha_medicion','fecha_recepcion',...CAMPOS];
  const TAM_PAGINA = 1000;
  const TTL_MS = 45000;
  let cache = null;

  function configuracion() {
    const cfg = global.AIRE_BGA_SUPABASE || {};
    const url = String(cfg.url || '').trim().replace(/\/+$/, '');
    const key = String(cfg.publishableKey || '').trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key.startsWith('sb_publishable_')) return null;
    return { url, key };
  }
  function disponible() { return !!configuracion(); }
  function convertir(fila) {
    const ts = Date.parse(fila.fecha_medicion);
    if (!Number.isFinite(ts)) return null;
    const registro = {
      ts,
      fecha_hora: fila.fecha_medicion,
      recibido: fila.fecha_recepcion
    };
    for (const campo of CAMPOS) {
      const valor = fila[campo];
      if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return null;
      registro[campo] = Number(valor);
    }
    return registro;
  }

  async function descargarPaginas({ desde=-Infinity, hasta=Infinity, maximo=Infinity, progreso }) {
    const cfg = configuracion();
    if (!cfg) throw new Error('Configura una clave sb_publishable_ en supabase-config.js.');
    const limite = Number.isFinite(maximo) ? maximo + 1 : Infinity;
    const filas = [];
    let offset = 0;
    while (filas.length < limite) {
      const cantidad = Math.min(TAM_PAGINA, limite - filas.length);
      const url = new URL(cfg.url + '/rest/v1/mediciones');
      url.searchParams.set('select', COLUMNAS.join(','));
      if (Number.isFinite(desde)) url.searchParams.append('fecha_medicion','gte.' + new Date(desde).toISOString());
      if (Number.isFinite(hasta)) url.searchParams.append('fecha_medicion','lte.' + new Date(hasta).toISOString());
      url.searchParams.set('order','fecha_medicion.desc');
      url.searchParams.set('limit',String(cantidad));
      url.searchParams.set('offset',String(offset));
      const respuesta = await fetch(url.toString(), {
        headers: { 'apikey': cfg.key, 'Accept':'application/json' },
        cache: 'no-store'
      });
      if (!respuesta.ok) {
        let detalle='';
        try { const e=await respuesta.json();detalle=e.message || e.error || ''; } catch (_) {}
        throw new Error(`Supabase HTTP ${respuesta.status}${detalle ? ': '+detalle : ''}`);
      }
      const lote = await respuesta.json();
      if (!Array.isArray(lote)) throw new Error('Respuesta de Supabase no válida.');
      filas.push(...lote);
      offset += lote.length;
      if (typeof progreso === 'function') progreso(filas.length);
      if (lote.length < cantidad) break;
    }
    const truncado = Number.isFinite(maximo) && filas.length > maximo;
    const relevantes = truncado ? filas.slice(0,maximo) : filas;
    const datos = relevantes.map(convertir).filter(Boolean).reverse();
    return {datos,truncado};
  }
  async function consultarVista({desde=-Infinity,hasta=Infinity,maximo=6000}={}) {
    const llave = `${desde}|${hasta}|${maximo}`;
    if (cache && cache.llave === llave && Date.now()-cache.fecha < TTL_MS) return cache.respuesta;
    const respuesta = await descargarPaginas({desde,hasta,maximo});
    cache = { llave, fecha:Date.now(), respuesta };
    return respuesta;
  }
  async function consultarCSV({desde=-Infinity,hasta=Infinity,maximo=Infinity,progreso}={}) {
    return descargarPaginas({desde,hasta,maximo,progreso});
  }
  global.AIRE_BGA_HISTORIAL = Object.freeze({ disponible,consultarVista,consultarCSV });
})(window);
