# AIRE.BGA — Plan de pruebas del sistema IoT

**Proyecto de grado:** Desarrollo de un sistema IoT de bajo costo para el seguimiento y alerta temprana de la calidad del aire en Bucaramanga
**Programa:** Ingeniería de Software
**Versión:** 1.0
**Fecha:** 8 de noviembre de 2026
**Documento de referencia:** `docs/01_especificacion_requisitos.md` (ERS v1.0)
**Estado:** Plan de pruebas propuesto. **No equivale a un acta de ejecución ni declara aprobados los casos.**

## 1. Objetivo

Verificar de forma reproducible que AIRE.BGA adquiere mediciones del Sensirion SEN55, las envía mediante el ESP32 por MQTT y HTTPS, las almacena y consulta en Supabase PostgreSQL, y registra y muestra eventos de alerta bajo reglas operativas experimentales. Documentar resultados, defectos, evidencias y limitaciones, diferenciando observaciones preliminares de ejecuciones formales.

## 2. Alcance, restricciones y fuentes de verificación

**Componentes incluidos:** firmware ESP32 + SEN55, broker MQTT de pruebas, Edge Function `registrar-medicion`, tablas `estaciones`, `mediciones`, `alertas`, trigger de evaluación, API REST con políticas RLS y frontend AIRE.BGA publicado en Vercel.

**Entornos:** laboratorio o entorno de pruebas controlado para el hardware; Supabase y Vercel del prototipo; navegadores de escritorio y móvil. Conservar versión/commit, fecha y zona horaria de cada prueba.

**Restricciones:** los umbrales de PM y los índices VOC/NOx son criterios experimentales, **no** equivalen al ICA oficial, ni certifican seguridad sanitaria. El SEN55 **no es detector de butano ni de fugas de gases inflamables**. No provocar emisiones químicas, liberar gas de encendedor, quemar materiales ni realizar exposiciones peligrosas: verificar alertas con datos simulados en una transacción reversible o un ambiente de pruebas separado. No insertar datos ficticios en la estación real sin identificarlos.

**Seguridad:** nunca publicar `config_local.h`, token de ingestión, contraseña de base de datos, `sb_secret_...`, claves `service_role` o encabezados privados en capturas, CSV o GitHub. Las verificaciones de acceso anónimo deben utilizar credenciales públicas y consultas de prueba no destructivas.

## 3. Estrategia de pruebas

Se utilizarán cuatro niveles complementarios:

1. **Unitarias/lógica:** validar el algoritmo de cuatro lecturas, umbrales, clasificaciones, transición y manejo de datos inválidos.
2. **Integración:** sensor → ESP32 → MQTT / HTTPS → Edge Function → PostgreSQL → Data API → navegador.
3. **Sistema:** comprobar filtros, visualización, exportación, notificación y persistencia desde distintos dispositivos.
4. **No funcionales:** verificar permisos, consistencia temporal, respuesta ante desconexión, rendimiento y límites de validación exterior.

**Estados permitidos:** `NO EJECUTADO`, `APROBADO`, `FALLIDO`, `BLOQUEADO`, `NO APLICA`. Las pruebas observadas durante el desarrollo se describen como *antecedentes*; pasarán a `APROBADO` solo si se ejecuta el procedimiento y se adjunta la evidencia exigida.

**Criterio general de aprobación:** todos los pasos obligatorios cumplen el resultado esperado, sin errores críticos, y existe evidencia verificable y fechada. Las desviaciones se registran como incidencias; nunca se cambian los resultados esperados después de ejecutarlos para hacer coincidir una prueba fallida.

## 4. Matriz de casos de prueba y trazabilidad

| ID | Caso de prueba | Requisitos asociados | Tipo | Situación al crear el plan |
|---|---|---|---|---|
| CP-01 | Lectura completa del SEN55 | RF-01, RF-07 | Integración | Antecedentes visuales; repetir formalmente |
| CP-02 | Periodicidad y contenido MQTT | RF-02, RF-06 | Integración | Antecedentes observados; medir |
| CP-03 | Ingesta HTTPS y autenticación | RF-03, RF-17, RNF-01, RNF-03 | Integración/seguridad | Se probaron 200 y 401; repetir formalmente |
| CP-04 | Persistencia con navegador cerrado | RF-04, RNF-04 | Sistema | Observada; repetir con conteo |
| CP-05 | Historial, selección y filtros | RF-06, RF-08, RF-09, RF-10, RNF-06, RNF-08 | Sistema | Observada; verificar límites |
| CP-06 | CSV de mediciones e integridad temporal | RF-11, RNF-05 | Sistema | CSV observado; probar volumen |
| CP-07 | Alerta por PM y normalización | RF-12, RF-14 | Lógica/integración | Prueba reversible previa; documentar ejecución |
| CP-08 | Activación y recuperación VOC | RF-13, RF-14 | Lógica/integración | Evidencia real anterior; simular formalmente |
| CP-09 | Historial de alertas y CSV | RF-15, RF-16 | Sistema | Consulta pública observada; comprobar CSV y avisos |
| CP-10 | RLS y permisos de solo lectura | RNF-02, RF-17 | Seguridad | Políticas aplicadas; falta prueba negativa |
| CP-11 | Pérdida y recuperación de Wi-Fi | RNF-10 | Resiliencia | Pendiente |
| CP-12 | Evaluación exterior comparativa | RNF-09 | Validación instrumental | Pendiente |
| CP-13 | Duplicados e idempotencia | RF-05 | Integración/datos | Pendiente prueba formal |
| CP-14 | Entradas inválidas y límites del servicio | RF-17 | Seguridad/datos | Pendiente |
| CP-15 | Confirmación independiente NOx | RF-13, RF-14 | Lógica | Pendiente |
| CP-16 | Compatibilidad, navegación y accesibilidad básica | RNF-06, RNF-08 | Sistema/usabilidad | Pendiente |
| CP-17 | Repositorio, secretos y reproducibilidad | RNF-01, RNF-07 | Revisión técnica | Pendiente revisión final |

## 5. Procedimientos y criterios de aceptación

### CP-01. Lectura completa del SEN55

**Precondición:** estación ensamblada y alimentada, firmware conocido, monitor serie disponible.
**Procedimiento:** observar al menos 10 ciclos; registrar las ocho variables y las unidades: PM1, PM2.5, PM4, PM10 (µg/m³), temperatura (°C), humedad (%), VOC Index y NOx Index (índices relativos).
**Esperado:** las ocho variables están identificadas; no se asignan unidades de ppm a VOC/NOx; anomalías y períodos de calentamiento se señalan.
**Evidencia:** `EV-CP01` — captura de Serial y tabla con 10 lecturas.

### CP-02. Periodicidad y contenido MQTT

**Precondición:** estación conectada a Wi-Fi; cliente MQTT suscrito a `bga/aire/sen55/estacion01/datos`.
**Procedimiento:** guardar 20 mensajes consecutivos, parsear sus JSON, verificar `fecha_hora` y las ocho medidas, calcular diferencias de tiempo entre mensajes.
**Esperado:** mensajes JSON válidos con estructura estable; período nominal de 30 segundos. Documentar mínimo, máximo, mediana y desviaciones reales en vez de exigir 30,000 s exactos.
**Evidencia:** `EV-CP02` — exportación de mensajes y cálculo de intervalos.

### CP-03. Ingesta HTTPS con autorización

**Precondición:** Edge Function activa, token de pruebas disponible *solo localmente*, estación de prueba o dato autorizado conocido.
**Procedimiento:** enviar una medición válida con token; repetir sin token o con uno erróneo; comparar el conteo de filas antes/después.
**Esperado:** operación autorizada exitosa (código y cuerpo conforme a la función); sin token responde 401 y no crea fila. **No registrar en evidencias el token completo**.
**Evidencia:** `EV-CP03` — respuestas HTTP anonimizadas y consulta SQL comparativa.

### CP-04. Persistencia sin navegador

**Precondición:** ESP32 conectado a Internet y enviando; se conoce la estación `estacion01`.
**Procedimiento:** registrar hora y conteo de filas; cerrar AIRE.BGA y dejar el dispositivo encendido durante un intervalo definido de al menos 5 minutos; volver a consultar PostgreSQL.
**Esperado:** existen nuevas filas en `mediciones` durante el período en que no hubo navegador abierto. Anotar diferencias con el volumen nominal esperado.
**Evidencia:** `EV-CP04` — consultas de antes y después, con horas UTC y Colombia.

### CP-05. Tendencias, filtros y últimas doce mediciones

**Precondición:** historial PostgreSQL disponible; web abierta desde escritorio y móvil.
**Procedimiento:** seleccionar las ocho variables y después una sola; probar todo el historial, períodos predefinidos y rango personalizado; probar rango sin registros y rango invertido; comprobar tabla de 12 filas.
**Esperado:** las gráficas corresponden a la selección; filtro efectivo; fechas se interpretan en Colombia; tabla presenta como máximo 12 filas ordenadas por captura descendente; errores de rango se comunican y no producen resultados engañosos.
**Evidencia:** `EV-CP05` — capturas de configuraciones y resultados.

### CP-06. Exportación CSV y fechas

**Precondición:** historial disponible; disponer, preferiblemente en entorno de pruebas, de más de 1.000 registros para validar paginación.
**Procedimiento:** descargar CSV completo y filtrado; abrirlo con importación UTF-8 en hoja de cálculo; verificar encabezados, filas, decimales y zonas horarias; contrastar recuentos con PostgreSQL.
**Esperado:** `fecha_hora`, `fecha_recepcion`, `pm1`, `pm25`, `pm4`, `pm10`, `temperatura`, `humedad`, `voc_index`, `nox_index`; los conteos corresponden al período; no hay corte artificial en 1.000 filas. Documentar claramente si las fechas exportadas están en UTC o `America/Bogota`.
**Evidencia:** `EV-CP06` — CSV sin secretos, recuento SQL y capturas del análisis.

### CP-07. Alerta de partículas, transición y normalización

**Precondición:** SQL de pruebas reversible revisado; **no** utilizar humo ni sustancias peligrosas.
**Procedimiento:** usar una estación temporal dentro de una transacción o un entorno aislado; inyectar tres lecturas de severidad alta y verificar ausencia de confirmación; añadir la cuarta y verificar evento; introducir cuatro lecturas normales y verificar normalización; ejecutar rollback y comprobar que la estación temporal desaparece.
**Esperado:** no se generan alertas prematuras ni repetidas; se registra transición al cuarto valor correspondiente y normalización tras cuatro lecturas válidas; la prueba no deja contaminación en datos reales.
**Evidencia:** `EV-CP07` — script, resultado y consultas de verificación.

### CP-08. VOC Index: activación y recuperación

**Precondición:** entorno SQL temporal, sin liberación de gases.
**Procedimiento:** simular tres lecturas VOC ≥ 150, después una cuarta; comprobar el evento; simular cuatro lecturas VOC menores que 150; comprobar recuperación. Controlar que la clasificación PM permanece independiente.
**Esperado:** un evento «Incremento relativo detectado» y, posteriormente, un evento «Retorno a referencia operativa», ambos trazables.
**Evidencia:** `EV-CP08` — ejecución y filas transitorias o de estación de prueba.

### CP-09. Historial de alertas e indicador local

**Precondición:** existen eventos de prueba no sensibles en Supabase; frontend en Vercel actualizado.
**Procedimiento:** consultar alertas en dos navegadores; filtrar estados; exportar CSV; crear un evento sintético controlado en entorno de pruebas y evaluar notificación; entrar a la sección Alertas.
**Esperado:** ambos navegadores consultan el mismo historial; CSV contiene los eventos esperados; el indicador de «sin revisar» se administra localmente y desaparece al revisar, sin alterar el historial centralizado.
**Evidencia:** `EV-CP09` — pantallas de dos dispositivos y CSV.

### CP-10. Verificación de RLS y acceso público

**Precondición:** usar la clave `sb_publishable_` desde un entorno de ensayo; no usar clave secret o service role para este caso.
**Procedimiento:** consultar `mediciones` y `alertas` con acceso anónimo; intentar `INSERT`, `UPDATE` y `DELETE` con un rol/clave anónimo sobre registros de prueba en entorno aislado; no realizar pruebas destructivas sobre datos de producción.
**Esperado:** `SELECT` autorizado; operaciones de escritura anónimas denegadas, sin cambios a registros; conservar errores HTTP/SQL sin claves.
**Evidencia:** `EV-CP10` — respuestas redaccionadas y comprobación de integridad.

### CP-11. Comportamiento ante desconexión

**Precondición:** ambiente controlado, equipo encendido, dispositivo con posibilidad de recuperar Wi-Fi.
**Procedimiento:** registrar 5 ciclos normales; interrumpir la conexión de red de prueba de manera controlada; restablecerla; comparar registros previstos y recibidos.
**Esperado:** se documenta la pérdida de lecturas y la capacidad de recuperación del servicio; **no** exigir reenvío de muestras almacenadas porque no está implementado como requisito verificado.
**Evidencia:** `EV-CP11` — consola, red, intervalos faltantes y conclusión.

### CP-12. Ensayo exterior y comparación instrumental

**Precondición:** ubicación, fecha, protección ambiental y equipo de referencia documentados; protocolo de comparación autorizado.
**Procedimiento:** instalar el prototipo sin exponer el SEN55 a lluvia o condensación; obtener registros sincronizados con una fuente de referencia adecuada; documentar temperatura, humedad, posición y período.
**Esperado:** se reportan diferencias, incertidumbres y limitaciones; no afirmar calibración o conformidad normativa sin una metodología y referencia idóneas.
**Evidencia:** `EV-CP12` — fotografías, metadatos y tabla comparativa.

### CP-13. Unicidad e idempotencia

**Precondición:** estación de pruebas con datos sintéticos; conocer la restricción `UNIQUE(estacion_id, fecha_medicion)`.
**Procedimiento:** enviar dos veces exactamente la misma medición; consultar número de registros en PostgreSQL y respuesta del servicio.
**Esperado:** una sola fila para la combinación estación/fecha; se documenta si la función responde «registrada o ya existente».
**Evidencia:** `EV-CP13` — peticiones sin credenciales, respuestas y consulta de conteo.

### CP-14. Validación negativa de parámetros

**Precondición:** entorno de ensayo para no introducir datos corruptos.
**Procedimiento:** probar JSON incompleto, fecha sin zona horaria, fecha inválida, campo no numérico, PM negativa, humedad fuera de 0–100 y token ausente; registrar cada respuesta.
**Esperado:** la función rechaza entradas inválidas sin insertar filas; los códigos y mensajes se registran tal como realmente respondan.
**Evidencia:** `EV-CP14` — matriz entrada / código / respuesta / cambio en base de datos.

### CP-15. Detección y recuperación independiente de NOx Index

**Precondición:** datos simulados en estación temporal; no generar gases reales.
**Procedimiento:** simular cuatro NOx Index ≥ 20 manteniendo PM y VOC dentro de sus valores habituales; luego cuatro lecturas de NOx Index menores que 20.
**Esperado:** se registran activación y recuperación de NOx sin activar semáforo de partículas ni evento VOC.
**Evidencia:** `EV-CP15` — consulta de alertas de prueba y ejecución reversible.

### CP-16. Navegación, compatibilidad y usabilidad

**Precondición:** versión publicada registrada; navegador en escritorio y dispositivo móvil.
**Procedimiento:** recorrer Panel general, Tendencias, Sensores y Alertas; probar filtros, interacción táctil, desplazamiento, descarga y claridad de textos/unidades; registrar viewport y navegador.
**Esperado:** las secciones se usan sin bloqueos; los elementos principales son legibles y las interacciones no se solapan; los hallazgos se registran como defectos, sin declarar cumplimiento de una norma de accesibilidad no auditada.
**Evidencia:** `EV-CP16` — lista de comprobación y capturas.

### CP-17. Repositorio, secretos y reproducibilidad

**Precondición:** repositorio local con frontend, firmware, Edge Function, migraciones, ERS y UML.
**Procedimiento:** comprobar `.gitignore`; revisar el índice Git con `git status` y `git diff --cached --name-only`; verificar que `config_local.h` no se rastrea; revisar ejemplos de configuración sin contraseñas; confirmar que la aplicación y la función tienen instrucciones de puesta en marcha.
**Esperado:** fuente versionable sin secretos; carpetas y documentos consistentes; `deno check` pasa para la Edge Function; no es necesario desplegar ni cambiar producción.
**Evidencia:** `EV-CP17` — salida de comandos sin credenciales y revisión del repositorio.

## 6. Registro estandarizado de cada ejecución

Duplicar la siguiente ficha por caso y ejecución; guardar, por ejemplo, como `docs/pruebas/ejecuciones/CP-07_2026-11-09.md`.

```markdown
# Ejecucion CP-XX

- **ID:** CP-XX
- **Requisito(s):** RF-XX / RNF-XX
- **Fecha y hora:** AAAA-MM-DD HH:MM (America/Bogota)
- **Ejecutor:**
- **Entorno:** prueba / produccion (solo consultas inocuas)
- **Firmware y commit Git:**
- **Navegador, version y dispositivo:**
- **Precondiciones:**
- **Datos de entrada (anonimizados):**
- **Pasos ejecutados:**
- **Resultado esperado:**
- **Resultado observado (hechos):**
- **Estado:** NO EJECUTADO / APROBADO / FALLIDO / BLOQUEADO / NO APLICA
- **Evidencia:** EV-CPXX (ruta del archivo)
- **Incidencia / observaciones:**
- **Firma o responsable de revision:**
```

## 7. Registro de defectos

Mantener un registro con `DEF-001`, fecha, prueba asociada, severidad (`critica`, `alta`, `media`, `baja`), pasos de reproducción, comportamiento actual, comportamiento esperado, evidencia, responsable, estado y commit de corrección. Para cerrar un defecto, volver a ejecutar el caso de prueba que lo detectó.

## 8. Evidencias y organización sugerida

```text
docs/
├── 01_especificacion_requisitos.md
├── 02_plan_pruebas.md
├── pruebas/
│   ├── 03_prueba_alertas_sin_guardar_datos.sql
│   └── ejecuciones/
│       └── CP-XX_AAAA-MM-DD.md
└── evidencias/
    ├── EV-CP01/
    ├── EV-CP02/
    └── ...
```

Nombrar las evidencias con un identificador estable: `EV-CPXX_YYYY-MM-DD_descripcion.png` o `.csv`. Cada imagen debe mostrar contexto suficiente para auditarla, ocultando contraseñas, tokens, información privada y datos sensibles.

## 9. Criterios de entrada y salida de la campaña

**Entrada:** firmware y frontend identificados por versión; base de pruebas disponible; esquema SQL versionado; permisos revisados; procedimientos y resultados esperados definidos; pruebas simuladas seguras preparadas.

**Salida mínima:** casos prioritarios ejecutados con evidencia; cero defectos críticos abiertos; resultados fallidos y pendientes informados sin ocultarlos; métricas de adquisición y persistencia documentadas; limitaciones de conectividad y medición exterior descritas. La decisión final de aceptación debe indicar cuántos casos resultaron `APROBADO`, `FALLIDO`, `BLOQUEADO`, `NO APLICA` y `NO EJECUTADO`.

## 10. Indicadores y reporte final

- **Cobertura de requisitos:** requisitos con al menos un caso ejecutado / total de requisitos aplicables (indicar exclusiones).
- **Tasa de aprobación:** casos aprobados / casos ejecutados con resultado (`APROBADO` + `FALLIDO`).
- **Continuidad de muestreo:** mediciones recibidas / mediciones nominalmente esperadas, indicando lagunas y duración.
- **Retardo de ingestión:** `fecha_recepcion - fecha_medicion` en segundos, con mediana, percentil 95 y máximo.
- **Correctitud de alertas:** transiciones esperadas frente a transiciones registradas, incluidos cambios y normalizaciones.
- **Integridad de exportación:** filas del CSV frente a filas seleccionadas desde PostgreSQL para un mismo rango.

No calcular valores hasta disponer de los datos de prueba y las evidencias correspondientes.

## 11. Control de cambios

| Versión | Fecha | Descripción |
|---|---|---|
| 1.0 | 2026-11-08 | Plan inicial de 17 casos alineado a la ERS v1.0; sin declarar resultados formales. |

---

**Nota académica:** este plan permite demostrar verificabilidad y trazabilidad del software del prototipo. No sustituye una calibración metrológica, un análisis sanitario ni certificaciones de seguridad ambiental.
