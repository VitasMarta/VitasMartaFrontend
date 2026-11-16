# GUÍA DETALLADA DE ARQUITECTURA, SISTEMA DE DISEÑO E IMPLEMENTACIÓN FRONTEND — VITASMARTA

**VITASMARTA · Plataforma Digital Integrada para la Gestión Sostenible del Turismo en Santa Marta**  
**Tipografía Oficial:** `Poppins` (Google Fonts)  
**Restricción Estricta de Interfaz:** **CERO CARDS (Prohibido el uso de tarjetas/cajas encapsuladas en todo el proyecto)**  
**Estándar de Accesibilidad:** WCAG 2.1 Nivel AA (`RNF-07`) · 100% Navegable por Teclado · LCP $\le 3\text{ s}$ en 4G (`RNF-03-3`)

---

## 1. Sistema de Diseño Visual y Regla Arquitectónica "Zero-Cards"

### 1.1. Paleta Oficial de Colores y Reglas de Contraste (WCAG 2.1 AA)

| Rol | Nombre | Hexadecimal | Variable CSS | Uso Exacto y Regla de Accesibilidad |
| :--- | :--- | :--- | :--- | :--- |
| **Primario (Principal)** | **Rosa Niebla** | `#f4e1de` | `--color-primary-mist` | Color de superficie principal, fondos de secciones editoriales, cabeceras amplias (`hero`), franjas alternas de listados y fondos de paneles laterales. **Regla WCAG:** Por ser un tono pastel luminoso, **siempre** debe llevar texto en **Azul Tinta (`#1d2b5c`)** encima (ratio de contraste $> 9.5:1$, nivel AAA). |
| **Secundario (Títulos y Estructura)** | **Azul Tinta** | `#1d2b5c` | `--color-secondary-ink` | Tipografía principal, títulos `H1`–`H4`, navegación superior, líneas divisorias finas (`1px solid rgba(29, 43, 92, 0.15)`), botones de acción primaria (con texto en `#f4e1de` o `#ffffff`) y pies de página. |
| **Terciario (Detalles Importantes)** | **Esmeralda** | `#00a060` | `--color-tertiary-emerald` | Indicadores de sostenibilidad óptima (`NOMINAL`), sellos de recomendación IA, estados confirmados, acentos interactivos, indicadores de foco de teclado (`outline: 2px solid #00a060`) y métricas positivas. **Regla WCAG:** Para texto pequeño sobre fondo claro o Rosa Niebla, acompañar siempre de ícono o usar peso `600/700` en tamaño $\ge 18\text{px}$, o usar como fondo de insignia con texto en `#1d2b5c` / blanco de alto contraste. |
| **Superficie Base** | Blanco Cálido | `#fdfbfa` | `--color-surface-base` | Fondo limpio para lectura densa (tablas de analítica, formularios extensos) que alterna con bloques en Rosa Niebla (`#f4e1de`). |
| **Semánticos Ambientales** | Ámbar / Coral | `#b45309` / `#b91c1c` | `--color-warn` / `--color-crit` | Exclusivos para los umbrales de capacidad de carga: Preventivo ($\ge 85\%$) y Crítico ($\ge 90\%$). |

### 1.2. Tipografía: Fuente `Poppins`

Toda la interfaz utiliza exclusivamente la familia **Poppins**:

* **`H1` (Títulos de Portal / Hero):** `Poppins`, peso `700` (Bold), `clamp(2rem, 4vw, 3.25rem)`, `line-height: 1.15`, `letter-spacing: -0.02em`, color `#1d2b5c`.
* **`H2` (Encabezados de Sección):** `Poppins`, peso `600` (SemiBold), `clamp(1.5rem, 2.5vw, 2.25rem)`, color `#1d2b5c`.
* **`H3` (Títulos de Atractivo en Listados):** `Poppins`, peso `600`, `1.25rem` (`20px`), color `#1d2b5c`.
* **Cuerpo de lectura (`Body`):** `Poppins`, peso `400` (Regular), `1rem` (`16px`), `line-height: 1.65`, color `#1d2b5c`.
* **Metadatos, Etiquetas y Cifras Tabulares:** `Poppins`, peso `500` (Medium), `0.875rem` (`14px`), `font-variant-numeric: tabular-nums` (para alinear precios en COP y porcentajes de ocupación).

### 1.3. Paradigma de Diseño "Zero-Cards" (¿Cómo maquetar sin usar Cards?)

Queda **estrictamente prohibido** el patrón de tarjeta (rectángulos con bordes redondeados, `box-shadow`, borde perimetral cerrado y fondo blanco flotante en cuadrículas de 3 columnas). En su lugar, VITASMARTA utiliza un **Diseño Editorial Fluido y Arquitectónico** basado en 5 patrones:

1. **Filas Editoriales Horizontales (*Editorial List Rows*) — Para el Catálogo (M2) y Recomendaciones IA (M6):**
   * Cada atractivo o recomendación es una **franja horizontal de ancho completo** separada únicamente por una línea divisoria inferior (`border-bottom: 1px solid rgba(29, 43, 92, 0.15)`).
   * A la izquierda: numeración tipográfica (`01`, `02`, `03`) en `Poppins 600` o miniatura panorámica sin marco flotante.
   * Al centro: Título en Azul Tinta (`#1d2b5c`), categorías separadas por puntos medios (`Playa · Ecoturismo`), y si viene de M6, la **explicación de la IA** en cursiva precedida por una barra vertical izquierda en Esmeralda (`border-left: 3px solid #00a060; padding-left: 12px`).
   * A la derecha: Precio en COP (`tabular-nums`), indicador lineal de sostenibilidad y enlace directo de acción (`Explorar destino →`).
   * Al pasar el cursor (`:hover`) o enfocar con teclado (`:focus-within`), toda la franja horizontal cambia suavemente su fondo a **Rosa Niebla (`#f4e1de`)**.

2. **Vista de Pantalla Dividida Asimétrica (*Split-Screen*) — Para la Ficha del Atractivo y Reserva (M2 + M3 + M8):**
   * En escritorio (`>= 1024px`), la pantalla se divide en dos lienzos continuos separados por una línea vertical fina (`1px`):
     * **Lienzo Izquierdo (60%):** Galería fotográfica continua a sangre (sin bordes redondeados), descripción bilingüe, atributos dinámicos JSONB renderizados como una **lista de definición tipográfica (`<dl>`)** de dos columnas separadas por líneas horizontales, y el bloque de **Buenas Prácticas Ambientales** (M8) integrado como un bloque de fondo Esmeralda suave (`rgba(0, 160, 96, 0.08)`) con borde izquierdo `#00a060` de `4px`.
     * **Lienzo Derecho Fijo (`sticky`, 40%, fondo Rosa Niebla `#f4e1de`):** Selector de franjas horarias (`GET /catalogo/{id}/franjas`), contador de cupos, casilla de aceptación de política de cancelación y botón en Azul Tinta (`#1d2b5c`) para iniciar el *soft lock* de reserva.

3. **Bandas de Métricas Continuas (*Metric Ribbons*) — Para Dashboards (M8 y M9):**
   * En lugar de "KPI Cards", las cifras clave (ej. *Reservas Confirmadas*, *Tasa de Ocupación*, *Ocupación Estimada Tayrona*) se disponen en una **banda horizontal continua** con fondo Rosa Niebla (`#f4e1de`), dividida por líneas verticales finas (`divide-x divide-[#1d2b5c]/15`).
   * Cada segmento muestra el número gigante en `Poppins 700` (`2.5rem`) en Azul Tinta (`#1d2b5c`) y la variación porcentual en Esmeralda (`#00a060`).

4. **Tablas Editoriales Limpias — Para Gestión de Prestadores (M4) y Administración (M1/M7/M8):**
   * Listados de reservas, usuarios, auditoría y alertas se presentan en tablas de ancho completo sin bordes exteriores, con cabeceras en mayúsculas pequeñas (`text-xs uppercase tracking-wider text-[#1d2b5c]/70`) sobre fondo `#f4e1de` y filas con `border-b border-[#1d2b5c]/10`.

5. **Paneles Deslizantes (*Slide-Over Drawers*) en lugar de Modales Flotantes:**
   * Para formularios rápidos (ej. reconocer alerta, cancelar reserva con motivo, editar franja), usar un panel lateral de alto completo (`100vh`) anclado a la derecha de la pantalla con fondo `#f4e1de` y borde izquierdo `#1d2b5c`.

---

## 2. Arquitectura Técnica del Proyecto Frontend

### 2.1. Stack Tecnológico Recomendado
* **Framework:** Next.js 15 (App Router) con TypeScript estricto.
* **Estilos:** Tailwind CSS configurado con las variables de la paleta oficial y la fuente `next/font/google` (`Poppins`).
* **Estado del Servidor y Caché HTTP:** TanStack Query (React Query v5) — fundamental para manejar la paginación por cursor de M2, el *polling* de exportaciones de M9 (`GET /exportaciones/{jobId}`) y la invalidación tras mutaciones.
* **Estado de Sesión y UI:** Zustand (ligero, para almacenar el usuario decodificado, el idioma activo `es-CO`/`en-US` y las notificaciones tipo *banner* superior).
* **Internacionalización (`RF-11`):** `next-intl` con detección automática de `Accept-Language`, selector manual persistente (sincronizado con `PUT /api/v1/identidad/usuarios/actual/preferencias`) y fallback automático a `es-CO`.
* **Gráficas sin Cards (M9):** Recharts o Visx renderizados directamente sobre el lienzo de la sección, usando trazos en `#1d2b5c` (Azul Tinta) y `#00a060` (Esmeralda).

### 2.2. Configuración Base de Tailwind y Variables CSS (`globals.css`)

```css
@import "tailwindcss";

:root {
  --color-primary-mist: #f4e1de;
  --color-secondary-ink: #1d2b5c;
  --color-tertiary-emerald: #00a060;
  --color-surface-base: #fdfbfa;
}

body {
  background-color: var(--color-surface-base);
  color: var(--color-secondary-ink);
  font-family: var(--font-poppins), sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Foco de teclado accesible (WCAG 2.1 AA - RNF-07-2) */
*:focus-visible {
  outline: 3px solid var(--color-tertiary-emerald);
  outline-offset: 2px;
}

/* Utilidad para prohibir sombras y bordes de tarjeta accidentalmente */
.editorial-row {
  border-bottom: 1px solid rgba(29, 43, 92, 0.15);
  transition: background-color 150ms ease;
}
.editorial-row:hover,
.editorial-row:focus-within {
  background-color: var(--color-primary-mist);
}
```

### 2.3. Estructura de Carpetas Sugerida (`src/`)

```text
src/
├── app/
│   ├── [locale]/                     # Soporte bilingüe es-CO / en-US (RF-11)
│   │   ├── (publico)/                # Canal IU-01: Turista y Catálogo Anónimo
│   │   │   ├── page.tsx              # Portada editorial + Buscador + Banda IA (M6)
│   │   │   ├── atractivo/[id]/       # Vista Split-Screen: Ficha M2 + Buenas Prácticas M8 + Franjas
│   │   │   └── login/ & registro/    # Autenticación M7 + Consentimientos granulares + MFA
│   │   ├── (turista)/                # Rutas protegidas rol TURISTA
│   │   │   ├── reservar/[id]/        # Flujo con Idempotency-Key y reloj de Soft Lock (10 min)
│   │   │   ├── mis-reservas/         # Historial (ACTIVAS, PASADAS, CANCELADAS) + Descarga PDF
│   │   │   └── mi-perfil/            # Intereses (M6), Preferencias, Consentimientos y Trámites ARCO
│   │   ├── (prestador)/              # Canal IU-02: Portal PYMES (rol PRESTADOR)
│   │   │   ├── onboarding/           # Autoregistro de prestador (M4)
│   │   │   ├── mi-oferta/            # Listados tabulares de Atractivos, Actividades, Eventos y Franjas
│   │   │   ├── reservas-recibidas/   # Confirmar, Rechazar, Cancelar con Idempotency-Key
│   │   │   ├── checkin-qr/           # Lector y validador de código QR (CU-27)
│   │   │   └── mis-indicadores/      # Series y métricas propias aisladas por tenant (M4 / M9)
│   │   └── (institucional)/          # Canales IU-03 e IU-04 (ADMINISTRADOR, ANALISTA, AUTORIDAD)
│   │       ├── admin/                # Usuarios y Matriz RBAC (M7), Moderación Editorial (M4), Umbrales (M8)
│   │       ├── monitoreo/            # Salud de servicios M1, Alertas M8, Estado Pipeline M9
│   │       ├── analitica/            # Rankings demanda, Tasa ocupación, Mapa de calor, Exportación PDF/CSV
│   │       └── sostenibilidad/       # Vista exclusiva Autoridad Ambiental (CU-28, solo lectura agregada)
├── core/
│   ├── api/
│   │   ├── gatewayClient.ts          # Cliente HTTP único hacia M1 con Correlation-Id y Refresh Token
│   │   ├── idempotency.ts            # Helper para pedir claves a M3 o generarlas para M4
│   │   └── errorNormalizer.ts        # Normaliza errores IC-02 (M1/M3/M7/M8/M9) y RFC 7807 (M4)
│   └── auth/
│       └── rbacGuard.ts              # Decodificador de claims (sub, rol, prestador_ref) y protección de rutas
└── shared/
    └── ui/                           # Componentes Zero-Cards: EditorialRow, SplitLayout, MetricRibbon, SlideOver
```

---

## 3. Implementación de los Mecanismos Arquitectónicos Críticos en el Frontend

### 3.1. Cliente HTTP Único hacia M1 (`gatewayClient.ts`)
El cliente HTTP debe cumplir 4 contratos simultáneamente:
1. Generar un `X-Correlation-Id` (`crypto.randomUUID()`) en cada petición (`RD-11`).
2. Enviar `Accept-Language` con el locale actual (`es-CO` o `en-US`).
3. Adjuntar `Authorization: Bearer <access_token>`. Si recibe `401 TOKEN_INVALIDO`, pausar las peticiones en vuelo, llamar una sola vez a `POST /api/v1/identidad/sesiones/refresco` y reintentar con el nuevo token.
4. Si recibe `503 SERVICIO_NO_DISPONIBLE` en un módulo secundario (como M6 Recomendaciones o M8 Buenas Prácticas), degradar silenciosamente esa sección de la pantalla sin romper la página principal (`CTR-M1-OUT-06`, regla 1).

### 3.2. Renderizador Dinámico de Atributos JSONB del Catálogo (`M2 §8.1`)
En la vista de detalle del atractivo (`GET /api/v1/catalogo/{id}`), cada atractivo trae claves distintas dentro de `atributos`:
* **Implementación:** Iterar sobre `Object.entries(ficha.atributos ?? {})` filtrando cualquier valor `null`, `undefined` o arreglo vacío.
* Renderizar una lista de descripción `<dl className="divide-y divide-[#1d2b5c]/15">` donde cada fila `<div className="py-3 flex justify-between">` muestra la clave formateada a la izquierda y el valor a la derecha. Si una propiedad no viene en el JSON, no existe en el DOM.

### 3.3. Sección de Recomendaciones con IA y Transparencia (`M6`)
En la portada del Portal del Turista:
* Se diseña como una **Banda Destacada de Ancho Completo** con fondo **Rosa Niebla (`#f4e1de`)** y borde superior e inferior de `2px solid #1d2b5c`.
* **Cabecera de Transparencia (`REG-03-1` y `REG-03-4`):** Incluye un sello en **Esmeralda (`#00a060`)** que dice *"Sugerencias generadas por Inteligencia Artificial para tu viaje"* junto a un enlace directo: *"Configurar o desactivar perfilado"*, que lleva al interruptor `PUT /api/v1/identidad/usuarios/actual/consentimientos/PERFILADO`.
* **Explicabilidad (`RF-07-3`) y Sostenibilidad (`RF-07-4`):** Cada ítem recomendado se muestra como una fila editorial numerada. Debajo del título se imprime el campo `explicacion` devuelto por Gemini/Fallback. Si `es_alternativa_sostenible == true`, se añade una etiqueta en línea color Esmeralda (`#00a060`): *"Alternativa sostenible con baja congestión hoy"*.

### 3.4. Flujo de Reserva con *Soft Lock* e Idempotencia (`M3`)
1. Cuando el turista selecciona la franja y hace clic en **"Reservar cupos"**, el frontend primero ejecuta `POST /api/v1/reservas/claves-idempotencia` con `{ operacion: "iniciar" }`.
2. Con la `clave_idempotencia` recibida, envía `POST /api/v1/reservas` incluyendo la cabecera `Idempotency-Key` y el objeto `aceptacion_politica` (`{ aceptada: true, politica_ref, version }`).
3. Si un corte de red en móvil obliga al usuario a volver a presionar el botón, el frontend **reutiliza la misma `clave_idempotencia`** para que M3 devuelva la reserva ya creada sin descontar cupos dobles (`CTR-M3-IN-01 §4.4`).
4. Si la reserva queda en estado pendiente (`vence_en != null`), mostrar una barra superior fija en color `#1d2b5c` con cuenta regresiva hacia `vence_en` e instrucciones de `siguiente_accion`.

### 3.5. Control de Versionado Optimista en el Portal de Prestadores (`M4`)
En todos los formularios del Portal de Prestadores (`PATCH /v1/atractivos/{id}`, `PATCH /v1/actividades/{id}`, `PATCH /v1/franjas/{id}`):
* El estado del formulario guarda el entero `version` recibido en el `GET`.
* Al guardar cambios, lo envía como `version_esperada: version`.
* Si el backend responde `409 Conflict` con `code: "version_conflict"`, mostrar una franja de aviso en la parte superior del formulario permitiendo recargar los datos más recientes sin perder el texto que el operador estaba redactando.

### 3.6. Gestor de Exportaciones Asíncronas (`M9`)
En los dashboards de Analítica (`CTR-M9-OUT-04`):
* Al hacer clic en **"Exportar PDF / CSV"**, se llama a `POST /api/v1/reportes/exportaciones`.
* Al recibir `202 Accepted` con el `job_id`, se muestra una barra de progreso en línea en la parte superior de la tabla (usando React Query con `refetchInterval: 2000` hacia `GET /api/v1/reportes/exportaciones/{jobId}`).
* Cuando `estado === "DISPONIBLE"`, el intervalo se detiene y la barra muestra un botón en **Esmeralda (`#00a060`)**: **"Descargar reporte listo"** que apunta a `url_descarga`.

---

## 4. Checklist de Accesibilidad (WCAG 2.1 AA — `RNF-07`) y Rendimiento (`RNF-03`)

1. **Navegación 100% por Teclado (`RNF-07-2`):**
   * Enlace `"Saltar al contenido principal"` (`Skip Link`) como primer elemento del DOM.
   * Todos los selectores de franjas horarias, filtros de catálogo y pestañas de dashboards deben usar elementos nativos (`<button>`, `<input>`, `<select>`) o roles ARIA completos con soporte de teclas `Tab`, `Enter`, `Space` y `Escape` (para cerrar paneles laterales).
2. **Semántica HTML sin Cards:**
   * Usar `<article>` o `<li>` dentro de `<ul role="list">` para cada fila editorial del catálogo.
   * Usar `<table>`, `<thead>`, `<th scope="col">` y `<tbody>` reales para los datos de M4, M7, M8 y M9.
3. **Optimización de LCP ($\le 3\text{ s}$ en 4G — `RNF-03-3`):**
   * Precargar la fuente `Poppins` con `display: 'swap'` y subconjunto `latin`.
   * La primera imagen del atractivo en la vista Split-Screen lleva `priority` (`fetchpriority="high"`); el resto de la galería de Cloudflare R2 lleva `loading="lazy"`.