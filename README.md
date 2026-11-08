# AIRE.BGA — Plataforma IoT de calidad del aire

**Proyecto de grado de Ingeniería de Software (prototipo en desarrollo).**

Aplicación web para visualizar mediciones ambientales de una estación experimental instalada en Bucaramanga, Colombia. La estación utiliza un **ESP32** y un **Sensirion SEN55** para medir material particulado (PM1.0, PM2.5, PM4.0 y PM10), temperatura, humedad relativa y los índices relativos VOC y NOx.

## Funciones implementadas

- **Panel general:** estado operativo por partículas y lecturas recientes.
- **Tendencias:** filtros de tiempo, gráficas independientes seleccionables, resúmenes y las últimas 12 lecturas del período.
- **Sensores:** consulta de las ocho variables ambientales.
- **Alertas:** reglas experimentales confirmadas con cuatro lecturas consecutivas, historial de eventos, avisos por nuevas alertas y recuperación a niveles inferiores.
- **Exportación CSV:** mediciones filtradas, historial local completo y eventos.
- **Almacenamiento actual:** IndexedDB dentro del navegador.

## Tecnologías

HTML5, CSS3, JavaScript, MQTT.js (MQTT por WebSockets), Chart.js e IndexedDB.

El código del frontend se compone de `index.html`, `style.css` y `app.js`; no requiere compilación. Las bibliotecas se cargan desde CDN.

## Ejecutar localmente

1. Abre esta carpeta en Visual Studio Code.
2. Instala la extensión **Live Server**, si aún no la tienes.
3. Haz clic derecho sobre `index.html` y selecciona **Open with Live Server**.
4. Verifica la conexión MQTT y el funcionamiento de las pantallas.

La aplicación escucha temporalmente el broker público de pruebas `broker.hivemq.com` por `wss://broker.hivemq.com:8884/mqtt`, tópico `bga/aire/sen55/estacion01/datos`. La estación debe publicar una lectura JSON cada 30 segundos.

## Limitaciones importantes del prototipo

- **Sin persistencia centralizada:** las mediciones solo se guardan cuando la aplicación está abierta en *este* navegador/origen. No se recuperan lecturas perdidas mientras está cerrada.
- **Sin garantías de operación continua ni seguridad del broker:** el MQTT público es exclusivamente para pruebas. Antes de un despliegue de producción, se requiere autenticación y control de acceso.
- **Semáforo experimental:** los umbrales instantáneos y las alertas de cuatro lecturas consecutivas no son un Índice de Calidad del Aire (ICA) oficial ni una evaluación sanitaria o regulatoria.
- **VOC/NOx:** los índices del SEN55 son relativos y no expresan concentraciones de gases.
- **Medición exterior:** requiere acondicionamiento mecánico, protección ambiental y validación instrumental de las mediciones.

## Próximas fases del trabajo de grado

1. Versionamiento en Git y repositorio GitHub.
2. Publicación estática en Vercel.
3. Diseño de base de datos PostgreSQL/Supabase y servicio de ingesta MQTT persistente.
4. Integración frontend–base de datos, seguridad y pruebas automatizadas.
5. Validación de campo, diagramas UML y documentación del proceso de Ingeniería de Software.

## Estructura

```
calidad_aire_plataforma/
├── index.html
├── style.css
├── app.js
├── README.md
└── .gitignore
```

**Nota:** ninguna credencial privada, contraseña o token de producción debe registrarse en este repositorio.
