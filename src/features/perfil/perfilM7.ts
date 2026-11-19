/** Forma real de M7 (`GET /usuarios/actual/perfil`): nombre visible + datos de contacto libres (JSON). */
export interface PerfilM7 {
  usuario_ref?: string;
  nombre_visible?: string | null;
  datos_contacto?: Record<string, unknown> | null;
}
interface CamposPerfil { nombre: string; apellido: string; telefono: string; pais_residencia: string }

const texto = (v: unknown) => (typeof v === "string" ? v : "");

/** M7 → formulario. Nombre y apellido viven en `datos_contacto`; si faltan se toman de `nombre_visible`. */
export function leerPerfil(d: PerfilM7): CamposPerfil & { contacto: Record<string, unknown> } {
  const contacto = d.datos_contacto ?? {};
  const [primero = "", ...resto] = (d.nombre_visible ?? "").trim().split(/\s+/);
  return {
    contacto,
    nombre: texto(contacto.nombre) || primero,
    apellido: texto(contacto.apellido) || resto.join(" "),
    telefono: texto(contacto.telefono),
    pais_residencia: texto(contacto.pais_residencia),
  };
}

/** Formulario → M7. Conserva las claves de contacto que el formulario no maneja. */
export function escribirPerfil(contacto: Record<string, unknown>, f: Partial<CamposPerfil>) {
  const nombre = (f.nombre ?? "").trim();
  const apellido = (f.apellido ?? "").trim();
  return {
    nombre_visible: [nombre, apellido].filter(Boolean).join(" "),
    datos_contacto: { ...contacto, nombre, apellido, telefono: (f.telefono ?? "").trim(), pais_residencia: (f.pais_residencia ?? "").trim() },
  };
}
