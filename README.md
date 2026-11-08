# AIRE.BGA — Sistema IoT para el seguimiento ambiental en Bucaramanga

**Proyecto de grado de Ingeniería de Software. Prototipo experimental en desarrollo.**

## Componentes implementados

- **Adquisición:** ESP32 + Sensirion SEN55, 8 variables (PM1, PM2.5, PM4, PM10, temperatura, humedad, VOC Index y NOx Index), cada 30 segundos.
- **Transporte:** MQTT en vivo hacia el navegador y HTTPS autenticado hacia `registrar-medicion` en Supabase Edge Functions.
- **Persistencia:** PostgreSQL `public.estaciones`, `public.mediciones` y `public.alertas`.
- **Detección de eventos:** trigger `trg_aire_bga_alertas` en PostgreSQL para evaluar cuatro lecturas consecutivas, guardar cambios, recuperación y normalización. El frontend no escribe eventos en PostgreSQL.
- **Interfaz:** `index.html`, `style.css`, `app.js`, HTML/CSS/JS sin compilación, gráficos Chart.js y MQTT.js.
- **Historial de mediciones:** `supabase-historial.js` (API REST, RLS `SELECT` público), con filtros, estadísticas, tabla de 12 lecturas y CSV paginado.
- **Historial de alertas:** `supabase-alertas.js` (API REST de solo lectura), filtros PM/VOC/NOx, CSV centralizado, actualización periódica y punto rojo por novedades.

## Consultar la plataforma

La aplicación está desplegada en Vercel y sincronizada con GitHub. Se ejecuta localmente con Live Server. La configuración pública reside en `supabase-config.js`. **No incluir contraseñas de PostgreSQL, tokens del ESP32 ni claves `sb_secret_` o `service_role` en el frontend.**

El valor `sb_publishable_` está diseñado para clientes públicos, condicionado por los permisos y políticas RLS. Los roles públicos solo deben tener permiso de **consulta** sobre mediciones y alertas. Los registros se insertan exclusivamente desde la Edge Function autenticada y el trigger del servidor.

## Flujo de datos

```text
SEN55 → ESP32 ── MQTT ─────────→ AIRE.BGA (Vercel, visualización inmediata)
            └── HTTPS autenticado → Supabase Edge Function → PostgreSQL
                                                            ├─ mediciones
                                                            └─ trigger → alertas
AIRE.BGA (Vercel) ── REST solo lectura ─────────────────────→ mediciones y alertas
```

## Semáforo y notificaciones

Los umbrales PM (experimental, **no ICA oficial**) son: atención PM2.5 ≥13 o PM10 ≥55; elevada PM2.5 ≥38 o PM10 ≥155; muy elevada PM2.5 ≥56 o PM10 ≥255 (µg/m³). La evaluación del cambio de nivel requiere cuatro lecturas consecutivas. Las alertas complementarias son de los índices relativos VOC ≥150 y NOx ≥20, también por cuatro lecturas; **no son concentraciones de gases** ni umbrales de salud.

- El **trigger PostgreSQL** es el responsable de registrar los eventos compartidos y su recuperación. Funciona aunque nadie tenga abierta la web.
- La web calcula provisionalmente el semáforo con MQTT para mostrar el estado en vivo, pero **no duplica eventos** en el historial local cuando Supabase está configurado.
- El punto rojo indica un evento nuevo de activación/aumento sin revisar en **este navegador**. Al entrar en Alertas desaparece; la marca de revisado se guarda en localStorage y no se sincroniza entre navegadores. Las normalizaciones se guardan pero no encienden el punto rojo.
- Se consulta Supabase aproximadamente cada 30 segundos y al regresar a la pestaña.
- La tabla muestra hasta 80 de los 500 eventos más recientes consultados, filtrados en la interfaz; **el CSV descarga todos los eventos de la categoría seleccionada por páginas de hasta 1.000**.
- Si la conexión al historial falla, aparece un mensaje explícito; no se confunde el historial centralizado con datos locales.

## Zona horaria

PostgreSQL almacena `timestamptz` (UTC). La interfaz convierte `fecha_evento` a la hora **America/Bogota (UTC−5)** y el CSV incluye fecha UTC, fecha Colombia y fecha de registro UTC.

## Seguridad, limitaciones y pruebas pendientes

- **Broker público de pruebas:** `broker.hivemq.com`; migrar a broker privado o autenticado antes de producción.
- En el prototipo no se garantiza reenvío tras pérdida de conectividad del ESP32 ni almacenamiento local de mediciones faltantes en el equipo.
- RLS de lectura pública expone las mediciones y alertas ambientales a cualquier visitante con la clave pública; evitar datos privados y ubicaciones sensibles.
- Las lecturas del SEN55 al aire libre requieren carcasa adecuada y validación contra instrumento de referencia.
- Las pruebas de integración del frontend de alertas se han realizado con respuestas de API **simuladas**. Debe verificarse en Live Server y en Vercel con eventos reales confirmados por PostgreSQL.
- Para la sustentación se recomienda conservar versiones en Git, scripts SQL, matriz de pruebas, ensayos de continuidad e informes de resultados.

## Archivos

```text
calidad_aire_plataforma/
├── index.html
├── style.css
├── app.js
├── supabase-config.js         # Solo URL y clave PUBLICABLE
├── supabase-historial.js
├── supabase-alertas.js        # Nuevo: eventos centralizados
├── README.md
└── .gitignore
```
