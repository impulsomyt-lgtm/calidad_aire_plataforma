/*
  AIRE.BGA | ESP32 + Sensirion SEN55 | MQTT + Supabase HTTPS
  Prototipo académico, 2026-11-08
  Lee una muestra cada 30 segundos. Envía el MISMO JSON al tópico MQTT
  y a la Edge Function registrar-medicion para almacenamiento centralizado.

  Requiere: Arduino ESP32, PubSubClient, SensirionI2CSen5x,
            soporte esp_http_client + certificado raíz bundle (ESP-IDF).
  Configuración privada en config_local.h; NO publicar en GitHub.
*/
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <SensirionI2CSen5x.h>
#include <time.h>
#include <math.h>
#include <string.h>
#include <esp_http_client.h>
#include <esp_crt_bundle.h>
#include "config_local.h"

static const char* MQTT_HOST = "broker.hivemq.com"; // broker compartido solo para pruebas
static const uint16_t MQTT_PORT = 1883;
static const char* MQTT_TOPIC = "bga/aire/sen55/estacion01/datos";
static const char* FUNCTION_URL = "https://afreehzqtonuhzmykjky.supabase.co/functions/v1/registrar-medicion";
static const unsigned long INTERVALO_MS = 30000UL;
static const int SDA_PIN = 25;
static const int SCL_PIN = 26;

SensirionI2CSen5x sen55;
WiFiClient mqttNet;
PubSubClient mqtt(mqttNet);
bool sen55Listo = false;
unsigned long ultimaLecturaMs = 0;
unsigned long ultimoWiFiMs = 0;
unsigned long ultimoMQTTMs = 0;
unsigned long ultimoSensorMs = 0;

bool configurarSensor() {
  char descripcion[256];
  const uint16_t resetError = sen55.deviceReset();
  if (resetError) {
    errorToString(resetError, descripcion, sizeof(descripcion));
    Serial.printf("SEN55: fallo reinicio: %s\n", descripcion);
    return false;
  }
  delay(100);
  const uint16_t startError = sen55.startMeasurement();
  if (startError) {
    errorToString(startError, descripcion, sizeof(descripcion));
    Serial.printf("SEN55: fallo inicio: %s\n", descripcion);
    return false;
  }
  Serial.println("SEN55: listo");
  return true;
}

void mantenerConexiones() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - ultimoWiFiMs >= 12000UL) {
      ultimoWiFiMs = millis();
      Serial.println("WiFi: reconectando...");
      WiFi.reconnect();
    }
    return;
  }
  if (!mqtt.connected() && millis() - ultimoMQTTMs >= 5000UL) {
    ultimoMQTTMs = millis();
    String clientId = "aire-bga-" + String((uint32_t)(ESP.getEfuseMac() & 0xFFFFFFFFULL), HEX);
    if (mqtt.connect(clientId.c_str())) Serial.println("MQTT: conectado");
    else Serial.printf("MQTT: error de conexion (%d)\n", mqtt.state());
  }
  if (mqtt.connected()) mqtt.loop();
}

bool fechaColombia(char* buffer, size_t n) {
  const time_t epoch = time(nullptr);
  if (epoch < 1704067200) return false;  // NTP aun no sincronizado
  struct tm local;
  if (!localtime_r(&epoch, &local)) return false;
  if (!strftime(buffer, n, "%Y-%m-%dT%H:%M:%S", &local)) return false;
  const char* zona = "-05:00";
  if (strlen(buffer) + strlen(zona) + 1 > n) return false;
  strcat(buffer, zona);
  return true;
}

// TLS autentica el certificado del servidor mediante la CA del bundle.
// No se utiliza setInsecure(), porque enviamos un secreto privado.
bool guardarSupabase(const char* json) {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (strlen(AIRE_BGA_INGEST_TOKEN) < 32 || strstr(AIRE_BGA_INGEST_TOKEN, "REEMPLAZAR")) {
    Serial.println("HTTPS: falta configurar el token privado en config_local.h");
    return false;
  }
  esp_http_client_config_t config = {};
  config.url = FUNCTION_URL;
  config.method = HTTP_METHOD_POST;
  config.timeout_ms = 10000;
  config.crt_bundle_attach = esp_crt_bundle_attach; // requiere bundle CA en core ESP32
  config.disable_auto_redirect = true;
  esp_http_client_handle_t cliente = esp_http_client_init(&config);
  if (!cliente) {
    Serial.println("HTTPS: no se pudo iniciar el cliente");
    return false;
  }
  esp_http_client_set_header(cliente, "Content-Type", "application/json");
  esp_http_client_set_header(cliente, "x-device-token", AIRE_BGA_INGEST_TOKEN);
  esp_http_client_set_post_field(cliente, json, (int)strlen(json));
  const esp_err_t err = esp_http_client_perform(cliente);
  bool ok = false;
  if (err == ESP_OK) {
    const int httpCode = esp_http_client_get_status_code(cliente);
    ok = (httpCode == 200);
    Serial.printf("Supabase HTTPS: HTTP %d %s\n", httpCode, ok ? "GUARDADO" : "REVISAR");
  } else {
    Serial.printf("Supabase HTTPS: fallo transporte/TLS: %s\n", esp_err_to_name(err));
  }
  esp_http_client_cleanup(cliente);
  return ok;
}

void leerYEnviar() {
  float pm1, pm25, pm4, pm10, humedad, temperatura, voc, nox;
  uint16_t error = sen55.readMeasuredValues(pm1, pm25, pm4, pm10,
                                             humedad, temperatura, voc, nox);
  if (error) {
    char descripcion[256];
    errorToString(error, descripcion, sizeof(descripcion));
    Serial.printf("SEN55: error de lectura: %s\n", descripcion);
    return;
  }
  const float campos[] = {pm1, pm25, pm4, pm10, temperatura, humedad, voc, nox};
  for (float valor : campos) {
    if (!isfinite(valor)) {
      Serial.println("SEN55: lectura incompleta; descartada");
      return;
    }
  }
  char fecha[36];
  if (!fechaColombia(fecha, sizeof(fecha))) {
    Serial.println("NTP: esperando hora real; no se envia la lectura");
    return;
  }
  char json[448];
  const int n = snprintf(json, sizeof(json),
    "{\"fecha_hora\":\"%s\",\"pm1\":%.2f,\"pm25\":%.2f,\"pm4\":%.2f,\"pm10\":%.2f,"
    "\"temperatura\":%.2f,\"humedad\":%.2f,\"voc_index\":%.2f,\"nox_index\":%.2f}",
    fecha, pm1, pm25, pm4, pm10, temperatura, humedad, voc, nox);
  if (n < 0 || n >= (int)sizeof(json)) {
    Serial.println("JSON: insuficiente memoria de salida");
    return;
  }
  // El mismo registro y la misma fecha se envian por ambos canales.
  if (mqtt.connected()) {
    const bool publicado = mqtt.publish(MQTT_TOPIC, json, false);
    Serial.printf("MQTT: %s\n", publicado ? "PUBLICADO" : "ERROR DE ENVIO");
  } else {
    Serial.println("MQTT: sin conexion; se intenta guardar por HTTPS igualmente");
  }
  guardarSupabase(json);
  Serial.printf("Lectura SEN55: %s | PM2.5=%.2f | PM10=%.2f\n", fecha, pm25, pm10);
}

void setup() {
  Serial.begin(115200);
  delay(900);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  sen55.begin(Wire);
  sen55Listo = configurarSensor();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  // Colombia UTC-5. La fecha se sincroniza una vez se establece Internet.
  configTime(-5L * 3600L, 0, "pool.ntp.org", "time.google.com");
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(768);
  mqtt.setSocketTimeout(3);
  ultimaLecturaMs = millis();
  Serial.println("AIRE.BGA MQTT + Supabase HTTPS iniciado");
}

void loop() {
  mantenerConexiones();
  if (!sen55Listo && millis() - ultimoSensorMs >= 10000UL) {
    ultimoSensorMs = millis();
    sen55Listo = configurarSensor();
  }
  if (millis() - ultimaLecturaMs >= INTERVALO_MS) {
    ultimaLecturaMs = millis();
    if (sen55Listo) leerYEnviar();
  }
  delay(10);
}
