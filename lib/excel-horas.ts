/**
 * Excel de "Mis horas" con formato: título, cabecera roja, columnas con ancho, pesos con punto,
 * horas en 12 h, días con más de 8 h marcados y fila de total con fórmulas.
 * exceljs se carga solo al exportar (import dinámico), no pesa en la app.
 */
import { DIAS, MESES, hora12 } from "./format";
import { MAX_HORAS_DIA } from "./registros";

export type FilaHoras = {
  fecha: string; // YYYY-MM-DD
  evento: string;
  lugar: string;
  paraQuien: string;
  llegada: string | null;
  salida: string | null;
  horas: number | null;
  valor: number | null;
};

const ROJO = "FFC8201A";
const ROJO_CLARO = "FFFDE8E7";
const GRIS_BORDE = "FFD4D4D8";
const GRIS_TEXTO = "FF52525B";

export async function excelHoras(opts: { filas: FilaHoras[]; anio: number; mes: number; nombre: string }): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Planillas Teatro";
  const titulo = `${MESES[opts.mes]} ${opts.anio}`;
  const ws = wb.addWorksheet(titulo, {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });

  const columnas = [
    { header: "Fecha", key: "fecha", width: 12 },
    { header: "Día", key: "dia", width: 11 },
    { header: "Evento", key: "evento", width: 38 },
    { header: "Lugar", key: "lugar", width: 30 },
    { header: "Para quién", key: "para", width: 18 },
    { header: "Llegada", key: "llegada", width: 12 },
    { header: "Salida", key: "salida", width: 12 },
    { header: "Horas", key: "horas", width: 9 },
    { header: "Valor", key: "valor", width: 14 },
  ];
  ws.columns = columnas.map(({ key, width }) => ({ key, width }));
  const ultima = String.fromCharCode(64 + columnas.length); // "I"

  // Título y subtítulo
  ws.mergeCells(`A1:${ultima}1`);
  const t = ws.getCell("A1");
  t.value = `Mis horas · ${titulo}`;
  t.font = { name: "Arial", size: 16, bold: true, color: { argb: ROJO } };
  ws.getRow(1).height = 26;
  ws.mergeCells(`A2:${ultima}2`);
  const st = ws.getCell("A2");
  st.value = `${opts.nombre} · Teatro Universidad de Medellín · descargado el ${new Date().toLocaleDateString("es-CO")}`;
  st.font = { name: "Arial", size: 10, color: { argb: GRIS_TEXTO } };

  // Cabecera
  const cab = ws.getRow(4);
  cab.values = columnas.map((c) => c.header);
  cab.height = 22;
  cab.eachCell((c) => {
    c.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROJO } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });

  // Horas por día (para marcar los días con más de 8 h)
  const porDia = new Map<string, number>();
  for (const f of opts.filas) porDia.set(f.fecha, (porDia.get(f.fecha) ?? 0) + (f.horas ?? 0));

  const primera = 5;
  opts.filas.forEach((f, i) => {
    const d = new Date(`${f.fecha}T12:00:00`);
    const r = ws.getRow(primera + i);
    r.values = {
      fecha: d,
      dia: DIAS[d.getDay()],
      evento: f.evento || "Sin nombre",
      lugar: f.lugar,
      para: f.paraQuien,
      llegada: f.llegada ? hora12(f.llegada, true) : "",
      salida: f.salida ? hora12(f.salida, true) : "",
      horas: f.horas ?? null,
      valor: f.valor ?? null,
    };
    const pasado = (porDia.get(f.fecha) ?? 0) > MAX_HORAS_DIA;
    r.eachCell({ includeEmpty: true }, (c, col) => {
      if (col > columnas.length) return;
      c.font = { name: "Arial", size: 10, color: pasado && (col === 1 || col === 8) ? { argb: ROJO } : undefined, bold: pasado && col === 8 };
      c.border = { bottom: { style: "thin", color: { argb: GRIS_BORDE } } };
      c.alignment = { vertical: "middle", horizontal: col >= 6 ? "center" : "left", wrapText: col === 3 || col === 4 };
      if (pasado) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROJO_CLARO } };
    });
    r.getCell("fecha").numFmt = "dd/mm/yyyy";
    r.getCell("valor").numFmt = '"$"#,##0';
    r.getCell("valor").alignment = { vertical: "middle", horizontal: "right" };
  });

  // Total (fórmulas: si editan una fila en Excel, el total se ajusta)
  const fin = primera + opts.filas.length - 1;
  const tot = ws.getRow(fin + 2);
  tot.getCell("salida").value = "Total";
  tot.getCell("horas").value = { formula: `SUM(H${primera}:H${fin})`, result: opts.filas.reduce((a, f) => a + (f.horas ?? 0), 0) };
  tot.getCell("valor").value = { formula: `SUM(I${primera}:I${fin})`, result: opts.filas.reduce((a, f) => a + (f.valor ?? 0), 0) };
  tot.getCell("valor").numFmt = '"$"#,##0';
  tot.height = 22;
  for (const k of ["salida", "horas", "valor"]) {
    const c = tot.getCell(k);
    c.font = { name: "Arial", size: 11, bold: true };
    c.border = { top: { style: "medium", color: { argb: ROJO } } };
    c.alignment = { vertical: "middle", horizontal: k === "valor" ? "right" : "center" };
  }

  // Nota de días con más de 8 h
  const pasados = [...porDia.entries()].filter(([, h]) => h > MAX_HORAS_DIA).length;
  if (pasados) {
    const n = ws.getCell(`A${fin + 4}`);
    n.value = `En rojo: ${pasados === 1 ? "1 día" : `${pasados} días`} con más de ${MAX_HORAS_DIA} h. La cuenta de cobro solo usa el consolidado.`;
    n.font = { name: "Arial", size: 9, italic: true, color: { argb: GRIS_TEXTO } };
  }

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, fin), column: columnas.length } };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
