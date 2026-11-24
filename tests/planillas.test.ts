import { readFileSync } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { fitInBox, generarPlanillas, imageSize, renderRegistro, type PlanillaInput } from "@/lib/docx/planillas";
import { paragraphsText } from "@/lib/docx/xml";
import { mensajeWhatsapp, nombresArchivo } from "@/lib/format";
import { parseRegistro } from "@/lib/registro";
import { calcularRegistro, prepararPersonal } from "@/lib/registro/calculo";
import { fillRegistroDocx, type RegistroPersona } from "@/lib/registro/docx";

const firma = readFileSync(path.join(__dirname, "..", "public", "logo-udem.png"));
const fx = (n: string) => readFileSync(path.join(__dirname, "..", "samples", n));

const base: PlanillaInput = {
  evento: "Red de Escuelas",
  fecha: "2026-11-18",
  horaEvento: "19:30",
  horaCitacion: "18:00",
  coordinador: "Laura Gómez Restrepo",
  notaLlaves: "La llave del vidrio de balcón izquierdo está mala.",
  aforo: 500,
  evaluacion: {
    reclamos: "El público asistente no presentó ninguna queja ni sugerencias.",
    aspectosMejorar: "",
    aspectosPermanecer: "",
    sugerencias: "No hay sugerencias por parte de los coordinadores.",
    notas: ["La llave del vidrio de balcón izquierdo está mala."],
  },
  localidades: {},
  firma,
};

function open(buf: Buffer) {
  const zip = new PizZip(buf);
  const doc = zip.file("word/document.xml")!.asText();
  return { zip, doc, text: paragraphsText(doc), lines: paragraphsText(doc).split("\n") };
}

describe("generarPlanillas", () => {
  const files = generarPlanillas(base);
  const [llaves, colillas, evaluacion] = files.map((f) => open(f.buffer));

  it("usa los nombres de archivo acordados", () => {
    expect(files.map((f) => f.name)).toEqual([
      "18_de_Noviembre_RED_DE_ESCUELAS-_LLAVES.docx",
      "18_de_Noviembre_RED_DE_ESCUELAS-COLILLAS.docx",
      "18_de_Noviembre_RED_DE_ESCUELAS-EVALUACION.docx",
    ]);
  });

  it("no deja marcadores ni datos de la plantilla original", () => {
    for (const f of [llaves, colillas, evaluacion]) {
      expect(f.text).not.toMatch(/\{\{|\}\}/);
      expect(f.text).not.toMatch(/gordo|gordc|victor/i);
    }
  });

  it("LLAVES: evento en mayúsculas, fecha larga, horas, coordinador y nota", () => {
    expect(llaves.lines).toContain("EVENTO: RED DE ESCUELAS");
    expect(llaves.lines.find((l) => l.startsWith("FECHA:"))).toMatch(
      /^FECHA: 18 de Noviembre del 2026\s+HORA: 7:30 PM\s+HORA CITACIÓN: 6:00 PM$/,
    );
    expect(llaves.lines).toContain("COORDINADOR: Laura Gómez Restrepo");
    expect(llaves.lines).toContain("NOTA: La llave del vidrio de balcón izquierdo está mala.");
    expect(llaves.text).toContain("CUARTO ACOMODADORES HALL");
  });

  it("COLILLAS: nombre, fecha, horario y total de boletas", () => {
    expect(colillas.lines).toContain("Red de Escuelas");
    expect(colillas.lines).toContain("FECHA: 18 de Noviembre 2026");
    expect(colillas.lines).toContain("HORARIO: 7:30 PM");
    expect(colillas.lines).toContain("Total boletas: 500 personas aproximadamente.");
  });

  it("EVALUACIÓN: campos por defecto, líneas en blanco y nota como viñeta", () => {
    const l = evaluacion.lines;
    expect(l).toContain("EVENTO: Red de Escuelas");
    expect(l.find((x) => x.startsWith("FECHA:"))).toMatch(/^FECHA:\s+18 de Noviembre 2026\s+HORARIO: 7:30 pm$/);
    expect(l).toContain("COORDINADOR: Laura Gómez Restrepo");
    expect(l).toContain("El público asistente no presentó ninguna queja ni sugerencias.");
    expect(l).toContain("Aspectos a mejorar en próximos eventos:_______________________________________");
    expect(l).toContain("No hay sugerencias por parte de los coordinadores.");
    const i = l.findIndex((x) => x.startsWith("NOTAS:"));
    expect(l.slice(i + 1).find((x) => x.trim())).toBe("La llave del vidrio de balcón izquierdo está mala.");
    const notaP = evaluacion.doc.match(/<w:p[ >](?:(?!<w:p[ >]).)*?La llave del vidrio(?:(?!<w:p[ >]).)*?<\/w:p>/s)![0];
    expect(notaP).toContain("<w:numPr>");
  });

  it("EVALUACIÓN: varias notas, aspectos escritos y sin notas", () => {
    const [, , ev] = generarPlanillas({
      ...base,
      evaluacion: { ...base.evaluacion, aspectosMejorar: "Más señalización", notas: ["Uno", "Dos", " "] },
    }).map((f) => open(f.buffer));
    expect(ev.lines).toContain("Aspectos a mejorar en próximos eventos:Más señalización");
    expect(ev.doc.match(/<w:numPr>/g)!.length).toBe(2);
    const [, , sin] = generarPlanillas({ ...base, evaluacion: { ...base.evaluacion, notas: [] } }).map((f) => open(f.buffer));
    expect(sin.doc).not.toContain("<w:numPr>");
  });

  it("COLILLAS: tabla por localidad con total calculado", () => {
    const [, col] = generarPlanillas({
      ...base,
      localidades: { lc: { boletas: 120, valor: 15000, observacion: "Cortesías 4" }, bl: { boletas: 30, valor: null, observacion: "" } },
    }).map((f) => open(f.buffer));
    expect(col.text).toContain("$15.000");
    expect(col.text).toContain("$1.800.000");
    expect(col.text).toContain("Cortesías 4");
  });

  it("conserva el logo y pone la firma del usuario ajustada al recuadro", () => {
    for (const f of [llaves, colillas, evaluacion]) {
      expect(f.zip.file("word/media/image1.png")).toBeTruthy();
      expect(f.zip.file("word/media/image2.png")).toBeNull();
      const media = Object.keys(f.zip.files).filter((n) => n.startsWith("word/media/") && n !== "word/media/image1.png");
      expect(media).toHaveLength(1);
      expect(f.zip.file(media[0])!.asNodeBuffer().equals(firma)).toBe(true);
      expect(f.doc.match(/<wp:extent /g)!.length).toBe(2);
    }
  });

  it("sin firma deja el recuadro en blanco; sin aforo pone ____", () => {
    const [ll, col] = generarPlanillas({ ...base, firma: null, aforo: null, notaLlaves: "" }).map((f) => open(f.buffer));
    expect(ll.lines).toContain("NOTA: ");
    const media = Object.keys(ll.zip.files).filter((n) => n.startsWith("word/media/") && n !== "word/media/image1.png");
    expect(ll.zip.file(media[0])!.asNodeBuffer().length).toBeLessThan(100);
    expect(col.lines).toContain("Total boletas: ____ personas aproximadamente.");
  });

  it("escapa caracteres especiales de XML", () => {
    const [ll] = generarPlanillas({ ...base, evento: "Rock & Roll <en vivo>" }).map((f) => open(f.buffer));
    expect(ll.text).toContain("EVENTO: ROCK & ROLL <EN VIVO>");
    expect(ll.doc).toContain("ROCK &amp; ROLL &lt;EN VIVO&gt;");
  });
});

async function personasDesde(file: string) {
  const r = await parseRegistro(file, fx(file));
  const prep = prepararPersonal(r.staff, r.horaCitacion);
  const calc = calcularRegistro(prep.rows, { salida: prep.salida, horaCitacion: r.horaCitacion });
  const personas: RegistroPersona[] = prep.rows.map((p, i) => ({ ...p, ...calc.filas[i] }));
  return { r, personas, totals: { horas: calc.totalHoras, valor: calc.totalValor } };
}

describe("REGISTRO", () => {
  it("completa el .docx original sin tocar nombres, cédulas ni teléfonos", async () => {
    const { r, personas, totals } = await personasDesde("registro-congreso.docx");
    const out = fillRegistroDocx(fx("registro-congreso.docx"), personas, totals);
    const again = await parseRegistro("r.docx", out);
    expect(again.staff).toHaveLength(r.staff.length);
    again.staff.forEach((s, i) => {
      expect(s).toMatchObject({ nombre: r.staff[i].nombre, cedula: r.staff[i].cedula, telefono: r.staff[i].telefono, cargo: r.staff[i].cargo });
      expect(s).toMatchObject({ salida: "19:30", llegada: personas[i].llegada, horas: personas[i].horas, valor: personas[i].valor, pp: "5", desempeno: "5" });
    });
    expect(again.staff[0]).toMatchObject({ llegada: "13:30", horas: 6, valor: 60000 });
    const xml = new PizZip(out).file("word/document.xml")!.asText();
    expect(xml).toContain('<w:t xml:space="preserve">3:30 pm</w:t>');
    expect(paragraphsText(xml)).toContain("$" + totals.valor.toLocaleString("es-CO"));
  });

  it("aplica correcciones, agrega y quita personas y renumera", async () => {
    const { personas, totals } = await personasDesde("registro-red-de-escuelas.docx");
    const editadas = personas.slice(0, 3).map((p, i) => (i === 1 ? { ...p, horas: 7, valor: 70000, llegada: "15:00" } : p));
    editadas.push({ nombre: "Persona Nueva", cargo: "A", llegada: "18:00", salida: "22:00", horas: 4, valor: 40000, pp: "5", desempeno: "4", observacion: "Refuerzo" });
    const out = fillRegistroDocx(fx("registro-red-de-escuelas.docx"), editadas, { horas: 21, valor: 210000 });
    const again = await parseRegistro("r.docx", out);
    expect(again.staff.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    expect(again.staff[1]).toMatchObject({ nombre: "Andrés Felipe Ríos", horas: 7, valor: 70000, llegada: "15:00", cedula: "1423938499" });
    expect(again.staff[3]).toMatchObject({ nombre: "Persona Nueva", cedula: "", telefono: "", desempeno: "4", observacion: "Refuerzo" });
    expect(paragraphsText(new PizZip(out).file("word/document.xml")!.asText())).toContain("$210.000");
    void totals;
  });

  it("un registro ya completo y sin cambios queda idéntico", async () => {
    const { personas, totals } = await personasDesde("registro-red-de-escuelas.docx");
    const out = fillRegistroDocx(fx("registro-red-de-escuelas.docx"), personas, totals);
    const a = new PizZip(fx("registro-red-de-escuelas.docx")).file("word/document.xml")!.asText();
    expect(new PizZip(out).file("word/document.xml")!.asText()).toBe(a);
  });

  it("genera el registro desde la plantilla cuando el archivo era PDF", async () => {
    const { r, personas, totals } = await personasDesde("registro-ejemplo.pdf");
    const out = renderRegistro({ evento: r.evento, fecha: r.fecha!, horaCitacion: r.horaCitacion!, horaEvento: r.horaEvento!, personas, totals });
    const again = await parseRegistro("r.docx", out);
    expect(again).toMatchObject({ evento: "EVENTO DE EJEMPLO", fecha: "2026-11-18", horaCitacion: "18:00", horaEvento: "19:30" });
    expect(again.staff).toHaveLength(23);
    expect(again.staff[0]).toMatchObject({ nombre: "Coordinador Ejemplo", cedula: "1000000001", telefono: "3000000001", horas: 6, valor: 60000 });
    expect(paragraphsText(new PizZip(out).file("word/document.xml")!.asText())).not.toMatch(/\{\{/);
  });
});

describe("utilidades", () => {
  it("lee tamaño de PNG y ajusta sin deformar", () => {
    expect(imageSize(firma)!.width).toBeGreaterThan(0);
    expect(fitInBox({ width: 400, height: 100 }, { width: 142, height: 48 })).toEqual([142, 36]);
    expect(fitInBox({ width: 100, height: 100 }, { width: 142, height: 48 })).toEqual([48, 48]);
  });

  it("arma el mensaje de WhatsApp con el día de la semana", () => {
    expect(
      mensajeWhatsapp({ fecha: "2026-11-18", evento: "RED DE ESCUELAS", aforo: 500, observaciones: "El evento transcurrió con normalidad", objetosPerdidos: "ninguno" }),
    ).toBe(
      "*Miércoles 18 de Noviembre: Red de Escuelas*\n\n*Aforo:* 500 personas\n\n*Observaciones:* El evento transcurrió con normalidad\n\n*Objetos perdidos:* ninguno",
    );
    expect(mensajeWhatsapp({ fecha: "2026-11-18", evento: "x", aforo: null, observaciones: "a", objetosPerdidos: "b" })).toContain("*Aforo:* ____ personas");
  });

  it("nombres de archivo con tildes y ñ, sin símbolos", () => {
    expect(nombresArchivo("Colegio Santa María del Rosario", "2026-11-07").llaves).toBe("07_de_Noviembre_COLEGIO_SANTA_MARÍA_DEL_ROSARIO-_LLAVES.docx");
    const n = nombresArchivo("Grados – Mañana", "2026-09-02");
    expect(n.colillas).toBe("02_de_Septiembre_GRADOS_MAÑANA-COLILLAS.docx");
    expect(n.registro).toBe("REGISTRO_GRADOS_MAÑANA.docx");
  });
});
