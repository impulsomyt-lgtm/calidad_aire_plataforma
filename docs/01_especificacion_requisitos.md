# AIRE.BGA — Especificación de requisitos de software (ERS)

**Proyecto de grado:** Desarrollo de un sistema IoT de bajo costo para el seguimiento y alerta temprana de la calidad del aire en Bucaramanga
**Programa:** Ingeniería de Software
**Versión:** 1.0
**Fecha:** 8 de noviembre de 2026
**Estado:** Documento de línea base; sujeto a revisión durante las pruebas formales.

## 1. Propósito

Definir los requisitos funcionales y no funcionales del sistema AIRE.BGA, así como los criterios mediante los cuales se verificará su cumplimiento. Este documento describe el prototipo implementado y diferencia las capacidades observadas de las verificaciones todavía pendientes.

## 2. Alcance y contexto

AIRE.BGA permite adquirir, transmitir, almacenar, consultar y visualizar información ambiental de una estación experimental situada en Bucaramanga. La estación emplea un ESP32 y un sensor Sensirion SEN55; el firmware transmite un registro aproximadamente cada 30 segundos mediante MQTT para visualización en tiempo real y HTTPS para almacenamiento centralizado en Supabase PostgreSQL.

La aplicación web, publicada mediante Vercel, ofrece panel general, consulta de sensores, tendencias, filtros temporales, exportaciones CSV y un historial centralizado de alertas. Las reglas experimentales evalúan las partículas PM2.5 y PM10, mientras que VOC Index y NOx Index se consideran indicadores complementarios independientes.

**Limitaciones del alcance:** los umbrales operativos y el semáforo no constituyen un Índice de Calidad del Aire (ICA) oficial ni una clasificación sanitaria. Los índices VOC y NOx no representan concentraciones de gases. El SEN55 no es un detector certificado de fugas de gas. La operación continua durante fallas de Wi-Fi, el almacenamiento local en el ESP32 y la validación contra una estación de referencia no se consideran capacidades ya verificadas.

## 3. Actores y componentes

- **Usuario consultante:** accede a los datos y a las alertas desde un navegador sin autenticación personal.
- **Estación IoT:** ESP32 con sensor SEN55; realiza adquisiciones y transmisiones.
- **Broker MQTT:** distribuye mensajes recientes a navegadores conectados.
- **Edge Function `registrar-medicion`:** autentica la solicitud del dispositivo, valida los datos y registra mediciones.
- **Supabase PostgreSQL:** conserva estaciones, mediciones y alertas; ejecuta el trigger de evaluación.
- **Aplicación AIRE.BGA:** interfaz web que consulta datos centralizados y presenta la información.

## 4. Requisitos funcionales

| ID | Requisito | Prioridad | Criterio de aceptación | Estado de referencia |
|---|---|---|---|---|
| RF-01 | Adquirir PM1.0, PM2.5, PM4.0, PM10, temperatura, humedad, VOC Index y NOx Index mediante el SEN55. | Alta | Una lectura válida incluye las ocho variables, con sus unidades o naturaleza relativa correctamente identificadas. | Implementado; comprobado en campo de prueba. |
| RF-02 | Publicar las mediciones en MQTT mediante un mensaje JSON a intervalos programados de 30 segundos. | Alta | Un cliente MQTT suscrito recibe mensajes sucesivos con el formato definido. | Implementado y observado. |
| RF-03 | Enviar las mediciones por HTTPS a la función `registrar-medicion`. | Alta | La función acepta datos válidos con el token correcto y responde satisfactoriamente. | Implementado y observado. |
| RF-04 | Almacenar centralizadamente las mediciones, incluyendo fecha de captura y fecha de recepción. | Alta | Aparecen nuevas filas en `mediciones` incluso con la aplicación web cerrada. | Implementado y comprobado. |
| RF-05 | Evitar la duplicación de mediciones de la misma estación con igual fecha de captura. | Alta | La restricción de unicidad impide registros equivalentes; se verifica también la idempotencia del servicio. | Restricción identificada; pendiente prueba formal completa. |
| RF-06 | Presentar un panel general con la condición operativa por partículas y los indicadores recientes. | Alta | El usuario puede consultar el estado y los valores desde un navegador. | Implementado y observado. |
| RF-07 | Visualizar individualmente las ocho variables ambientales y los datos generales de la estación. | Alta | La sección Sensores muestra las ocho variables y su significado. | Implementado y observado. |
| RF-08 | Consultar series temporales y seleccionar una o varias de las ocho variables. | Alta | El usuario puede marcar o desmarcar variables y visualizar las gráficas correspondientes. | Implementado y observado. |
| RF-09 | Filtrar el historial por período, incluyendo un intervalo personalizado. | Alta | Al elegir fechas, las gráficas y los registros reflejan el período solicitado en hora de Colombia. | Implementado; pendiente batería sistemática de pruebas de límites. |
| RF-10 | Mostrar las últimas doce mediciones del período seleccionado. | Media | La tabla muestra hasta doce registros ordenados del más reciente al más antiguo. | Implementado y observado. |
| RF-11 | Exportar mediciones a CSV, tanto completas como filtradas por período. | Alta | El archivo contiene las columnas de fecha y las ocho mediciones; no se trunca por paginación del servicio. | Implementado; exportación comprobada, pendiente prueba de volumen. |
| RF-12 | Evaluar el estado operativo de PM2.5 y PM10 mediante umbrales experimentales y cuatro lecturas consecutivas para confirmar los cambios. | Alta | Se genera un evento cuando cuatro lecturas confirman el cambio; se evita registrar uno nuevo si no existe transición confirmada. | Implementado; prueba controlada superada. |
| RF-13 | Evaluar de forma independiente VOC Index y NOx Index usando criterios experimentales de cuatro lecturas. | Alta | Se registra el incremento o retorno a referencia por indicador, sin modificar por ello el semáforo de PM. | Implementado; VOC validado, NOx pendiente de prueba específica. |
| RF-14 | Registrar centralizadamente activaciones, cambios de nivel, reducciones y normalizaciones. | Alta | Los eventos quedan en `alertas`, vinculados a la estación y, cuando corresponda, a una medición. | Implementado; se observaron activaciones y recuperaciones. |
| RF-15 | Consultar y exportar el historial centralizado de alertas desde diferentes dispositivos. | Alta | Los eventos disponibles en Supabase aparecen en la aplicación publicada y pueden exportarse a CSV. | Consulta comprobada en Vercel; exportación pendiente de prueba formal. |
| RF-16 | Señalar localmente en cada navegador que hay nuevas alertas sin revisar. | Media | Un nuevo evento pendiente activa un indicador; consultar Alertas marca como revisados los eventos de ese navegador. | Implementado; pruebas de interfaz simuladas. |
| RF-17 | Rechazar intentos de registro sin el token autorizado o con datos no válidos. | Alta | Una petición sin token válido devuelve un error de autorización y no inserta mediciones. | Autorización comprobada; validaciones de entradas pendientes de pruebas negativas. |

## 5. Requisitos no funcionales

| ID | Requisito | Criterio verificable | Estado de referencia |
|---|---|---|---|
| RNF-01 | Seguridad de la ingestión | El token del dispositivo se mantiene fuera del código público; la función comprueba su valor antes de insertar datos. | Parcialmente verificado; revisar secretos en el repositorio. |
| RNF-02 | Acceso de solo lectura | Los visitantes pueden consultar mediciones y alertas, pero no insertarlas, modificarlas ni eliminarlas mediante la clave pública. | RLS configurado; pendiente prueba negativa de permisos. |
| RNF-03 | Protección del transporte | El dispositivo usa HTTPS hacia Supabase y el navegador usa HTTPS/WSS en los servicios públicos. | Implementado; pendiente registro de verificación de TLS. |
| RNF-04 | Persistencia independiente del navegador | El ESP32 continúa enviando mediciones a PostgreSQL con AIRE.BGA cerrada, siempre que tenga alimentación y conectividad. | Comprobado en prueba funcional. |
| RNF-05 | Consistencia temporal | Las fechas se almacenan como instantes con zona horaria y se muestran al usuario en `America/Bogota` (UTC−05:00). | Comprobado en capturas; pendiente prueba de exportación. |
| RNF-06 | Interoperabilidad | Un navegador de escritorio y otro dispositivo pueden consultar el mismo historial centralizado. | Comprobado en computador y celular. |
| RNF-07 | Mantenibilidad y trazabilidad | El repositorio conserva frontend, firmware sin secretos, función de ingestión, migraciones, pruebas y diagramas editables. | En organización; pendiente revisión y commit. |
| RNF-08 | Usabilidad | La interfaz permite navegar entre Panel general, Tendencias, Sensores y Alertas, con etiquetas y unidades comprensibles. | Implementado; pendiente prueba de usuarios. |
| RNF-09 | Calidad de la medición exterior | El prototipo debe documentar protección mecánica, condiciones de instalación y comparación con referencia antes de afirmar precisión en exteriores. | Pendiente de validación metrológica. |
| RNF-10 | Resiliencia frente a desconexiones | Se deben identificar y cuantificar pérdidas de datos ante interrupciones de alimentación o Internet; el reenvío local no se presupone implementado. | Pendiente de implementación o evaluación experimental. |

## 6. Reglas operativas experimentales

- **Intervalo nominal de adquisición/transmisión:** 30 segundos; no representa una garantía de periodicidad exacta.
- **Semáforo principal:** determinado por PM2.5 y PM10, considerando el nivel de mayor severidad.
- **Confirmación de cambios:** cuatro lecturas consecutivas para registrar activaciones, cambios, reducciones y normalizaciones, según la lógica implementada en PostgreSQL.
- **Umbrales operativos de partículas documentados en la plataforma:** PM2.5: atención desde 13, elevada desde 38 y muy elevada desde 56 µg/m³; PM10: atención desde 55, elevada desde 155 y muy elevada desde 255 µg/m³. La implementación exacta se verificará contra el SQL del trigger versionado.
- **Eventos complementarios:** VOC Index ≥ 150 o NOx Index ≥ 20, evaluados por separado y confirmados mediante cuatro lecturas consecutivas.
- **Interpretación:** no equivalen a ICA oficial ni permiten determinar ausencia de riesgos por gases inflamables.

## 7. Evidencia disponible y pruebas pendientes

**Evidencia ya obtenida:** transmisión MQTT, almacenamiento HTTPS en PostgreSQL, lectura del historial desde celular, prueba reversible de alerta roja y normalización, y registro observado de incremento y recuperación del VOC Index.

**Pruebas formales aún recomendadas:** validación de campos inválidos, duplicados, consultas con filtros de fecha extremos, exportaciones con más de 1.000 filas, RLS para solicitudes anónimas de escritura, comportamiento ante pérdida de conectividad, comprobación específica de NOx, compatibilidad de navegadores y validación instrumental en exteriores.

## 8. Matriz inicial de trazabilidad

| Evidencia / caso de prueba a documentar | Requisitos asociados |
|---|---|
| CP-01 Captura de una lectura completa del SEN55 | RF-01, RF-07 |
| CP-02 Publicación MQTT cada 30 segundos nominales | RF-02, RF-06 |
| CP-03 HTTPS autorizado y no autorizado | RF-03, RF-17, RNF-01 |
| CP-04 Persistencia con navegador cerrado | RF-04, RNF-04 |
| CP-05 Historial y gráficas desde dos dispositivos | RF-08, RF-09, RF-10, RNF-06 |
| CP-06 Exportación CSV completo y por período | RF-11, RNF-05 |
| CP-07 Alerta por partículas y normalización | RF-12, RF-14 |
| CP-08 Activación y recuperación VOC | RF-13, RF-14 |
| CP-09 Consulta y exportación de eventos | RF-15, RF-16 |
| CP-10 Verificación RLS sin permisos de escritura | RNF-02 |
| CP-11 Pérdida y restablecimiento de conectividad | RNF-10 |
| CP-12 Validación comparativa en exteriores | RNF-09 |

## 9. Control de cambios

| Versión | Fecha | Descripción |
|---|---|---|
| 1.0 | 2026-11-08 | Línea base inicial basada en el prototipo AIRE.BGA y las pruebas documentadas hasta la fecha. |

---

**Nota metodológica:** los estados «implementado» y «comprobado» se refieren a las evidencias funcionales reunidas durante el desarrollo; no implican certificación, calibración instrumental ni validación normativa del sistema.
