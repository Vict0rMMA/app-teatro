import { describe, expect, it } from "vitest";
import { cuentaAnterior, esAdminEmail, rutaInicial, sanearSecciones, seccionDeRuta, TODAS } from "@/lib/permisos";

describe("permisos por sección", () => {
  it("cada ruta pertenece a su sección", () => {
    expect(seccionDeRuta("/")).toBe("planillas");
    expect(seccionDeRuta("/planillas")).toBe("planillas");
    expect(seccionDeRuta("/planillas/abc123")).toBe("planillas");
    expect(seccionDeRuta("/horas")).toBe("horas");
    expect(seccionDeRuta("/cuenta-cobro")).toBe("cobro");
    expect(seccionDeRuta("/ajustes")).toBe("ajustes");
    expect(seccionDeRuta("/admin")).toBeNull();
    // No confundir rutas parecidas
    expect(seccionDeRuta("/horasextra")).toBeNull();
    expect(seccionDeRuta("/planillas-x")).toBeNull();
  });

  it("redirige a la primera sección habilitada", () => {
    expect(rutaInicial(TODAS)).toBe("/planillas");
    expect(rutaInicial(["cobro", "horas"])).toBe("/horas");
    expect(rutaInicial(["ajustes"])).toBe("/ajustes");
    expect(rutaInicial([])).toBeNull();
  });

  it("limpia lo que llega: solo secciones válidas, sin repetir, en orden", () => {
    expect(sanearSecciones(["cobro", "horas", "cobro", "admin", 3, null])).toEqual(["horas", "cobro"]);
    expect(sanearSecciones("planillas")).toEqual([]);
    expect(sanearSecciones(undefined)).toEqual([]);
  });

  it("cuentas anteriores a los permisos conservan acceso; las nuevas no", () => {
    expect(cuentaAnterior("Tue, 24 Nov 2026 20:00:00 GMT")).toBe(true);
    expect(cuentaAnterior("Thu, 26 Nov 2026 10:00:00 GMT")).toBe(false);
    expect(cuentaAnterior(undefined)).toBe(false);
    expect(cuentaAnterior("no es fecha")).toBe(false);
  });

  it("reconoce a la administradora sin importar mayúsculas", () => {
    expect(esAdminEmail("Admin@Ejemplo.com", "admin@ejemplo.com ")).toBe(true);
    expect(esAdminEmail("otra@ejemplo.com", "admin@ejemplo.com")).toBe(false);
    expect(esAdminEmail("admin@ejemplo.com", undefined)).toBe(false);
  });
});
