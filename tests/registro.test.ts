import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRegistro, RegistroError, sanitizeRegistro } from "@/lib/registro";
import { parseHeader } from "@/lib/registro/build";

const fx = (n: string) => readFileSync(path.join(__dirname, "..", "samples", n));

describe.each([["registro-red-de-escuelas.docx"], ["registro-red-de-escuelas.pdf"]])("Red de Escuelas (%s)", (file) => {
  it("lee encabezado y tabla completa", async () => {
    const r = await parseRegistro(file, fx(file));
    expect(r.evento).toBe("RED DE ESCUELAS");
    expect(r.fecha).toBe("2026-11-18");
    expect(r.horaCitacion).toBe("18:00");
    expect(r.horaEvento).toBe("19:30");
    expect(r.warnings).toEqual([]);
    expect(r.staff).toHaveLength(23);
    expect(r.staff.map((s) => s.n)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));

    const [coord, ac, a] = r.staff;
    expect(coord).toMatchObject({
      nombre: "Laura Gómez Restrepo",
      cedula: "1347712782",
      telefono: "3003530829",
      llegada: "16:00",
      salida: "22:00",
      horas: 6,
      valor: 60000,
      cargo: "C",
      pp: "5",
      desempeno: "5",
    });
    expect(ac).toMatchObject({ nombre: "Andrés Felipe Ríos", cargo: "AC", horas: 5, valor: 50000 });
    expect(a).toMatchObject({ nombre: "Camila Zapata Mejía", ubi: "S", cargo: "A", llegada: "18:00" });
    expect(r.staff[16]).toMatchObject({ nombre: "Paula Andrea Cano", llegada: "17:00", horas: 5 });
  });

  it("no deja salir cédulas ni teléfonos", async () => {
    const r = sanitizeRegistro(await parseRegistro(file, fx(file)));
    const json = JSON.stringify(r);
    expect(json).not.toContain("1347712782");
    expect(json).not.toContain("3003530829");
    expect(r.staff[0]).not.toHaveProperty("cedula");
    expect(r.staff[0]).not.toHaveProperty("telefono");
  });
});

describe.each([["registro-congreso.docx"], ["registro-congreso.pdf"]])("Congreso sin horas (%s)", (file) => {
  it("lee fecha con formato 'DD MES DE AAAA' y filas vacías", async () => {
    const r = await parseRegistro(file, fx(file));
    expect(r.evento).toBe("X CONGRESO INTERNACIONAL DE COMUNICACIÓN ESTRATÉGICA D2");
    expect(r.fecha).toBe("2026-11-05");
    expect(r.horaCitacion).toBe("15:30");
    expect(r.horaEvento).toBe("17:00");
    expect(r.staff.length).toBeGreaterThan(15);
    expect(r.staff[0]).toMatchObject({ nombre: "Laura Gómez Restrepo", cargo: "C", llegada: null, horas: null });
    expect(r.staff[2]).toMatchObject({ nombre: "Camila Zapata Mejía", ubi: "B", cargo: "A" });
  });
});

describe("parseHeader", () => {
  it("tolera texto pegado y variantes", () => {
    const h = parseHeader(
      "NOMBRE DEL EVENTO: GRADOS – MAÑANA\nFECHA: 01 DE NOVIEMBRE 2026HORA CITACION: 8:30 AM   HORA EVENTO: 10:00 AM",
    );
    expect(h).toMatchObject({
      evento: "GRADOS – MAÑANA",
      fecha: "2026-11-01",
      horaCitacion: "08:30",
      horaEvento: "10:00",
    });
  });
});

describe("errores", () => {
  it("rechaza extensiones no soportadas", async () => {
    await expect(parseRegistro("foto.png", Buffer.from("x"))).rejects.toBeInstanceOf(RegistroError);
  });
  it("rechaza docx dañado", async () => {
    await expect(parseRegistro("a.docx", Buffer.from("no es un zip"))).rejects.toMatchObject({ code: "ARCHIVO_INVALIDO" });
  });
  it("rechaza pdf falso", async () => {
    await expect(parseRegistro("a.pdf", Buffer.from("hola"))).rejects.toMatchObject({ code: "ARCHIVO_INVALIDO" });
  });
  it("rechaza docx sin tabla de personal", async () => {
    await expect(parseRegistro("LLAVES.docx", readFileSync(path.join(__dirname, "..", "templates", "LLAVES.docx")))).rejects.toMatchObject({
      code: "SIN_TABLA",
    });
  });
});

describe("PDF de ejemplo con celdas partidas en dos líneas", () => {
  it("une cédulas partidas, ignora la fila de totales y lee la página 2", async () => {
    const raw = await parseRegistro("registro-ejemplo.pdf", fx("registro-ejemplo.pdf"));
    expect(raw).toMatchObject({ evento: "EVENTO DE EJEMPLO", fecha: "2026-11-18", horaCitacion: "18:00", horaEvento: "19:30" });
    expect(raw.staff).toHaveLength(23);
    expect(raw.staff[0]).toMatchObject({ nombre: "Coordinador Ejemplo", cedula: "1000000001", cargo: "C", horas: 6, valor: 60000, salida: "22:00" });
    expect(raw.staff[9]).toMatchObject({ n: 10, nombre: "Acomodador Ejemplo 10", ubi: "M", cedula: "1000000010" });
    expect(raw.staff[22]).toMatchObject({ n: 23, nombre: "Acomodador Ejemplo 23", ubi: "B", cargo: "A", valor: 40000 });
    expect(raw.staff.reduce((a, s) => a + (s.horas ?? 0), 0)).toBe(96);
  });
});
