import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { handleError, HttpError, requireSeccion, requireUser } from "@/lib/api";
import { consecutivoReenvio, generarDocx, leerFormato, revisarFormato, validar, type DatosPersona, type Extraccion } from "@/lib/cuenta-cobro";
import { convertirDocxAPdf } from "@/lib/gotenberg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  datos: Extraccion; // lo que devolvió /api/cuenta-cobro (ya revisado por el usuario)
  plantilla?: { base64: string };
  persona: Omit<DatosPersona, "firma"> & {
    firma?: { base64: string; tipo: "png" | "jpeg"; anchoPx: number; altoPx: number };
  };
};

/** Genera el .docx en memoria. Nada se guarda: ni la cuenta, ni la cédula, ni el celular. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const [, body] = (await Promise.all([requireSeccion(user, "cobro"), req.json().catch(() => null)])) as [void, Body | null];
    const pdf = new URL(req.url).searchParams.get("format") === "pdf";
    if (pdf && !process.env.GOTENBERG_URL) throw new HttpError(503, "La conversión a PDF requiere configurar Gotenberg en el servidor.", "PDF_NO_CONFIGURADO");
    const p = body?.persona;
    if (!body?.datos?.filas?.length || !p?.nombre?.trim() || !/^\d{5,12}$/.test(p.cedula ?? "") || !p.celular || !p.direccion || !p.ciudad)
      throw new HttpError(400, "Faltan datos: nombre, cédula, celular, dirección o ciudad.");
    if (p.firma && (p.firma.base64.length > 700_000 || !(p.firma.anchoPx > 0) || !(p.firma.altoPx > 0)))
      throw new HttpError(413, "La firma es demasiado grande.");

    const v = validar(body.datos); // se revalida en el servidor: nunca confiar en el cliente
    if (!v.ok) throw new HttpError(422, "La cuenta tiene errores.", "VALIDACION_CUENTA", { errores: v.errores });

    let plantilla: Uint8Array;
    if (body.plantilla?.base64) {
      if (body.plantilla.base64.length > 2_800_000) throw new HttpError(413, "El formato DOCX supera el límite de 2 MB.");
      plantilla = Buffer.from(body.plantilla.base64, "base64");
      if (plantilla.length < 4 || plantilla[0] !== 0x50 || plantilla[1] !== 0x4b)
        throw new HttpError(415, "El formato seleccionado no es un archivo DOCX válido.");
    } else {
      plantilla = await readFile(path.join(process.cwd(), "plantilla", "cuenta_cobro_base.docx"));
    }
    // El consecutivo y el período del formato no se cambian: el formato tiene que ser del mismo mes.
    const formato = await leerFormato(plantilla).catch(() => null);
    if (!formato) throw new HttpError(415, "No se pudo leer el formato DOCX.", "FORMATO_INVALIDO");
    const otroMes = revisarFormato(formato, body.datos.mes, body.datos.anio);
    if (otroMes) throw new HttpError(422, otroMes, "FORMATO_OTRO_MES");
    // Reenvío: el consecutivo es el del formato con A al final; no se escribe a mano.
    const reenvio = p.reenvio ? consecutivoReenvio(formato) : null;
    if (p.reenvio && !reenvio) throw new HttpError(422, "El formato no tiene consecutivo (N° AAAA-MM) para el reenvío.", "FORMATO_SIN_CONSECUTIVO");

    const firma = p.firma
      ? { data: Buffer.from(p.firma.base64, "base64"), tipo: p.firma.tipo, anchoPx: p.firma.anchoPx, altoPx: p.firma.altoPx }
      : undefined;
    const docx = await generarDocx(plantilla, v, { ...p, firma, reenvio: reenvio ? { consecutivo: reenvio } : undefined });
    const nombreLimpio = p.nombre.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
    const nombre = `Cuenta de cobro_${nombreLimpio}`;
    const salida = pdf ? await convertirDocxAPdf(docx, nombre) : docx;
    return new NextResponse(Buffer.from(salida), {
      headers: {
        "Content-Type": pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${nombre}.${pdf ? "pdf" : "docx"}`)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err, new URL(req.url).pathname);
  }
}
