# DOCUMENTACIÓN DE CONSUMO DE API — FRONTEND VITASMARTA

**VITASMARTA · Plataforma Digital Integrada para la Gestión Sostenible del Turismo en Santa Marta**  
**Punto Único de Entrada:** Módulo M1 — API Gateway / BFF (`svc-gateway`)  
**Protocolo:** HTTPS (TLS 1.2+) · REST/JSON (`IC-01`, `IC-02`)

---

## 1. Reglas Globales de Comunicación (Frontend $\rightarrow$ M1 API Gateway)

Según `CONTRATOS_M1_API_GATEWAY.md`, ningún canal de usuario (IU-01 Turista, IU-02 Prestador, IU-03 Administración, IU-04 Monitoreo) conoce ni llama directamente a los contenedores internos de M2–M10. Todas las peticiones salen hacia el dominio del **API Gateway (M1)**.

### 1.1. Tabla Oficial de Prefijos en el Borde (`CTR-M1-OUT-01`)

*Nota de normalización de rutas:* Aunque los OpenAPI individuales de M2 (`openapi.json`) y M4 (`API.md`) documentan sus rutas locales como `/v1/...`, el API Gateway (M1) expone toda la plataforma bajo el prefijo unificado `/api/v1/{dominio}/**`. El cliente HTTP del frontend siempre debe apuntar a la tabla de enrutamiento de M1:

| Prefijo en el API Gateway (M1) | Microservicio Destino          | Política de Acceso en el Borde                                                           |
| :----------------------------- | :----------------------------- | :--------------------------------------------------------------------------------------- |
| `/api/v1/estado/servicios`     | **M1** (`svc-gateway`)         | Autenticada (`ADMINISTRADOR` — Panel IU-04)                                              |
| `/api/v1/catalogo/**`          | **M2** (`svc-catalogo`)        | **Pública (`GET`)** sin token (`RF-01-7`)                                                |
| `/api/v1/reservas/**`          | **M3** (`svc-reservas`)        | Autenticada (`TURISTA` / `PRESTADOR`)                                                    |
| `/api/v1/prestadores/**`       | **M4** (`svc-prestadores`)     | Autenticada con aislamiento de tenant (`prestador_ref` / `X-Tenant-Id`)                  |
| `/api/v1/integracion/**`       | **M5** (`svc-integracion`)     | Autenticada (`INTEGRADOR_TECNICO` / `ADMINISTRADOR`)                                     |
| `/api/v1/recomendaciones/**`   | **M6** (`svc-ia`)              | Autenticada (`TURISTA` — Puerto `IRecommendation`)                                       |
| `/api/v1/identidad/**`         | **M7** (`svc-identidad`)       | Mixta: Registro/Login/Recuperación/OAuth públicos; resto autenticado                     |
| `/api/v1/ambiental/**`         | **M8** (`svc-ambiental`)       | Mixta: `GET .../buenas-practicas` público; resto `ADMINISTRADOR` / `AUTORIDAD_AMBIENTAL` |
| `/api/v1/reportes/**`          | **M9** (`svc-reportes`)        | Autenticada (`ANALISTA_TURISTICO`, `ADMINISTRADOR`, `PRESTADOR`, `AUTORIDAD_AMBIENTAL`)  |
| `/api/v1/notificaciones/**`    | **M10** (`svc-notificaciones`) | Autenticada (`ADMINISTRADOR`)                                                            |

### 1.2. Cabeceras HTTP Obligatorias (Request Headers)

Todo interceptor HTTP del frontend debe inyectar:

| Cabecera | Cuándo enviarla | Regla del Contrato |
| :--- | :--- | :--- |
| `Authorization: Bearer <access_token>` | En toda ruta privada | JWT firmado con **ES256** emitido por M7 (`CTR-M7-OUT-05`). Contiene `sub` (UUID usuario), `rol` y `prestador_ref` (si es prestador). |
| `X-Correlation-Id` | En **todas** las peticiones | UUID v4 generado por el frontend por cada acción de usuario (`RD-11`, `CTR-M1-OUT-01`). Permite rastrear la traza completa extremo a extremo. |
| `Accept-Language` | En **todas** las peticiones | `es-CO` o `en-US` según el selector de idioma activo o detección del navegador (`RF-11`, `FR-121`). |
| `Idempotency-Key` | En mutaciones críticas (M3 y M4) | En M3 se obtiene primero llamando a `POST /api/v1/reservas/claves-idempotencia`. En M4 es un UUID v4 generado por el cliente. |
| `X-Tenant-Id` | Solo rol `ADMINISTRADOR` operando en M4 | UUID del prestador sobre el cual el administrador desea ejecutar una acción en nombre del tenant (`API.md` de M4). |

### 1.3. Contrato Unificado de Errores (`CTR-M1-OUT-06` y Apéndice A)

El frontend debe interceptar dos familias de errores:

1. **Envoltura Estándar VITASMARTA (M1, M3, M6, M7, M8, M9):**
   ```json
   {
     "codigo": "ACCESO_DENEGADO",
     "mensaje": "No tienes permiso para realizar esta acción",
     "marca_temporal": "2026-11-12T18:03:41Z",
     "correlation_id": "d8f2a4c6-1e3b-4f5a-9c7d-2b4e6f8a0d13",
     "detalles": [
       { "campo": "umbral_critico", "problema": "debe ser mayor que umbral_preventivo" }
     ]
   }
   ```
2. **Problem Details RFC 7807 (Exclusivo de M4 — Servicio Prestadores):**
   ```json
   {
     "type": "https://api.vitasmarta.co/errors/version-conflict",
     "title": "Conflicto de version",
     "status": 409,
     "detail": "La version esperada 3 no coincide con la version actual 4",
     "instance": "/v1/atractivos/6f1c2a9e",
     "code": "version_conflict",
     "trace_id": "6b0f3f9c4f7a4c1e"
   }
   ```
   *Regla para el Frontend:* El interceptor de errores debe leer `error.mensaje || error.detail` para mostrar el mensaje al usuario en pantalla.

---

## 2. Catálogo Completo de Endpoints por Módulo

### 2.1. Módulo M7 — Servicio Identidad (`/api/v1/identidad/**`)
*Fuente: `CONTRATOS_M7_SERVICIO_IDENTIDAD.md`*

#### A. Registro, Verificación y Recuperación (Públicos — `CTR-M7-OUT-01`)
| Método | Ruta (vía M1) | Body / Parámetros | Respuesta Exitosa | Reglas de Interfaz |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/identidad/cuentas` | `{ correo, password, tipo_usuario, consentimientos: [{finalidad, version_terminos, aceptado}] }` | `201 Created` | Validar en UI que `password` tenga $\ge 12$ caracteres, mayúscula, minúscula, número y símbolo (`RF-08-11`). Consentimientos `COMERCIAL` y `PERFILADO` son casillas opcionales independientes (`FR-707`). |
| `POST` | `/api/v1/identidad/cuentas/verificacion` | `{ token }` (del link de correo) | `200 OK` | Activa la cuenta y redirige a iniciar sesión. |
| `POST` | `/api/v1/identidad/cuentas/reenvio-verificacion` | Header `Authorization` | `200 OK` | Invalida el enlace anterior y envía uno nuevo. |
| `POST` | `/api/v1/identidad/password/recuperacion` | `{ correo }` | `202 Accepted` | **Anti-enumeración:** Siempre responde `202` con `"Si el correo está registrado, recibirás un enlace de recuperación"`. |
| `POST` | `/api/v1/identidad/password/restablecimiento` | `{ token, nueva_password }` | `200 OK` | Invalida todas las sesiones previas del usuario. |
| `GET` | `/api/v1/identidad/oauth/{proveedor}/inicio` | `proveedor` $\in$ `google \| facebook` | Redirección `302` | Inicia flujo OAuth 2.0 Authorization Code (`CTR-M7-IN-02`). |
| `GET` | `/api/v1/identidad/oauth/{proveedor}/callback` | Query: `?code=...&state=...` | `200 OK` (Tokens) | Crea o vincula la cuenta con correo ya certificado. |

#### B. Sesión, Login y MFA (`CTR-M7-OUT-02`)
| Método | Ruta (vía M1) | Body / Parámetros | Respuesta Exitosa | Reglas de Interfaz |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/identidad/sesiones` | `{ correo, password }` | `200 OK`: `{ access_token, refresh_token, expira_en }` **o** `{ mfa_requerido: true }` | Si devuelve `mfa_requerido: true` (roles `ADMINISTRADOR` e `INTEGRADOR_TECNICO`), mostrar pantalla de código TOTP. Si devuelve `423 Locked`, mostrar aviso de bloqueo por 15 min (5 intentos fallidos). |
| `POST` | `/api/v1/identidad/sesiones/mfa` | `{ codigo_totp }` (+ contexto de desafío) | `200 OK`: `{ access_token, refresh_token, expira_en }` | Completa el login de administradores e integradores. |
| `POST` | `/api/v1/identidad/sesiones/refresco` | `{ refresh_token }` | `200 OK`: Nuevo par `{ access_token, refresh_token }` | **Rotación obligatoria:** El `refresh_token` anterior queda invalidado. Si responde `401`, cerrar sesión en el frontend. |
| `DELETE` | `/api/v1/identidad/sesiones` | Header `Authorization` | `200 OK` | Cierra la sesión actual y revoca el `jti` del token. |

#### C. Perfil del Titular, Preferencias y Derechos ARCO (`CTR-M7-OUT-03`)
| Método | Ruta (vía M1) | Body / Parámetros | Respuesta Exitosa | Reglas de Interfaz |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/identidad/usuarios/actual/perfil` | — | `200 OK` (Datos del titular) | — |
| `PUT` | `/api/v1/identidad/usuarios/actual/perfil` | Campos del perfil | `200 OK` | — |
| `GET/PUT` | `/api/v1/identidad/usuarios/actual/preferencias` | `{ idioma_preferido, canal_autorizado, idioma_autorizado }` | `200 OK` | Al cambiar `idioma_preferido` (`es-CO` / `en-US`), actualizar el estado global de i18n y mostrar `"El idioma de la interfaz fue actualizado"`. |
| `PUT` | `/api/v1/identidad/usuarios/actual/intereses` | `{ intereses: ["naturaleza", "aventura", ...] }` | `200 OK` | Reemplazo atómico de la lista de intereses turísticos (alimenta a M6). |
| `GET` | `/api/v1/identidad/usuarios/actual/consentimientos` | — | `200 OK` | Lista historial y estado actual de `TRATAMIENTO`, `COMERCIAL`, `PERFILADO`. |
| `PUT` | `/api/v1/identidad/usuarios/actual/consentimientos/{finalidad}` | `{ otorgado: boolean }` | `200 OK` | Permite al turista apagar el perfilado de IA (`PERFILADO = false`) o correos comerciales en cualquier momento (`REG-03-4`). |
| `POST` | `/api/v1/identidad/usuarios/actual/solicitudes-arco` | `{ tipo: "ACCESO" \| "RECTIFICACION" \| "CANCELACION" \| "OPOSICION", detalle }` | `201 Created` | Registra trámite ARCO Ley 1581. |
| `GET` | `/api/v1/identidad/usuarios/actual/solicitudes-arco` | — (y `/{id}` para detalle) | `200 OK` | Muestra la barra de progreso de los 5 pasos del trámite ARCO. |
| `GET` | `/api/v1/identidad/usuarios/actual/exportacion-datos` | — | `200 OK` (Descarga PDF) | Exporta los datos personales del titular en PDF legible. |

#### D. Administración de Usuarios, Roles y Auditoría (`CTR-M7-OUT-04` — Rol `ADMINISTRADOR`)
| Método | Ruta (vía M1) | Body / Parámetros | Respuesta Exitosa |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/identidad/admin/usuarios` | Query: `?page=0&size=20` + filtros | `200 OK`: `{ content, page, size, totalElements }` |
| `PATCH` | `/api/v1/identidad/admin/usuarios/{usuarioId}/rol` | `{ rol: "ANALISTA_TURISTICO" \| ... }` | `200 OK` (`"El rol fue actualizado y el cambio quedó registrado en auditoría"`) |
| `DELETE` | `/api/v1/identidad/admin/usuarios/{usuarioId}` | — | `200 OK` (Elimina o seudonimiza si hay retención legal) |
| `POST` | `/api/v1/identidad/admin/usuarios/{usuarioId}/desbloqueo` | — | `200 OK` (Reinicia contador de fallos de login) |
| `GET/PUT` | `/api/v1/identidad/admin/matriz-autorizacion` | Body en `PUT`: Nueva versión de matriz RBAC | `200 OK` |
| `GET` | `/api/v1/identidad/admin/auditoria` | Query: `?usuario=...&recurso=...&accion=...&desde=...&hasta=...&page=0&size=20` | `200 OK` (Log inmutable con los 7 campos de `RNF-04-8`) |

---

### 2.2. Módulo M2 — Servicio Catálogo (`/api/v1/catalogo/**`)
*Fuente: `MODULO_M2_SERVICIO_CATALOGO.md` y `openapi.json` (Públicos en modo lectura)*

| Método | Ruta Expuesta | Parámetros (Query / Path) | Respuesta (`200 OK`) | Reglas de Renderizado en Frontend |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/catalogo/categorias` | — | `CategoriaDTO[]`: `[{ slug, nombre: {"es-CO": "...", "en-US": "..."}, primer_nivel: bool }]` | Poblar filtros de barra lateral y cabeceras de exploración. |
| `GET` | `/api/v1/catalogo/busqueda` | `texto` (str), `categorias` (str[]), `lat` (num), `lng` (num), `radio_km` (num), `precio_minimo` (num), `precio_maximo` (num), `atributos` (JSON string, ej. `{"sostenibilidad":0.8}`), `orden` (`relevancia \| nombre \| distancia \| precio \| popularidad \| sostenibilidad`), `descendente` (bool), `limite` (1..100, def 20), `cursor` (str) | `ResultadoBusqueda`: `{ items: ItemResultadoBusqueda[], total, cursor_siguiente, desde_cache, frescura_ultima_actualizacion }` | **1.** Paginación basada en cursor (`cursor_siguiente`).<br>**2.** Cambiar `orden` no debe borrar los filtros activos (`RF-01-6`).<br>**3.** Si `desde_cache == true` y la fuente está degradada, mostrar `frescura_ultima_actualizacion` (`RF-10-6`). |
| `GET` | `/api/v1/catalogo/{id}` | Path: `id` (str)<br>Query: `idioma` (def `es-CO`) | Objeto JSON dinámico con las claves presentes del atractivo/actividad/evento. | **Regla de oro JSONB (`§8.1`):** El frontend **solo renderiza las propiedades que existen en el JSON**. Si un atributo opcional no viene, no se dibuja la fila ni etiquetas vacías. |
| `GET` | `/api/v1/catalogo/{id}/franjas` | Path: `id` (str) | `RespuestaFranjas`: `{ id, franjas: [{ fecha, hora_inicio, hora_fin, cupo, estado }] }` | Mostrar selector de horarios antes de iniciar reserva. |
| `GET` | `/api/v1/catalogo/{id}/multimedia` | Path: `id` (str) | `MultimediaDTO[]`: `[{ tipo: "foto"\|"video", url_cdn, tam_bytes, orden }]` | Renderizar galería con `loading="lazy"` desde `url_cdn` (Cloudflare R2). |

---

### 2.3. Módulo M6 — Servicio IA / Recomendaciones (### 1. Endpoints expuestos por M6 hacia el Frontend (vía M1)

|**Método**|**Ruta en el Frontend (vía M1)**|**Ruta interna en tu FastAPI (M6)**|**Rol requerido**|**Propósito**|
|---|---|---|---|---|
|**`GET`**|`/api/v1/recomendaciones`|`/api/v1/recomendaciones`|`TURISTA` (JWT)|Obtiene la lista personalizada de atractivos con explicación (RF-07-1/3) o el fallback degradado (RF-07-8).|
|**`GET`**|`/api/v1/recomendaciones/alternativas/{atractivo_id}`|`/api/v1/recomendaciones/alternativas/{atractivo_id}`|`TURISTA` / Público|Sugiere destinos alternativos menos saturados cuando un atractivo supera el 80% de su capacidad de carga (RF-07-4, CU-13).|

### 2. Contrato de `GET /api/v1/recomendaciones`

#### A. Petición desde el Frontend (Request)

- **Cabeceras obligatorias:**
    
    - `Authorization: Bearer <access_token>` (El API Gateway lo valida en el borde y te lo reenvía íntegro para que extraigas el `sub` del turista).
        
    - `Accept-Language: es-CO` o `en-US` (Inyectado/negociado por M1 para que Gemini redacte la explicación en el idioma activo).
        
    - `X-Correlation-Id: <uuid>` (Generado por el frontend o por M1 para trazabilidad RD-11).
        
- **Query Params opcionales:**
    
    - `limite` (`integer`, default `5`, máx `10`): Cantidad de recomendaciones a retornar.
        
    - `categoria` (`string`, opcional): Por si el turista filtra recomendaciones en una categoría puntual (ej. `naturaleza`, `gastronomia`).
        
    - `lat` y `lng` (`number`, opcionales): Ubicación actual del turista para contextualizar cercanía.
        

#### B. Respuestas que el Frontend debe manejar (Responses)

Tu microservicio puede devolver **dos códigos de éxito distintos** según la máquina de estados del Laboratorio 02 (Figura 4.2):

Caso 1: `200 OK` — Recomendación generada por IA (o estándar si `perfilado_consentido = false`)

JSON

```
{
  "estado_respuesta": "PERSONALIZADA",
  "degradada": false,
  "aviso_transparencia_ia": "Estas recomendaciones fueron generadas por inteligencia artificial según tus preferencias y la ocupación actual de los destinos.",
  "marca_temporal": "2026-11-13T15:00:00Z",
  "correlation_id": "c7b3f2e1-4a55-4b1e-9f2a-1b2c3d4e5f60",
  "items": [
    {
      "atractivo_ref": "3f6b1c2e-8f1a-4c1e-9d2a-7b5e6f1a2c3d",
      "nombre": "Ciénaga Grande Viewpoint",
      "categorias": ["naturaleza", "ecoturismo"],
      "puntuacion": 0.94,
      "explicacion": "Seleccionado por tu interés en naturaleza y porque hoy presenta una ocupación baja (32%), ideal para una visita tranquila.",
      "sostenibilidad": {
        "ocupacion_estimada": 32.0,
        "nivel_saturacion": "NOMINAL",
        "es_alternativa_sostenible": true
      }
    }
  ]
}
```

Caso 2: `206 Partial Content` — Activación del `FallbackHandler` (Timeout de Gemini > 1200 ms, caída de M7/M8 o cold-start) El frontend **no muestra pantalla de error**; renderiza la lista normalmente pero muestra una etiqueta sutil indicando que son sugerencias generales:

JSON

```
{
  "estado_respuesta": "DEGRADADA_FALLBACK",
  "degradada": true,
  "motivo_degradacion": "TIMEOUT_MOTOR_IA",
  "aviso_transparencia_ia": "Mostrando los destinos destacados de Santa Marta con mejor disponibilidad ambiental en este momento.",
  "marca_temporal": "2026-11-13T15:00:01Z",
  "correlation_id": "c7b3f2e1-4a55-4b1e-9f2a-1b2c3d4e5f60",
  "items": [
    {
      "atractivo_ref": "atr-042",
      "nombre": "Quinta de San Pedro Alejandrino",
      "categorias": ["cultura"],
      "puntuacion": 0.85,
      "explicacion": "Uno de los atractivos culturales mejor valorados del catálogo con cupos disponibles hoy.",
      "sostenibilidad": {
        "ocupacion_estimada": 45.0,
        "nivel_saturacion": "NOMINAL",
        "es_alternativa_sostenible": false
      }
    }
  ]
}
```

### 3. Contrato de `GET /api/v1/recomendaciones/alternativas/{atractivo_id}` (CU-13 / RF-07-4)

Cuando un turista entra a ver la ficha de un atractivo (ej. Parque Tayrona) y está por encima del 80% de ocupación (nivel `RECOMENDACION`, `PREVENTIVO` o `CRITICO`), o cuando M3 bloquea una reserva por umbral crítico (`409 RESERVA_RESTRINGIDA`), el frontend llama a este endpoint para mostrar la **banda de destinos alternativos descongestivos**:

- **Respuesta `200 OK`:**
    

JSON

```
{
  "atractivo_saturado_ref": "3f6b1c2e-8f1a-4c1e-9d2a-7b5e6f1a2c3d",
  "ocupacion_actual_saturado": 86.4,
  "mensaje_ambiental": "Este destino supera el 80% de su capacidad hoy. Te sugerimos estas experiencias similares con menor congestión:",
  "alternativas": [
    {
      "atractivo_ref": "9a1f3c5e-7d2b-4e8a-b6c4-1f5d9a3e7c21",
      "nombre": "Cascadas de Marinka",
      "categorias": ["naturaleza", "aventura"],
      "ocupacion_estimada": 28.5,
      "explicacion": "Comparte la categoría de naturaleza y ecoturismo, pero cuenta con un 70% más de disponibilidad ambiental en este momento."
    }
  ]
}
```

### 4. Cómo se integra el Opt-Out del Perfilado (REG-03-4) en el Frontend

Para cumplir con el requisito regulatorio **REG-03-4** (_"El usuario podrá desactivar las recomendaciones personalizadas y optar por navegación sin perfilado"_), el frontend **no tiene que llamar a M6 para apagar la IA**. El flujo es:

1. El turista apaga el switch de "Permitir recomendaciones personalizadas con IA" en su vista de perfil.
    
2. El frontend hace `PUT /api/v1/identidad/usuarios/actual/consentimientos/PERFILADO` hacia **M7** con `otorgado: false`.
    
3. La próxima vez que el frontend llame a `GET /api/v1/recomendaciones`, tu servicio M6 consultará a M7 (`CTR-M7-OUT-06`), verá `"perfilado_consentido": false`, omitirá el llamado a Gemini y devolverá un `200 OK` con `"estado_respuesta": "ESTANDAR_SIN_PERFILADO"`.

### 2.4. Módulo M3 — Servicio Reservas (`/api/v1/reservas/**`)
*Fuente: `CONTRATOS_M3_SERVICIO_RESERVAS.md` y `m3-openapi.json`*

#### Flujo Crítico de Reserva (Requiere emisión previa de Clave de Idempotencia)
En M3, el frontend **no inventa** el `Idempotency-Key`; debe pedírselo a M3 antes de ejecutar la acción (`iniciar`, `confirmar`, `rechazar`, `cancelar`, `modificar`).

| Método | Ruta (vía M1) | Headers / Body | Respuesta Exitosa | Rol Requerido |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/reservas/claves-idempotencia` | Body: `{ operacion: "iniciar" \| "confirmar" \| "rechazar" \| "cancelar" \| "modificar", reserva_ref: string \| null }` | `201 Created`: `{ clave_idempotencia, operacion }` | `TURISTA`, `PRESTADOR` |
| `POST` | `/api/v1/reservas` | Header: `Idempotency-Key: <clave_idempotencia>`<br>Body (`CrearReservaEntrada`): `{ servicio_ref, franja_ref, cantidad_cupos, aceptacion_politica: { aceptada: true, politica_ref, version } }` | `201 Created` (`ReservaRespuesta`): `{ reserva_ref, codigo_confirmacion, estado, fecha_inicio, fecha_fin, vence_en, tarifa, politica, instrucciones_pago_externo, siguiente_accion, ... }` | `TURISTA` |
| `GET` | `/api/v1/reservas` | Query: `?page=0&size=20&clasificacion=ACTIVAS \| PASADAS \| CANCELADAS` | `200 OK` (`PaginaRespuesta`): `{ content: ReservaRespuesta[], total_elements, page, size }` | `TURISTA`, `PRESTADOR` |
| `GET` | `/api/v1/reservas/{reserva_ref}` | Path: `reserva_ref` | `200 OK` (`ReservaRespuesta`) | `TURISTA`, `PRESTADOR` |
| `POST` | `/api/v1/reservas/{reserva_ref}/modificar` | Header: `Idempotency-Key`<br>Body: `CrearReservaEntrada` | `200 OK` (`ReservaRespuesta` con `original_ref` y `reemplazo_ref`) | `TURISTA` |
| `POST` | `/api/v1/reservas/{reserva_ref}/cancelar` | Header: `Idempotency-Key`<br>Body: `{ motivo: string }` | `200 OK` (`ReservaRespuesta` con `penalidad_aplicada_porcentaje`) | `TURISTA`, `PRESTADOR` |
| `POST` | `/api/v1/reservas/{reserva_ref}/confirmar` | Header: `Idempotency-Key`<br>Body: `{ motivo: string }` | `200 OK` (`ReservaRespuesta`) | `PRESTADOR` |
| `POST` | `/api/v1/reservas/{reserva_ref}/rechazar` | Header: `Idempotency-Key`<br>Body: `{ motivo: string }` | `200 OK` (`ReservaRespuesta`) | `PRESTADOR` |
| `GET` | `/api/v1/reservas/{reserva_ref}/comprobante` | Path: `reserva_ref` | `200 OK` (`application/pdf` binario) | `TURISTA`, `PRESTADOR` |
| `POST` | `/api/v1/reservas/validaciones-qr` | Body: `{ token: string }` | `200 OK` (`ReservaRespuesta`) | `PRESTADOR` |

---

### 2.5. Módulo M4 — Servicio Prestadores (`/api/v1/prestadores/**`)
*Fuente: `API.md` (Servicio Prestadores M4). Nota: Todas las actualizaciones `PATCH`/`PUT` exigen **versionado optimista** enviando el entero `version_esperada`.*

#### A. Autoregistro y Perfil del Prestador (`TURISTA` en registro / `PRESTADOR` aprobado)
| Método | Ruta en M4 (Enrutada por M1) | Body / Parámetros | Respuesta |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/prestadores/solicitudes` | `{ tipo, segmento, razon_social, nombre_comercial, email, representante_legal: {nombre, documento, email, telefono}, consentimientos, nit, telefono, direccion_privada, descripcion: {es, en}, sitio_web, redes, atributos_perfil }` | `201 Created` (Estado `pendiente`) |
| `GET` | `/v1/prestadores/solicitudes/{prestador_id}` | Path: `prestador_id` (UUID) | `200 OK`: `{ prestador, historial }` (Muestra motivo si fue rechazado) |
| `POST` | `/v1/prestadores/solicitudes/{prestador_id}/reenviar` | Body con correcciones | `200 OK` |
| `GET/PATCH` | `/v1/prestadores/mi-perfil` | En `PATCH`: `{ version_esperada, nombre_comercial, descripcion, sitio_web, redes, atributos_perfil }` | `200 OK` |
| `GET/PATCH` | `/v1/prestadores/mi-perfil/datos-personales` | Exportación y rectificación Ley 1581 (`version_esperada` en `PATCH`) | `200 OK` |
| `GET/POST` | `/v1/prestadores/mi-perfil/consentimientos` | `GET` lista; `POST .../{finalidad}/revocar` revoca consentimiento no obligatorio | `200 OK` |

#### B. Gestión de la Oferta: Atractivos, Actividades, Eventos y Multimedia
| Método | Ruta en M4 | Body / Parámetros | Respuesta |
| :--- | :--- | :--- | :--- |
| `GET/POST` | `/v1/atractivos` | `GET`: `?estado=...&categoria=...&page=1&page_size=20`<br>`POST`: `{ nombre: {es, en}, descripcion: {es, en}, categorias, ubicacion: {lat, lng}, horarios, tarifas, condiciones_acceso, accesibilidad, sostenibilidad }` | `200` / `201` (Nace en `borrador`, `version: 1`) |
| `GET/PATCH` | `/v1/atractivos/{atractivo_id}` | En `PATCH`: `{ version_esperada, ...campos }` | `200 OK` (`409` si ya está publicado; requiere `/corregir`) |
| `GET/POST` | `/v1/actividades` | `GET`: `?estado=...&categoria=...&nivel_dificultad=baja\|media\|alta`<br>`POST`: `{ nombre: {es, en}, descripcion: {es, en}, categorias, ubicacion, duracion_minutos (1..1440), nivel_dificultad, equipamiento, operador: {nombre, descripcion, sitio_web}, precio: {monto, moneda:"COP"}, edad_minima, capacidad_maxima, incluye }` | `200` / `201` (**Regla:** No enviar correo/teléfono en `operador` o dará error `dato_comercial_sensible`) |
| `GET/PATCH` | `/v1/actividades/{actividad_id}` | En `PATCH`: `{ version_esperada, ...campos }` | `200 OK` |
| `GET/POST` | `/v1/eventos` | `GET`: `?estado=...&categoria=...&modalidad=...&solo_vigentes=true`<br>`POST`: `{ nombre: {es, en}, descripcion: {es, en}, categorias, ubicacion, fecha_inicio, fecha_fin, cupo_total, precio, requisitos, organizador: {nombre: {es, en}}, modalidad: "presencial"\|"virtual"\|"hibrido" }` | `200` / `201` |
| `GET/PATCH` | `/v1/eventos/{evento_id}` | En `PATCH`: `{ version_esperada, ...campos }` | `200 OK` |
| `POST` | `/v1/contenido/{contenido_id}/enviar-revision` | `{ motivo, version_esperada }` | `200 OK` (Pasa a `en_revision`) |
| `POST` | `/v1/contenido/{contenido_id}/corregir` | `{ motivo, version_esperada }` | `200 OK` (Permite editar un contenido ya publicado) |
| `GET` | `/v1/contenido/{contenido_id}/historial` | `?page=1&page_size=20` | `200 OK` (Historial de transiciones editoriales) |
| `GET/POST` | `/v1/contenido/{contenido_id}/multimedia` | En `POST` (`multipart/form-data`): `archivo` (JPEG/PNG/WebP $\le 10\text{MB}$, MP4 $\le 50\text{MB}$), `tipo` (`foto`\|`video`), `orden`, `version_esperada` | `200` / `201`: `{ id, tipo, url_cdn, tam_bytes, mime_type, orden }` |
| `PUT` | `/v1/contenido/{contenido_id}/multimedia/orden` | `{ items: [{id, orden}], version_esperada }` | `200 OK` |
| `DELETE` | `/v1/contenido/{contenido_id}/multimedia/{multimedia_id}` | Query: `?version_esperada=1` | `204 No Content` |

#### C. Disponibilidad, Políticas, Reservas Recibidas, Check-in QR e Indicadores Propios
| Método | Ruta en M4 | Body / Parámetros | Respuesta |
| :--- | :--- | :--- | :--- |
| `GET/POST` | `/v1/contenido/{contenido_id}/franjas` | `GET`: `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`<br>`POST`: `{ franjas: [{ fecha, hora_inicio, hora_fin, cupo_total, cupo_disponible, estado }] }` | `200` / `201` |
| `PATCH/DELETE`| `/v1/franjas/{franja_id}` | `PATCH`: `{ version_esperada, cupo_total, cupo_disponible, estado }` | `200` / `204` |
| `GET/PUT` | `/v1/prestadores/mi-perfil/configuracion-reservas` | `{ version_esperada, requiere_confirmacion_manual, tiempo_maximo_confirmacion_minutos (5..10080), instrucciones_pago, medios_pago }` | `200 OK` |
| `GET/PUT` | `/v1/prestadores/mi-perfil/politica-cancelacion` | `{ version_esperada, tipo, horas_limite_cancelacion, penalidad_porcentaje, descripcion, condiciones }` (También disponible por contenido en `/v1/contenido/{id}/politica-cancelacion`) | `200 OK` |
| `GET` | `/v1/prestadores/reservas` | `?estado=...&desde=...&hasta=...&page=1&page_size=20` (y `/{reserva_id}` para detalle) | `200 OK` |
| `POST` | `/v1/prestadores/reservas/{reserva_id}/{accion}` | `accion` $\in$ `confirmar \| rechazar \| cancelar`<br>Header obligatorio: `Idempotency-Key`<br>Body: `{ motivo }` | `200 OK` |
| `POST` | `/v1/prestadores/check-in/validar` | `{ codigo_qr: string }` (Rate limit: 30 req/min) | `200 OK`: `{ valido, reserva_id, estado, contenido_id, mensaje, validado_en }` |
| `GET` | `/v1/prestadores/indicadores` | `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&contenido_id=...` | `200 OK`: `{ tenant_id, desde, hasta, indicadores: {reservas_total, reservas_confirmadas, reservas_canceladas, ingresos_cop, ocupacion_promedio_porcentaje, contenidos_publicados}, series }` |

#### D. Administración de Prestadores y Moderación Editorial (Rol `ADMINISTRADOR`)
| Método | Ruta en M4 | Propósito |
| :--- | :--- | :--- |
| `GET` | `/v1/admin/prestadores` | Listar solicitudes y prestadores (`?estado=pendiente\|aprobado\|rechazado\|suspendido&tipo=...&texto=...`). Detalle en `/{prestador_id}`. |
| `POST` | `/v1/admin/prestadores/{prestador_id}/{accion}` | `accion` $\in$ `aprobar \| rechazar \| suspender \| reactivar` (Con `{ motivo }` en el body). |
| `GET/POST/PATCH`| `/v1/admin/tipos-prestador` | Gestionar catálogo dinámico de tipos de prestador y su `atributos_schema` (JSON Schema). |
| `POST` | `/v1/admin/contenido/{contenido_id}/{accion}` | Moderación editorial: `accion` $\in$ `aprobar \| publicar \| devolver \| rechazar \| archivar`. Vista previa en `GET .../proyeccion`. |
| `GET/POST` | `/v1/admin/credenciales` | Emitir y revocar API Keys (`X-Api-Key`) para integraciones de prestadores (requiere `X-Tenant-Id`). |
| `GET` | `/v1/admin/auditoria` y `/v1/admin/outbox` | Auditoría interna de M4 y monitoreo/reintento de eventos en el Outbox de M4. |

---

### 2.6. Módulo M8 — Servicio Ambiental (`/api/v1/ambiental/**`)
*Fuente: `CONTRATOS_M8_SERVICIO_AMBIENTAL.md`*

| Método     | Ruta (vía M1)                                                        | Rol Autorizado                         | Body / Parámetros                                                                                             | Respuesta y Semántica en Frontend                                                                                                                                                                                                                                           |
| :--------- | :------------------------------------------------------------------- | :------------------------------------- | :------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`      | `/api/v1/ambiental/atractivos/{atractivoId}/buenas-practicas`        | **Público** (Turista)                  | Path: `atractivoId`                                                                                           | **`200 OK`**: `{ atractivo_ref, contenido, fecha_publicacion }` $\rightarrow$ Mostrar bloque ambiental en la ficha del atractivo.<br>**`204 No Content`**: Body vacío $\rightarrow$ **Omitir completamente la sección en la interfaz** sin mostrar error (`CTR-M8-OUT-06`). |
| `POST`     | `/api/v1/ambiental/atractivos/{atractivoId}/buenas-practicas`        | `ADMINISTRADOR`                        | `{ contenido: string }`                                                                                       | `201 Created` (`400` si el atractivo en M2 no es natural).                                                                                                                                                                                                                  |
| `GET`      | `/api/v1/ambiental/atractivos/{atractivoId}/configuracion-capacidad` | `ADMINISTRADOR`, `AUTORIDAD_AMBIENTAL` | Path: `atractivoId`                                                                                           | `200 OK`: `{ capacidad_carga, umbral_recomendacion (80), umbral_preventivo (85), umbral_critico (90), fuente_criterio, vigencia_desde, vigencia_hasta, responsable, version, restriccion_reservas, criterio_vencido }`.                                                     |
| `POST/PUT` | `/api/v1/ambiental/atractivos/{atractivoId}/configuracion-capacidad` | Solo `ADMINISTRADOR`                   | Mismo esquema de configuración                                                                                | `201` / `200 OK` (Crea nueva versión inmutable; si `AUTORIDAD_AMBIENTAL` intenta escribir, recibe `403`).                                                                                                                                                                   |
| `GET`      | `.../configuracion-capacidad/versiones` y `/auditoria`               | `ADMINISTRADOR`                        | Path: `atractivoId`                                                                                           | `200 OK` (Historial de versiones y cambios campo a campo).                                                                                                                                                                                                                  |
| `POST`     | `/api/v1/ambiental/atractivos/{atractivoId}/conflictos-fuente`       | `ADMINISTRADOR`                        | `{ atractivo_ref, capacidad_externa, fuente_externa, decision: "INTERNA_PREVALECE" \| "DECISION_EXPLICITA" }` | `201 Created` (Resuelve discrepancias entre capacidad interna y fuentes como CORPAMAG).                                                                                                                                                                                     |
| `GET`      | `/api/v1/ambiental/alertas`                                          | `ADMINISTRADOR`                        | `?estado=ACTIVA \| RECONOCIDA \| CERRADA \| TODAS&page=0&size=20`                                             | `200 OK`: Bandeja de alertas del panel IU-04 (`PREVENTIVA` / `CRITICA`).                                                                                                                                                                                                    |
| `POST`     | `/api/v1/ambiental/alertas/{alertaId}/reconocimiento`                | `ADMINISTRADOR`                        | Sin body                                                                                                      | `200 OK` (Pasa de `ACTIVA` $\rightarrow$ `RECONOCIDA` asignando `usuario_responsable`).                                                                                                                                                                                     |
| `POST`     | `/api/v1/ambiental/alertas/{alertaId}/cierre`                        | `ADMINISTRADOR`                        | Sin body                                                                                                      | `200 OK` (Pasa de `RECONOCIDA` $\rightarrow$ `CERRADA`. Si estaba `ACTIVA`, devuelve `409`: debe reconocerse primero).                                                                                                                                                      |
| `GET`      | `/api/v1/ambiental/atractivos/{atractivoId}/ocupacion-estimada`      | `ADMINISTRADOR`                        | Path: `atractivoId`                                                                                           | `200 OK` (Diagnóstico de los 5 insumos de ocupación en ventana móvil).                                                                                                                                                                                                      |
| `GET`      | `/api/v1/ambiental/indicadores-agregados`                            | `ADMINISTRADOR`, `AUTORIDAD_AMBIENTAL` | `?periodo=YYYY-MM&atractivoId=...`                                                                            | `200 OK`: `{ periodo, indicadores: [{ atractivo_ref, ocupacion_estimada_consolidada: {promedio, maximo}, alertas_del_periodo: {preventivas, criticas}, distribucion_flujo_turistico: {"06-10": 0.18, ...}, nivel_agregacion }] }`.                                          |
| `GET`      | `/api/v1/ambiental/atractivos/{atractivoId}/historico`               | `ADMINISTRADOR`                        | `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`                                                                          | `200 OK` (Series históricas $\ge 6$ meses).                                                                                                                                                                                                                                 |
| `PUT`      | `/api/v1/ambiental/retencion`                                        | `ADMINISTRADOR`                        | `{ periodo_retencion_meses: int >= 6 }`                                                                       | `200 OK` (`400` si es menor a 6 meses).                                                                                                                                                                                                                                     |

---

### 2.7. Módulo M9 — Servicio Reportes (`/api/v1/reportes/**`)
*Fuente: `CONTRATOS_M9_SERVICIO_REPORTES.md`*

| Método | Ruta (vía M1) | Roles Autorizados | Query / Body | Respuesta y Reglas en Frontend |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/reportes/indicadores-demanda` | `ANALISTA_TURISTICO`, `ADMINISTRADOR`, `PRESTADOR` (solo propio) | `?periodo=2026-Q3&prestador=...&compararCon=2026-Q2&topN=10` | `200 OK`: `{ periodo, comparado_con, alcance, atractivos_mas_consultados: [{referencia, etiqueta, valor, variacion}], actividades_mas_reservadas, periodos_alta_demanda, moneda: "COP", zona_horaria_presentacion: "America/Bogota" }`. |
| `GET` | `/api/v1/reportes/tasa-ocupacion` | `ANALISTA_TURISTICO`, `ADMINISTRADOR`, `PRESTADOR` (solo propio) | `?prestador=uuid&periodo=2026-09&compararCon=2026-08` | `200 OK`: `{ prestador_ref, etiqueta_prestador, periodo, base_reservas_confirmadas_pasadas, tasa_ocupacion, comparativa: {periodo, tasa_ocupacion, variacion: "+5.6 puntos"} }`. |
| `GET` | `/api/v1/reportes/dashboard/series` | `ANALISTA_TURISTICO`, `ADMINISTRADOR`, `PRESTADOR` | `?indicador=atractivos_consultados \| actividades_reservadas \| tasa_ocupacion \| reservas_por_periodo&tipo=BARRAS \| LINEA_TENDENCIA&periodo=2026-Q3&topN=10` (o `desde`/`hasta` para `LINEA_TENDENCIA`) | `200 OK`: `{ tipo, indicador, periodo, moneda, puntos: [{etiqueta, valor}] o [{periodo, valor}], mensaje }`. |
| `GET` | `/api/v1/reportes/dashboard/mapa-calor` | `ANALISTA_TURISTICO`, `ADMINISTRADOR`, `PRESTADOR` | `?periodo=2026-Q3` | `200 OK`: `{ periodo, zona_horaria, celdas: [{atractivo_ref, etiqueta, subperiodo, intensidad (0..1)}] }`. |
| `GET` | `/api/v1/reportes/dashboard/sostenibilidad` | `AUTORIDAD_AMBIENTAL`, `ADMINISTRADOR` | `?periodo=2026-Q3` (y `/atractivos/{atractivoId}` para detalle) | `200 OK`: `{ periodo, zona_horaria, indicadores: [{atractivo_ref, etiqueta_atractivo, ocupacion_estimada_consolidada, alertas_del_periodo, distribucion_flujo_turistico, nivel_agregacion}] }`. |
| `POST` | `/api/v1/reportes/exportaciones` | `ANALISTA_TURISTICO`, `ADMINISTRADOR`, `PRESTADOR` | `{ formato: "PDF" \| "CSV", filtros: { periodo: "2026-Q3", indicadores: [...], prestador: null } }` | **`202 Accepted`**: `{ job_id, estado: "ENCOLADO", formato, fecha_solicitud }`. Inicia el flujo de exportación asíncrona. |
| `GET` | `/api/v1/reportes/exportaciones/{jobId}` | Solicitante dueño del job o `ADMINISTRADOR` | Path: `jobId` | **`200 OK` (Polling):** `{ job_id, estado: "ENCOLADO" \| "GENERANDO" \| "DISPONIBLE" \| "FALLIDO", url_descarga, fecha_expiracion }`. |
| `GET` | `/api/v1/reportes/exportaciones/{jobId}/descarga` | Solicitante dueño del job | Path: `jobId` | **`200 OK`:** Descarga binaria (`application/pdf` o `text/csv`). `410 Gone` si el archivo expiró (TTL 3 días). |
| `GET` | `/api/v1/reportes/admin/pipeline/estado` | `ADMINISTRADOR` | — | `200 OK`: Estado de las colas RabbitMQ de M9 (`lag_consume_segundos`, `mensajes_pendientes`, `ultimo_replay`). |
| `POST` | `/api/v1/reportes/admin/pipeline/replay` | `ADMINISTRADOR` | `{ origen: "TODOS" \| "RESERVAS" \| "AMBIENTAL" \| "OFERTA" \| "CATALOGO", desde, hasta }` | `202 Accepted`: `{ replay_id, estado: "EN_CURSO", eventos_estimados }`. |
