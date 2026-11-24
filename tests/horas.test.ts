import { describe, expect, it } from "vitest";
import { duracionCampo, formatDuracion, formatHoras, parseDuracion } from "@/lib/format";
import { calcularRegistro } from "@/lib/registro/calculo";
import { buildRow } from "@/lib/registro/build";

describe("horas con minutos", () => {
  it("lee las formas habituales de escribir una duración", () => {
    expect(parseDuracion("5")).toBe(5);
    expect(parseDuracion("5:30")).toBe(5.5);
    expect(parseDuracion("5:45")).toBe(5.75);
    expect(parseDuracion("5h30")).toBe(5.5);
    expect(parseDuracion("5 h 30 min")).toBe(5.5);
    expect(parseDuracion("5,5")).toBe(5.5);
    expect(parseDuracion("30 min")).toBe(0.5);
    expect(parseDuracion("")).toBeNull();
    expect(parseDuracion("5:75")).toBeNull();
    expect(parseDuracion("hola")).toBeNull();
  });

  it("nunca muestra decimales", () => {
    expect(formatDuracion(5)).toBe("5 h");
    expect(formatDuracion(5.5)).toBe("5 h 30 min");
    expect(formatDuracion(0.25)).toBe("15 min");
    expect(formatDuracion(96.5)).toBe("96 h 30 min");
    expect(duracionCampo(5.5)).toBe("5:30");
    expect(duracionCampo(6)).toBe("6");
    // En los documentos de Word
    expect(formatHoras(5.5)).toBe("5:30");
    expect(formatHoras(96)).toBe("96");
    for (const s of [formatDuracion(5.5), duracionCampo(5.5), formatHoras(5.5)]) expect(s).not.toMatch(/[.,]\d/);
  });

  it("calcula llegada al minuto y valor proporcional", () => {
    const r = calcularRegistro([{ nombre: "a", horas: 5.5 }], { salida: "22:00", horaCitacion: "16:30" });
    expect(r.filas[0]).toMatchObject({ llegada: "16:30", salida: "22:00", valor: 55000 });
    expect(r.totalHoras).toBe(5.5);
  });

  it("lee 5:30 en la columna TOTAL HORAS del registro", () => {
    const row = buildRow({ n: "1", nombre: "Ana", horas: "5:30", cargo: "A" }, 1)!;
    expect(row.horas).toBe(5.5);
  });
});
