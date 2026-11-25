import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { excelHoras } from "@/lib/excel-horas";

describe("excelHoras", () => {
  it("arma el Excel con título, cabecera, pesos, total en su columna y días de más de 8 h marcados", async () => {
    const blob = await excelHoras({
      anio: 2026,
      mes: 10, // noviembre
      nombre: "Ana Prueba Ficticia",
      filas: [
        { fecha: "2026-11-18", evento: "Red de Escuelas", lugar: "Teatro", paraQuien: "", llegada: "16:00", salida: "22:00", horas: 6, valor: 60000 },
        { fecha: "2026-11-21", evento: "Mundo Danza", lugar: "Teatro", paraQuien: "Sara Ríos", llegada: "12:00", salida: "17:00", horas: 5, valor: 50000 },
        { fecha: "2026-11-21", evento: "Mundo Danza noche", lugar: "Teatro", paraQuien: "Sara Ríos", llegada: "19:00", salida: "00:00", horas: 5, valor: 50000 },
      ],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await blob.arrayBuffer()) as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];

    expect(ws.name).toBe("Noviembre 2026");
    expect(ws.getCell("A1").value).toBe("Mis horas · Noviembre 2026");
    expect((ws.getRow(4).values as unknown[]).slice(1)).toEqual(["Fecha", "Día", "Evento", "Lugar", "Para quién", "Llegada", "Salida", "Horas", "Valor"]);
    expect(ws.getCell("I5").numFmt).toBe('"$"#,##0');
    expect(ws.getCell("F5").value).toBe("4:00 pm");
    // Total: "Total" bajo Salida, horas bajo Horas, valor bajo Valor.
    expect(ws.getCell("G9").value).toBe("Total");
    expect(ws.getCell("H9").value).toMatchObject({ formula: "SUM(H5:H7)", result: 16 });
    expect(ws.getCell("I9").value).toMatchObject({ formula: "SUM(I5:I7)", result: 160000 });
    // 21/11 suma 10 h: filas marcadas en rojo claro.
    expect((ws.getCell("A6").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFFDE8E7");
    expect((ws.getCell("A5").fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb).not.toBe("FFFDE8E7");
  });
});
