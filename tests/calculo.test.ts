import { describe, expect, it } from "vitest";
import { calcularRegistro, horasPorCargo, prepararPersonal } from "@/lib/registro/calculo";

const leido = (cargo: "C" | "AC" | "A", extra: object = {}) => ({
  nombre: "x",
  cargo,
  llegada: null as string | null,
  salida: null as string | null,
  horas: null as number | null,
  pp: "",
  desempeno: "",
  ...extra,
});

describe("prepararPersonal", () => {
  it("sin horas: base 4 → A 4, AC 5, C 6 y salida = citación + base", () => {
    const r = prepararPersonal([leido("C"), leido("AC"), leido("A"), leido("A"), leido("A")], "18:30");
    expect(r.base).toBe(4);
    expect(r.rows.map((x) => x.horas)).toEqual([6, 5, 4, 4, 4]);
    expect(r.rows.every((x) => x.auto && x.pp === "5" && x.desempeno === "5")).toBe(true);
    expect(r.salida).toBe("22:30");
    expect(r.supuestos).toEqual(["5 personas no traían horas: base 4 h, AC +1 h y C +2 h."]);
  });

  it("la base sale de las horas de los acomodadores del archivo: base 6 → AC 7, C 8", () => {
    const r = prepararPersonal([leido("C"), leido("AC"), leido("A", { horas: 6 }), leido("A", { horas: 6 }), leido("A", { horas: 5 })], "17:00");
    expect(r.base).toBe(6);
    expect(r.rows.map((x) => x.horas)).toEqual([8, 7, 6, 6, 5]);
    expect(r.rows.map((x) => x.auto)).toEqual([true, true, false, false, false]);
    expect(r.salida).toBe("23:00");
    expect(r.supuestos).toEqual(["2 personas no traían horas: base 6 h, AC +1 h y C +2 h."]);
  });

  it("no sobrescribe horas escritas y respeta los extras configurados", () => {
    const r = prepararPersonal([leido("C", { horas: 7, pp: "4" }), leido("AC"), leido("A", { llegada: "18:00", salida: "22:00" })], "18:00", { ac: 2, c: 3 });
    expect(r.rows.map((x) => x.horas)).toEqual([7, 6, 4]);
    expect(r.rows[0].pp).toBe("4");
    expect(r.supuestos).toEqual(["1 persona no traía horas: base 4 h, AC +2 h y C +3 h."]);
  });

  it("usa la salida escrita más común del archivo", () => {
    const r = prepararPersonal([leido("A", { horas: 4, salida: "22:00" }), leido("A", { horas: 4, salida: "22:00" })], "18:30");
    expect(r.salida).toBe("22:00");
    expect(r.supuestos).toEqual([]);
  });
});

describe("horasPorCargo", () => {
  it("A = base, AC = base + 1, C = base + 2", () => {
    expect([horasPorCargo("A", 4), horasPorCargo("AC", 4), horasPorCargo("C", 4)]).toEqual([4, 5, 6]);
    expect([horasPorCargo("A", 6), horasPorCargo("AC", 6), horasPorCargo("C", 6)]).toEqual([6, 7, 8]);
  });
});

describe("calcularRegistro", () => {
  const personas = [
    { nombre: "Coordinador", horas: 6 },
    { nombre: "AC", horas: 5 },
    { nombre: "A1", horas: 4 },
    { nombre: "A2", horas: 4 },
  ];

  it("llegada = salida − horas; valor = horas × $10.000; totales", () => {
    const r = calcularRegistro(personas, { salida: "22:30", horaCitacion: "18:30" });
    expect(r.filas.map((f) => f.llegada)).toEqual(["16:30", "17:30", "18:30", "18:30"]);
    expect(r.filas.every((f) => f.salida === "22:30")).toBe(true);
    expect(r.filas.map((f) => f.valor)).toEqual([60000, 50000, 40000, 40000]);
    expect(r.totalHoras).toBe(19);
    expect(r.totalValor).toBe(190000);
    expect(r.alertas).toEqual([]);
  });

  it("valor por hora configurable y medias horas", () => {
    const r = calcularRegistro([{ nombre: "a", horas: 4.5 }], { salida: "22:00", horaCitacion: "17:30", valorHora: 12000 });
    expect(r.filas[0]).toMatchObject({ llegada: "17:30", valor: 54000 });
  });

  it("cruza medianoche", () => {
    const r = calcularRegistro([{ nombre: "a", horas: 5 }], { salida: "01:00", horaCitacion: "20:00" });
    expect(r.filas[0].llegada).toBe("20:00");
    expect(r.alertas).toEqual([]);
  });

  it("alerta si faltan horas o si alguien llega después de la citación", () => {
    const r = calcularRegistro(
      [
        { nombre: "Sin horas", horas: null },
        { nombre: "Tarde", horas: 3 },
      ],
      { salida: "22:30", horaCitacion: "18:30" },
    );
    expect(r.alertas.join(" ")).toContain("Falta las horas de Sin horas");
    expect(r.alertas.join(" ")).toContain("Tarde llega a las 7:30 PM, después de la citación");
    expect(r.filas[0]).toMatchObject({ llegada: null, valor: null });
  });

  it("alerta si la salida no es coherente con la citación", () => {
    const r = calcularRegistro(personas, { salida: "18:30", horaCitacion: "18:30" });
    expect(r.alertas.some((a) => a.includes("no es coherente"))).toBe(true);
  });
});

describe("salida propia por persona", () => {
  it("quien se va a otra hora conserva su llegada y suma sus horas", () => {
    const r = calcularRegistro(
      [
        { nombre: "Ana", horas: 4 },
        { nombre: "Luis", horas: 5, salida: "18:30" },
      ],
      { salida: "17:30", horaCitacion: "13:30", valorHora: 10000 },
    );
    expect(r.filas[0]).toMatchObject({ llegada: "13:30", salida: "17:30", horas: 4, valor: 40000 });
    expect(r.filas[1]).toMatchObject({ llegada: "13:30", salida: "18:30", horas: 5, valor: 50000 });
    expect(r.totalHoras).toBe(9);
  });
});
