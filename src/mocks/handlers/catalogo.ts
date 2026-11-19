import { http, HttpResponse } from "msw";
import { CATALOGO, franjasDe, nivelDe, politicaDe } from "../data/catalogo";
import { claimsOf, errorBody, gw, isoDay, unauthorized } from "../shared";
import { consentimientoPerfilado } from "./identidad";

const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** M2 (público) · M6 (recomendaciones IA) · M8 (buenas prácticas, público). */
export const catalogoHandlers = [
  http.get(gw("/catalogo/categorias"), () =>
    HttpResponse.json([
      { slug: "naturaleza", nombre: { "es-CO": "Naturaleza", "en-US": "Nature" }, primer_nivel: true },
      { slug: "ecoturismo", nombre: { "es-CO": "Ecoturismo", "en-US": "Ecotourism" }, primer_nivel: false },
      { slug: "playa", nombre: { "es-CO": "Playa", "en-US": "Beach" }, primer_nivel: false },
      { slug: "cultura", nombre: { "es-CO": "Cultura", "en-US": "Culture" }, primer_nivel: true },
      { slug: "gastronomia", nombre: { "es-CO": "Gastronomía", "en-US": "Food" }, primer_nivel: true },
      { slug: "aventura", nombre: { "es-CO": "Aventura", "en-US": "Adventure" }, primer_nivel: true },
    ]),
  ),

  http.get(gw("/catalogo/busqueda"), ({ request }) => {
    const q = new URL(request.url).searchParams;
    const texto = norm(q.get("texto") ?? "");
    const categorias = q.getAll("categorias");
    const min = q.get("precio_minimo") ? Number(q.get("precio_minimo")) : null;
    const max = q.get("precio_maximo") ? Number(q.get("precio_maximo")) : null;
    const lat = q.get("lat") ? Number(q.get("lat")) : null;
    const lng = q.get("lng") ? Number(q.get("lng")) : null;
    const radio = q.get("radio_km") ? Number(q.get("radio_km")) : null;
    const orden = q.get("orden") ?? "relevancia";
    const desc = q.get("descendente") === "true";
    const limite = Math.min(100, Math.max(1, Number(q.get("limite") ?? 20)));
    const pagina = q.get("pagina") ? Math.max(1, Number(q.get("pagina"))) : null;
    const offset = pagina ? (pagina - 1) * limite : Number(q.get("cursor") ?? 0);

    let rows = CATALOGO.map((c) => ({
      c,
      distancia: lat != null && lng != null ? haversine(lat, lng, c.ubicacion.lat, c.ubicacion.lng) : null,
    }))
      .filter(({ c }) => !texto || norm(Object.values(c.nombre).join(" ") + " " + Object.values(c.descripcion).join(" ")).includes(texto))
      .filter(({ c }) => categorias.length === 0 || categorias.some((k) => c.categorias.includes(k)))
      .filter(({ c }) => (min == null || (c.precio ?? 0) >= min) && (max == null || (c.precio ?? 0) <= max))
      .filter(({ distancia }) => radio == null || distancia == null || distancia <= radio);

    const key = {
      nombre: ({ c }: (typeof rows)[number]) => c.nombre["es-CO"],
      distancia: ({ distancia }: (typeof rows)[number]) => distancia ?? 0,
      precio: ({ c }: (typeof rows)[number]) => c.precio ?? 0,
      popularidad: ({ c }: (typeof rows)[number]) => -c.popularidad,
      sostenibilidad: ({ c }: (typeof rows)[number]) => c.ocupacion,
      relevancia: ({ c }: (typeof rows)[number]) => -c.popularidad,
    }[orden as "nombre"] ?? (({ c }: (typeof rows)[number]) => -c.popularidad);
    rows = [...rows].sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0));
    if (desc) rows.reverse();

    const page = rows.slice(offset, offset + limite);
    const next = offset + limite < rows.length ? String(offset + limite) : null;
    return HttpResponse.json({
      items: page.map(({ c, distancia }) => ({
        id: c.id,
        tipo: c.tipo,
        nombre: c.nombre,
        descripcion_corta: Object.fromEntries(Object.entries(c.descripcion).map(([k, v]) => [k, v.split(". ")[0]])),
        categorias: c.categorias,
        precio: c.precio == null ? null : { monto: c.precio, moneda: "COP" },
        distancia_km: distancia == null ? null : Math.round(distancia * 10) / 10,
        imagen_url: c.imagen,
        sostenibilidad: { ocupacion_estimada: c.ocupacion, nivel_saturacion: nivelDe(c.ocupacion) },
      })),
      total: rows.length,
      cursor_siguiente: next,
      ...(pagina ? { pagina } : {}),
      desde_cache: q.get("texto") === "cache",
      frescura_ultima_actualizacion: q.get("texto") === "cache" ? new Date(Date.now() - 20 * 60_000).toISOString() : null,
    });
  }),

  http.get(gw("/catalogo/:id/franjas"), ({ params }) => {
    const c = CATALOGO.find((x) => x.id === params.id);
    return c ? HttpResponse.json(franjasDe(c.id)) : HttpResponse.json({ codigo: "NO_ENCONTRADO", mensaje: "No encontrado" }, { status: 404 });
  }),

  http.get(gw("/catalogo/:id/multimedia"), ({ params }) => {
    const c = CATALOGO.find((x) => x.id === params.id);
    if (!c) return HttpResponse.json({ codigo: "NO_ENCONTRADO", mensaje: "No encontrado" }, { status: 404 });
    return HttpResponse.json([
      { tipo: "foto", url_cdn: c.imagen, tam_bytes: 640_000, orden: 1 },
      { tipo: "foto", url_cdn: "/mock/gallery-a.svg", tam_bytes: 512_000, orden: 2 },
      { tipo: "foto", url_cdn: "/mock/gallery-b.svg", tam_bytes: 498_000, orden: 3 },
    ]);
  }),

  http.get(gw("/catalogo/:id"), ({ params, request }) => {
    const c = CATALOGO.find((x) => x.id === params.id);
    if (!c) return HttpResponse.json(errorBody(request, "NO_ENCONTRADO", "No encontramos este atractivo"), { status: 404 });
    return HttpResponse.json({
      id: c.id,
      tipo: c.tipo,
      nombre: c.nombre,
      descripcion: c.descripcion,
      categorias: c.categorias,
      ubicacion: c.ubicacion,
      precio: c.precio == null ? null : { monto: c.precio, moneda: "COP" },
      sostenibilidad: { ocupacion_estimada: c.ocupacion, nivel_saturacion: nivelDe(c.ocupacion) },
      politica_cancelacion: politicaDe(),
      atributos: c.atributos,
    });
  }),

  // ── M8 · Buenas prácticas ambientales (público): 200 con contenido o 204 sin contenido ──────────
  http.get(gw("/ambiental/atractivos/:id/buenas-practicas"), ({ params }) => {
    const c = CATALOGO.find((x) => x.id === params.id);
    if (!c?.natural) return new HttpResponse(null, { status: 204 });
    return HttpResponse.json({
      atractivo_ref: c.id,
      contenido:
        "No dejes residuos y lleva contigo lo que traigas. Mantente en los senderos señalizados, no alimentes a la fauna y evita protectores solares no biodegradables. Respeta los sitios sagrados de las comunidades indígenas.",
      fecha_publicacion: isoDay(-30),
    });
  }),

  // ── M6 · Recomendaciones IA (TURISTA, JWT) ───────────────────────────────────────────────────
  http.get(gw("/recomendaciones/alternativas/:id"), ({ params }) => {
    const c = CATALOGO.find((x) => x.id === params.id);
    const alternativas = CATALOGO.filter((x) => x.id !== params.id && x.ocupacion < 60 && x.categorias.some((k) => c?.categorias.includes(k))).slice(0, 3);
    return HttpResponse.json({
      atractivo_saturado_ref: params.id,
      ocupacion_actual_saturado: c?.ocupacion ?? 86.4,
      mensaje_ambiental: "Este destino supera el 80% de su capacidad hoy. Te sugerimos estas experiencias similares con menor congestión:",
      alternativas: alternativas.map((a) => ({
        atractivo_ref: a.id,
        nombre: a.nombre["es-CO"],
        categorias: a.categorias,
        ocupacion_estimada: a.ocupacion,
        explicacion: `Comparte la categoría ${a.categorias[0]}, pero cuenta con un ${Math.round(100 - a.ocupacion)}% de disponibilidad ambiental en este momento.`,
      })),
    });
  }),

  http.get(gw("/recomendaciones"), ({ request }) => {
    const claims = claimsOf(request);
    if (!claims) return unauthorized(request);
    const limite = Math.min(10, Number(new URL(request.url).searchParams.get("limite") ?? 5));
    const base = {
      marca_temporal: new Date().toISOString(),
      correlation_id: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    };
    const items = [...CATALOGO]
      .filter((c) => c.tipo !== "evento")
      .sort((a, b) => a.ocupacion - b.ocupacion)
      .slice(0, limite)
      .map((c, i) => ({
        atractivo_ref: c.id,
        nombre: c.nombre["es-CO"],
        categorias: c.categorias,
        puntuacion: Math.round((0.95 - i * 0.04) * 100) / 100,
        explicacion: `Seleccionado por tu interés en ${c.categorias[0]} y porque hoy presenta una ocupación baja (${Math.round(c.ocupacion)}%), ideal para una visita tranquila.`,
        sostenibilidad: { ocupacion_estimada: c.ocupacion, nivel_saturacion: nivelDe(c.ocupacion), es_alternativa_sostenible: c.ocupacion < 50 },
      }));

    if (!consentimientoPerfilado(claims.sub)) {
      return HttpResponse.json({
        estado_respuesta: "ESTANDAR_SIN_PERFILADO",
        degradada: false,
        aviso_transparencia_ia: "Mostrando los destinos destacados de Santa Marta. Activa el perfilado para recibir sugerencias personalizadas.",
        ...base,
        items,
      });
    }
    return HttpResponse.json({
      estado_respuesta: "PERSONALIZADA",
      degradada: false,
      aviso_transparencia_ia: "Estas recomendaciones fueron generadas por inteligencia artificial según tus preferencias y la ocupación actual de los destinos.",
      ...base,
      items,
    });
  }),
];
