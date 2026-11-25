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
  /** Fila de TOTAL del propio consolidado, si venía al pegar: sirve para cruzar la suma. */
  totales?: { horas: number | null; valor: number | null };
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
/** Igual que toMin pero sin lanzar (para ordenar aunque una hora venga mal; ese error ya se reporta). */
const minutos = (h: string): number => {
  try {
    return toMin(h);
  } catch {
    return 0;
  }
};
const nombreMes = (mes: number) => MESES[mes - 1] ?? `mes ${mes}`;
/** Minuto de fin; si la hora de fin es menor o igual que la de inicio, el evento terminó al día siguiente. */
const finMin = (f: Fila) => {
  const ini = minutos(f.hora_inicio), fin = minutos(f.hora_fin);
  return fin <= ini ? fin + 24 * 60 : fin;
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
  const alertas = (d.alertas ?? []).map((a) => `${a.fila !== null ? `Fila ${a.fila + 1}: ` : ""}${a.mensaje}`);
  if (!d.filas.length) errores.push("No hay filas para la cuenta de cobro.");
  if (!(d.mes >= 1 && d.mes <= 12) || !(d.anio >= 2000 && d.anio <= 2100))
    errores.push("No se pudo saber de qué mes es el consolidado. Revisa las fechas.");
  if (!d.persona?.nombre?.trim()) errores.push("Falta el nombre de la persona.");
  if (!/^\d{5,12}$/.test(d.persona?.cedula ?? ""))
    errores.push(`La cédula "${d.persona?.cedula ?? ""}" no es válida: debe tener solo números (5 a 12). Revísala en el consolidado.`);

  const porDia: Record<string, Fila[]> = {};
  const vistos = new Set<string>();

  d.filas.forEach((f, i) => {
    const n = `Fila ${i + 1} (${f.fecha} ${f.evento})`;
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(f.fecha)) errores.push(`${n}: fecha inválida.`);
    const [, mm, aa] = f.fecha.split("/").map(Number);
    if (mm !== d.mes || aa !== d.anio) errores.push(`${n}: la fecha no es de ${nombreMes(d.mes)} ${d.anio}.`);
    try {
      // Si termina a medianoche o después (ej. 18:30–00:00), la hora de fin es del día siguiente.
      let dur = (toMin(f.hora_fin) - toMin(f.hora_inicio)) / 60;
      if (dur <= 0) dur += 24;
      if (dur !== f.horas) errores.push(`${n}: ${f.hora_inicio}–${f.hora_fin} da ${dur} h, pero dice ${f.horas} h.`);
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
    const orden = [...filas].sort((a, b) => minutos(a.hora_inicio) - minutos(b.hora_inicio));
    for (let i = 1; i < orden.length; i++) {
      if (minutos(orden[i].hora_inicio) < finMin(orden[i - 1]))
        errores.push(`${dia}: se cruzan "${orden[i - 1].evento}" y "${orden[i].evento}".`);
    }
  }

  const mapa = new Map<string, Grupo>();
  [...d.filas]
    .sort((a, b) => fechaKey(a.fecha).localeCompare(fechaKey(b.fecha)) || minutos(a.hora_inicio) - minutos(b.hora_inicio))
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

  // Cruce con la fila de TOTAL del propio Excel: si no cuadra, falta o sobra alguna fila.
  if (d.totales?.horas != null && d.totales.horas !== totalHoras)
    errores.push(`La suma de las filas da ${totalHoras} h, pero el total del consolidado dice ${d.totales.horas} h. Revisa que copiaste todas las filas.`);
  if (d.totales?.valor != null && d.totales.valor !== totalValor)
    errores.push(`La suma de las filas da ${pesosSinEspacio(totalValor)}, pero el total del consolidado dice ${pesosSinEspacio(d.totales.valor)}.`);

  const asunto = `Cuenta de cobro ${nombreMes(d.mes).toLowerCase()}`;
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

export type DatosFormato = { consecutivo: string | null; mes: number | null; anio: number | null };

/** Lee del formato DOCX el consecutivo ("N° 2026-10") y el período ("… de Octubre del año 2026"). */
export async function leerFormato(plantilla: ArrayBuffer | Uint8Array): Promise<DatosFormato> {
  const zip = await JSZip.loadAsync(plantilla);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const parrafos = (xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? []).map((p) =>
    [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => decodificarXml(m[1]!)).join(""),
  );
  const texto = parrafos.join("\n");
  const cons = /N°\s*(\d{4})-(\d{2})(A*)/.exec(texto);
  const per = new RegExp(`(${MESES.join("|")})\\s+del\\s+año\\s+(\\d{4})`, "i").exec(texto);
  const mesPer = per ? MESES.findIndex((m) => m.toLowerCase() === per[1]!.toLowerCase()) + 1 : null;
  return {
    consecutivo: cons ? `${cons[1]}-${cons[2]}${cons[3]}` : null,
    mes: mesPer ?? (cons ? Number(cons[2]) : null),
    anio: per ? Number(per[2]) : cons ? Number(cons[1]) : null,
  };
}

/** Mensaje de error si el formato no es del mismo mes que el consolidado; null si cuadra. */
export function revisarFormato(f: DatosFormato, mes: number, anio: number): string | null {
  if (f.mes == null || f.anio == null) return null;
  if (f.mes === mes && f.anio === anio) return null;
  return `El formato es de ${nombreMes(f.mes)} ${f.anio} y el consolidado es de ${nombreMes(mes)} ${anio}. Sube el formato de ${nombreMes(mes).toLowerCase()} que te enviaron (su consecutivo y período no se cambian).`;
}

/** Consecutivo de reenvío: el del formato con una A al final (2026-10 → 2026-10A). */
export const consecutivoReenvio = (f: DatosFormato) => (f.consecutivo ? `${f.consecutivo}A` : null);

export type DatosPersona = {
  nombre: string;
  cedula: string;
  celular: string;
  direccion: string;
  ciudad: string;
  firma?: { data: Uint8Array; tipo: "png" | "jpeg"; anchoPx: number; altoPx: number };
  /** Solo para reenvíos: el consecutivo de la cuenta original con sufijo A. */
  reenvio?: { consecutivo: string };
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function reemplazarUno(x: string, buscar: string, poner: string): string {
  const n = x.split(buscar).length - 1;
  if (n !== 1) throw new Error(`Plantilla: se esperaba 1 vez "${buscar}" y hay ${n}.`);
  return x.replace(buscar, poner);
}

function decodificarXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** Sustituye texto aunque Word lo haya repartido entre varios runs dentro del mismo párrafo. */
function reemplazarTexto(x: string, buscar: string, poner: string, ultimaCoincidencia = false): string {
  const parrafosCoincidentes = [...x.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].filter((m) => {
    const texto = [...m[0]!.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((n) => decodificarXml(n[1]!)).join("");
    return texto.includes(buscar);
  });
  if (!parrafosCoincidentes.length || (!ultimaCoincidencia && parrafosCoincidentes.length !== 1))
    throw new Error(`Plantilla: se esperaba una vez "${buscar}" y hay ${parrafosCoincidentes.length}.`);
  const objetivo = ultimaCoincidencia ? parrafosCoincidentes.at(-1)![0]! : parrafosCoincidentes[0]![0]!;
  const actualizado = x.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (parrafo) => {
    if (parrafo !== objetivo) return parrafo;
    const nodos = [...parrafo.matchAll(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g)];
    const valores = nodos.map((n) => decodificarXml(n[2]!));
    const texto = valores.join("");
    const inicio = texto.indexOf(buscar);
    if (inicio < 0) return parrafo;
    if (texto.indexOf(buscar, inicio + buscar.length) >= 0) throw new Error(`Plantilla: texto repetido "${buscar}".`);
    const fin = inicio + buscar.length;
    let offset = 0;
    const nuevos = valores.map((valor) => {
      const desde = offset;
      const hasta = offset + valor.length;
      offset = hasta;
      const cruza = desde < fin && hasta > inicio;
      if (!cruza) return valor;
      const prefijo = valor.slice(0, Math.max(0, inicio - desde));
      const sufijo = valor.slice(Math.max(0, fin - desde));
      if (desde <= inicio && hasta >= fin) return prefijo + poner + sufijo;
      if (desde <= inicio) return prefijo + poner;
      if (hasta >= fin) return sufijo;
      return "";
    });
    let i = 0;
    return parrafo.replace(/(<w:t[^>]*>)[\s\S]*?(<\/w:t>)/g, (_todo, apertura: string, cierre: string) => {
      const valor = nuevos[i++];
      return `${apertura}${esc(valor ?? "")}${cierre}`;
    });
  });
  return actualizado;
}

function transformarParrafo(x: string, coincide: (texto: string) => boolean, transformar: (texto: string) => string): string {
  let encontrados = 0;
  const actualizado = x.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (parrafo) => {
    const nodos = [...parrafo.matchAll(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g)];
    const texto = nodos.map((n) => decodificarXml(n[2]!)).join("");
    if (!coincide(texto)) return parrafo;
    encontrados++;
    const nuevoTexto = transformar(texto);
    let i = 0;
    return parrafo.replace(/(<w:t[^>]*>)[\s\S]*?(<\/w:t>)/g, (_todo, apertura: string, cierre: string) => {
      return `${apertura}${i++ === 0 ? esc(nuevoTexto) : ""}${cierre}`;
    });
  });
  if (encontrados > 1) throw new Error("Plantilla: hay más de un campo de período o fecha.");
  return actualizado;
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
    ["ANA", p.nombre],
    ["C.C. 1234567891", `C.C. ${p.cedula}`],
    ["$280.000", pesosSinEspacio(v.totalValor)],
    ["Ana Rios", p.nombre],
    ["C.C. 123456789", `C.C. ${p.cedula}`],
    ["3505486602", p.celular],
    ["Avenida 44 # 63- 03", p.direccion],
    ["Bello - Antioquia", p.ciudad],
  ];
  for (const [i, [a, b]] of reemplazos.entries()) x = reemplazarTexto(x, a, b, i === 4);

  if (p.reenvio) x = transformarParrafo(x, (s) => /N°\s*\d{4}-\d{2}A?/.test(s), (s) => s.replace(/N°\s*\d{4}-\d{2}A?/, `N° ${p.reenvio!.consecutivo}`));

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
