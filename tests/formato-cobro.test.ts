import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { leerConsolidadoTexto } from "@/lib/consolidado-texto";
import { consecutivoReenvio, generarDocx, leerFormato, revisarFormato, validar, type Extraccion } from "@/lib/cuenta-cobro";

const PLANTILLA = readFileSync(path.join(__dirname, "..", "plantilla", "cuenta_cobro_base.docx"));

// Datos ficticios.
const base = (): Extraccion => ({
  persona: { nombre: "Ana Prueba Ficticia", cedula: "1000000001" },
  mes: 10,
  anio: 2026,
  alertas: [],
  filas: [
    { dependencia: "Teatro", fecha: "02/10/2026", evento: "Concierto", hora_inicio: "14:00", hora_fin: "18:00", horas: 4, valor_hora: 10000, total: 40000, centro_costos: "29150002 - 202001", cuenta: "51119001", proyecto: "99999999" },
    { dependencia: "Derecho", fecha: "03/10/2026", evento: "Charla", hora_inicio: "08:00", hora_fin: "12:00", horas: 4, valor_hora: 10000, total: 40000, centro_costos: "31050001-201002", cuenta: "7208020401", proyecto: "99999999" },
  ],
});

describe("formato oficial de la cuenta de cobro", () => {
  it("lee el consecutivo y el período del formato", async () => {
    const f = await leerFormato(PLANTILLA);
    expect(f).toEqual({ consecutivo: "2026-10", mes: 10, anio: 2026 });
    expect(consecutivoReenvio(f)).toBe("2026-10A");
  });

  it("bloquea usar el formato de otro mes (consecutivo y período no se cambian)", async () => {
    const f = await leerFormato(PLANTILLA);
    expect(revisarFormato(f, 10, 2026)).toBeNull();
    expect(revisarFormato(f, 11, 2026)).toMatch(/formato es de Octubre 2026 y el consolidado es de Noviembre 2026/);
  });

  it("el reenvío cambia solo el consecutivo; fecha y período del formato quedan iguales", async () => {
    const f = await leerFormato(PLANTILLA);
    const out = await generarDocx(PLANTILLA, validar(base()), {
      nombre: "Ana Prueba Ficticia",
      cedula: "1000000001",
      celular: "3000000000",
      direccion: "Calle 1",
      ciudad: "Medellín - Antioquia",
      reenvio: { consecutivo: consecutivoReenvio(f)! },
    });
    const xml = await (await JSZip.loadAsync(out)).file("word/document.xml")!.async("string");
    const texto = (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("");
    expect(texto).toContain("N° 2026-10A");
    expect(texto).toContain("de Octubre del año 2026");
    expect(texto).toContain("Medellín, 21 de Noviembre de 2026");
    expect(texto).toContain("$80.000");
  });
});

describe("validación: errores claros en vez de caerse", () => {
  it("mes inválido, hora mal escrita y cédula con puntos dan error, no excepción", () => {
    expect(validar({ ...base(), mes: 0, anio: 0 }).errores.join(" ")).toMatch(/qué mes/);
    const mala = base();
    mala.filas[0].hora_inicio = "25:99";
    expect(validar(mala).ok).toBe(false);
    expect(validar({ ...base(), persona: { nombre: "Ana", cedula: "10.000.000" } }).errores.join(" ")).toMatch(/cédula/);
    expect(validar({ ...base(), persona: { nombre: " ", cedula: "1000000001" } }).errores.join(" ")).toMatch(/nombre/);
  });

  it("cruza la suma con la fila de TOTAL del Excel", () => {
    expect(validar({ ...base(), totales: { horas: 8, valor: 80000 } }).ok).toBe(true);
    const v = validar({ ...base(), totales: { horas: 9, valor: 90000 } });
    expect(v.errores.join(" ")).toMatch(/total del consolidado dice 9 h/);
    expect(v.errores.join(" ")).toMatch(/\$90\.000/);
  });

  it("el lector de celdas toma la fila de TOTAL solo si todas las filas son de la persona", () => {
    const cab = "NOMBRE\tCÉDULA\tFACULTAD/DEPENDENCIA\tFECHA\tEVENTO\tLABOR REALIZADA\tHORA INICIO\tHORA FINAL\tHORAS TOTALES TRABAJADAS\tVALOR HORA\tTOTAL A PAGAR POR EVENTO\tCENTRO DE COSTOS\tCUENTA\tPROYECTO";
    const fila = (n: string) => [n, "1000000001", "Teatro", "02/10/2026", "Concierto", "Logístico", "2:00 PM", "6:00 PM", "4", "$10,000", "$40,000", "29150002 - 202001", "51119001", "99999999"].join("\t");
    const total = "TOTAL\t\t\t\t\t\t\t\t4\t\t$40,000\t\t\t";
    expect(leerConsolidadoTexto([cab, fila("Ana Prueba"), total].join("\n"), "Ana Prueba")!.totales).toEqual({ horas: 4, valor: 40000 });
    expect(leerConsolidadoTexto([cab, fila("Ana Prueba"), fila("Otra Persona").replace("02/10", "03/10"), total].join("\n"), "Ana Prueba")!.totales).toBeUndefined();
  });
});
