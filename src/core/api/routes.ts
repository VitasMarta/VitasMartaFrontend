/**
 * Tabla ÚNICA de rutas del API Gateway (M1, CTR-M1-OUT-01). Todas cuelgan de /api/v1/{dominio}/**.
 * Cambiar el enrutamiento de un módulo es tocar solo este archivo.
 */
const V1 = "/api/v1";
const seg = (value: string) => encodeURIComponent(value);

/**
 * M4 documenta sus rutas internas como `/v1/...`. El Gateway las expone bajo `/api/v1/prestadores/**`
 * con reescritura transparente: se elimina `/v1` y, si la ruta interna ya empieza por `/prestadores/`,
 * se evita duplicar el segmento.
 *   /v1/atractivos             → /api/v1/prestadores/atractivos
 *   /v1/prestadores/mi-perfil  → /api/v1/prestadores/mi-perfil
 *   /v1/admin/prestadores      → /api/v1/prestadores/admin/prestadores
 */
export function m4(internal: string): string {
  let rest = internal.replace(/^\/v1/, "");
  rest = rest.replace(/^\/prestadores(?=\/|$)/, "");
  return `${V1}/prestadores${rest}`;
}

export const routes = {
  /** M1 · salud de servicios (panel IU-04, ADMINISTRADOR) */
  estadoServicios: `${V1}/estado/servicios`,

  /** M2 · Catálogo (público) */
  catalogo: {
    categorias: `${V1}/catalogo/categorias`,
    busqueda: `${V1}/catalogo/busqueda`,
    ficha: (id: string) => `${V1}/catalogo/${seg(id)}`,
    franjas: (id: string) => `${V1}/catalogo/${seg(id)}/franjas`,
    multimedia: (id: string) => `${V1}/catalogo/${seg(id)}/multimedia`,
  },

  /** M3 · Reservas */
  reservas: {
    base: `${V1}/reservas`,
    claves: `${V1}/reservas/claves-idempotencia`,
    detalle: (ref: string) => `${V1}/reservas/${seg(ref)}`,
    accion: (ref: string, accion: "modificar" | "cancelar" | "confirmar" | "rechazar") =>
      `${V1}/reservas/${seg(ref)}/${accion}`,
    comprobante: (ref: string) => `${V1}/reservas/${seg(ref)}/comprobante`,
    validacionesQr: `${V1}/reservas/validaciones-qr`,
  },

  /** M6 · Recomendaciones IA */
  recomendaciones: {
    base: `${V1}/recomendaciones`,
    alternativas: (atractivoId: string) => `${V1}/recomendaciones/alternativas/${seg(atractivoId)}`,
  },

  /** M7 · Identidad */
  identidad: {
    cuentas: `${V1}/identidad/cuentas`,
    verificacion: `${V1}/identidad/cuentas/verificacion`,
    reenvioVerificacion: `${V1}/identidad/cuentas/reenvio-verificacion`,
    recuperacion: `${V1}/identidad/password/recuperacion`,
    restablecimiento: `${V1}/identidad/password/restablecimiento`,
    oauthInicio: (proveedor: "google" | "facebook") => `${V1}/identidad/oauth/${proveedor}/inicio`,
    sesiones: `${V1}/identidad/sesiones`,
    sesionesMfa: `${V1}/identidad/sesiones/mfa`,
    perfil: `${V1}/identidad/usuarios/actual/perfil`,
    preferencias: `${V1}/identidad/usuarios/actual/preferencias`,
    intereses: `${V1}/identidad/usuarios/actual/intereses`,
    consentimientos: `${V1}/identidad/usuarios/actual/consentimientos`,
    consentimiento: (finalidad: string) => `${V1}/identidad/usuarios/actual/consentimientos/${seg(finalidad)}`,
    arco: `${V1}/identidad/usuarios/actual/solicitudes-arco`,
    arcoDetalle: (id: string) => `${V1}/identidad/usuarios/actual/solicitudes-arco/${seg(id)}`,
    exportacionDatos: `${V1}/identidad/usuarios/actual/exportacion-datos`,
    admin: {
      usuarios: `${V1}/identidad/admin/usuarios`,
      rol: (id: string) => `${V1}/identidad/admin/usuarios/${seg(id)}/rol`,
      usuario: (id: string) => `${V1}/identidad/admin/usuarios/${seg(id)}`,
      desbloqueo: (id: string) => `${V1}/identidad/admin/usuarios/${seg(id)}/desbloqueo`,
      matriz: `${V1}/identidad/admin/matriz-autorizacion`,
      auditoria: `${V1}/identidad/admin/auditoria`,
    },
  },

  /** M8 · Ambiental */
  ambiental: {
    buenasPracticas: (atractivoId: string) => `${V1}/ambiental/atractivos/${seg(atractivoId)}/buenas-practicas`,
    capacidad: (atractivoId: string) => `${V1}/ambiental/atractivos/${seg(atractivoId)}/configuracion-capacidad`,
    capacidadVersiones: (atractivoId: string) =>
      `${V1}/ambiental/atractivos/${seg(atractivoId)}/configuracion-capacidad/versiones`,
    capacidadAuditoria: (atractivoId: string) =>
      `${V1}/ambiental/atractivos/${seg(atractivoId)}/configuracion-capacidad/auditoria`,
    conflictos: (atractivoId: string) => `${V1}/ambiental/atractivos/${seg(atractivoId)}/conflictos-fuente`,
    ocupacion: (atractivoId: string) => `${V1}/ambiental/atractivos/${seg(atractivoId)}/ocupacion-estimada`,
    historico: (atractivoId: string) => `${V1}/ambiental/atractivos/${seg(atractivoId)}/historico`,
    alertas: `${V1}/ambiental/alertas`,
    alertaReconocimiento: (id: string) => `${V1}/ambiental/alertas/${seg(id)}/reconocimiento`,
    alertaCierre: (id: string) => `${V1}/ambiental/alertas/${seg(id)}/cierre`,
    indicadores: `${V1}/ambiental/indicadores-agregados`,
    retencion: `${V1}/ambiental/retencion`,
  },

  /** M9 · Reportes */
  reportes: {
    demanda: `${V1}/reportes/indicadores-demanda`,
    ocupacion: `${V1}/reportes/tasa-ocupacion`,
    series: `${V1}/reportes/dashboard/series`,
    mapaCalor: `${V1}/reportes/dashboard/mapa-calor`,
    sostenibilidad: `${V1}/reportes/dashboard/sostenibilidad`,
    sostenibilidadAtractivo: (id: string) => `${V1}/reportes/dashboard/sostenibilidad/atractivos/${seg(id)}`,
    exportaciones: `${V1}/reportes/exportaciones`,
    exportacion: (jobId: string) => `${V1}/reportes/exportaciones/${seg(jobId)}`,
    exportacionDescarga: (jobId: string) => `${V1}/reportes/exportaciones/${seg(jobId)}/descarga`,
    pipelineEstado: `${V1}/reportes/admin/pipeline/estado`,
    pipelineReplay: `${V1}/reportes/admin/pipeline/replay`,
  },

  /** M4 · Prestadores (ver `m4()`) */
  prestadores: {
    solicitudes: m4("/v1/prestadores/solicitudes"),
    solicitud: (id: string) => m4(`/v1/prestadores/solicitudes/${seg(id)}`),
    solicitudReenviar: (id: string) => m4(`/v1/prestadores/solicitudes/${seg(id)}/reenviar`),
    miPerfil: m4("/v1/prestadores/mi-perfil"),
    datosPersonales: m4("/v1/prestadores/mi-perfil/datos-personales"),
    consentimientos: m4("/v1/prestadores/mi-perfil/consentimientos"),
    revocarConsentimiento: (finalidad: string) =>
      m4(`/v1/prestadores/mi-perfil/consentimientos/${seg(finalidad)}/revocar`),
    configuracionReservas: m4("/v1/prestadores/mi-perfil/configuracion-reservas"),
    politicaCancelacion: m4("/v1/prestadores/mi-perfil/politica-cancelacion"),
    oferta: (tipo: "atractivos" | "actividades" | "eventos") => m4(`/v1/${tipo}`),
    ofertaItem: (tipo: "atractivos" | "actividades" | "eventos", id: string) => m4(`/v1/${tipo}/${seg(id)}`),
    contenido: (id: string, sub: string) => m4(`/v1/contenido/${seg(id)}/${sub}`),
    multimediaItem: (id: string, multimediaId: string) =>
      m4(`/v1/contenido/${seg(id)}/multimedia/${seg(multimediaId)}`),
    franja: (id: string) => m4(`/v1/franjas/${seg(id)}`),
    reservas: m4("/v1/prestadores/reservas"),
    reserva: (id: string) => m4(`/v1/prestadores/reservas/${seg(id)}`),
    reservaAccion: (id: string, accion: "confirmar" | "rechazar" | "cancelar") =>
      m4(`/v1/prestadores/reservas/${seg(id)}/${accion}`),
    checkIn: m4("/v1/prestadores/check-in/validar"),
    indicadores: m4("/v1/prestadores/indicadores"),
    admin: {
      prestadores: m4("/v1/admin/prestadores"),
      prestador: (id: string) => m4(`/v1/admin/prestadores/${seg(id)}`),
      prestadorAccion: (id: string, accion: string) => m4(`/v1/admin/prestadores/${seg(id)}/${accion}`),
      tipos: m4("/v1/admin/tipos-prestador"),
      tipo: (id: string) => m4(`/v1/admin/tipos-prestador/${seg(id)}`),
      contenidoAccion: (id: string, accion: string) => m4(`/v1/admin/contenido/${seg(id)}/${accion}`),
      contenidoProyeccion: (id: string) => m4(`/v1/admin/contenido/${seg(id)}/proyeccion`),
      credenciales: m4("/v1/admin/credenciales"),
      credencial: (id: string) => m4(`/v1/admin/credenciales/${seg(id)}`),
      auditoria: m4("/v1/admin/auditoria"),
      outbox: m4("/v1/admin/outbox"),
      outboxReintentar: (id: string) => m4(`/v1/admin/outbox/${seg(id)}/reintentar`),
    },
  },
} as const;
