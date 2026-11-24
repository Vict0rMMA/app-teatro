import pdf from "pdf-parse/lib/pdf-parse.js";
import { normalize } from "../format";
import { buildRow, columnFor, finalizeRegistro, type Column } from "./build";
import { RegistroError, type Registro, type StaffRowRaw } from "./types";

interface Item {
  x: number;
  y: number;
  w: number;
  str: string;
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
}

async function extractItems(buffer: Buffer): Promise<Item[][]> {
  const pages: Item[][] = [];
  try {
    await pdf(buffer, {
      pagerender: async (page: { getTextContent: (o: object) => Promise<{ items: TextItem[] }> }) => {
        const tc = await page.getTextContent({ normalizeWhitespace: true });
        pages.push(
          tc.items
            .filter((it) => it.str.trim())
            .map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width, str: it.str })),
        );
        return "";
      },
    });
  } catch {
    throw new RegistroError("ARCHIVO_INVALIDO", "No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.");
  }
  return pages;
}

const center = (it: Item) => it.x + it.w / 2;

function isHeaderAnchor(it: Item) {
  const t = normalize(it.str);
  return t.includes("nombre") && t.includes("completo");
}

function groupLines(items: Item[]): string {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= 3) last.push(it);
    else lines.push([it]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ")).join("\n");
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export async function parseRegistroPdf(buffer: Buffer): Promise<Registro> {
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new RegistroError("ARCHIVO_INVALIDO", "El archivo no es un PDF válido.");
  }
  const pages = await extractItems(buffer);
  if (!pages.some((p) => p.length)) {
    throw new RegistroError(
      "FORMATO_NO_RECONOCIDO",
      "El PDF no tiene texto seleccionable (¿es un escaneo?). Sube el .docx original.",
    );
  }

  const p0 = pages.findIndex((p) => p.some(isHeaderAnchor));
  if (p0 < 0) {
    throw new RegistroError("SIN_TABLA", "No se encontró la tabla de personal (columna NOMBRE COMPLETO).");
  }
  const headY = pages[p0].find(isHeaderAnchor)!.y;

  // Columnas: extensión X de los textos del encabezado (un encabezado puede ocupar varias líneas).
  const acc = new Map<Column, { start: number; end: number }>();
  for (const it of pages[p0]) {
    if (Math.abs(it.y - headY) > 22) continue;
    const col = columnFor(it.str);
    if (!col) continue;
    const prev = acc.get(col);
    acc.set(col, prev ? { start: Math.min(prev.start, it.x), end: Math.max(prev.end, it.x + it.w) } : { start: it.x, end: it.x + it.w });
  }
  if (acc.size < 3 || !acc.has("nombre")) {
    throw new RegistroError("SIN_TABLA", "La tabla de personal del PDF no tiene las columnas esperadas.");
  }
  const cols = [...acc.entries()].map(([col, r]) => ({ col, ...r })).sort((a, b) => a.start - b.start);
  // Límite entre columnas: punto medio entre el final de un encabezado y el inicio del siguiente.
  const bounds = cols.map((c, i) => (i < cols.length - 1 ? (c.end + cols[i + 1].start) / 2 : Infinity));
  const columnAt = (x: number): Column => cols[bounds.findIndex((b) => x < b)].col;

  const anchorCol: Column = acc.has("n") ? "n" : "nombre";
  const staff: StaffRowRaw[] = [];

  pages.forEach((items, pi) => {
    if (pi < p0) return;
    const head = items.find(isHeaderAnchor);
    const limit = head ? head.y - 8 : Infinity;
    const body = items.filter((it) => it.y < limit);

    const anchors = body
      .filter((it) => columnAt(center(it)) === anchorCol && (anchorCol !== "n" || /^\d{1,3}$/.test(it.str.trim())))
      .sort((a, b) => b.y - a.y);
    if (!anchors.length) return;

    const gaps = anchors.slice(1).map((a, i) => anchors[i].y - a.y);
    const tol = Math.max(6, (median(gaps) || 24) * 0.5);

    const rows = anchors.map(() => [] as Item[]);
    for (const it of body) {
      let best = -1;
      let bestDy = Infinity;
      anchors.forEach((a, i) => {
        const dy = Math.abs(a.y - it.y);
        if (dy < bestDy) {
          bestDy = dy;
          best = i;
        }
      });
      if (best >= 0 && bestDy <= tol) rows[best].push(it);
    }

    rows.forEach((rowItems) => {
      const cells: Partial<Record<Column, string>> = {};
      rowItems
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .forEach((it) => {
          const col = columnAt(center(it));
          cells[col] = cells[col] ? `${cells[col]} ${it.str}` : it.str;
        });
      const row = buildRow(cells, staff.length + 1);
      if (row) staff.push(row);
    });
  });

  const headerText = groupLines(pages[p0].filter((it) => it.y > headY + 22));
  return finalizeRegistro(headerText, staff);
}
