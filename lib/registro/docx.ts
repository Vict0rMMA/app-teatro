import PizZip from "pizzip";
import { formatCOP, formatHoras, hora12, normalize } from "../format";
import { elements, encodeXml, findElements, paragraphsText, textOf } from "../docx/xml";
import { buildRow, columnFor, finalizeRegistro, type Column } from "./build";
import { RegistroError, type Registro, type StaffRowRaw } from "./types";

function cellSpan(tc: string): number {
  const m = tc.match(/<w:gridSpan\s+w:val="(\d+)"/);
  return m ? Number(m[1]) : 1;
}

interface Cell {
  col: number;
  text: string;
  /** posición del <w:tc> dentro del XML de la fila */
  start: number;
  end: number;
}

/** Celdas de una fila con su índice en la cuadrícula (respeta gridSpan). */
function rowCells(tr: string): Cell[] {
  let col = 0;
  const before = tr.match(/<w:gridBefore\s+w:val="(\d+)"/);
  if (before) col = Number(before[1]);
  return findElements(tr, "w:tc").map(([start, end]) => {
    const tc = tr.slice(start, end);
    const cell = { col, text: paragraphsText(tc).replace(/\n/g, " "), start, end };
    col += cellSpan(tc);
    return cell;
  });
}

function openDocx(buffer: Buffer | Uint8Array) {
  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch {
    throw new RegistroError("ARCHIVO_INVALIDO", "El archivo no es un .docx válido o está dañado.");
  }
  const doc = zip.file("word/document.xml")?.asText();
  if (!doc) throw new RegistroError("FORMATO_NO_RECONOCIDO", "El .docx no tiene contenido de Word reconocible.");
  return { zip, doc };
}

/** Localiza la tabla de personal y el mapa columna de cuadrícula → campo. */
function locateStaffTable(doc: string) {
  for (const range of findElements(doc, "w:tbl")) {
    const rows = elements(doc.slice(range[0], range[1]), "w:tr");
    for (let i = 0; i < rows.length; i++) {
      const map = new Map<number, Column>();
      for (const c of rowCells(rows[i])) {
        const col = columnFor(c.text);
        if (col) map.set(c.col, col);
      }
      const cols = new Set(map.values());
      if (cols.has("nombre") && cols.size >= 3) return { range, colMap: map, headerRowIndex: i };
    }
  }
  throw new RegistroError("SIN_TABLA", "No se encontró la tabla de personal (columnas N°, NOMBRE COMPLETO, LLEGADA, SALIDA…).");
}

function cellsByColumn(tr: string, colMap: Map<number, Column>) {
  const cells: Partial<Record<Column, string>> = {};
  for (const c of rowCells(tr)) {
    const col = colMap.get(c.col);
    if (col) cells[col] = (cells[col] ? cells[col] + " " : "") + c.text;
  }
  return cells;
}

export function parseRegistroDocx(buffer: Buffer | Uint8Array): Registro {
  const { doc } = openDocx(buffer);
  const { range, colMap, headerRowIndex } = locateStaffTable(doc);

  const rows = elements(doc.slice(range[0], range[1]), "w:tr").slice(headerRowIndex + 1);
  const staff: StaffRowRaw[] = [];
  for (const tr of rows) {
    const row = buildRow(cellsByColumn(tr, colMap), staff.length + 1);
    if (row) staff.push(row);
  }

  const body = doc.slice(0, range[0]) + doc.slice(range[1]);
  const bodyStart = body.indexOf("<w:body");
  const headerText = paragraphsText(bodyStart >= 0 ? body.slice(bodyStart) : body);
  return finalizeRegistro(headerText || textOf(body), staff);
}

// ---------------------------------------------------------------------------
// Completar el registro original (.docx subido)

/** Persona tal como queda después de confirmar la tabla. */
export interface RegistroPersona {
  nombre: string;
  cargo: string;
  cedula?: string;
  telefono?: string;
  ubi?: string;
  cc?: string;
  llegada: string | null;
  salida: string | null;
  horas: number | null;
  valor: number | null;
  pp: string;
  desempeno: string;
  observacion: string;
}

const PPR_AFTER_JC = /<w:(textDirection|textAlignment|textboxTightWrap|outlineLvl|divId|cnfStyle|rPr|sectPr|pPrChange)[\s>/]/;
const RUN_PR = '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>';

/** Centra el párrafo respetando el orden de elementos de <w:pPr> que exige Word. */
function centerPPr(p: string): string {
  const pPr = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>|<w:pPr\/>/)?.[0];
  if (!pPr || pPr === "<w:pPr/>") {
    const jc = '<w:pPr><w:jc w:val="center"/></w:pPr>';
    return pPr ? p.replace(pPr, jc) : p.replace(/^<w:p(\s[^>]*)?>/, (m) => m + jc);
  }
  let inner = pPr.slice(7, -8).replace(/<w:jc\s[^>]*\/>/, "");
  const m = inner.match(PPR_AFTER_JC);
  inner = m ? inner.slice(0, m.index) + '<w:jc w:val="center"/>' + inner.slice(m.index) : inner + '<w:jc w:val="center"/>';
  return p.replace(pPr, `<w:pPr>${inner}</w:pPr>`);
}

/** Reemplaza el contenido de una celda por un texto en Arial 9 centrado (conserva tcPr y el pPr del primer párrafo). */
function setCell(tc: string, value: string): string {
  const tcPr = tc.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0] ?? "";
  const ps = findElements(tc, "w:p");
  let open = "<w:p>";
  let pPr = "";
  if (ps.length) {
    const p = tc.slice(ps[0][0], ps[0][1]);
    open = p.match(/^<w:p(?:\s[^>]*)?>/)?.[0]?.replace(/\/>$/, ">") ?? "<w:p>";
    pPr = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  }
  const centered = centerPPr(`${open}${pPr}</w:p>`).replace(/<\/w:p>$/, "");
  const run = value ? `<w:r>${RUN_PR}<w:t xml:space="preserve">${encodeXml(value)}</w:t></w:r>` : "";
  return `<w:tc>${tcPr}${centered}${run}</w:p></w:tc>`;
}

function display(col: Column, r: RegistroPersona, n: number): string | null {
  switch (col) {
    case "n":
      return String(n);
    case "llegada":
    case "salida":
      return hora12(r[col], true);
    case "horas":
      return r.horas == null ? "" : formatHoras(r.horas);
    case "valor":
      return r.valor == null ? "" : formatCOP(r.valor);
    case "pp":
    case "desempeno":
    case "observacion":
    case "nombre":
    case "cargo":
      return r[col] ?? "";
    case "cedula":
    case "telefono":
    case "ubi":
    case "cc":
      return r[col] ?? "";
    default:
      return null;
  }
}

/** Columnas que el coordinador puede cambiar; las demás (nombre, cédula, teléfono, UBI, cargo, C.C) se respetan. */
const EDITABLES: Column[] = ["n", "llegada", "salida", "horas", "valor", "pp", "desempeno", "observacion"];

function rewriteRow(tr: string, colMap: Map<number, Column>, r: RegistroPersona, n: number, cols: Column[]): string {
  const cells = (() => {
    let col = 0;
    const before = tr.match(/<w:gridBefore\s+w:val="(\d+)"/);
    if (before) col = Number(before[1]);
    return findElements(tr, "w:tc").map(([start, end]) => {
      const tc = tr.slice(start, end);
      const c = { col, start, end, text: paragraphsText(tc).replace(/\n/g, " ").trim() };
      col += cellSpan(tc);
      return c;
    });
  })();
  let out = tr;
  for (const c of [...cells].sort((a, b) => b.start - a.start)) {
    const field = colMap.get(c.col);
    if (!field || !cols.includes(field)) continue;
    const value = display(field, r, n);
    if (value == null || value === c.text) continue; // igual que antes: no se toca el formato
    out = out.slice(0, c.start) + setCell(out.slice(c.start, c.end), value) + out.slice(c.end);
  }
  return out;
}

/**
 * Completa el registro .docx original con la tabla confirmada, conservando su formato:
 * - Horas, llegada, salida, valor, P.P, DESEMP y observación quedan como en la tabla.
 * - Nombre, cédula, teléfono, UBI y cargo de las filas originales no se modifican.
 * - Personas agregadas se insertan copiando el formato de la primera fila; las quitadas se eliminan.
 * - N° se renumera y la fila de totales se recalcula.
 * El resultado vive solo en memoria (tiene cédulas y teléfonos).
 */
export function fillRegistroDocx(
  buffer: Buffer | Uint8Array,
  personas: RegistroPersona[],
  totals: { horas: number; valor: number },
): Buffer {
  const { zip, doc } = openDocx(buffer);
  const { range, colMap, headerRowIndex } = locateStaffTable(doc);
  const table = doc.slice(range[0], range[1]);
  const rowRanges = findElements(table, "w:tr");

  const dataRows: Array<{ i: number; xml: string; key: string }> = [];
  rowRanges.forEach(([rs, re], i) => {
    if (i <= headerRowIndex) return;
    const xml = table.slice(rs, re);
    const parsed = buildRow(cellsByColumn(xml, colMap), 0);
    if (parsed) dataRows.push({ i, xml, key: normalize(parsed.nombre) });
  });
  if (!dataRows.length) throw new RegistroError("SIN_PERSONAL", "El registro no tiene filas de personal para completar.");

  const used = new Set<number>();
  const allCols = [...new Set(colMap.values())];
  const newRows = personas.map((p, idx) => {
    const key = normalize(p.nombre);
    const match = dataRows.find((d) => !used.has(d.i) && d.key === key);
    if (match) {
      used.add(match.i);
      return rewriteRow(match.xml, colMap, p, idx + 1, EDITABLES);
    }
    // Persona nueva: copia de la primera fila con todas las celdas reescritas.
    return rewriteRow(dataRows[0].xml, colMap, p, idx + 1, allCols);
  });

  const firstIdx = dataRows[0].i;
  const lastIdx = dataRows[dataRows.length - 1].i;
  const start = rowRanges[firstIdx][0];
  const end = rowRanges[lastIdx][1];
  let after = table.slice(end);

  // Fila de totales: la primera fila después del personal, sin nombre.
  const totalRange = rowRanges[lastIdx + 1];
  if (totalRange) {
    const tr = table.slice(totalRange[0], totalRange[1]);
    if (!cellsByColumn(tr, colMap).nombre?.trim()) {
      const totalsRow: RegistroPersona = {
        nombre: "",
        cargo: "",
        llegada: null,
        salida: null,
        horas: totals.horas,
        valor: totals.valor,
        pp: "",
        desempeno: "",
        observacion: "",
      };
      const rewritten = rewriteRow(tr, colMap, totalsRow, 0, ["horas", "valor"]);
      after = after.replace(tr, rewritten);
    }
  }

  const newTable = table.slice(0, start) + newRows.join("") + after;
  zip.file("word/document.xml", doc.slice(0, range[0]) + newTable + doc.slice(range[1]));
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}
