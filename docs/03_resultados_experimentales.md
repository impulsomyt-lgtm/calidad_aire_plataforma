# AIRE.BGA — Resultados experimentales y evidencias

**Proyecto:** Desarrollo de un sistema IoT de bajo costo para el seguimiento y alerta temprana de la calidad del aire en Bucaramanga
**Programa:** Ingeniería de Software
**Documento:** `docs/03_resultados_experimentales.md`
**Versión:** 0.2 — ampliación con evidencia Arduino IDE y contraste con la plataforma
**Fecha de consolidación:** 10 de noviembre de 2026
**Zona horaria del informe:** `America/Bogota` (UTC−05:00)
**Nota metodológica:** se distinguen pruebas funcionales exploratorias, ensayos de campo y casos formales definidos en `02_plan_pruebas.md`.

## 1. Objetivo y alcance

Documentar las evidencias disponibles de **adquisición de datos, cambios de señal, transmisión, persistencia, visualización y generación de alertas** del prototipo IoT AIRE.BGA, compuesto por un sensor Sensirion SEN55, un ESP32 y una plataforma web. Los resultados corresponden a pruebas exploratorias de funcionamiento; **no son una calibración del instrumento**, una comparación con una estación de referencia, ni una certificación de calidad del aire.

## 2. Sistema utilizado

- **Sensor:** Sensirion SEN55; variables PM1.0, PM2.5, PM4.0, PM10, temperatura, humedad relativa, VOC Index y NOx Index.
- **Controlador:** ESP32; adquisición nominal cada 30 segundos.
- **Comunicación y almacenamiento:** envío de datos mediante MQTT y HTTPS; función de ingestión y base PostgreSQL en Supabase.
- **Interfaz:** plataforma web AIRE.BGA publicada en Vercel, con tendencias históricas y trazabilidad de alertas.
- **Lógica de alertas relativa:** VOC Index ≥ 150 o NOx Index ≥ 20, durante cuatro lecturas consecutivas. Los índices son **relativos**, no valores de concentración en ppm o µg/m³.
- **Trazabilidad:** los CSV de las consultas SQL se conservaron sin modificar y se relacionan con fotografías y capturas de la plataforma.

![Prototipo físico ensamblado](evidencias/02_prototipo_fisico/prototipo_ensamblado.png)

*Figura 1. Prototipo físico del sistema IoT con ESP32, SEN55 y alimentación externa. Fuente: fotografía aportada por el autor.*

### 2.1. Verificación de adquisición, transmisión y registro en Arduino IDE

El **10 de noviembre de 2026**, se documentó el firmware `AIRE_BGA_Firmware_MQTT_HTTPS.ino` en **Arduino IDE 2.3.2**, con la tarjeta **ESP32 Dev Module** seleccionada. En la parte visible del código se observa el uso del broker de pruebas MQTT `broker.hivemq.com`, el tópico `bga/aire/sen55/estacion01/datos`, el envío HTTPS a una función de Supabase, el intervalo de adquisición configurado en **30.000 ms** y la conexión I²C mediante **GPIO25 (SDA)** y **GPIO26 (SCL)**. La captura no expone el contenido de `config_local.h`, que contiene configuración privada.

El **Monitor Serie** muestra registros de lectura del SEN55, mensajes `MQTT: PUBLICADO` y respuestas de la función de ingestión `Supabase HTTPS: HTTP 200 GUARDADO`. Los mensajes de publicación indican que la operación de publicación fue aceptada por la biblioteca MQTT; no prueban por sí solos que un suscriptor determinado haya recibido el mensaje. La respuesta HTTP 200 indica que el servicio contestó satisfactoriamente, y la visualización posterior en la web respalda adicionalmente la persistencia de los datos.

![Arduino IDE: firmware y Monitor Serie](evidencias/02_prototipo_fisico/ArduinoIDE_firmware_monitorserie_10nov2026.png)

*Figura de evidencia complementaria A. Arduino IDE 2.3.2 con parámetros visibles del firmware y Monitor Serie del ESP32, mostrando lecturas SEN55, publicación MQTT y respuestas HTTPS 200. Fuente: captura original del autor, 10 de noviembre de 2026.*

### 2.2. Correspondencia entre Monitor Serie y plataforma AIRE.BGA

La captura de la tabla **«Últimas 12 mediciones»** de AIRE.BGA muestra las mismas marcas de tiempo y los mismos valores de PM2.5/PM10 que aparecen en el Monitor Serie para las cuatro lecturas consecutivas siguientes:

| Fecha y hora (Colombia) | PM2.5 en Monitor Serie (µg/m³) | PM2.5 en plataforma (µg/m³) | PM10 en ambos (µg/m³) |
|---|---:|---:|---:|
| 10/11/2026 11:06:08 | 7,90 | 7,9 | 7,9 |
| 10/11/2026 11:06:38 | 7,70 | 7,7 | 7,7 |
| 10/11/2026 11:07:08 | 7,50 | 7,5 | 7,5 |
| 10/11/2026 11:07:38 | 7,80 | 7,8 | 7,8 |

Esta coincidencia **confirma, para las cuatro lecturas observadas**, la correspondencia entre los datos adquiridos y presentados en la plataforma. No equivale a una prueba de integridad del 100 % de todos los mensajes transmitidos ni a una medición de latencia extremo a extremo. La captura de la plataforma también expone las otras variables ambientales para esos instantes: PM1.0, PM4.0, temperatura, humedad, VOC Index y NOx Index.

![Tabla Últimas 12 mediciones de AIRE.BGA](evidencias/02_prototipo_fisico/Plataforma_ultimas12_mediciones_10nov2026.png)

*Figura de evidencia complementaria B. Correspondencia temporal y numérica entre lecturas de PM del Monitor Serie y la tabla de mediciones históricas de AIRE.BGA. Fuente: captura original del autor, 10 de noviembre de 2026.*

> **Observación temporal:** las marcas de `fecha_medicion` incluyen la zona horaria `-05:00`, correspondiente a `America/Bogota`; se comparan instantes equivalentes, no marcas UTC sin conversión. Véase la sección 7.

## 3. Prueba exterior: 9 de noviembre de 2026

El dispositivo se instaló en la **calle 9 con carrera 22, Bucaramanga (Santander)**, en un entorno urbano próximo a una vía. Según el registro del autor, la estación comenzó a operar aproximadamente a las **08:10 a. m.** y no fue manipulada durante el evento de alerta descrito.

La captura del historial documenta un evento de **VOC Index = 161 a las 09:30:21**, seguido de un evento **«Retorno a referencia operativa», VOC Index = 127 a las 10:23:52**. La separación entre eventos es de **53 minutos y 31 segundos**. Esta diferencia no mide por sí sola el tiempo de permanencia del contaminante.

![Instalación exterior](evidencias/03_prueba_exterior/instalacion_exterior_vista_frontal.jpg)

*Figura 2. Estación IoT instalada en exterior, junto a una vía urbana de Bucaramanga. Fuente: fotografía original aportada por el autor.*

![Alerta VOC observada durante la prueba de campo](evidencias/03_prueba_exterior/alerta_VOC_campo_09nov.png)

*Figura 3. Historial de alerta VOC y recuperación durante el ensayo exterior. Fuente: captura de AIRE.BGA.*

**Interpretación:** el evento coincide con la operación de la estación en exteriores y demuestra detección y almacenamiento de una variación del índice. No permite atribuir causalmente el incremento al tráfico ni determinar una concentración absoluta de gas.

## 4. Ensayo PM: respuesta exploratoria a partículas (10 de noviembre de 2026)

### 4.1. Procedimiento observado

Se colocó temporalmente un recipiente de vidrio sobre el prototipo y se generó una exposición a humo procedente de un fósforo apagado. El autor reportó la exposición aproximadamente entre **09:17 y 09:21 a. m.**, tras lo cual retiró el recipiente. Este procedimiento se registra retrospectivamente como **ensayo exploratorio ya realizado**; no constituye una recomendación para reproducirlo.

### 4.2. Resultados

Se analizaron **33 registros** del archivo de Supabase entre **09:13:27 y 09:29:27**, sin intervalos mayores de 30 segundos en ese tramo.

| Magnitud | Hallazgo documentado |
|---|---|
| PM1.0 máximo reportado | 3.633,1 µg/m³ |
| PM2.5 / PM4.0 / PM10 máximos reportados | 6.553,4 µg/m³ |
| Primer valor de PM2.5 igual a 6.553,4 | 09:18:27 |
| Último valor consecutivo igual a 6.553,4 | 09:20:27 |
| PM2.5 posterior | 858,7 a las 09:20:57; 40,5 a las 09:21:27; 18,6 a las 09:21:57 |
| Último PM2.5 del archivo | 14,7 µg/m³ a las 09:29:27 |

Los registros muestran una respuesta intensa del sistema y posteriormente una disminución pronunciada. La meseta repetida de **6.553,4 µg/m³** requiere cautela: es un valor fuera del intervalo de medición de PM usualmente especificado para el dispositivo y **no debe interpretarse como concentración cuantitativamente validada**. Debe revisarse en el análisis técnico del formato de salida, saturación y tratamiento de extremos.

### 4.3. Eventos de alerta PM

| Hora (Colombia) | Evento registrado | Nivel | Valor asociado |
|---|---|---|---:|
| 09:19:57 | Aumento confirmado | Muy elevada | 6.553,40 µg/m³ |
| 09:22:57 | Reducción de alerta | Elevada | 15,90 µg/m³ |
| 09:23:27 | Reducción de alerta | Atención | 15,30 µg/m³ |
| 09:55:57 | Normalización | Normal | 12,90 µg/m³ |

La activación de las **09:19:57** coincide con la cuarta lectura consecutiva elevada observada desde **09:18:27**. El tiempo entre alerta inicial y normalización registrada fue de **36 minutos**. La diferencia con el descenso de partículas observado cerca de las 09:22 requiere comprobar la lógica completa de cambios de nivel y normalización antes de afirmar cumplimiento integral de todas las transiciones.

![Gráficas PM](evidencias/04_prueba_pm/PM_graficas_plataforma.png)

*Figura 4. Evolución de las cuatro fracciones de partículas durante el ensayo, según AIRE.BGA.*

![Historial de alertas PM](evidencias/04_prueba_pm/PM_historial_alertas.png)

*Figura 5. Activación, reducciones de nivel y normalización asociadas al ensayo PM.*

**Datos originales:** `evidencias/04_prueba_pm/PM_mediciones_0910_0930.csv` y `PM_alertas_0900_1200.csv`.

## 5. Ensayo VOC Index: respuesta exploratoria y recuperación (10 de noviembre de 2026)

### 5.1. Procedimiento observado

Se expuso el dispositivo a gas liberado de un encendedor sin llama, mediante un recipiente temporal de vidrio, según lo reportado por el autor. Esta condición se documenta exclusivamente como antecedente experimental; **no debe reproducirse**, por el riesgo de acumulación de gas inflamable junto a una batería y componentes electrónicos.

### 5.2. Resultados de las mediciones

El archivo incluye **76 mediciones** desde **09:49:27 hasta 10:27:57** (hora Colombia). Hubo dos intervalos de 60 segundos: **10:12:27–10:13:27** y **10:16:57–10:17:57**; no se conoce su causa.

| Indicador | Resultado |
|---|---|
| VOC Index máximo | **497** a las 10:06:57 |
| Primer incremento marcado del episodio | 140 a las 10:02:57 |
| Alerta VOC | 10:04:57, valor 485 |
| Recuperación operativa | 10:23:57, valor 127 |
| Último VOC Index disponible | 104 a las 10:27:57 |
| NOx Index durante esta ventana | Entre 1 y 2 |
| PM2.5 durante esta ventana | Entre 8,0 y 15,2 µg/m³ |

La separación entre alerta y recuperación fue de **19 minutos**; esta medida corresponde al registro de eventos, no a una concentración de gas ni a la duración exacta de la exposición.

### 5.3. Regla de cuatro lecturas

| Hora | VOC Index | Validación |
|---|---:|---|
| 10:03:27 | 347 | Superior al umbral — 1/4 |
| 10:03:57 | 447 | Superior al umbral — 2/4 |
| 10:04:27 | 476 | Superior al umbral — 3/4 |
| **10:04:57** | **485** | **Superior al umbral — 4/4; alerta** |
| 10:22:27 | 146 | Inferior al umbral — 1/4 |
| 10:22:57 | 139 | Inferior al umbral — 2/4 |
| 10:23:27 | 132 | Inferior al umbral — 3/4 |
| **10:23:57** | **127** | **Inferior al umbral — 4/4; recuperación** |

**Resultado funcional:** los timestamps del historial de alertas coinciden con las cuartas lecturas de ambas secuencias. La señal VOC es relativa y no identifica ni cuantifica específicamente butano.

![Respuesta VOC](evidencias/05_prueba_voc/VOC_grafica_plataforma.png)

*Figura 6. Evolución temporal del VOC Index en la plataforma AIRE.BGA.*

![Eventos VOC](evidencias/05_prueba_voc/VOC_historial_alertas.png)

*Figura 7. Alerta y evento de retorno operativo del primer ensayo VOC.*

**Datos originales:** `evidencias/05_prueba_voc/VOC_mediciones_0949_1030.csv` y `VOC_alertas_0949_1030.csv`.

## 6. Ensayo con llama: NOx Index, VOC, temperatura y humedad (10 de noviembre de 2026)

### 6.1. Procedimiento observado

El autor reportó una exposición transitoria utilizando una **llama de encendedor** bajo un recipiente de vidrio, cerca del prototipo. Se registran los resultados históricos de una prueba ya realizada. **No repetir** este ensayo: una llama, gases de combustión, vidrio y una fuente de alimentación eléctrica cercana suponen riesgos de incendio, calor y exposición a productos de combustión.

### 6.2. Datos ambientales

Se analizaron **39 registros** entre **10:20:27 y 10:39:58**. Un intervalo de **61 segundos**, entre **10:33:27 y 10:34:28**, interrumpe la periodicidad nominal de 30 segundos.

| Variable | Resultado |
|---|---|
| NOx Index máximo | **451** a las 10:34:28 |
| VOC Index máximo en esta ventana | **475** a las 10:33:27 |
| Temperatura antes de la respuesta | **27,42 °C** a las 10:30:27 |
| Temperatura máxima | **34,12 °C** a las 10:34:28 |
| Aumento puntual de temperatura | **6,70 °C** entre las dos marcas anteriores |
| Humedad relativa máxima | **76,12 %** a las 10:32:27 |
| Humedad relativa mínima | **39,77 %** durante el ensayo |
| PM2.5 en la ventana 10:20–10:40 | **6,3 a 11,4 µg/m³** |

Temperatura y humedad cambiaron simultáneamente durante el episodio; por tanto, no es posible aislar con estos datos la contribución de productos de combustión, calor y humedad a la señal del NOx Index. El índice no equivale a una concentración específica de NO₂.

### 6.3. Alertas simultáneas y recuperaciones

| Indicador | Activación | Valor | Recuperación | Valor | Separación |
|---|---|---:|---|---:|---|
| NOx Index | 10:33:27 | 436 | 10:38:58 | 1 | **5 min 31 s** |
| VOC Index | 10:33:27 | 475 | 10:40:28 | 97 | **7 min 1 s** |

**Fuente y delimitación:** la activación de ambos índices y la recuperación NOx están en `NOx_alertas_VOC_1020_1040.csv`; la recuperación VOC a las **10:40:28** figura en la captura `NOx_segunda_recuperacion_VOC.png` y queda fuera del rango de consulta de los CSV que terminan antes de las 10:40. Conviene exportar ese evento posteriormente en una consulta ampliada para cerrar la trazabilidad estrictamente tabular.

La activación simultánea coincide con cuatro lecturas consecutivas sobre ambos umbrales:

| Hora | NOx Index | VOC Index |
|---|---:|---:|
| 10:31:57 | 120 | 263 |
| 10:32:27 | 335 | 319 |
| 10:32:57 | 393 | 447 |
| **10:33:27** | **436** | **475** |

La recuperación NOx se verificó con lecturas **8, 3, 1 y 1** a las **10:37:28, 10:37:58, 10:38:28 y 10:38:58**, respectivamente. Para afirmar formalmente la secuencia exacta de cuatro lecturas de recuperación de la segunda alerta VOC deben consultarse las mediciones después de las 10:40.

![Temperatura, humedad y NOx](evidencias/06_prueba_nox/NOx_graficas_temperatura_humedad_NOx.png)

*Figura 8. Respuestas temporales de temperatura, humedad relativa y NOx Index durante el ensayo.*

![Alertas NOx](evidencias/06_prueba_nox/NOx_historial_alertas.png)

*Figura 9. Activación y recuperación de la alerta NOx.*

![Segunda recuperación VOC](evidencias/06_prueba_nox/NOx_segunda_recuperacion_VOC.png)

*Figura 10. Historial web que muestra la recuperación VOC del segundo episodio a las 10:40:28.*

**Datos originales:** `NOx_mediciones_1030_1040.csv`, `NOx_alertas_1030_1040.csv`, `NOx_mediciones_1020_1040.csv` y `NOx_alertas_VOC_1020_1040.csv`.

## 7. Gestión de fechas y sincronización temporal

El proyecto utiliza PostgreSQL con columnas de tipo `TIMESTAMPTZ`. Las marcas de tiempo pueden representarse en **UTC**, mientras que el usuario y la plataforma consultan fechas y horas en la zona horaria **`America/Bogota` (UTC−05:00)**, que no usa horario de verano.

- **Ejemplo:** `2026-11-10 15:33:27 UTC` equivale a **10:33:27 a. m.** en Bucaramanga el mismo día.
- Una diferencia fija de cinco horas en la representación **no implica por sí sola retraso de red o transmisión**.
- Se deben comparar **instantes equivalentes con zonas horarias explícitas**, no cadenas de fecha sin conversión.
- Se conservarán la hora de medición y, cuando proceda, la hora de recepción, para evaluar posibles latencias por separado.

Consulta PostgreSQL utilizada para exportar horas de Colombia:

```sql
SELECT
  fecha_medicion AT TIME ZONE 'America/Bogota' AS fecha_colombia,
  pm25, pm10, temperatura, humedad, voc_index, nox_index
FROM public.mediciones
WHERE fecha_medicion >= (
  TIMESTAMP '2026-11-10 10:20:00' AT TIME ZONE 'America/Bogota'
)
AND fecha_medicion < (
  TIMESTAMP '2026-11-10 10:40:00' AT TIME ZONE 'America/Bogota'
)
ORDER BY fecha_medicion;
```

## 8. Evaluación general de las evidencias

| Función evaluada | Evidencia observada | Alcance de la conclusión |
|---|---|---|
| Adquisición del SEN55 | Registros de las ocho variables en CSV | Se verificó disponibilidad de datos durante las ventanas analizadas |
| Concordancia firmware-plataforma | Capturas del Monitor Serie y de «Últimas 12 mediciones» | Coinciden hora, PM2.5 y PM10 en cuatro lecturas consecutivas; no se infiere integridad global de transmisión |
| Publicación y respuesta de ingestión | Mensajes `MQTT: PUBLICADO` y `Supabase HTTPS: HTTP 200 GUARDADO` | Verificación de retorno de operaciones en el firmware; la recepción MQTT extremo a extremo exige comprobación independiente |
| Respuesta a variaciones | Cambios en PM, VOC Index y NOx Index | Respuesta **cualitativa/exploratoria**; no exactitud instrumental |
| Persistencia | Fechas y valores exportados de PostgreSQL | Los registros fueron almacenados y son recuperables |
| Visualización | Capturas de gráficas en AIRE.BGA | Representación de series y eventos observada |
| Alertas | Activaciones y recuperaciones en historial | Se documentaron ciclos de eventos de PM, VOC y NOx |
| Cuatro lecturas consecutivas | Secuencias VOC y NOx de los CSV | Coincidencia observada con los eventos correspondientes |
| Continuidad estricta | Brechas aisladas de 60–61 s | Requiere investigación; no declarar 100 % de entrega |
| Exactitud y calibración | Sin equipo de referencia | **No evaluadas** |

### Diferencia con el plan de pruebas formal

Los ensayos de estímulo aquí descritos son **evidencias exploratorias ya ejecutadas** y pueden respaldar el funcionamiento del sistema. **No reemplazan automáticamente** los protocolos formales `CP-07`, `CP-08` y `CP-15` del documento `02_plan_pruebas.md`, que prevén validar las transiciones con datos de prueba reproducibles y sin exposición a combustión o gases inflamables. La prueba exterior es también exploratoria y no equivale a comparación instrumental con equipo de referencia.

## 9. Limitaciones y recomendaciones futuras

1. No se utilizaron instrumentos de referencia ni un protocolo metrológico que permita estimar error de medición, incertidumbre o exactitud.
2. Los máximos extremos de PM deben identificarse como **fuera del rango de interpretación cuantitativa** sin tratarlos como concentraciones ambientales fiables.
3. Los índices VOC y NOx son **relativos** y no identifican compuestos específicos ni concentraciones absolutas.
4. Se observaron algunas brechas en las series de mediciones; se recomienda evaluar estabilidad, alimentación, conectividad y registro de errores en pruebas no invasivas.
5. **Trabajo futuro — evaluación de carcasa:** analizar experimentalmente si el encapsulamiento afecta ventilación, temperatura o respuesta de las variables; no forma parte de las seis pruebas de laboratorio previstas.
6. Para próximos ensayos, priorizar monitoreo de aire ambiente y validación de reglas mediante datos sintéticos aislados. Evitar pruebas con humo concentrado, llama o liberación de gases cerca del prototipo.
7. Antes de publicar fotografías en un repositorio abierto, revisar autorización y privacidad de personas reconocibles que aparezcan incidentalmente.

## 10. Inventario de evidencias

El archivo `docs/evidencias/README.md` relaciona las seis categorías, incluyendo las capturas de Arduino IDE y la tabla web de mediciones históricas. Las fotografías, las capturas y los CSV se conservan como **fuentes primarias**. Las figuras y descripciones de este documento no sustituyen los registros originales.

**Estado del documento:** borrador de resultados basado en las evidencias suministradas. Antes de su incorporación definitiva a la tesis debe revisarse junto con el director del proyecto, indicar condiciones experimentales detalladas (duración, ubicación, equipo, configuración y versiones), numerar las figuras según el formato institucional y anexar referencias técnicas completas del fabricante.
