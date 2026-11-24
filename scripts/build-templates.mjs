// Convierte las plantillas originales del Teatro (Word) en plantillas con marcadores
// para docxtemplater. Solo toca los runs de los campos: logo, tablas y estilos quedan intactos.
//
//   node scripts/build-templates.mjs [carpeta-originales]
//
// Por defecto lee samples/real/plantillas-originales/{LLAVES,COLILLAS,EVALUACION,REGISTRO}.docx
// y escribe templates/*.docx + templates/meta.json.

import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { scrub } from "./scrub-docx.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const srcDir = path.resolve(process.argv[2] ?? path.join(root, "samples/real/plantillas-originales"));
const outDir = path.join(root, "templates");

const EMU_PER_PX = 9525;

const textOfRun = (r) => [...r.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

function paragraphs(xml) {
  return [...xml.matchAll(/<w:p[\s>](?:(?!<w:p[\s>]).)*?<\/w:p>/gs)].map((m) => ({ start: m.index, xml: m[0] }));
}

/**
 * Reescribe los runs de texto de un párrafo. `edit` recibe los textos de los runs y devuelve
 * los nuevos; un texto "" elimina el run. `expect` protege contra plantillas distintas.
 */
function editParagraph(doc, match, expect, edit) {
  const p = paragraphs(doc).find((p) => match(p.xml.replace(/<[^>]+>/g, "")));
  if (!p) throw new Error(`No se encontró el párrafo: ${match}`);
  const runs = [...p.xml.matchAll(/<w:r[\s>](?:(?!<w:r[\s>]).)*?<\/w:r>/gs)].filter((m) => /<w:t[\s>]/.test(m[0]));
  const texts = runs.map((m) => textOfRun(m[0]));
  if (expect && JSON.stringify(texts) !== JSON.stringify(expect)) {
    throw new Error(`Runs inesperados:\n${JSON.stringify(texts)}\n${JSON.stringify(expect)}`);
  }
  const next = edit([...texts]);
  let out = p.xml;
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i][0];
    const replaced =
      next[i] === ""
        ? ""
        : r.replace(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/, `<w:t xml:space="preserve">${next[i]}</w:t>`).replace(/(<\/w:t>)[\s\S]*?(?=<\/w:r>)/, "$1");
    out = out.slice(0, runs[i].index) + replaced + out.slice(runs[i].index + r.length);
  }
  out = out.replace(/<w:proofErr [^>]*\/>/g, "");
  return doc.slice(0, p.start) + out + doc.slice(p.start + p.xml.length);
}

/** Cambia el dibujo de la firma por el marcador de imagen {{%firma}} y borra la imagen original. */
function replaceFirma(zip, doc, mediaName) {
  const rels = zip.file("word/_rels/document.xml.rels").asText();
  const rel = rels.match(new RegExp(`<Relationship [^>]*Id="(rId\\d+)"[^>]*Target="media/${mediaName}"[^>]*/>`))
    ?? rels.match(new RegExp(`<Relationship [^>]*Target="media/${mediaName}"[^>]*Id="(rId\\d+)"[^>]*/>`));
  if (!rel) throw new Error(`No hay relación para ${mediaName}`);
  const rId = rel[1];
  const run = [...doc.matchAll(/<w:r[\s>](?:(?!<w:r[\s>]).)*?<\/w:r>/gs)].find((m) => m[0].includes(`r:embed="${rId}"`));
  if (!run) throw new Error(`No hay dibujo con ${rId}`);
  const ext = run[0].match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
  const rPr = run[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
  const box = { width: Math.round(Number(ext[1]) / EMU_PER_PX), height: Math.round(Number(ext[2]) / EMU_PER_PX) };
  doc = doc.replace(run[0], `<w:r>${rPr}<w:t>{{%firma}}</w:t></w:r>`);
  zip.file("word/_rels/document.xml.rels", rels.replace(rel[0], ""));
  zip.remove(`word/media/${mediaName}`);
  return { doc, box };
}

const label = (t) => /[A-ZÁÉÍÓÚ]{3,}[^:]*:\s*$/.test(t);
const clearFrom = (texts, from) => {
  for (let j = from; j < texts.length && !label(texts[j]); j++) texts[j] = "";
};

const specs = {
  LLAVES: (doc) => {
    doc = editParagraph(doc, (t) => t.startsWith("EVENTO:"), null, (t) => ["EVENTO: ", "{{evento}}"]);
    doc = editParagraph(doc, (t) => t.startsWith("FECHA:"), null, (t) => {
      t[1] = "{{fecha}}";
      const h = t.findIndex((x) => /HORA:\s*$/.test(x));
      // Los runs de espacios entre la fecha y "HORA:" se vuelven un relleno calculado,
      // para que fechas largas (Septiembre) no empujen la hora de citación a otra línea.
      t[2] = "{{espacioFecha}}";
      for (let j = 3; j < h; j++) t[j] = "";
      t[h] = t[h].trimStart();
      t[h + 1] = "{{horaEvento}}";
      clearFrom(t, h + 2);
      const c = t.findIndex((x) => /CITACI.N:\s*$/.test(x));
      t[c + 1] = "{{horaCitacion}}";
      clearFrom(t, c + 2);
      return t;
    });
    doc = editParagraph(doc, (t) => t.startsWith("COORDINADOR:"), null, (t) => t.map((x, i) => (i === 0 ? x : i === 1 ? "{{coordinador}}" : "")));
    doc = editParagraph(doc, (t) => t.trim() === "NOTA:", ["NOTA: "], () => ["NOTA: {{nota}}"]);
    return doc;
  },
  COLILLAS: (doc) => {
    doc = editParagraph(doc, (t) => t.trim() === "GordoConsejos", null, () => ["{{evento}}"]);
    doc = editParagraph(doc, (t) => t.startsWith("FECHA:"), null, (t) => t.map((x, i) => (i === 0 ? x : i === 1 ? " " : i === 2 ? "{{fecha}}" : "")));
    doc = editParagraph(doc, (t) => t.startsWith("HORARIO"), null, (t) => t.map((x, i) => (i < 2 ? x : i === 2 ? "{{horaEvento}}" : "")));
    doc = editParagraph(doc, (t) => t.startsWith("Total boletas:"), null, (t) => {
      t[1] = "{{aforo}}";
      return t;
    });
    // Tabla de localidades: boletas, valor, total y observaciones (opcionales).
    for (const [label, k] of [["LUNETA CENTRO", "lc"], ["LUNETA LATERAL", "ll"], ["BALCÓN CENTRO", "bc"], ["BALCÓN LATERAL", "bl"]]) {
      doc = fillRowCells(doc, label, ["B", "V", "T", "O"].map((s) => "{{" + k + s + "}}"));
    }
    return doc;
  },
  EVALUACION: (doc) => {
    doc = editParagraph(doc, (t) => t.startsWith("EVENTO:"), null, (t) => ["EVENTO: ", "{{evento}}"]);
    doc = editParagraph(doc, (t) => t.startsWith("FECHA:"), null, (t) => {
      t[2] = "{{fecha}}";
      t[3] = "";
      const h = t.findIndex((x) => /HORARIO:\s*$/.test(x));
      t[h + 1] = "{{horaEvento}}";
      clearFrom(t, h + 2);
      return t;
    });
    doc = editParagraph(doc, (t) => t.startsWith("COORDINADOR:"), null, (t) => t.map((x, i) => (i === 0 ? x : i === 1 ? "{{coordinador}}" : "")));
    doc = editParagraph(doc, (t) => t.startsWith("El público asistente"), null, (t) => t.map((_, i) => (i === 0 ? "{{reclamos}}" : "")));
    for (const [start, tag] of [["Aspectos a mejorar", "{{aspectosMejorar}}"], ["Aspectos que por su buen", "{{aspectosPermanecer}}"]]) {
      doc = editParagraph(doc, (t) => t.startsWith(start), null, (t) => {
        const u = t.findIndex((x) => /^_+$/.test(x));
        return t.map((x, i) => (i < u ? x : i === u ? tag : ""));
      });
    }
    doc = editParagraph(doc, (t) => t.startsWith("No hay sugerencias"), null, (t) => t.map((_, i) => (i === 0 ? "{{sugerencias}}" : "")));
    // Notas: una viñeta por nota. Los párrafos {{#notas}} y {{/notas}} desaparecen al renderizar.
    doc = editParagraph(doc, (t) => t.startsWith("No hay llaves"), null, () => ["{{.}}"]);
    const p = paragraphs(doc).find((p) => p.xml.includes("{{.}}"));
    const wrap = (tag) => `<w:p><w:r><w:t>${tag}</w:t></w:r></w:p>`;
    doc = doc.slice(0, p.start) + wrap("{{#notas}}") + p.xml + wrap("{{/notas}}") + doc.slice(p.start + p.xml.length);
    return doc;
  },
};

/** Inserta un texto en las celdas (después de la primera) de la fila que contiene `label`. */
function fillRowCells(doc, label, values) {
  const row = [...doc.matchAll(/<w:tr[\s>](?:(?!<w:tr[\s>]).)*?<\/w:tr>/gs)].find((m) => m[0].replace(/<[^>]+>/g, "").includes(label));
  if (!row) throw new Error(`No se encontró la fila ${label}`);
  const cells = [...row[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)];
  let out = row[0];
  for (let i = cells.length - 1; i >= 1; i--) {
    const tc = cells[i][0];
    const v = values[i - 1];
    if (!v) continue;
    const markRPr = tc.match(/<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)[\s\S]*?<\/w:pPr>/)?.[1] ?? "";
    const filled = tc.replace(/<\/w:p>/, `<w:r>${markRPr}<w:t xml:space="preserve">${v}</w:t></w:r></w:p>`);
    out = out.slice(0, cells[i].index) + filled + out.slice(cells[i].index + tc.length);
  }
  return doc.replace(row[0], out);
}

/** Pone un texto en una celda conservando el formato del primer run (o del párrafo). */
function setCellText(tc, text) {
  const firstP = tc.match(/<w:p[\s>](?:(?!<w:p[\s>]).)*?<\/w:p>/s)[0];
  const rPr =
    firstP.match(/<w:r[\s>][\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)/)?.[1] ?? firstP.match(/<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)/)?.[1] ?? "";
  const pPr = firstP.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  const open = firstP.match(/^<w:p[^>]*>/)[0];
  const tcPr = tc.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0] ?? "";
  return `<w:tc>${tcPr}${open}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
}

/** REGISTRO: el registro oficial con una fila repetible {{#personal}} y la fila de totales. */
function buildRegistro(doc) {
  doc = doc.replace(/(<w:t[^>]*>)NOMBRE DEL EVENTO:[^<]*(<\/w:t>)/, "$1NOMBRE DEL EVENTO: {{evento}}$2");
  doc = doc.replace(/(<w:t[^>]*>)FECHA:[^<]*(<\/w:t>)/, "$1FECHA: {{fechaRegistro}}$2");
  doc = doc.replace(/(<w:t[^>]*>)HORA CITACION:[^<]*(<\/w:t>)/, "$1HORA CITACION: {{horaCitacion}}        HORA EVENTO: {{horaEvento}}$2");
  const staff = [...doc.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].find((t) => t[0].includes("NOMBRE COMPLETO"))[0];
  const rows = [...staff.matchAll(/<w:tr[\s>](?:(?!<w:tr[\s>]).)*?<\/w:tr>/gs)].map((m) => m[0]);
  const header = rows.findIndex((r) => r.replace(/<[^>]+>/g, "").includes("NOMBRE COMPLETO"));
  const first = rows[header + 1];
  const last = rows[rows.length - 1];
  const keys = ["n", "nombre", "cedula", "ubi", "llegada", "salida", "horas", "valor", "telefono", "cargo", "pp", "desempeno", "cc", "observacion"];
  const fill = (row, texts) => {
    const cells = [...row.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)];
    if (cells.length !== texts.length) throw new Error(`La fila tiene ${cells.length} celdas, se esperaban ${texts.length}`);
    let out = row;
    for (let i = cells.length - 1; i >= 0; i--) {
      out = out.slice(0, cells[i].index) + setCellText(cells[i][0], texts[i]) + out.slice(cells[i].index + cells[i][0].length);
    }
    return out;
  };
  const last1 = keys.length - 1;
  const loopRow = fill(first, keys.map((k, i) => (i === 0 ? "{{#personal}}" : "") + "{{" + k + "}}" + (i === last1 ? "{{/personal}}" : "")));
  const totalRow = fill(last, keys.map((k) => (k === "horas" ? "{{totalHoras}}" : k === "valor" ? "{{totalValor}}" : "")));
  const before = staff.slice(0, staff.indexOf(first));
  const after = staff.slice(staff.lastIndexOf(last) + last.length);
  return doc.replace(staff, before + loopRow + totalRow + after);
}

const meta = {};
fs.mkdirSync(outDir, { recursive: true });
for (const [name, spec] of Object.entries(specs)) {
  const zip = new PizZip(fs.readFileSync(path.join(srcDir, `${name}.docx`)));
  let doc = zip.file("word/document.xml").asText();
  doc = spec(doc);
  const firma = replaceFirma(zip, doc, "image2.png");
  zip.file("word/document.xml", firma.doc);
  scrub(zip);
  fs.writeFileSync(path.join(outDir, `${name}.docx`), zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  meta[name] = { firma: firma.box };
  console.log(`✔ ${name}.docx  firma ${firma.box.width}×${firma.box.height}px`);
}
{
  const zip = new PizZip(fs.readFileSync(path.join(srcDir, "REGISTRO.docx")));
  zip.file("word/document.xml", buildRegistro(zip.file("word/document.xml").asText()));
  scrub(zip);
  fs.writeFileSync(path.join(outDir, "REGISTRO.docx"), zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("✔ REGISTRO.docx");
}
fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
