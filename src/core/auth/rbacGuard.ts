/**
 * RBAC en el cliente: decide qué áreas de la UI se muestran. NO es una barrera de seguridad
 * (el Gateway y cada microservicio validan el rol en cada petición); solo evita mostrar pantallas
 * que el backend rechazaría con 403.
 */
export type Rol =
  | "TURISTA"
  | "PRESTADOR"
  | "ADMINISTRADOR"
  | "ANALISTA_TURISTICO"
  | "AUTORIDAD_AMBIENTAL"
  | "INTEGRADOR_TECNICO";

export type Area =
  | "turista"
  | "onboarding"
  | "prestador"
  | "admin"
  | "monitoreo"
  | "analitica"
  | "sostenibilidad";

export const AREA_ROLES: Record<Area, readonly Rol[]> = {
  turista: ["TURISTA"],
  onboarding: ["TURISTA", "PRESTADOR"],
  prestador: ["PRESTADOR"],
  admin: ["ADMINISTRADOR"],
  monitoreo: ["ADMINISTRADOR"],
  analitica: ["ANALISTA_TURISTICO", "ADMINISTRADOR"],
  sostenibilidad: ["AUTORIDAD_AMBIENTAL", "ADMINISTRADOR"],
};

export const canAccess = (rol: Rol | undefined | null, area: Area): boolean =>
  !!rol && AREA_ROLES[area].includes(rol);

/** Pantalla de inicio de cada rol tras iniciar sesión. */
export const ROL_HOME: Record<Rol, string> = {
  TURISTA: "/",
  PRESTADOR: "/mi-oferta",
  ADMINISTRADOR: "/admin",
  ANALISTA_TURISTICO: "/analitica",
  AUTORIDAD_AMBIENTAL: "/sostenibilidad",
  INTEGRADOR_TECNICO: "/",
};

/** Roles que deben completar MFA TOTP (CTR-M7-OUT-02). */
export const MFA_ROLES: readonly Rol[] = ["ADMINISTRADOR", "INTEGRADOR_TECNICO"];
