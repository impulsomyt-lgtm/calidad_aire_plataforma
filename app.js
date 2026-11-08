/*
 AIRE.BGA · Estación 01 · Prototipo académico.
 MQTT -> semáforo en vivo. Supabase -> historial centralizado de mediciones y eventos.
 Alertas operativas experimentales: cuatro mediciones consecutivas.
 NO se calcula ni se afirma disponer del ICA oficial colombiano.
*/
const MQTT_URL = 'wss://broker.hivemq.com:8884/mqtt';
const TOPICO = 'bga/aire/sen55/estacion01/datos';
const CAMPOS = ['pm1','pm25','pm4','pm10','temperatura','humedad','voc_index','nox_index'];
const COLUMNAS_CSV = ['fecha_hora','fecha_recepcion','pm1','pm25','pm4','pm10','temperatura','humedad','voc_index','nox_index'];
const SEGUNDOS_INACTIVO = 95;
const MAX_GRAFICA = 350;
const CUATRO = 4;
const MAX_REGISTROS_VISTA = 6000;
const historialSupabase = window.AIRE_BGA_HISTORIAL;
const alertasSupabase = window.AIRE_BGA_ALERTAS;
let lecturasMQTTRecientes = [];
let errorHistorial = ''; 
const NIVELES = [
  { nombre:'Normal', etiqueta:'Calidad por partículas: normal', clase:'normal', color:'#12a978' },
  { nombre:'Atención', etiqueta:'Atención por partículas', clase:'attention', color:'#e4b12b' },
  { nombre:'Elevada', etiqueta:'Concentración elevada', clase:'elevated', color:'#e98935' },
  { nombre:'Muy elevada', etiqueta:'Concentración muy elevada', clase:'high', color:'#d94e60' }
];
const $ = id => document.getElementById(id);
const fechaCorta = new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const horaCO = new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const ejeCO = new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const nombresVistas = {panel:'Panel general',tendencias:'Tendencias',sensores:'Sensores',alertas:'Alertas'};

let db=null, dbDisponible=false, mqttCliente=null;
let historialMem=[], eventosMem=[];
let ultimasLecturas=[], ultimoRecibido=0, ultimaLectura=null, mensajesSesion=0;
let estadoPM=null; // null: todavía no confirmado; entero 0 a 3
let estadosGas={voc:false,nox:false};
let eventosTotales=0, filtroActual='40', tareaRefresco=null;
// El punto rojo representa NUEVAS alertas desde la última revisión en este navegador.
// El historial compartido vive en PostgreSQL. La marca de revisado es local a cada dispositivo.
const CLAVE_ALERTAS_NO_LEIDAS = 'aire_bga_alertas_no_leidas_v1';
const CLAVE_REVISION_REMOTA = 'aire_bga_alertas_revision_supabase_v1';
let alertasNoLeidas = false;
let alertasRemotas = [], totalAlertasRemotas = 0;
let alertasRemotasCargadas = false, errorAlertasRemotas = '', secuenciaConsultaAlertas = 0;
let ultimaRevisionRemota = null;
try {
  if(alertasSupabase?.disponible()){
    const s = localStorage.getItem(CLAVE_REVISION_REMOTA);
    ultimaRevisionRemota = s !== null && Number.isFinite(Number(s)) ? Number(s) : null;
  } else {
    alertasNoLeidas = localStorage.getItem(CLAVE_ALERTAS_NO_LEIDAS) === '1';
  }
} catch(e) { /* El almacenamiento puede estar bloqueado. */ }
function vistaAlertasActiva(){ return location.hash === '#alertas'; }
function marcarAlertasRevisadas(){
  alertasNoLeidas = false;
  if(alertasSupabase?.disponible()){
    if (alertasRemotasCargadas) {
      // Tomar la marca temporal del servidor, no el reloj del celular o PC.
      const ultimoVisto=alertasRemotas.reduce((max,e)=>Math.max(max,e.registroMs),0);
      ultimaRevisionRemota=Math.max(ultimaRevisionRemota??0,ultimoVisto);
      try {localStorage.setItem(CLAVE_REVISION_REMOTA, String(ultimaRevisionRemota));} catch(e){}
    }
  } else {
    try { localStorage.setItem(CLAVE_ALERTAS_NO_LEIDAS, '0'); } catch(e) {}
  }
  actualizarContadorAlertas();
}
function esNuevaAlerta(evento){
  return evento === 'Alerta confirmada' ||
         evento === 'Aumento confirmado' ||
         evento === 'Incremento relativo detectado';
}

function actualizarReloj(){ $('clock').textContent=horaCO.format(new Date()); }
actualizarReloj(); setInterval(actualizarReloj,1000);
function cambiarVista(){
  const vista=nombresVistas[location.hash.slice(1)] ? location.hash.slice(1) : 'panel';
  document.querySelectorAll('[data-page]').forEach(el=>{ const activo=el.dataset.page===vista;el.hidden=!activo;el.classList.toggle('active',activo); });
  document.querySelectorAll('[data-view]').forEach(el=>{const activo=el.dataset.view===vista;el.classList.toggle('active',activo); if(activo)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('breadcrumb').textContent=nombresVistas[vista]; window.scrollTo(0,0);
  if(vista==='tendencias') actualizarGraficasPersonalizadas();
  if(vista==='alertas'){
    if(!alertasSupabase?.disponible() || alertasRemotasCargadas) marcarAlertasRevisadas();
    actualizarTablaAlertas();
  }
}
window.addEventListener('hashchange',cambiarVista);
function setConexion(texto,estado=''){ $('connectionText').textContent=texto;$('connectionBadge').className='connection-pill '+estado; }
// Punto rojo únicamente cuando existe al menos una alerta nueva sin revisar.
// El total histórico sigue disponible dentro del Centro de alertas.
function actualizarContadorAlertas(){
  const punto=$('navAlertCount');
  punto.hidden=!alertasNoLeidas;
  const enlace=document.querySelector('[data-view="alertas"]');
  enlace.classList.toggle('has-unread',alertasNoLeidas);
  enlace.setAttribute('aria-label',alertasNoLeidas?'Alertas, hay avisos nuevos sin revisar':'Alertas');
  $('alertsTotal').textContent=String(eventosTotales);
  $('homeAlertsCount').textContent=`${eventosTotales} ${eventosTotales===1?'evento':'eventos'}`;
}
function escribirVariable(nombre,valor){ document.querySelectorAll(`[data-field="${nombre}"]`).forEach(el=>el.textContent=Number(valor).toFixed(1)); }
function mostrarFecha(ms){ return Number.isFinite(ms) ? fechaCorta.format(new Date(ms)) : 'Sin fecha'; }
function validoNumero(x){return typeof x==='number' && Number.isFinite(x);}
function nivelPM(d){ return Math.max(d.pm25>=56?3:d.pm25>=38?2:d.pm25>=13?1:0,d.pm10>=255?3:d.pm10>=155?2:d.pm10>=55?1:0); }
function indicadorDominante(d){ const a=d.pm25>=56?3:d.pm25>=38?2:d.pm25>=13?1:0; const b=d.pm10>=255?3:d.pm10>=155?2:d.pm10>=55?1:0;return a===b?'PM2.5 y PM10':a>b?'PM2.5':'PM10'; }
function esReciente(){return ultimoRecibido>0 && Date.now()-ultimoRecibido<SEGUNDOS_INACTIVO*1000;}

// Almacenamiento local permanente del navegador: no requiere Supabase todavía.
function abrirDB(){return new Promise(resolve=>{
  if(!('indexedDB' in window)){resolve();return;}
  const solicitud=indexedDB.open('aire_bga_local_v1',1);
  solicitud.onupgradeneeded=()=>{
    const banco=solicitud.result;
    if(!banco.objectStoreNames.contains('mediciones'))banco.createObjectStore('mediciones',{keyPath:'ts'});
    if(!banco.objectStoreNames.contains('eventos'))banco.createObjectStore('eventos',{keyPath:'id',autoIncrement:true});
  };
  solicitud.onsuccess=()=>{db=solicitud.result;dbDisponible=true;db.onversionchange=()=>db.close();resolve();};
  solicitud.onerror=()=>{console.warn('IndexedDB no disponible; historial solo en memoria');resolve();};
});}
function consultar(store,accion='getAll',param){ return new Promise((resolve,reject)=>{
  try{ const tx=db.transaction(store,'readonly');const req=tx.objectStore(store)[accion](...(param===undefined?[]:[param]));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error); }
  catch(e){reject(e);} }); }
function guardar(store,obj){return new Promise((resolve,reject)=>{
  try{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(obj);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);}catch(e){reject(e);}
});}
async function leerMediciones(min=-Infinity,max=Infinity){
  if(!dbDisponible)return historialMem.filter(d=>d.ts>=min&&d.ts<=max).sort((a,b)=>a.ts-b.ts);
  const r=Number.isFinite(min)&&Number.isFinite(max)?IDBKeyRange.bound(min,max):Number.isFinite(min)?IDBKeyRange.lowerBound(min):Number.isFinite(max)?IDBKeyRange.upperBound(max):null;
  try {return await consultar('mediciones','getAll',r===null?undefined:r);}catch(e){console.warn(e);return [];}
}
async function leerEventos(){
  if(!dbDisponible)return eventosMem.slice();
  try{return await consultar('eventos');}catch(e){console.warn(e);return [];}
}
async function agregarEvento(tipo,nombre,evento,valor,nivel,ts,grado=null){
  // Cuando Supabase está conectado, el trigger PostgreSQL es la fuente oficial.
  if(alertasSupabase?.disponible()) return;
  const registro={tipo,nombre,evento,valor,nivel,ts,grado};
  if(dbDisponible){try{await guardar('eventos',registro);}catch(e){console.warn(e);eventosMem.push(registro);}}
  else eventosMem.push(registro);
  eventosTotales++;
  // Si se confirma una alerta fuera del Centro de alertas, activar aviso sin número.
  // No se notifica por recuperaciones, normalizaciones o reducciones de nivel.
  if(esNuevaAlerta(evento) && location.hash !== '#alertas'){
    alertasNoLeidas = true;
    try { localStorage.setItem(CLAVE_ALERTAS_NO_LEIDAS, '1'); } catch(e) {}
  }
  if(location.hash==='#alertas') marcarAlertasRevisadas();
  else actualizarContadorAlertas();
  if(location.hash==='#alertas')actualizarTablaAlertas();
}

// Semáforo confirmado: 4 valores consecutivos en ese nivel o por encima.
// En recuperación: 4 lecturas consecutivas en ese nivel o por debajo.
function cuatroConsecutivas(){
  if(ultimasLecturas.length<4)return false;
  return ultimasLecturas.every((d,i,a)=>i===0 || (d.ts-a[i-1].ts>0 && d.ts-a[i-1].ts<=90000));
}
async function evaluarAlertas(lectura){
  // Si hay interrupción entre mediciones, se reinicia el conteo.
  if(ultimasLecturas.length && lectura.ts-ultimasLecturas.at(-1).ts>90000) ultimasLecturas=[];
  ultimasLecturas.push(lectura);
  ultimasLecturas=ultimasLecturas.slice(-4);
  if(!cuatroConsecutivas())return;
  const grades=ultimasLecturas.map(nivelPM);
  let siguiente=estadoPM;
  if(estadoPM===null)siguiente=Math.min(...grades);
  else if(Math.min(...grades)>estadoPM)siguiente=Math.min(...grades);
  else if(Math.max(...grades)<estadoPM)siguiente=Math.max(...grades);
  if(siguiente!==estadoPM){
    const anterior=estadoPM;
    estadoPM=siguiente;
    // Estado normal inicial no es un evento; normalización posterior sí.
    if(!(anterior===null && siguiente===0)){
      const nombre=indicadorDominante(lectura);
      const evento=siguiente===0?'Normalización':anterior===null?'Alerta confirmada':siguiente>anterior?'Aumento confirmado':'Reducción de alerta';
      await agregarEvento('pm',nombre,evento,Number(Math.max(lectura.pm25,lectura.pm10).toFixed(2)),NIVELES[siguiente].nombre,lectura.ts,siguiente);
    }
  }
  for(const tipo of ['voc','nox']){
    const campo=tipo==='voc'?'voc_index':'nox_index';const umbral=tipo==='voc'?150:20;
    const todosAltos=ultimasLecturas.every(d=>d[campo]>=umbral);
    const todosBajos=ultimasLecturas.every(d=>d[campo]<umbral);
    if(!estadosGas[tipo]&&todosAltos){estadosGas[tipo]=true;await agregarEvento(tipo,tipo.toUpperCase()+' Index','Incremento relativo detectado',lectura[campo],'Aviso',lectura.ts);}
    else if(estadosGas[tipo]&&todosBajos){estadosGas[tipo]=false;await agregarEvento(tipo,tipo.toUpperCase()+' Index','Retorno a referencia operativa',lectura[campo],'Resuelto',lectura.ts);}
  }
}
function actualizarEstado(){
  const fresco=esReciente();
  const estado=!fresco?'stale':estadoPM===null?'pending':NIVELES[estadoPM].clase;
  const card=$('operationalCard');card.dataset.level=estado;
  $('trafficLights').dataset.level=estado;
  $('trafficLights').setAttribute('aria-label',estado==='pending'?'Evaluación pendiente':estado==='stale'?'Mediciones no recientes':NIVELES[estadoPM].nombre);
  $('alertStatusCard').dataset.level=estado;
  let title,kicker,info,symbol;
  if(!fresco){title=ultimoRecibido?'Sin datos recientes':'Esperando mediciones';kicker='ESTADO NO VERIFICADO';info='La estación no ha enviado datos recientemente. No se asigna un estado verde sin información actual.';symbol='··';}
  else if(estadoPM===null){title='Verificando mediciones';kicker='EVALUACIÓN EN CURSO';info='Se necesitan 4 lecturas consecutivas de PM2.5 y PM10 para confirmar el primer estado.';symbol='◉';}
  else {const d=NIVELES[estadoPM];title=d.etiqueta;kicker=estadoPM===0?'CONDICIÓN OPERATIVA ESTABLE':'AVISO PREVENTIVO CONFIRMADO';info=estadoPM===0?'No se han confirmado incrementos persistentes según las reglas de esta estación.':'Incremento persistente confirmado por cuatro lecturas. Es una alerta experimental, no un nivel sanitario oficial.';symbol=['✓','!','▲','!'][estadoPM];}
  $('operationalState').textContent=title;$('operationalKicker').textContent=kicker;$('operationalExplanation').textContent=info;$('statusSymbol').textContent=symbol;
  $('alertsCurrentStatus').textContent=!fresco?'Sin datos actuales':estadoPM===null?'En verificación':NIVELES[estadoPM].nombre;
  $('alertsCurrentDetail').textContent=info;
  $('alertsActive').textContent=String(Number(estadosGas.voc)+Number(estadosGas.nox));
  $('homeAlertsDescription').textContent=!fresco?'Esperando nuevas lecturas para evaluar el estado.':estadoPM===null?'Comprobando cuatro mediciones consecutivas.':estadoPM===0?'Sin alerta activa de partículas.':'Estado de '+NIVELES[estadoPM].nombre.toLowerCase()+' confirmado por partículas.';
  const activos=Number(estadosGas.voc)+Number(estadosGas.nox);
  $('secondaryEvents').textContent=activos ? `${activos} aviso(s) complementario(s) activo(s)`:'Sin avisos complementarios activos';
  $('vocRuleState').textContent=estadosGas.voc?'Evento relativo activo':'Sin evento confirmado';
  $('noxRuleState').textContent=estadosGas.nox?'Evento relativo activo':'Sin evento confirmado';
  $('vocRuleState').classList.toggle('active',estadosGas.voc);
  $('noxRuleState').classList.toggle('active',estadosGas.nox);
  if(ultimaLectura){
    for(const [key,campo] of [['pm25','pm25'],['pm10','pm10']]){
      const x=key==='pm25'?ultimaLectura.pm25:ultimaLectura.pm10;
      const g=key==='pm25'?(x>=56?3:x>=38?2:x>=13?1:0):(x>=255?3:x>=155?2:x>=55?1:0);
      const chip=$(key+'StatusChip');chip.textContent=NIVELES[g].nombre+' (instantánea)';chip.dataset.level=NIVELES[g].clase;
    }
    $('vocStatus').textContent=ultimaLectura.voc_index>=150?'Incremento relativo':'Índice relativo';
    $('noxStatus').textContent=ultimaLectura.nox_index>=20?'Incremento relativo':'Índice relativo';
    $('vocStatus').classList.toggle('alert-small',ultimaLectura.voc_index>=150);
    $('noxStatus').classList.toggle('alert-small',ultimaLectura.nox_index>=20);
  }
}

function reducirParaGrafica(datos){
  if(datos.length<=MAX_GRAFICA)return datos;
  const stride=(datos.length-1)/(MAX_GRAFICA-1);
  const salida=[];
  for(let i=0;i<MAX_GRAFICA;i++)salida.push(datos[Math.round(i*stride)]);
  return salida;
}

// CSV: nunca exportar solo los 350 puntos de la gráfica, siempre todas las mediciones del filtro.
function descargarCSV(nombre,columnas,datos){
  if(!datos.length)return;
  const esc=x=>{const s=String(x??'');const seguro=/^[=+@\-\t\r]/.test(s)?"'"+s:s;return '"'+seguro.replace(/"/g,'""')+'"';};
  const lineas=[columnas.map(esc).join(','),...datos.map(d=>columnas.map(c=>esc(d[c])).join(','))];
  const blob=new Blob(['\uFEFF'+lineas.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function alCSV(datos){return datos.map(d=>({fecha_hora:d.fecha_hora||new Date(d.ts).toISOString(),fecha_recepcion:d.recibido,...Object.fromEntries(CAMPOS.map(c=>[c,d[c]]))}));}

// ─── Alertas: un único historial centralizado, con respaldo local explícito ───
function dibujarEventos(eventos, total=eventos.length, mensaje=''){
  eventosTotales=total;
  actualizarContadorAlertas();
  const filtro=$('alertFilter').value;
  const visibles=eventos.filter(e=>filtro==='todos'||e.tipo===filtro);
  $('exportAlertsBtn').disabled = alertasSupabase?.disponible() ? total===0 || !!mensaje : !visibles.length;
  const cuerpo=$('alertRows');
  cuerpo.replaceChildren();
  if(mensaje || !visibles.length){
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=5;td.className='empty-row';
    td.textContent=mensaje || 'No hay eventos registrados con este filtro.';
    tr.appendChild(td);cuerpo.appendChild(tr);
    return;
  }
  // Recibimos primero los más recientes desde PostgreSQL.
  const ordenados=visibles.slice().sort((a,b)=>b.ts-a.ts);
  for(const e of ordenados.slice(0,80)){
    const tr=document.createElement('tr');
    [mostrarFecha(e.ts),e.nombre,e.evento,e.valor.toFixed(2)+(e.tipo==='pm'?' µg/m³':' (índice)')].forEach(t=>{
      const td=document.createElement('td');td.textContent=t;tr.appendChild(td);
    });
    const td=document.createElement('td'),badge=document.createElement('span');
    const grado = NIVELES.findIndex(n=>n.nombre===e.nivel);
    badge.className='level-chip '+(e.tipo==='pm' ? (NIVELES[Math.max(0,grado)].clase) : (e.nivel==='Resuelto'?'normal':'attention'));
    badge.textContent=e.nivel;
    td.appendChild(badge);tr.appendChild(td);cuerpo.appendChild(tr);
  }
}
async function refrescarAlertasCentralizadas(){
  if(!alertasSupabase?.disponible())return false;
  const seq=++secuenciaConsultaAlertas;
  try{
    const r=await alertasSupabase.consultarRecientes({maximo:500});
    if(seq!==secuenciaConsultaAlertas)return false;
    alertasRemotas=r.datos;
    totalAlertasRemotas=r.total;
    alertasRemotasCargadas=true;
    errorAlertasRemotas='';
    if(ultimaRevisionRemota===null){
      // Primera visita: no señalar alertas antiguas como si acabaran de llegar.
      ultimaRevisionRemota=r.datos.reduce((max,e)=>Math.max(max,e.registroMs),0);
      try {localStorage.setItem(CLAVE_REVISION_REMOTA,String(ultimaRevisionRemota));}catch(e){}
    }
    if(vistaAlertasActiva()) marcarAlertasRevisadas();
    else alertasNoLeidas=r.datos.some(e=>esNuevaAlerta(e.evento) && e.registroMs>ultimaRevisionRemota);
    eventosTotales=r.total;
    actualizarContadorAlertas();
    const nota=$('alertDataSource');
    if(nota) nota.textContent=`Historial centralizado · Supabase PostgreSQL · ${r.total} evento(s) guardados. Se muestran los 80 más recientes del filtro dentro de los últimos 500 consultados. La marca de revisión es local a este navegador.`;
    if(vistaAlertasActiva())dibujarEventos(alertasRemotas,totalAlertasRemotas);
    return true;
  }catch(e){
    if(seq!==secuenciaConsultaAlertas)return false;
    errorAlertasRemotas=e.message || String(e);
    console.warn('Alertas Supabase:',e);
    const nota=$('alertDataSource');
    if(nota) nota.textContent=`No se pudo actualizar el historial de Supabase: ${errorAlertasRemotas}. Se mantiene la última consulta válida, si existe.`;
    if(vistaAlertasActiva()){
      if(alertasRemotasCargadas)dibujarEventos(alertasRemotas,totalAlertasRemotas);
      else dibujarEventos([],0,'No se pudieron cargar las alertas de Supabase. Comprueba la conexión y los permisos de lectura.');
    }
    return false;
  }
}
async function actualizarTablaAlertas(){
  if(alertasSupabase?.disponible()){
    if(alertasRemotasCargadas) dibujarEventos(alertasRemotas,totalAlertasRemotas);
    else dibujarEventos([],0,'Consultando historial centralizado…');
    await refrescarAlertasCentralizadas();
    return;
  }
  const eventos=await leerEventos();
  const nota=$('alertDataSource');
  if(nota)nota.textContent='Respaldo local de este navegador. Configura supabase-config.js para consultar las alertas compartidas.';
  dibujarEventos(eventos,eventos.length);
}
function mostrarMedicion(d,esNueva){
  ultimaLectura=d;
  CAMPOS.forEach(c=>escribirVariable(c,d[c]));
  $('lastCapture').textContent=mostrarFecha(d.ts);
  $('sensorCapture').textContent=mostrarFecha(d.ts);
  $('lastReceived').textContent=horaCO.format(new Date(d.recibido||d.ts));
  if(esNueva){mensajesSesion++;ultimoRecibido=Date.now();}
  $('messageCount').textContent=String(mensajesSesion);
  $('freshness').textContent=esReciente()?'Justo ahora':'Sin datos actuales';
  actualizarEstado();
}
let procesando=Promise.resolve();
async function procesarMensaje(p){
  let d;try{d=typeof p==='string'?JSON.parse(p):p;}catch(e){console.warn('MQTT no es JSON válido');return false;}
  if(!d || CAMPOS.some(c=>d[c]===null||d[c]===undefined||d[c]===''||!Number.isFinite(Number(d[c])))){console.warn('Lectura MQTT incompleta');return false;}
  const fechaValida=typeof d.fecha_hora==='string' && Number.isFinite(Date.parse(d.fecha_hora));
  const ts=fechaValida?Date.parse(d.fecha_hora):Date.now();
  if(ts>Date.now()+5*60000){console.warn('Fecha de captura en el futuro, descartada');return false;}
  let actual={ts,fecha_hora:fechaValida?d.fecha_hora:new Date(ts).toISOString(),recibido:new Date().toISOString()};
  CAMPOS.forEach(c=>actual[c]=Number(d[c]));
  // Evitar escribir / contar mensajes repetidos con la misma marca temporal.
  if(dbDisponible){try{if(await consultar('mediciones','get',ts))return false;}catch(e){console.warn(e);}}
  else if(historialMem.some(x=>x.ts===ts))return false;
  if(dbDisponible){try{await guardar('mediciones',actual);}catch(e){console.warn(e);historialMem.push(actual);}}
  else historialMem.push(actual);
  lecturasMQTTRecientes.push(actual);
  lecturasMQTTRecientes = lecturasMQTTRecientes.filter(x => Date.now()-x.ts <= 180000).slice(-10);
  mostrarMedicion(actual,true);
  await evaluarAlertas(actual);
  actualizarEstado();
  if(location.hash==='#tendencias')programarRefrescoGraficas();
  $('exportAllBtn').disabled=false;
  return true;
}

// ---- Pantalla independiente: gráficas seleccionables (una variable por gráfica) ----
const META_GRAFICAS = {
  pm1:         {nombre:'PM1.0',       unidad:'µg/m³', color:'#399bba', simbolo:'P1'},
  pm25:        {nombre:'PM2.5',       unidad:'µg/m³', color:'#14a681', simbolo:'P₂'},
  pm4:         {nombre:'PM4.0',       unidad:'µg/m³', color:'#6a8dd9', simbolo:'P4'},
  pm10:        {nombre:'PM10',        unidad:'µg/m³', color:'#3984db', simbolo:'P₁₀'},
  temperatura: {nombre:'Temperatura', unidad:'°C', color:'#df8c3a', simbolo:'°C'},
  humedad:     {nombre:'Humedad',     unidad:'%', color:'#16a6b7', simbolo:'RH'},
  voc_index:   {nombre:'VOC Index',   unidad:'índice', color:'#9b70dd', simbolo:'VOC'},
  nox_index:   {nombre:'NOx Index',   unidad:'índice', color:'#b565ba', simbolo:'NOx'}
};
const graficasActivas = new Map();
let seleccionGraficas = new Set(['pm25','pm10']);
let datosGraficas = [];
let ultimoFiltroGraficas = 0;
let refrescoGraficas = null;
let fechasAplicadas = null;

function guardarSeleccion(){
  try {localStorage.setItem('aire_bga_graficas_seleccion',JSON.stringify([...seleccionGraficas]));}catch(e){}
}
function recuperarSeleccion(){
  try {
    const dato=JSON.parse(localStorage.getItem('aire_bga_graficas_seleccion'));
    if(Array.isArray(dato))seleccionGraficas=new Set(dato.filter(x=>Object.hasOwn(META_GRAFICAS,x)));
  }catch(e){}
  document.querySelectorAll('[data-graph]').forEach(c=>c.checked=seleccionGraficas.has(c.dataset.graph));
  actualizarSeleccionUI();
}
function actualizarSeleccionUI(){
  document.querySelectorAll('.check-tile').forEach(l=>l.classList.toggle('selected',l.querySelector('input').checked));
  $('selectedCount').textContent=`${seleccionGraficas.size} de 8 seleccionadas`;
  $('graphPanelCount').textContent=`${seleccionGraficas.size} gráfica${seleccionGraficas.size===1?'':'s'}`;
  $('customNoSelection').hidden=seleccionGraficas.size>0;
}
function modificarSeleccion(clave,seleccionada){
  if(seleccionada)seleccionGraficas.add(clave);else seleccionGraficas.delete(clave);
  document.querySelectorAll('[data-graph]').forEach(c=>{if(c.dataset.graph===clave)c.checked=seleccionada;});
  guardarSeleccion();actualizarSeleccionUI();
  if(location.hash==='#tendencias')actualizarGraficasPersonalizadas();
}
function elegirTodas(seleccionar){
  seleccionGraficas=new Set(seleccionar?Object.keys(META_GRAFICAS):[]);
  document.querySelectorAll('[data-graph]').forEach(c=>c.checked=seleccionar);
  guardarSeleccion();actualizarSeleccionUI();
  if(location.hash==='#tendencias')actualizarGraficasPersonalizadas();
}
function tiempoLocalInput(d){
  // YYYY-MM-DDTHH:mm en hora civil de Colombia, sin depender del huso del computador.
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
  const m=Object.fromEntries(p.map(a=>[a.type,a.value]));
  return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
}
function ajustarFiltroGraficas(){
  const manual=$('graphRange').value==='custom';
  $('graphFrom').disabled=!manual;$('graphTo').disabled=!manual;$('graphApply').disabled=!manual;
  if(manual){
    if(!$('graphFrom').value)$('graphFrom').value=tiempoLocalInput(new Date(Date.now()-86400000));
    if(!$('graphTo').value)$('graphTo').value=tiempoLocalInput(new Date());
    $('graphFilterInfo').textContent='Indica el rango y pulsa «Aplicar fechas».';
  }else{fechasAplicadas=null;actualizarGraficasPersonalizadas();}
}
function filtrosGraficas(){
  const modo=$('graphRange').value, ahora=Date.now();
  if(modo==='custom'){
    if(!fechasAplicadas)return {error:'Para consultar ese intervalo, pulsa «Aplicar fechas».'};
    return fechasAplicadas;
  }
  const horas={'1h':1,'6h':6,'24h':24,'7d':168,'30d':720};
  return {desde:horas[modo]?ahora-horas[modo]*3600000:-Infinity,hasta:Infinity};
}
function aplicarFechasGraficas(){
  const a=$('graphFrom').value,b=$('graphTo').value;
  if(!a || !b){$('graphFilterInfo').textContent='Indica las dos fechas.';return;}
  const desde=Date.parse(a+'-05:00'),hasta=Date.parse(b+'-05:00')+59999;
  if(!Number.isFinite(desde)||!Number.isFinite(hasta)||desde>hasta){$('graphFilterInfo').textContent='El rango de fechas es inválido.';return;}
  fechasAplicadas={desde,hasta};actualizarGraficasPersonalizadas();
}
function crearTarjetaGrafica(clave){
  const meta=META_GRAFICAS[clave];
  const art=document.createElement('article');art.className='single-chart-card';art.dataset.plot=clave;art.style.setProperty('--plot-color',meta.color);
  // La estructura es fija, sin incluir contenido recibido por MQTT como HTML.
  art.innerHTML=`<div class="single-chart-head"><div class="single-chart-name"><span class="single-chart-symbol"></span><div><h3></h3><p>Mediciones históricas · <span class="unit-label"></span></p></div></div><button class="graph-remove" type="button" aria-label="Quitar gráfica" title="Quitar gráfica">×</button></div>
  <div class="single-graph-stats"><strong class="plot-last">—</strong><span class="plot-average">Promedio —</span><span class="plot-max">Máximo —</span></div>
  <div class="single-chart-plot"><canvas role="img"></canvas><div class="no-plot">No hay registros disponibles para este período.</div></div>
  <p class="single-chart-foot">Actualización automática · hasta 350 puntos en pantalla</p>`;
  art.querySelector('.single-chart-symbol').textContent=meta.simbolo;
  art.querySelector('h3').textContent=meta.nombre;
  art.querySelector('.unit-label').textContent=meta.unidad;
  art.querySelector('canvas').setAttribute('aria-label',`Histórico individual de ${meta.nombre}`);
  art.querySelector('.graph-remove').setAttribute('aria-label',`Quitar gráfica de ${meta.nombre}`);
  art.querySelector('.graph-remove').addEventListener('click',()=>modificarSeleccion(clave,false));
  return art;
}
function dibujarTarjetaGrafica(clave,datos){
  const art=document.querySelector(`[data-plot="${clave}"]`);
  if(!art)return;
  const meta=META_GRAFICAS[clave],n=datos.length;
  const a=art.querySelector('.plot-last'),b=art.querySelector('.plot-average'),c=art.querySelector('.plot-max');
  a.textContent=n?`${datos[n-1][clave].toFixed(1)} ${meta.unidad}`:'—';
  b.textContent=n?`Promedio ${(datos.reduce((s,d)=>s+d[clave],0)/n).toFixed(1)} ${meta.unidad}`:'Promedio —';
  let valorMax=-Infinity;
  for(const d of datos)if(d[clave]>valorMax)valorMax=d[clave];
  c.textContent=n?`Máximo ${valorMax.toFixed(1)} ${meta.unidad}`:'Máximo —';
  art.querySelector('.no-plot').hidden=n>0;
  if(typeof Chart==='undefined'){
    art.querySelector('.no-plot').hidden=false;
    art.querySelector('.no-plot').textContent='No se pudo cargar Chart.js.';
    return;
  }
  const vista=reducirParaGrafica(datos);
  const labels=vista.map(d=>ejeCO.format(new Date(d.ts)));
  const values=vista.map(d=>d[clave]);
  if(!graficasActivas.has(clave)){
    const nueva=new Chart(art.querySelector('canvas'),{
      type:'line',data:{labels,datasets:[{label:meta.nombre,data:values,borderColor:meta.color,backgroundColor:meta.color+'16',pointRadius:values.length>80?0:2,pointHoverRadius:5,borderWidth:2.5,fill:true,tension:0.28}]},
      options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{intersect:false,mode:'index'},plugins:{legend:{display:false},tooltip:{backgroundColor:'#1c3c49',padding:11}},scales:{x:{grid:{display:false},ticks:{color:'#91a3af',maxTicksLimit:5,maxRotation:0,font:{size:10}}},y:{beginAtZero:true,grid:{color:'#edf2f5'},ticks:{color:'#91a3af',font:{size:10}},title:{display:true,text:meta.unidad,color:'#8297a3',font:{size:10}}}}}
    });
    graficasActivas.set(clave,nueva);
  }else{
    const graf=graficasActivas.get(clave);
    graf.data.labels=labels;graf.data.datasets[0].data=values;graf.data.datasets[0].pointRadius=values.length>80?0:2;
    graf.update('none');
  }
}
let refrescoActivo=0;
function filtrarRecientesMQTT(desde,hasta) {
  return lecturasMQTTRecientes.filter(d => d.ts >= desde && d.ts <= hasta && Date.now()-d.ts <= 180000);
}
function fusionarMediciones(datos,recientes,maximo) {
  const registros = new Map(datos.map(d => [d.ts,d]));
  for (const d of recientes) registros.set(d.ts,d);
  return [...registros.values()].sort((a,b)=>a.ts-b.ts).slice(-maximo);
}
async function actualizarGraficasPersonalizadas(){
  const req=++refrescoActivo;
  if(location.hash!=='#tendencias')return;
  const limites=filtrosGraficas();
  if(limites.error){$('graphFilterInfo').textContent=limites.error;return;}
  const modo=$('graphRange').value;
  const maximo=modo==='40'?40:MAX_REGISTROS_VISTA;
  let datos=[],origen='',truncado=false;
  if(historialSupabase?.disponible()) {
    try {
      const remoto=await historialSupabase.consultarVista({...limites,maximo});
      datos=fusionarMediciones(remoto.datos,filtrarRecientesMQTT(limites.desde,limites.hasta),maximo);
      truncado=remoto.truncado;
      origen='Supabase PostgreSQL + MQTT reciente';
      errorHistorial='';
    }catch(error){
      console.warn('Consulta Supabase:',error);
      errorHistorial=error.message;
      datos=await leerMediciones(limites.desde,limites.hasta);
      origen='Solo datos locales de respaldo (Supabase no disponible)';
    }
  }else{
    datos=await leerMediciones(limites.desde,limites.hasta);
    origen='Solo historial local: falta configurar supabase-config.js';
  }
  if(req!==refrescoActivo)return;
  if(modo==='40')datos=datos.slice(-40);
  if(datos.length>maximo)datos=datos.slice(-maximo);
  datosGraficas=datos;
  const n=datos.length;
  const fechaTexto=n?`${mostrarFecha(datos[0].ts)} a ${mostrarFecha(datos.at(-1).ts)}`:'Sin mediciones disponibles';
  const mensajeMuestra=truncado && modo!=='40'?' · Muestra: últimas 6.000 lecturas; promedios calculados sobre esta muestra. CSV: período completo.':'';
  const mensajeError=errorHistorial?` · ${errorHistorial}`:'';
  $('graphFilterInfo').textContent=`${origen} · ${n.toLocaleString('es-CO')} lecturas visualizadas · ${fechaTexto}${mensajeMuestra}${mensajeError}`;
  $('exportBtn').disabled=n===0;
  $('exportAllBtn').disabled=!historialSupabase?.disponible() && n===0;
  $('sessionCount').textContent=n.toLocaleString('es-CO')+(truncado && modo!=='40'?'+':'');
  const promedio=clave=>n?(datos.reduce((s,d)=>s+d[clave],0)/n).toFixed(1):'—';
  $('averagePm25').textContent=promedio('pm25');
  $('averagePm10').textContent=promedio('pm10');
  const cuerpo=$('recentRows');cuerpo.replaceChildren();
  if(!n){
    const fila=document.createElement('tr');
    fila.innerHTML='<td colspan="9" class="empty-row">Sin mediciones para este período</td>';
    cuerpo.appendChild(fila);
  }
  for(const d of datos.slice(-12).reverse()){
    const fila=document.createElement('tr');
    const valores=[mostrarFecha(d.ts),
      d.pm1.toFixed(1)+' µg/m³', d.pm25.toFixed(1)+' µg/m³',
      d.pm4.toFixed(1)+' µg/m³', d.pm10.toFixed(1)+' µg/m³',
      d.temperatura.toFixed(1)+' °C', d.humedad.toFixed(1)+' %',
      d.voc_index.toFixed(0),d.nox_index.toFixed(0)];
    for(const valor of valores){
      const celda=document.createElement('td');celda.textContent=valor;fila.appendChild(celda);
    }
    cuerpo.appendChild(fila);
  }
  const caja=$('customCharts');
  for(const [clave,graf] of graficasActivas){
    if(!seleccionGraficas.has(clave)){graf.destroy();graficasActivas.delete(clave);}
  }
  caja.querySelectorAll('[data-plot]').forEach(art=>{if(!seleccionGraficas.has(art.dataset.plot))art.remove();});
  for(const clave of Object.keys(META_GRAFICAS)){
    if(!seleccionGraficas.has(clave))continue;
    let card=caja.querySelector(`[data-plot="${clave}"]`);
    if(!card)card=crearTarjetaGrafica(clave);
    caja.appendChild(card);
    dibujarTarjetaGrafica(clave,datos);
  }
  actualizarSeleccionUI();
}

function programarRefrescoGraficas(){
  if(refrescoGraficas)clearTimeout(refrescoGraficas);
  refrescoGraficas=setTimeout(actualizarGraficasPersonalizadas,220);
}
function configurarGraficas(){
  recuperarSeleccion();
  document.querySelectorAll('[data-graph]').forEach(c=>c.addEventListener('change',()=>modificarSeleccion(c.dataset.graph,c.checked)));
  $('selectAllGraphs').addEventListener('click',()=>elegirTodas(true));
  $('clearGraphs').addEventListener('click',()=>elegirTodas(false));
  $('graphRange').addEventListener('change',ajustarFiltroGraficas);
  $('graphApply').addEventListener('click',aplicarFechasGraficas);

}

function conectarMQTT(){
  if(typeof mqtt==='undefined'){setConexion('No se cargó MQTT.js','offline');return;}
  mqttCliente=mqtt.connect(MQTT_URL,{clientId:'aire_bga_web_'+Math.random().toString(16).slice(2,10),clean:true,keepalive:45,connectTimeout:15000,reconnectPeriod:5000});
  mqttCliente.on('connect',()=>{setConexion('MQTT conectado','online');mqttCliente.subscribe(TOPICO,{qos:0},err=>setConexion(err?'Error al suscribir':'Esperando nuevas mediciones',err?'offline':'online'));});
  mqttCliente.on('message',(topic,payload)=>{if(topic!==TOPICO)return;procesando=procesando.then(()=>procesarMensaje(payload.toString())).then(ok=>{if(ok)setConexion('Datos en tiempo real','online');}).catch(e=>console.warn('Error procesando datos:',e));});
  mqttCliente.on('reconnect',()=>setConexion('Reconectando…'));
  mqttCliente.on('offline',()=>setConexion('MQTT sin conexión','offline'));
  mqttCliente.on('close',()=>setConexion('MQTT desconectado','offline'));
  mqttCliente.on('error',err=>console.warn('MQTT:',err.message));
}
setInterval(()=>{
  if(ultimoRecibido){const s=Math.floor((Date.now()-ultimoRecibido)/1000);$('freshness').textContent=esReciente()?`Hace ${s} s`:'Sin datos recientes';if(!esReciente()&&mqttCliente?.connected)setConexion('Sin datos recientes');}
  actualizarEstado();
},5000);
async function exportarMediciones(completo=false){
  const boton=$(completo?'exportAllBtn':'exportBtn');
  const nombre=completo?'aire_bga_todo_el_historial.csv':'aire_bga_periodo.csv';
  let limites={desde:-Infinity,hasta:Infinity};
  if(!completo){
    limites=filtrosGraficas();
    if(limites.error){$('graphFilterInfo').textContent=limites.error;return;}
  }
  if(historialSupabase?.disponible()){
    boton.disabled=true;
    const original=$('graphFilterInfo').textContent;
    try {
      const maximo=!completo && $('graphRange').value==='40'?40:Infinity;
      const r=await historialSupabase.consultarCSV({...limites,maximo,progreso:n=>{
        $('graphFilterInfo').textContent=`Preparando CSV desde Supabase: ${n.toLocaleString('es-CO')} mediciones leídas…`;
      }});
      if(!r.datos.length){$('graphFilterInfo').textContent='No hay registros centralizados para exportar.';return;}
      descargarCSV(nombre,COLUMNAS_CSV,alCSV(r.datos));
      $('graphFilterInfo').textContent=`CSV de Supabase preparado: ${r.datos.length.toLocaleString('es-CO')} mediciones. ${original}`;
    }catch(error){
      console.error('Exportación Supabase:',error);
      $('graphFilterInfo').textContent=`No se pudo exportar desde Supabase: ${error.message}. No se ha generado un CSV local incompleto.`;
    }finally{boton.disabled=false;}
  }else{
    const datos=completo?await leerMediciones():datosGraficas;
    descargarCSV(nombre,COLUMNAS_CSV,alCSV(datos));
    $('graphFilterInfo').textContent='CSV de respaldo local descargado. Configura Supabase para exportar el historial centralizado.';
  }
}
$('exportBtn').addEventListener('click',()=>exportarMediciones(false));
$('exportAllBtn').addEventListener('click',()=>exportarMediciones(true));
// Refresca el historial remoto aunque la estación no envíe MQTT a este navegador.
setInterval(()=>{if(location.hash==='#tendencias')actualizarGraficasPersonalizadas();},60000);
$('alertFilter').addEventListener('change',()=>{
  if(alertasSupabase?.disponible() && alertasRemotasCargadas) dibujarEventos(alertasRemotas,totalAlertasRemotas);
  else actualizarTablaAlertas();
});
// La verificación periódica funciona aun si MQTT no llega al navegador.
setInterval(()=>{ if(alertasSupabase?.disponible())refrescarAlertasCentralizadas(); },30000);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden && alertasSupabase?.disponible())refrescarAlertasCentralizadas();
});
$('exportAlertsBtn').addEventListener('click',async()=>{
  const boton=$('exportAlertsBtn'), filtro=$('alertFilter').value;
  if(alertasSupabase?.disponible()){
    boton.disabled=true;
    const nota=$('alertDataSource');
    const texto=nota?.textContent || '';
    try{
      const eventos=await alertasSupabase.consultarCSV({tipo:filtro,progreso:n=>{
        if(nota)nota.textContent=`Descargando historial de alertas: ${n.toLocaleString('es-CO')} filas…`;
      }});
      if(!eventos.length){if(nota)nota.textContent='No hay alertas que exportar con este filtro.';return;}
      descargarCSV('aire_bga_alertas_supabase.csv',
        ['fecha_evento_utc','fecha_colombia','fecha_registro_utc','indicador','evento','valor','nivel','tipo'],
        eventos.map(e=>({fecha_evento_utc:new Date(e.ts).toISOString(),
          fecha_colombia:mostrarFecha(e.ts),fecha_registro_utc:new Date(e.registroMs).toISOString(),
          indicador:e.nombre,evento:e.evento,valor:e.valor,nivel:e.nivel,tipo:e.tipo})));
      if(nota)nota.textContent=`CSV descargado: ${eventos.length} eventos. ${texto}`;
    }catch(e){
      console.error('CSV de alertas:',e);
      if(nota)nota.textContent='No se pudo exportar el historial centralizado: '+e.message;
    }finally{boton.disabled=false;}
  }else{
    const eventos=(await leerEventos()).filter(e=>filtro==='todos'||e.tipo===filtro);
    descargarCSV('aire_bga_alertas_locales.csv',['fecha_hora','indicador','evento','valor','nivel'],
      eventos.map(e=>({fecha_hora:new Date(e.ts).toISOString(),indicador:e.nombre,evento:e.evento,valor:e.valor,nivel:e.nivel})));
  }
});

async function iniciar(){
  configurarGraficas();
  await abrirDB();
  const registros=await leerMediciones();
  const eventos=alertasSupabase?.disponible() ? [] : await leerEventos();
  eventosTotales=eventos.length;
  actualizarContadorAlertas();
  if(!alertasSupabase?.disponible()){
    const pmEventos=eventos.filter(e=>e.tipo==='pm'&&Number.isInteger(e.grado));
    if(pmEventos.length)estadoPM=pmEventos.at(-1).grado;
    for(const tipo of ['voc','nox']){
      const ev=eventos.filter(e=>e.tipo===tipo).at(-1);
      if(ev)estadosGas[tipo]=ev.nivel!=='Resuelto';
    }
  }
  if(registros.length){
    ultimasLecturas=registros.slice(-4);
    const last=registros.at(-1);
    mostrarMedicion(last,false);
    // La historia cargada se muestra, pero no se considera dato en vivo.
    $('exportAllBtn').disabled=false;
  }
  actualizarEstado();
  cambiarVista();
  conectarMQTT();
  if(alertasSupabase?.disponible())refrescarAlertasCentralizadas();
  else actualizarTablaAlertas();
  if(!dbDisponible && !historialSupabase?.disponible())$('graphFilterInfo').textContent='Atención: IndexedDB no disponible y Supabase sin configurar.';
}
iniciar().catch(e=>{console.error('Inicio:',e);setConexion('Error de inicio','offline');});
