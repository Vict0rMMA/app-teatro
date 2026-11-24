import fs from "node:fs";
import path from "node:path";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import PizZip from "pizzip";
import { fechaDiaMes, fechaLlaves, formatCOP, formatHoras, hora12, MESES, nombresArchivo, titleCase } from "../format";
import type { RegistroPersona } from "../registro/docx";
import meta from "@/templates/meta.json";

export type TemplateName = "LLAVES" | "COLILLAS" | "EVALUACION";
export type Localidad = "lc" | "ll" | "bc" | "bl";
export const LOCALIDADES: Array<{ key: Localidad; label: string }> = [
  { key: "lc", label: "Luneta centro" },
  { key: "ll", label: "Luneta lateral" },
  { key: "bc", label: "Balcón centro" },
  { key: "bl", label: "Balcón lateral" },
];

export interface PlanillaInput {
  evento: string;
  fecha: string; // YYYY-MM-DD
  horaEvento: string; // HH:mm
  horaCitacion: string; // HH:mm
  coordinador: string;
  /** null = todavía no se sabe: COLILLAS sale con "____" */
  aforo: number | null;
  /** Línea "NOTA:" de LLAVES */
  notaLlaves: string;
  evaluacion: {
    reclamos: string;
    aspectosMejorar: string;
    aspectosPermanecer: string;
    sugerencias: string;
    notas: string[];
  };
  localidades: Partial<Record<Localidad, { boletas: number | null; valor: number | null; observacion: string }>>;
  /** PNG de la firma. Si no hay, el espacio queda en blanco. */
  firma: Buffer | null;
}

export interface GeneratedFile {
  name: string;
  template: TemplateName;
  buffer: Buffer;
}

/** PNG transparente de 1×1: ocupa el recuadro de la firma sin dibujar nada. */
const BLANK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP4//8/AwAI/AL+eMSysAAAAABJRU5ErkJggg==",
  "base64",
);
const UNDERLINE_MEJORAR = "_______________________________________";
const UNDERLINE_PERMANECER = "_________________";

const TEMPLATES_DIR = path.join(process.cwd(), "templates");
const cache = new Map<string, Buffer>();

function loadTemplate(name: string): Buffer {
  let buf = cache.get(name);
  if (!buf) {
    buf = fs.readFileSync(path.join(TEMPLATES_DIR, `${name}.docx`));
    cache.set(name, buf);
  }
  return buf;
}

/** Ancho y alto de un PNG o JPEG leyendo la cabecera. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

export { BLANK_PNG };

export function isPng(buf: Buffer) {
  return buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47;
}

/** Ajusta la firma dentro del recuadro original de la plantilla sin deformarla. */
export function fitInBox(img: { width: number; height: number }, box: { width: number; height: number }): [number, number] {
  const scale = Math.min(box.width / img.width, box.height / img.height);
  return [Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale))];
}

function render(template: string, data: Record<string, unknown>, modules: unknown[] = []): Buffer {
  const doc = new Docxtemplater(new PizZip(loadTemplate(template)), {
    modules: modules as never[],
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: () => "",
  });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

export function renderTemplate(name: TemplateName, data: Record<string, unknown>, firma: Buffer | null): Buffer {
  const box = meta[name].firma;
  const image = firma ?? BLANK_PNG;
  // El módulo trata cualquier objeto como imagen ya resuelta, así que el valor del
  // marcador es un texto y el Buffer sale de aquí.
  const imageModule = new ImageModule({
    centered: false,
    getImage: () => image,
    getSize: (img: Buffer) => {
      if (img === BLANK_PNG) return [box.width, box.height];
      const size = imageSize(img);
      return size ? fitInBox(size, box) : [box.width, box.height];
    },
  });
  return render(name, { ...data, firma: "firma" }, [imageModule]);
}

/**
 * Espacios entre la fecha y "HORA:" en LLAVES. El original trae 31 espacios para
 * "23 de Julio del 2025" + "8:00 PM" + "6:30 PM"; cada carácter extra en negrilla
 * ocupa más o menos dos espacios.
 */
export function espacioFecha(fecha: string, horaEvento: string, horaCitacion: string): string {
  const extra = fecha.length - 20 + (horaEvento.length - 7) + (horaCitacion.length - 7);
  return " ".repeat(Math.max(3, 31 - extra * 2));
}

export function templateData(input: PlanillaInput) {
  const year = input.fecha.slice(0, 4);
  const llavesFecha = fechaLlaves(input.fecha);
  const ev = input.evaluacion;

  const loc: Record<string, string> = {};
  for (const { key } of LOCALIDADES) {
    const l = input.localidades[key];
    const total = l?.boletas != null && l?.valor != null ? l.boletas * l.valor : null;
    loc[`${key}B`] = l?.boletas != null ? l.boletas.toLocaleString("es-CO") : "";
    loc[`${key}V`] = l?.valor != null ? formatCOP(l.valor) : "";
    loc[`${key}T`] = total != null ? formatCOP(total) : "";
    loc[`${key}O`] = l?.observacion?.trim() ?? "";
  }

  return {
    LLAVES: {
      evento: input.evento.trim().toUpperCase(),
      fecha: llavesFecha,
      espacioFecha: espacioFecha(llavesFecha, hora12(input.horaEvento), hora12(input.horaCitacion)),
      horaEvento: hora12(input.horaEvento),
      horaCitacion: hora12(input.horaCitacion),
      coordinador: input.coordinador.trim(),
      nota: input.notaLlaves.trim(),
    },
    COLILLAS: {
      evento: titleCase(input.evento),
      fecha: `${fechaDiaMes(input.fecha)} ${year}`,
      horaEvento: hora12(input.horaEvento),
      aforo: input.aforo != null ? input.aforo.toLocaleString("es-CO") : "____",
      ...loc,
    },
    EVALUACION: {
      evento: titleCase(input.evento),
      fecha: `${fechaDiaMes(input.fecha)} ${year}`,
      horaEvento: hora12(input.horaEvento, true),
      coordinador: input.coordinador.trim(),
      reclamos: ev.reclamos.trim(),
      aspectosMejorar: ev.aspectosMejorar.trim() || UNDERLINE_MEJORAR,
      aspectosPermanecer: ev.aspectosPermanecer.trim() || UNDERLINE_PERMANECER,
      sugerencias: ev.sugerencias.trim(),
      notas: ev.notas.map((n) => n.trim()).filter(Boolean),
    },
  } satisfies Record<TemplateName, Record<string, unknown>>;
}

export function generarPlanillas(input: PlanillaInput): GeneratedFile[] {
  const data = templateData(input);
  const names = nombresArchivo(input.evento, input.fecha);
  return [
    { template: "LLAVES" as const, name: names.llaves },
    { template: "COLILLAS" as const, name: names.colillas },
    { template: "EVALUACION" as const, name: names.evaluacion },
  ].map((f) => ({ ...f, buffer: renderTemplate(f.template, data[f.template], input.firma) }));
}

/** "18 DE NOVIEMBRE 2026", como en los registros del Teatro. */
export function fechaRegistro(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} DE ${MESES[m - 1].toUpperCase()} ${y}`;
}

/** REGISTRO desde /templates/REGISTRO.docx (cuando el archivo subido era PDF o no hubo archivo). */
export function renderRegistro(input: {
  evento: string;
  fecha: string;
  horaCitacion: string;
  horaEvento: string;
  personas: RegistroPersona[];
  totals: { horas: number; valor: number };
}): Buffer {
  return render("REGISTRO", {
    evento: input.evento.trim().toUpperCase(),
    fechaRegistro: fechaRegistro(input.fecha),
    horaCitacion: hora12(input.horaCitacion),
    horaEvento: hora12(input.horaEvento),
    personal: input.personas.map((p, i) => ({
      n: i + 1,
      nombre: p.nombre,
      cedula: p.cedula ?? "",
      ubi: p.ubi ?? "",
      llegada: hora12(p.llegada, true),
      salida: hora12(p.salida, true),
      horas: p.horas == null ? "" : formatHoras(p.horas),
      valor: p.valor == null ? "" : formatCOP(p.valor),
      telefono: p.telefono ?? "",
      cargo: p.cargo,
      pp: p.pp,
      desempeno: p.desempeno,
      cc: p.cc ?? "",
      observacion: p.observacion,
    })),
    totalHoras: formatHoras(input.totals.horas),
    totalValor: formatCOP(input.totals.valor),
  });
}
