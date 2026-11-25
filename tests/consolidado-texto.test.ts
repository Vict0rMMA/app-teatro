import { describe, expect, it } from "vitest";
import { hora24, leerConsolidadoTexto } from "@/lib/consolidado-texto";
import { validar } from "@/lib/cuenta-cobro";

// Datos ficticios con los formatos de hora que aparecen en los consolidados reales.
const CAB = "NOMBRE\tCÉDULA\tFACULTAD/DEPENDENCIA\tFECHA\tEVENTO\tLABOR REALIZADA\tHORA INICIO\tHORA FINAL\tHORAS TOTALES TRABAJADAS\tVALOR HORA\tTOTAL A PAGAR POR EVENTO\tCENTRO DE COSTOS\tCUENTA\tPROYECTO";
const fila = (nombre: string, fecha: string, evento: string, ini: string, fin: string, h: number, proyecto = "99999999", dep = "Teatro", cc = "29150002 - 202001") =>
  [nombre, "1000000001", dep, fecha, evento, "Logístico", ini, fin, String(h), "$10,000 ", `$${h * 10},000 `, cc, "51119001", proyecto].join("\t");

const ANA = "Ana Prueba Ficticia";
const TEXTO = [
  "OCTUBRE",
  CAB,
  fila(ANA, "02/10/2026", "CONCIERTO", "7:00AM", "1:00PM", 6),
  fila(ANA, "05/10/2026", "Reunión", "6:00 a.m", "12:00 p.m", 6, "99999999", "Derecho", "31050001-201002"),
  fila(ANA, "06/10/2026", "Filartechno", "4:30 p. m.", "10:30 p.m.", 6),
  fila(ANA, "16/10/2026", "Monólogos", "5.30PM", "10:30PM", 5),
  fila(ANA, "20/10/2026", "Padel", "4:30 PM", "6:30 PM", 2, "80230001"),
  fila(ANA, "13/10/2026", "Charla", "8:00 AM", "12:00 AM", 4),
].join("\n");

describe("hora24", () => {
  it("entiende los formatos del consolidado", () => {
    expect(hora24("7:00AM")).toBe("07:00");
    expect(hora24("12:00 p.m")).toBe("12:00");
    expect(hora24("12:00 AM")).toBe("00:00");
    expect(hora24("4:30 p. m.")).toBe("16:30");
    expect(hora24("5.30PM")).toBe("17:30");
    expect(hora24("8:00 a. m.")).toBe("08:00");
    expect(hora24("18:45")).toBe("18:45");
    expect(hora24("13:00 PM")).toBeNull();
  });
});

describe("leerConsolidadoTexto (sin IA)", () => {
  it("lee la tabla, corrige la hora ambigua y avisa el proyecto distinto", () => {
    const d = leerConsolidadoTexto(TEXTO, ANA)!;
    expect(d.filas).toHaveLength(6);
    expect(d.mes).toBe(10);
    expect(d.anio).toBe(2026);
    expect(d.persona).toEqual({ nombre: ANA, cedula: "1000000001" });
    // 8:00 AM–12:00 AM con 4 h → 08:00–12:00 y alerta
    const charla = d.filas.find((f) => f.evento === "Charla")!;
    expect([charla.hora_inicio, charla.hora_fin]).toEqual(["08:00", "12:00"]);
    expect(d.alertas.some((a) => a.tipo === "hora_ambigua")).toBe(true);
    expect(d.alertas.some((a) => a.tipo === "dato_inusual" && a.mensaje.includes("80230001"))).toBe(true);
    // Los códigos se copian tal cual
    expect(d.filas.find((f) => f.evento === "Reunión")!.centro_costos).toBe("31050001-201002");

    const v = validar(d);
    expect(v.errores).toEqual([]);
    expect(v.totalHoras).toBe(29);
    expect(v.totalValor).toBe(290000);
  });

  it("funciona sin cabecera y solo toma las filas de la persona", () => {
    const sinCab = TEXTO.split("\n").slice(2).join("\n") + "\n" + fila("Otra Persona", "07/10/2026", "X", "8:00 AM", "12:00 PM", 4).replace("1000000001", "2000000002");
    const d = leerConsolidadoTexto(sinCab, "ana ficticia")!;
    expect(d.filas).toHaveLength(6);
    expect(d.filas.every((f) => f.evento !== "X")).toBe(true);
  });

  it("si la persona no aparece y hay varias, no inventa filas", () => {
    const varias = TEXTO + "\n" + fila("Otra Persona", "07/10/2026", "X", "8:00 AM", "12:00 PM", 4);
    const d = leerConsolidadoTexto(varias, "Pedro Inexistente")!;
    expect(d.filas).toEqual([]);
    expect(d.alertas[0].tipo).toBe("persona_no_encontrada");
  });

  it("acepta eventos que terminan a medianoche o la cruzan", () => {
    const t = [CAB, fila(ANA, "10/10/2026", "Función noche", "6:30 PM", "12:00 AM", 5.5), fila(ANA, "11/10/2026", "Montaje", "10:00 PM", "1:00 AM", 3)].join("\n");
    const d = leerConsolidadoTexto(t, ANA)!;
    expect(d.filas.map((f) => `${f.hora_inicio}-${f.hora_fin}`)).toEqual(["18:30-00:00", "22:00-01:00"]);
    expect(validar(d).errores).toEqual([]);
  });

  it("devuelve null si lo pegado no es la tabla (entonces se usa Gemini)", () => {
    expect(leerConsolidadoTexto("hola, esto no es una tabla", ANA)).toBeNull();
    expect(leerConsolidadoTexto("a\tb\tc", ANA)).toBeNull();
  });
});
