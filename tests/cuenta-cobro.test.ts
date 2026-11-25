import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { generarDocx, validar, type Extraccion, type Fila } from "@/lib/cuenta-cobro";
import { COLOR_DIA, comparar, estadoDia, mensajeDia, sanearRegistros, workLogsARegistros, type RegistroPersonal } from "@/lib/registros";

const PLANTILLA = readFileSync(path.join(__dirname, "..", "plantilla", "cuenta_cobro_base.docx"));

const fila = (p: Partial<Fila>): Fila => ({
  dependencia: "Teatro",
  fecha: "02/10/2026",
  evento: "Concierto de prueba",
  labor: "Logístico",
  hora_inicio: "14:00",
  hora_fin: "18:00",
  horas: 4,
  valor_hora: 10000,
  total: 40000,
  centro_costos: "29150002 - 202001",
  cuenta: "51119001",
  proyecto: "99999999",
  ...p,
});

// Datos ficticios.
const base = (): Extraccion => ({
  persona: { nombre: "Ana Prueba Ficticia", cedula: "1000000001" },
  mes: 10,
  anio: 2026,
  filas: [
    fila({}),
    fila({ fecha: "03/10/2026", hora_inicio: "08:00", hora_fin: "14:00", horas: 6, total: 60000 }),
    fila({ fecha: "03/10/2026", dependencia: "Derecho", evento: "Charla", centro_costos: "31050001 - 201002", cuenta: "7208020401", hora_inicio: "15:00", hora_fin: "17:00", horas: 2, total: 20000 }),
  ],
  alertas: [],
});

describe("validar (cuenta de cobro, sin IA)", () => {
  it("acepta un consolidado correcto y agrupa por centro de costos", () => {
    const v = validar(base());
    expect(v.errores).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.totalHoras).toBe(12);
    expect(v.totalValor).toBe(120000);
    expect(v.grupos).toHaveLength(2);
    expect(v.correo.asunto).toBe("Cuenta de cobro octubre");
  });

  it("detecta horas que no cuadran, totales mal, más de 8 h, cruces y fechas fuera del mes", () => {
    const d = base();
    d.filas[0].hora_fin = "19:00"; // 5 h, pero dice 4
    d.filas[1].total = 50000; // 6 × 10.000 ≠ 50.000
    d.filas.push(fila({ fecha: "03/10/2026", evento: "Cruce", hora_inicio: "13:00", hora_fin: "15:00", horas: 2, total: 20000 })); // 10 h y cruce
    d.filas.push(fila({ fecha: "01/11/2026", evento: "Noviembre" }));
    const e = validar(d).errores.join("\n");
    expect(e).toMatch(/da 5 h, pero dice 4 h/);
    expect(e).toMatch(/≠ 50000/);
    expect(e).toMatch(/03\/10\/2026: suma 10 h/);
    expect(e).toMatch(/se cruzan/);
    expect(e).toMatch(/no es de Octubre 2026/);
  });

  it("genera el .docx con todas las filas y subtotales", async () => {
    const v = validar(base());
    const out = await generarDocx(PLANTILLA, v, { nombre: "Ana Prueba Ficticia", cedula: "1000000001", celular: "3000000000", direccion: "Calle 1 # 2-3", ciudad: "Medellín - Antioquia" });
    const xml = await (await JSZip.loadAsync(out)).file("word/document.xml")!.async("string");
    expect(xml).toContain("Concierto de prueba");
    expect(xml).toContain("SUBTOTAL TEATRO");
    expect(xml).toContain("SUBTOTAL DERECHO");
    expect(xml).toContain("$120.000");
    expect(xml).not.toMatch(/w:color w:val="(EE0000|FF0000|C00000)"/);
    // Todas las líneas de la tabla quedan explícitas (el PDF de LibreOffice no inventa las que faltan).
    const tabla = xml.slice(xml.indexOf("<w:tbl>"), xml.indexOf("</w:tbl>"));
    expect(tabla).not.toMatch(/<w:(top|left|bottom|right) w:val="(nil|none)"\/>/);
  });
});

describe("registros personales (solo comparan)", () => {
  it("colores y avisos por día", () => {
    expect(estadoDia(7)).toBe("normal");
    expect(estadoDia(8)).toBe("limite");
    expect(estadoDia(9)).toBe("excedido");
    expect(COLOR_DIA.excedido).toContain("bg-danger");
    expect(mensajeDia(9)).toMatch(/^Ese día te pasaste de 8 h/);
    expect(mensajeDia(8)).toMatch(/máximo de 8 h/);
    expect(mensajeDia(5)).toBeNull();
  });

  it("un día con 9 h en el registro sale excedido y la cuenta sigue igual al consolidado", () => {
    const d = base();
    const antes = structuredClone(d);
    const vAntes = validar(d);
    const registros: RegistroPersonal[] = [
      { fecha: "02/10/2026", evento: "Concierto de prueba", hora_inicio: "09:00", hora_fin: "18:00", horas: 9 },
      { fecha: "03/10/2026", hora_inicio: "08:00", hora_fin: "16:00", horas: 8 },
      { fecha: "05/10/2026", hora_inicio: "08:00", hora_fin: "10:00", horas: 2 },
      { fecha: "05/11/2026", hora_inicio: "08:00", hora_fin: "10:00", horas: 2 }, // otro mes: se ignora
    ];
    const c = comparar(d.filas, registros, d.mes, d.anio);

    const dia2 = c.find((x) => x.fecha === "02/10/2026")!;
    expect(dia2).toMatchObject({ horas_consolidado: 4, horas_registro: 9, estado: "diferente", excedido_8h_en_registro: true });
    expect(dia2.mensaje).toMatch(/En la cuenta va lo del consolidado; tu registro queda como respaldo para reclamar/);
    expect(dia2.mensaje).toMatch(/te pasaste de 8 h/);
    expect(c.find((x) => x.fecha === "03/10/2026")!.estado).toBe("coincide");
    expect(c.find((x) => x.fecha === "05/10/2026")!.estado).toBe("solo_registro");
    expect(c.some((x) => x.fecha === "05/11/2026")).toBe(false);

    // Nada de la cuenta cambia.
    expect(d).toEqual(antes);
    expect(validar(d)).toEqual(vAntes);
  });

  it("adapta Mis horas (workLogs) y sanea lo que llega del cliente", () => {
    const r = workLogsARegistros([
      { fecha: "2026-10-02", evento: "Concierto", llegada: "14:00", salida: "18:00", horas: 4 },
      { fecha: "2026-10-03", evento: "", llegada: null, salida: null, horas: null },
    ]);
    expect(r).toEqual([{ fecha: "02/10/2026", evento: "Concierto", hora_inicio: "14:00", hora_fin: "18:00", horas: 4 }]);
    expect(sanearRegistros([{ fecha: "2026-10-02", horas: 4 }, { fecha: "02/10/2026", horas: 99 }, "x", ...r])).toEqual(r);
  });
});

// Caso real (datos personales: vive en samples/real/, que está en .gitignore).
const TSV = path.join(__dirname, "..", "samples", "real", "consolidado_octubre_victor.tsv");
describe.skipIf(!existsSync(TSV))("consolidado real de octubre", () => {
  const to24 = (s: string) => {
    const m = /^(\d{1,2})[:.](\d{2})\s*([ap])/i.exec(s.trim().toLowerCase())!;
    let h = Number(m[1]) % 12;
    if (m[3] === "p") h += 12;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  };
  const leer = (): Extraccion => {
    const lines = readFileSync(TSV, "utf8").split(/\r?\n/).slice(1).filter(Boolean);
    const filas = lines.map((l) => {
      const c = l.split("\t").map((x) => x.replace(/\s+/g, " ").trim());
      return { dependencia: c[2], fecha: c[3], evento: c[4], labor: c[5], hora_inicio: to24(c[6]), hora_fin: to24(c[7]), horas: +c[8], valor_hora: +c[9].replace(/\D/g, ""), total: +c[10].replace(/\D/g, ""), centro_costos: c[11], cuenta: c[12], proyecto: c[13] };
    });
    const c0 = lines[0].split("\t");
    return { persona: { nombre: c0[0].trim(), cedula: c0[1].trim() }, mes: 10, anio: 2026, filas, alertas: [] };
  };

  it("28 filas, 128 h, $1.280.000, 10 subtotales, sin errores", async () => {
    const d = leer();
    const v = validar(d);
    expect(v.errores).toEqual([]);
    expect(d.filas).toHaveLength(28);
    expect(v.totalHoras).toBe(128);
    expect(v.totalValor).toBe(1_280_000);
    expect(v.grupos).toHaveLength(10);
    expect(Math.max(...Object.values(v.horasPorDia))).toBeLessThanOrEqual(8);
    const out = await generarDocx(PLANTILLA, v, { nombre: d.persona.nombre, cedula: d.persona.cedula, celular: "3000000000", direccion: "Calle 1", ciudad: "Medellín - Antioquia" });
    expect(out.length).toBeGreaterThan(10_000);
  });

  it("con 9 h en un día del registro personal la cuenta sigue igual", () => {
    const d = leer();
    const v = validar(d);
    const c = comparar(d.filas, [{ fecha: "02/10/2026", hora_inicio: "07:00", hora_fin: "16:00", horas: 9 }], d.mes, d.anio);
    expect(c.find((x) => x.fecha === "02/10/2026")!.excedido_8h_en_registro).toBe(true);
    expect(validar(d)).toEqual(v);
    expect(v.totalValor).toBe(1_280_000);
  });
});
