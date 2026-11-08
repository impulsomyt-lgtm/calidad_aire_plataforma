/*
 * AIRE.BGA | Lectura del historial de alertas confirmado por PostgreSQL.
 * Solo GET /rest/v1/alertas. Sin permisos de escritura ni secretos privados.
 */
(function (global) {
  'use strict';
  const COLUMNAS = 'id,fecha_evento,fecha_registro,tipo,indicador,evento,nivel,valor';
  const TAM_PAGINA = 1000;
  function configuracion() {
    const cfg = global.AIRE_BGA_SUPABASE || {};
    const url = String(cfg.url || '').trim().replace(/\/+$/, '');
    const key = String(cfg.publishableKey || '').trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key.startsWith('sb_publishable_')) return null;
    return {url, key};
  }
  function disponible() {return Boolean(configuracion());}
  function convertir(f) {
    const ts=Date.parse(f.fecha_evento);
    const registroMs=Date.parse(f.fecha_registro);
    const valor=Number(f.valor);
    if(!Number.isFinite(ts) || !Number.isFinite(valor))return null;
    return {
      id:String(f.id || ''),ts,registroMs:Number.isFinite(registroMs)?registroMs:ts,
      tipo:String(f.tipo||''),nombre:String(f.indicador||''),evento:String(f.evento||''),
      nivel:String(f.nivel||''),valor
    };
  }
  async function consultar({tipo='todos', maximo=500, todos=false, progreso}={}){
    const cfg=configuracion();
    if(!cfg)throw new Error('Falta la clave pública sb_publishable_ en supabase-config.js.');
    const datos=[];
    let offset=0, total=null;
    while(true){
      const cantidad=todos?TAM_PAGINA:Math.min(TAM_PAGINA,maximo-offset);
      if(cantidad<=0)break;
      const url=new URL(cfg.url+'/rest/v1/alertas');
      url.searchParams.set('select',COLUMNAS);
      if(tipo!=='todos')url.searchParams.set('tipo','eq.'+tipo);
      url.searchParams.set('order',todos?'fecha_evento.asc,id.asc':'fecha_evento.desc,id.desc');
      url.searchParams.set('limit',String(cantidad));
      url.searchParams.set('offset',String(offset));
      const response=await fetch(url.toString(),{
        headers:{'apikey':cfg.key,'Accept':'application/json','Prefer':'count=exact'},
        cache:'no-store'
      });
      if(!response.ok){
        let error='';try{const info=await response.json();error=info.message||info.error||'';}catch(_){ }
        throw new Error(`Supabase HTTP ${response.status}${error?': '+error:''}`);
      }
      const rango=response.headers.get('Content-Range');
      if(rango && /\/(\d+)$/.test(rango))total=Number(rango.split('/')[1]);
      const lote=await response.json();
      if(!Array.isArray(lote))throw new Error('Respuesta de alertas no válida.');
      datos.push(...lote.map(convertir).filter(Boolean));
      offset+=lote.length;
      if(typeof progreso==='function')progreso(datos.length);
      if(lote.length<cantidad || (!todos && offset>=maximo))break;
    }
    return {datos,total:total??datos.length};
  }
  async function consultarRecientes({maximo=500}={}){
    return consultar({maximo});
  }
  async function consultarCSV({tipo='todos',progreso}={}){
    const r=await consultar({tipo,todos:true,progreso});
    return r.datos;
  }
  global.AIRE_BGA_ALERTAS=Object.freeze({disponible,consultarRecientes,consultarCSV});
})(window);
