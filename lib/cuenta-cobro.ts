import JSZip from "jszip";

export type Fila = {
  dependencia: string;
  fecha: string; // DD/MM/AAAA
  evento: string;
  labor?: string;
  hora_inicio: string; // HH:MM 24h
  hora_fin: string;
  horas: number;
  valor_hora: number;
  total: number;
  centro_costos: string;
  cuenta: string;
  proyecto: string;
};

export type Alerta = { tipo: string; fila: number | null; mensaje: string };

export type Extraccion = {
  persona: { nombre: string; cedula: string };
  mes: number;
  anio: number;
  filas: Fila[];
  alertas: Alerta[];
};

export type Grupo = { centro: string; nombre: string; filas: Fila[]; horas: number; valor: number };

export type Validacion = {
  ok: boolean;
  errores: string[];
  alertas: string[];
  grupos: Grupo[];
  totalHoras: number;
  totalValor: number;
  horasPorDia: Record<string, number>;
  correo: { para: string; asunto: string; archivo: string };
};

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MAX_HORAS_DIA = 8;
const MAX_ASUNTO = 60;

const toMin = (h: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(h.trim());
  if (!m) throw new Error(`Hora inválida: "${h}"`);
  return Number(m[1]) * 60 + Number(m[2]);
};

const fechaKey = (f: string) => f.split("/").reverse().join("");
const pesos = (n: number) => `$ ${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
const pesosSinEspacio = (n: number) => `$${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
export const hora12 = (h: string) => {
  const t = toMin(h), hh = Math.floor(t / 60), mm = t % 60;
  return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "p" : "a"}.m.`;
};

export function validar(d: Extraccion): Validacion {
  const errores: string[] = [];
  const alertas = d.alertas.map((a) => `${a.fila !== null ? `Fila ${a.fila + 1}: ` : ""}${a.mensaje}`);
  if (!d.filas.length) errores.push("No hay filas para la cuenta de cobro.");

  const porDia: Record<string, Fila[]> = {};
  const vistos = new Set<string>();

  d.filas.forEach((f, i) => {
    const n = `Fila ${i + 1} (${f.fecha} ${f.evento})`;
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(f.fecha)) errores.push(`${n}: fecha inválida.`);
    const [, mm, aa] = f.fecha.split("/").map(Number);
    if (mm !== d.mes || aa !== d.anio) errores.push(`${n}: la fecha no es de ${MESES[d.mes - 1]} ${d.anio}.`);
    try {
      const dur = (toMin(f.hora_fin) - toMin(f.hora_inicio)) / 60;
      if (dur <= 0) errores.push(`${n}: la hora fin es menor o igual a la de inicio.`);
      else if (dur !== f.horas) errores.push(`${n}: ${f.hora_inicio}–${f.hora_fin} da ${dur} h, pero dice ${f.horas} h.`);
    } catch (e) {
      errores.push(`${n}: ${(e as Error).message}`);
    }
    if (f.horas * f.valor_hora !== f.total) errores.push(`${n}: ${f.horas} h × ${f.valor_hora} ≠ ${f.total}.`);
    if (!/^\d{8}\s*-\s*\d{6}$/.test(f.centro_costos.trim())) alertas.push(`${n}: centro de costos con formato inusual "${f.centro_costos}".`);
    const k = [f.fecha, f.evento, f.hora_inicio, f.centro_costos].join("|");
    if (vistos.has(k)) errores.push(`${n}: fila duplicada.`);
    vistos.add(k);
    (porDia[f.fecha] ??= []).push(f);
  });

  const horasPorDia: Record<string, number> = {};
  for (const [dia, filas] of Object.entries(porDia)) {
    const h = filas.reduce((s, f) => s + f.horas, 0);
    horasPorDia[dia] = h;
    if (h > MAX_HORAS_DIA) errores.push(`${dia}: suma ${h} h (máximo ${MAX_HORAS_DIA} h/día salvo evento autorizado).`);
    const orden = [...filas].sort((a, b) => toMin(a.hora_inicio) - toMin(b.hora_inicio));
    for (let i = 1; i < orden.length; i++) {
      if (toMin(orden[i].hora_inicio) < toMin(orden[i - 1].hora_fin))
        errores.push(`${dia}: se cruzan "${orden[i - 1].evento}" y "${orden[i].evento}".`);
    }
  }

  const mapa = new Map<string, Grupo>();
  [...d.filas]
    .sort((a, b) => fechaKey(a.fecha).localeCompare(fechaKey(b.fecha)) || toMin(a.hora_inicio) - toMin(b.hora_inicio))
    .forEach((f) => {
      const c = f.centro_costos.replace(/\D/g, "").slice(0, 8);
      const g = mapa.get(c) ?? { centro: c, nombre: f.dependencia, filas: [], horas: 0, valor: 0 };
      g.filas.push(f);
      g.horas += f.horas;
      g.valor += f.total;
      mapa.set(c, g);
    });
  const grupos = [...mapa.values()];
  const totalHoras = grupos.reduce((s, g) => s + g.horas, 0);
  const totalValor = grupos.reduce((s, g) => s + g.valor, 0);

  const asunto = `Cuenta de cobro ${MESES[d.mes - 1].toLowerCase()}`;
  if (asunto.length > MAX_ASUNTO) errores.push("El asunto supera 60 caracteres.");

  return {
    ok: errores.length === 0,
    errores,
    alertas,
    grupos,
    totalHoras,
    totalValor,
    horasPorDia,
    correo: {
      para: "facturacionelectronica@udemedellin.edu.co",
      asunto,
      archivo: `Cuenta de cobro_${d.persona.nombre}.pdf`,
    },
  };
}

export type DatosPersona = {
  nombre: string;
  cedula: string;
  celular: string;
  direccion: string;
  ciudad: string;
  firma?: { data: Uint8Array; tipo: "png" | "jpeg"; anchoPx: number; altoPx: number };
  /** Solo para reenvíos: fecha de hoy y consecutivo con sufijo (ej. "2026-10A"). */
  reenvio?: { fecha: string; consecutivo: string };
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function reemplazarUno(x: string, buscar: string, poner: string): string {
  const n = x.split(buscar).length - 1;
  if (n !== 1) throw new Error(`Plantilla: se esperaba 1 vez "${buscar}" y hay ${n}.`);
  return x.replace(buscar, poner);
}

function llenarFila(fila: string, valores: string[]): string {
  let r = fila.replace(/ w14:(paraId|textId)="\w+"/g, "").replace("<w:trPr>", "<w:trPr><w:cantSplit/>");
  const celdas = r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
  if (celdas.length !== valores.length) throw new Error("Plantilla: número de columnas inesperado.");
  celdas.forEach((c, i) => {
    const p = /<w:p[ >][\s\S]*?<\/w:p>/.exec(c)![0];
    const pPr = /^<w:p[ >][\s\S]*?<\/w:pPr>/.exec(p)![0];
    const rPr = /<w:r[ >][\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)/.exec(p)![1];
    r = r.replace(c, c.replace(p, `${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(valores[i])}</w:t></w:r></w:p>`));
  });
  return r;
}

/** Llena la plantilla normalizada (plantilla/cuenta_cobro_base.docx) y devuelve el .docx. */
export async function generarDocx(plantilla: ArrayBuffer | Uint8Array, v: Validacion, p: DatosPersona): Promise<Uint8Array> {
  if (!v.ok) throw new Error("La cuenta tiene errores de validación; corrígelos antes de generar.");
  const zip = await JSZip.loadAsync(plantilla);
  let x = await zip.file("word/document.xml")!.async("string");

  const t0 = x.indexOf("<w:tbl>"), t1 = x.indexOf("</w:tbl>") + 8;
  const tbl = x.slice(t0, t1);
  const filas = tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];
  if (filas.length < 10) throw new Error("Plantilla: tabla con estructura inesperada.");
  const [encabezado, filaDato, filaSubtotal] = [filas[0]!, filas[7]!, filas[9]!];

  const cuerpo = v.grupos.flatMap((g) => [
    ...g.filas.map((f) =>
      llenarFila(filaDato, [f.evento, f.fecha, f.dependencia, f.centro_costos, f.cuenta, f.proyecto, pesosSinEspacio(f.valor_hora), hora12(f.hora_inicio), hora12(f.hora_fin), String(f.horas), pesos(f.total)]),
    ),
    llenarFila(filaSubtotal, [`SUBTOTAL ${g.nombre.toUpperCase()}`, String(g.horas), pesos(g.valor)]),
  ]);
  x = x.slice(0, t0) + tbl.slice(0, tbl.indexOf(encabezado)) + filas.slice(0, 2).join("") + cuerpo.join("") + "</w:tbl>" + x.slice(t1);

  const reemplazos: [string, string][] = [
    [">ANA<", `>${esc(p.nombre)}<`],
    ["C.C. 1234567891", `C.C. ${esc(p.cedula)}`],
    [">$280.000<", `>${pesosSinEspacio(v.totalValor)}<`],
    [">Ana Rios<", `>${esc(p.nombre)}<`],
    [">123456789<", `>${esc(p.cedula)}<`],
    [">3505486602<", `>${esc(p.celular)}<`],
    [">Avenida 44 # 63- 03<", `>${esc(p.direccion)}<`],
    [">Bello - Antioquia<", `>${esc(p.ciudad)}<`],
  ];
  for (const [a, b] of reemplazos) x = reemplazarUno(x, a, b);

  if (p.reenvio) {
    x = x.replace(/Medellín, \d{1,2} de [A-Za-zÁÉÍÓÚáéíóú]+ de \d{4}/, `Medellín, ${esc(p.reenvio.fecha)}`);
    x = x.replace(/<w:t>\d{4}-\d{2}A?<\/w:t>/, `<w:t>${esc(p.reenvio.consecutivo)}</w:t>`);
  }

  if (p.firma) {
    const ext = p.firma.tipo;
    zip.file(`word/media/firma.${ext}`, p.firma.data);
    const relsPath = "word/_rels/document.xml.rels";
    const rels = await zip.file(relsPath)!.async("string");
    zip.file(relsPath, rels.replace("</Relationships>", `<Relationship Id="rIdFirma" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/firma.${ext}"/></Relationships>`));
    const ctPath = "[Content_Types].xml";
    let ct = await zip.file(ctPath)!.async("string");
    if (!ct.includes(`Extension="${ext}"`)) ct = ct.replace('<Default Extension="xml"', `<Default Extension="${ext}" ContentType="image/${ext}"/><Default Extension="xml"`);
    zip.file(ctPath, ct);
    const anchoEmu = 2_000_000, altoEmu = Math.round((anchoEmu * p.firma.altoPx) / p.firma.anchoPx);
    const img =
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${anchoEmu}" cy="${altoEmu}"/><wp:docPr id="501" name="Firma"/><wp:cNvGraphicFramePr/>` +
      `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="501" name="firma.${ext}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="rIdFirma"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${anchoEmu}" cy="${altoEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    x = reemplazarUno(x, "<w:r><w:rPr><w:noProof/></w:rPr><w:t>PONER FIRMA DIGITAL (NO PUEDE SER FOTO)</w:t></w:r>", img);
  }

  // Bloque de firma sin partirse entre páginas
  const a = x.lastIndexOf("<w:p ", x.indexOf("Declaro bajo gravedad"));
  const b = x.indexOf("Ciudad:");
  if (a > 0 && b > a) {
    const seg = x.slice(a, b)
      .replace(/(<w:p [^>]*>)<w:pPr>/g, "$1<w:pPr><w:keepNext/><w:keepLines/>")
      .replace(/(<w:p [^>]*>)(?!<w:pPr>)/g, "$1<w:pPr><w:keepNext/></w:pPr>");
    x = x.slice(0, a) + seg + x.slice(b);
  }

  // Todo en negro
  x = x.replace(/w:color w:val="(EE0000|FF0000|C00000)"/g, 'w:color w:val="000000"');

  zip.file("word/document.xml", x);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
