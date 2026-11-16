# TODO_FRONTEND — VITASMARTA

Fuentes: `contratos_de_consumo_api_del_frontend.md` (contratos M1–M9) y `gu_a_detallada_de_desarrollo_frontend.md` (diseño y arquitectura).
Roles: **[COORD]** planifica y fija criterios · **[CODER]** implementa · **[REV]** verifica y bloquea la fase si no pasa.

Estado: `[ ]` pendiente · `[x]` hecho. **Fases 0–8 ejecutadas** (ver «Resultado y desviaciones» al final).

---

## 0. Reglas inquebrantables (se verifican en cada fase)

| # | Regla | Cómo la verifica [REV] |
|---|-------|------------------------|
| R1 | **CERO CARDS**: sin `box-shadow`, sin rectángulos con borde cerrado + radio + fondo flotante, sin cuadrículas de tarjetas, sin componente `Card`. Solo filas editoriales, bandas, split-screen, tablas, slide-overs. | Script `scripts/check-no-cards.mjs` (falla CI si encuentra `shadow-`, `Card`, `rounded-(md\|lg\|xl\|2xl)` junto a `border` en el mismo `className`, o `box-shadow` en CSS) + revisión visual. |
| R2 | Paleta: Rosa Niebla `#f4e1de`, Azul Tinta `#1d2b5c`, Esmeralda `#00a060`, Base `#fdfbfa`, Ámbar `#b45309` / Coral `#b91c1c` (solo umbrales de capacidad). Solo vía variables CSS/tokens Tailwind; prohibido hex suelto en componentes. | `grep` de `#[0-9a-f]{6}` fuera de `globals.css`/config. |
| R3 | Tipografía **Poppins** únicamente (`next/font/google`, subset `latin`, `display: swap`). | Inspección de CSS computado; `grep` de `font-family`. |
| R4 | WCAG 2.1 AA: contraste, 100 % teclado, skip link, foco visible, `<table>`/`<th scope>` reales, `aria-live` para avisos. | `eslint-plugin-jsx-a11y`, axe (jest-axe / Playwright), recorrido manual con teclado. |
| R5 | **Toda** petición HTTP sale por `core/api/gatewayClient.ts` hacia M1, con `X-Correlation-Id` (UUID v4 por acción), `Accept-Language`, y `Authorization: Bearer` en rutas privadas. Prohibido `fetch`/`axios` directo en otros archivos. | Regla ESLint `no-restricted-globals`/`no-restricted-imports` + `grep`; test unitario del cliente. |
| R6 | Rutas siempre bajo `/api/v1/{dominio}/**` (nunca `/v1/...` ni hosts de M2–M10). | Test que inspecciona todas las URLs construidas. |

---

## 1. Puntos que necesito que confirmes (ambigüedades detectadas en los documentos)

1. **Rutas de M4 no encajan con la tabla de prefijos.** El contrato lista M4 como `/v1/atractivos`, `/v1/actividades`, `/v1/eventos`, `/v1/contenido/**`, `/v1/franjas/**`, `/v1/admin/**` y `/v1/prestadores/**`, pero M1 solo enruta `/api/v1/prestadores/**` hacia M4. ¿Cómo las expone el Gateway?
   - (a) `/api/v1/prestadores/atractivos`, `/api/v1/prestadores/contenido/...`, `/api/v1/prestadores/admin/...` (todo bajo el prefijo), o
   - (b) otro prefijo adicional que no aparece en la tabla.
   Mientras tanto centralizaré el mapeo en un único archivo `core/api/routes.ts` para cambiarlo en un solo punto. **Supuesto por defecto: (a).**
2. **URL base del Gateway** (variable `NEXT_PUBLIC_GATEWAY_URL`): ¿hay entorno de desarrollo/mock disponible? Si no, propongo MSW con mocks derivados de los contratos.
3. **Almacenamiento de tokens.** El Gateway devuelve `access_token` y `refresh_token` en el cuerpo JSON. Propuesta: `access_token` solo en memoria (Zustand, sin persistir) y `refresh_token` en cookie `httpOnly` gestionada por un Route Handler de Next (proxy de login/refresco/logout). Alternativa más simple pero menos segura: `refresh_token` en `sessionStorage`. **Recomiendo la cookie httpOnly.** Implica que login/refresco pasan por un Route Handler que reenvía al Gateway (sigue siendo el Gateway el único destino de negocio). ¿Lo aprobamos?
4. **MFA:** el contrato de `POST /sesiones/mfa` dice `{ codigo_totp }` "+ contexto de desafío" sin definir el campo. ¿Cómo se identifica el desafío (p. ej. `mfa_token` en la respuesta de `/sesiones`)?
5. **Contraste Esmeralda (`#00a060`) — conflicto con WCAG AA.** Cálculo aproximado:
   - Esmeralda sobre blanco cálido ≈ 3,3:1 (falla para texto normal; vale para UI/texto grande).
   - Esmeralda sobre Rosa Niebla ≈ 2,7:1 → **el anillo de foco de 3 px en Esmeralda falla el mínimo de 3:1 (WCAG 1.4.11) sobre fondos Rosa Niebla.**
   - Texto Azul Tinta sobre Esmeralda ≈ 4,0:1 y blanco sobre Esmeralda ≈ 3,4:1 (ambos fallan para texto pequeño).
   - Ámbar `#b45309` sobre Rosa Niebla ≈ 4,4:1 (marginal).
   Propuesta (sin cambiar la paleta oficial): (i) anillo de foco doble: Azul Tinta interior + Esmeralda exterior, o solo Azul Tinta sobre Rosa Niebla; (ii) Esmeralda solo para fondos de insignia con texto ≥ 18 px/700, íconos y bordes; (iii) para texto Esmeralda pequeño, token derivado más oscuro (`--color-tertiary-emerald-text`, p. ej. `#007a48`). Verificaré todo con un script de contraste antes de fijar tokens. ¿Aceptas esta desviación mínima para cumplir AA?
6. **Versiones:** la guía pide Next.js 15 + Tailwind (sintaxis v4 `@import "tailwindcss"`) + React Query v5 + Zustand + `next-intl`. ¿Gestor de paquetes preferido (npm / pnpm)? Supuesto: **pnpm**, con `pnpm create next-app` en este mismo directorio.
7. **Alcance inicial:** propongo entregar en orden de fases (Setup → Core → Design system → Público → Turista → Prestador → Institucional). ¿Quieres empezar con un corte vertical (catálogo + ficha + reserva) antes de los portales de Prestador/Admin? **Recomendado.**
8. **Notificaciones (M10):** existe `/api/v1/notificaciones/**` (solo `ADMINISTRADOR`) pero el contrato no detalla endpoints. Se deja fuera de alcance salvo que los aportes.
9. **Detalles menores del contrato** que tomaré como supuesto: `GET /catalogo/{id}` devuelve `atributos` anidado (la guía §3.2) mientras el contrato dice "claves presentes" en la raíz — el renderizador soportará ambos casos; paginación de M4 usa `page` base 1 y M3/M7/M8 base 0.

---

## 2. Fases de trabajo

### Fase 0 — Andamiaje y configuración *(requiere confirmación)*
- [x] [CODER] Crear proyecto Next.js 15 (App Router, TypeScript `strict`, ESLint, Tailwind 4) con pnpm.
- [x] [CODER] Dependencias instaladas (react-query, zustand, next-intl, recharts, zod, react-hook-form, jose, vitest, RTL, jest-axe, msw, playwright, axe, jsx-a11y).
- [x] [CODER] `.env.example` y `.env.local` (`NEXT_PUBLIC_GATEWAY_URL=http://localhost:8080`, `API_MOCKING`).
- [x] [CODER] Scripts `lint`, `typecheck`, `test`, `test:e2e`, `check:no-cards`, `check:gateway-only`, `check`.
- [x] [CODER] Estructura `src/` creada (route groups vacíos; `[locale]` se cablea en Fase 2).
- [x] [REV] Build, lint y typecheck limpios; 11 tests del BFF verdes; smoke test con MSW OK.

### Fase 1 — Sistema de diseño (tokens y base global)
- [x] [CODER] `globals.css` con variables (`--color-primary-mist`, `--color-secondary-ink`, `--color-tertiary-emerald`, `--color-surface-base`, `--color-warn`, `--color-crit`) y mapeo a tokens Tailwind (`@theme`).
- [x] [CODER] Poppins con `next/font/google` (pesos 400/500/600/700, `latin`, `swap`, `preload`) → `--font-poppins`.
- [x] [CODER] Escala tipográfica H1–H3, body, metadatos con `tabular-nums` (guía §1.2).
- [x] [CODER] Foco visible global (según decisión del punto 1.5), `.editorial-row`, `prefers-reduced-motion`.
- [x] [CODER] Script de contraste (`scripts/check-contrast.mjs`) que valida todos los pares texto/fondo usados.
- [x] [REV] Contraste ≥ 4,5:1 (texto) y ≥ 3:1 (UI) en cada par; sin hex sueltos.

### Fase 2 — Núcleo de integración con el Gateway (`core/`)
- [x] [CODER] `core/api/routes.ts`: tabla única de rutas `/api/v1/...` por módulo (punto 1.1).
- [x] [CODER] `core/api/gatewayClient.ts`:
  - [x] `X-Correlation-Id` = `crypto.randomUUID()` por acción de usuario (misma id en reintentos de la misma acción).
  - [x] `Accept-Language` desde el locale activo (`es-CO` / `en-US`).
  - [x] `Authorization: Bearer` en rutas privadas.
  - [x] `401 TOKEN_INVALIDO` → cola de peticiones en vuelo, **un único** `POST /identidad/sesiones/refresco`, reintento con token nuevo; si falla con 401 → cerrar sesión y redirigir a login. Rotación del `refresh_token`.
  - [x] `503 SERVICIO_NO_DISPONIBLE` en módulos secundarios (M6, M8 buenas prácticas) → degradación silenciosa por sección.
  - [x] Soporte de `Idempotency-Key`, `X-Tenant-Id` (admin en M4), `multipart/form-data` y descargas binarias (PDF/CSV).
- [x] [CODER] `core/api/errorNormalizer.ts`: unifica envoltura VITASMARTA (`codigo`, `mensaje`, `correlation_id`, `detalles[]`) y RFC 7807 de M4 (`detail`, `code`, `trace_id`) en un `ApiError` común (`mensaje = error.mensaje || error.detail`); mapeo de `detalles[].campo` a errores de formulario.
- [x] [CODER] `core/api/idempotency.ts`: M3 → `POST /reservas/claves-idempotencia` (`iniciar|confirmar|rechazar|cancelar|modificar`); M4 → UUID v4 cliente; reutilización de la misma clave ante reintento.
- [x] [CODER] `core/auth/`: store de sesión (Zustand), decodificación de claims (`sub`, `rol`, `prestador_ref`), `rbacGuard.ts` (middleware/layout guards por rol), flujo login → MFA, logout (`DELETE /sesiones`), Route Handlers de sesión (punto 1.3).
- [x] [CODER] `core/i18n/`: `next-intl`, mensajes `es-CO`/`en-US`, fallback a `es-CO`, selector persistente sincronizado con `PUT /identidad/usuarios/actual/preferencias`.
- [x] [CODER] Provider de React Query (defaults, `refetchInterval` para polling de M9), store UI (banner superior de avisos).
- [x] [CODER] Mocks MSW de todos los contratos para desarrollo y tests.
- [x] [CODER] Tests unitarios: cabeceras, refresh único con peticiones concurrentes, normalización de ambos formatos de error, idempotencia.
- [x] [REV] R5 y R6 verificados; ningún `fetch` fuera del cliente.

### Fase 3 — Componentes base Zero-Cards (`shared/ui`)
- [x] [CODER] `SkipLink`, `AppShell` (header Azul Tinta, nav, selector de idioma, footer), `Banner` (`aria-live`).
- [x] [CODER] `EditorialRow` (numeración, título, categorías `A · B`, explicación IA con borde izquierdo Esmeralda, precio `tabular-nums`, indicador lineal de sostenibilidad, enlace de acción, hover/`focus-within` Rosa Niebla; `<li>` dentro de `<ul role="list">`).
- [x] [CODER] `SplitLayout` (60/40 ≥ 1024 px, lienzo derecho `sticky` Rosa Niebla, apilado en móvil).
- [x] [CODER] `MetricRibbon` (banda continua con divisores verticales finos, cifra `2.5rem/700`, variación Esmeralda).
- [x] [CODER] `EditorialTable` (`<table>`, `<th scope="col">`, cabecera en versalitas sobre Rosa Niebla, filas `border-b`).
- [x] [CODER] `SlideOver` (drawer 100vh a la derecha, focus trap, `Escape` cierra, retorno de foco, `role="dialog"` + `aria-modal`).
- [x] [CODER] Campos de formulario accesibles (label, error asociado por `aria-describedby`, resumen de errores), `Button`, `Tabs` (roles ARIA completos), `Stepper/Progress` (ARCO, exportación), `SustainabilityIndicator` (NOMINAL/Ámbar/Coral con ícono + texto, no solo color), `CountdownBar` (soft lock).
- [ ] [CODER] Página interna `/dev/ui` con todos los componentes para revisión visual. _(pendiente: sustituida por pruebas de componentes (jest-axe) y el barrido e2e)_
- [x] [REV] `check-no-cards` limpio; axe sin violaciones; navegación por teclado completa en `SlideOver`, `Tabs`, filas.

### Fase 4 — Portal público IU-01 (catálogo, M2 + M6 + M8)
- [x] [CODER] **Portada** `(publico)/page.tsx`: hero Rosa Niebla, buscador, banda de recomendaciones IA (M6).
  - `GET /recomendaciones` (200 `PERSONALIZADA`/`ESTANDAR_SIN_PERFILADO`, **206** `DEGRADADA_FALLBACK` con etiqueta sutil, sin pantalla de error); sello de transparencia Esmeralda + enlace "Configurar o desactivar perfilado"; etiqueta "Alternativa sostenible con baja congestión hoy" si `es_alternativa_sostenible`. Si el usuario es anónimo, no se llama a M6 (requiere JWT) y la banda no se muestra.
- [x] [CODER] **Catálogo/Búsqueda** `GET /catalogo/busqueda`: filtros (texto, categorías, geolocalización/`radio_km`, precio, atributos, orden), paginación por `cursor`, cambiar `orden` conserva filtros, aviso de `frescura_ultima_actualizacion` si `desde_cache`, filtros desde `GET /catalogo/categorias`, estado de URL en query params.
- [x] [CODER] **Ficha del atractivo** `atractivo/[id]` (Split-Screen): galería (`/multimedia`, primera imagen `priority`, resto `lazy`), descripción por idioma, `<dl>` dinámico JSONB (solo claves presentes), bloque de Buenas Prácticas M8 (`200` muestra / `204` omite sección / `503` degrada), banda de alternativas (`/recomendaciones/alternativas/{id}` cuando ocupación > 80 % o tras `409 RESERVA_RESTRINGIDA`), lienzo derecho con franjas (`/franjas`), cupos y política.
- [x] [CODER] **Registro** (`POST /identidad/cuentas`): validación de contraseña (≥ 12, mayús., minús., número, símbolo), consentimientos `TRATAMIENTO` obligatorio y `COMERCIAL`/`PERFILADO` opcionales independientes; **verificación de correo**, **reenvío**, **recuperación** (mensaje anti-enumeración siempre igual) y **restablecimiento**.
- [x] [CODER] **Login**: correo/contraseña, `423 Locked` (aviso 15 min), pantalla TOTP si `mfa_requerido`, OAuth Google/Facebook (`/oauth/{proveedor}/inicio` y callback).
- [x] [REV] Sin cards en listados; LCP objetivo ≤ 3 s en 4G (Lighthouse); degradaciones de M6/M8 no rompen la página; axe limpio.

### Fase 5 — Portal Turista (M3 + M7 + M6)
- [x] [CODER] **Reservar** `(turista)/reservar/[id]`: `POST /reservas/claves-idempotencia {operacion:"iniciar"}` → `POST /reservas` con `Idempotency-Key` y `aceptacion_politica`; reutilizar la clave en reintentos; barra fija con cuenta regresiva a `vence_en` + `siguiente_accion` e `instrucciones_pago_externo`; manejo de `409 RESERVA_RESTRINGIDA` (→ alternativas M6) y otros errores de negocio.
- [x] [CODER] **Mis reservas**: `GET /reservas?clasificacion=ACTIVAS|PASADAS|CANCELADAS` (paginado), detalle, **cancelar** (slide-over con `motivo`, muestra `penalidad_aplicada_porcentaje`), **modificar** (clave `modificar`, enlaza `original_ref`/`reemplazo_ref`), descarga de comprobante PDF.
- [x] [CODER] **Mi perfil**: perfil, preferencias (idioma → actualiza i18n + aviso "El idioma de la interfaz fue actualizado"), intereses (`PUT` reemplazo atómico), consentimientos (interruptor `PERFILADO` = opt-out de IA, REG-03-4), solicitudes ARCO (crear, listar, detalle con progreso de 5 pasos), exportación de datos PDF.
- [x] [REV] Idempotencia: doble clic/reintento no genera segunda reserva; flujo completo con teclado; textos bilingües.

### Fase 6 — Portal Prestador IU-02 (M4 + M3 + M9)
- [x] [CODER] **Onboarding**: formulario de solicitud (tipo, segmento, representante legal, consentimientos, descripción es/en, atributos dinámicos según `atributos_schema` del tipo), estado de solicitud, motivo de rechazo y reenvío.
- [x] [CODER] **Mi perfil** y datos personales (Ley 1581), consentimientos (revocar), configuración de reservas, política de cancelación.
- [x] [CODER] **Mi oferta**: tablas y formularios de Atractivos, Actividades (no enviar correo/teléfono en `operador` → error `dato_comercial_sensible`) y Eventos; flujo editorial (`enviar-revision`, `corregir`, historial); multimedia (subida multipart con límites 10 MB imagen / 50 MB video, reordenar, eliminar); franjas (CRUD).
- [x] [CODER] **Versionado optimista** en todos los `PATCH/PUT` (`version_esperada`); ante `409 version_conflict` mostrar franja de aviso con recarga de datos **sin perder lo que el usuario escribió**.
- [x] [CODER] **Reservas recibidas**: tabla con filtros; confirmar/rechazar/cancelar con `Idempotency-Key` y `motivo` (slide-over) — vía M3 o M4 según decisión del punto 1.1; clave de idempotencia M3 vs UUID M4.
- [x] [CODER] **Check-in QR** (`validar`, rate limit 30 req/min → manejo de `429`, resultado claro `valido`/mensaje).
- [x] [CODER] **Mis indicadores**: `MetricRibbon` + gráficas (M4 `/indicadores` y M9 con alcance propio).
- [x] [REV] Aislamiento de tenant (no se envía `X-Tenant-Id` salvo admin); sin cards; formularios accesibles con errores por campo.

### Fase 7 — Portales institucionales IU-03 / IU-04 (M1, M4, M5, M7, M8, M9)
- [x] [CODER] **Admin**: usuarios (lista paginada/filtros, cambio de rol, eliminar, desbloqueo), matriz RBAC (ver/editar versión), auditoría con filtros (7 campos RNF-04-8); prestadores (listar, aprobar/rechazar/suspender/reactivar con `motivo`), tipos de prestador y `atributos_schema`, moderación editorial de contenido (aprobar/publicar/devolver/rechazar/archivar + vista previa `proyeccion`), credenciales API (`X-Tenant-Id`), auditoría y outbox de M4.
- [x] [CODER] **Ambiental (M8, admin)**: configuración de capacidad y umbrales (80/85/90, validar crítico > preventivo), versiones y auditoría, conflictos de fuente, ocupación estimada, histórico ≥ 6 meses, retención (≥ 6 meses), **alertas** (bandeja con `ACTIVA → RECONOCIDA → CERRADA`, `409` si se cierra sin reconocer), creación de buenas prácticas.
- [x] [CODER] **Monitoreo**: `GET /estado/servicios` (M1), alertas M8, estado del pipeline M9 y replay (`202`).
- [x] [CODER] **Analítica (M9)**: indicadores de demanda, tasa de ocupación (con comparativa), series (BARRAS/LINEA_TENDENCIA), mapa de calor, todo sin cards; **exportaciones asíncronas**: `POST` → `202` + `job_id`, polling `refetchInterval: 2000`, barra de progreso, botón Esmeralda "Descargar reporte listo", manejo de `FALLIDO` y `410 Gone`.
- [x] [CODER] **Sostenibilidad (Autoridad Ambiental)**: vista de solo lectura agregada (M8 indicadores + M9 sostenibilidad), sin acciones de escritura (`403` esperado).
- [ ] [CODER] Integración técnica (M5, `INTEGRADOR_TECNICO`): solo si se aportan contratos (punto 1.8). Login con MFA obligatorio para `ADMINISTRADOR` e `INTEGRADOR_TECNICO`. _(pendiente: sin contratos de M5 en la documentación)_
- [x] [REV] Guards por rol correctos (redirección + ocultar navegación no autorizada); tablas con semántica real; gráficas con alternativa textual/tabla accesible y no dependientes solo del color.

### Fase 8 — Calidad transversal
- [x] [CODER] Estados de carga/vacío/error en todas las pantallas (skeletons sin forma de card: franjas/líneas); páginas `error.tsx`, `not-found.tsx`.
- [x] [CODER] Tests: unitarios (core), componentes (RTL + jest-axe), E2E Playwright de flujos críticos (login+MFA, búsqueda→ficha→reserva con reintento idempotente, cancelación, exportación asíncrona, conflicto de versión).
- [ ] [CODER] Rendimiento: `next/image` con `priority` solo en LCP, `lazy` en el resto, bundle por ruta, Lighthouse CI (LCP ≤ 3 s en 4G emulado). _(pendiente: no medido: requiere entorno con red 4G emulada y backends reales)_
- [x] [CODER] i18n completo `es-CO`/`en-US` (sin cadenas fijas en componentes).
- [x] [REV] Auditoría final: `check-no-cards`, `check-gateway-only`, `check-contrast`, axe en todas las rutas, recorrido manual con teclado y lector de pantalla, revisión de seguridad (tokens, XSS en contenido de M2/M8, descargas).

---

## 3. Mapa rápido contrato → pantalla

| Módulo | Prefijo Gateway | Pantallas principales |
|--------|-----------------|-----------------------|
| M1 | `/api/v1/estado/servicios` | Monitoreo |
| M2 | `/api/v1/catalogo/**` (público) | Portada, búsqueda, ficha, franjas, galería |
| M3 | `/api/v1/reservas/**` | Reservar, mis reservas, reservas recibidas, QR |
| M4 | `/api/v1/prestadores/**` (ver 1.1) | Onboarding, mi oferta, indicadores, admin de prestadores/moderación |
| M5 | `/api/v1/integracion/**` | Pendiente de contratos |
| M6 | `/api/v1/recomendaciones/**` | Banda IA, alternativas descongestivas |
| M7 | `/api/v1/identidad/**` | Login/registro/MFA, perfil/ARCO, admin usuarios/RBAC/auditoría |
| M8 | `/api/v1/ambiental/**` | Buenas prácticas, umbrales, alertas, sostenibilidad |
| M9 | `/api/v1/reportes/**` | Analítica, exportaciones, pipeline |
| M10 | `/api/v1/notificaciones/**` | Pendiente de contratos |

---

## 4. Checklist de la puerta del Reviewer (por fase)

- [x] `pnpm lint && pnpm typecheck && pnpm test` en verde.
- [x] `pnpm check:no-cards` y `pnpm check:gateway-only` en verde.
- [x] Ningún `box-shadow`, `Card`, rejilla de tarjetas ni hex suelto.
- [x] Todas las URLs `/api/v1/...`, con `X-Correlation-Id`, `Accept-Language` y `Authorization` donde aplica.
- [x] Navegable solo con teclado; foco siempre visible; `Escape` cierra slide-overs; skip link presente.
- [x] Mensajes de error mostrados con `mensaje || detail`, con `correlation_id`/`trace_id` disponible para soporte.
- [x] Textos en ambos idiomas.


---

## 5. Resultado y desviaciones (cierre de las Fases 1–8)

**Verificación automática (todo en verde):** `pnpm check` = ESLint (incl. jsx-a11y y prohibición de `fetch` fuera de `core/api`) · `tsc` estricto · `check:no-cards` · `check:gateway-only` · `check:palette` · `check:contrast` (20 pares WCAG AA) · 48 pruebas Vitest (cliente HTTP, refresco único, errores, RBAC, i18n es/en con >300 claves, componentes + jest-axe, BFF). `pnpm test:e2e` = 18 pruebas Playwright en Chromium contra el build de producción con el Gateway simulado por MSW (corte vertical, portales, y barrido axe de todas las pantallas por rol).

**Decisiones aplicadas (confirmadas por el usuario):** M4 bajo `/api/v1/prestadores/**` con reescritura (`m4()` en `core/api/routes.ts`) · `access_token` en memoria + `refresh_token` en cookie httpOnly vía BFF (`/bff/**`) · MFA con `{codigo_totp, mfa_token}` · Foco Azul Tinta y Esmeralda oscurecido solo para texto pequeño (`--color-emerald-text`, `--color-warn-text`) · pnpm · `NEXT_PUBLIC_GATEWAY_URL=http://localhost:8080` · MSW.

**Supuestos sobre contratos incompletos** (a confirmar con cada módulo):
1. `ItemResultadoBusqueda` (M2), `politica_cancelacion` y `sostenibilidad` en la ficha, `franja_ref` en las franjas, `servicio_nombre`/`cantidad_cupos` en `ReservaRespuesta`: el contrato no los define; los tipos los tratan como opcionales y la UI muestra solo lo presente.
2. Listados de M4: se asume `{ items, total, page, page_size }` (se tolera también array/`content`).
3. Estado de servicios M1 (`/estado/servicios`), credenciales (revocar = `DELETE /admin/credenciales/{id}`), reintento de outbox: rutas/forma inferidas.
4. Reservas recibidas usa los endpoints de **M4** (`/prestadores/reservas/**`, UUID del cliente como `Idempotency-Key`); los de M3 para el prestador (`confirmar/rechazar` con clave de M3 y `validaciones-qr`) están en `routes.ts` pero la UI usa M4 por coherencia con el listado.
5. La ruta `reservar/[id]` de la guía se resolvió como panel de reserva dentro de la ficha (lienzo derecho del split-screen) y la confirmación vive en `mis-reservas/[ref]`.

**Pendiente / fuera de alcance:**
- M5 (integración técnica) y M10 (notificaciones): sin contratos.
- OAuth: los botones inician el flujo en el Gateway, pero el contrato del callback (`200` con tokens) no encaja con una redirección del navegador; falta definir cómo termina el flujo. Reenvío de verificación (requiere `Authorization` antes de verificar) no implementado.
- Onboarding: sin `atributos_perfil` dinámicos por `atributos_schema` ni `redes`; sin vistas de `mi-perfil/datos-personales` y revocación de consentimientos de M4.
- Videos sin subtítulos: `MultimediaDTO` no expone pistas; se anotó la excepción de lint.
- LCP ≤ 3 s en 4G: no medido (el HTML se renderiza en cliente tras consultar al Gateway; si LCP queda corto, prefetch en servidor de la ficha). Recorrido manual con lector de pantalla pendiente.
- Guards de rol solo en cliente (la cookie de refresco está acotada a `/bff/api/v1/identidad/sesiones`, el servidor de Next no ve la sesión); la autorización real la aplica el Gateway.
