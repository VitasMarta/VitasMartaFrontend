import { describe, expect, it } from "vitest";
import { escribirPerfil, leerPerfil } from "@/features/perfil/perfilM7";

describe("perfil M7 ↔ formulario", () => {
  it("lee nombre y apellido de datos_contacto", () => {
    const p = leerPerfil({ nombre_visible: "Ana Pérez", datos_contacto: { nombre: "Ana", apellido: "Pérez Gil", telefono: "300" } });
    expect(p).toMatchObject({ nombre: "Ana", apellido: "Pérez Gil", telefono: "300", pais_residencia: "" });
  });

  it("si no hay datos_contacto parte nombre_visible", () => {
    expect(leerPerfil({ nombre_visible: "Juan Carlos Ruiz", datos_contacto: null })).toMatchObject({ nombre: "Juan", apellido: "Carlos Ruiz" });
    expect(leerPerfil({})).toMatchObject({ nombre: "", apellido: "" });
  });

  it("escribe nombre_visible y conserva claves de contacto ajenas al formulario", () => {
    expect(escribirPerfil({ presupuesto: "medio" }, { nombre: " Ana ", apellido: "Pérez", telefono: "", pais_residencia: "CO" })).toEqual({
      nombre_visible: "Ana Pérez",
      datos_contacto: { presupuesto: "medio", nombre: "Ana", apellido: "Pérez", telefono: "", pais_residencia: "CO" },
    });
  });
});
