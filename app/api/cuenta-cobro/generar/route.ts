import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { HttpError, handleError, requireUser } from "@/lib/api";
import { generarDocx, validar, type DatosPersona, type Extraccion } from "@/lib/cuenta-cobro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    await requireUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    const p = body?.persona;
    if (!body?.datos?.filas?.length || !p?.nombre || !/^\d{5,12}$/.test(p.cedula ?? "") || !p.celular || !p.direccion || !p.ciudad)
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
    const firma = p.firma
      ? { data: Buffer.from(p.firma.base64, "base64"), tipo: p.firma.tipo, anchoPx: p.firma.anchoPx, altoPx: p.firma.altoPx }
      : undefined;
    const docx = await generarDocx(plantilla, v, { ...p, firma });
    return new NextResponse(Buffer.from(docx), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Cuenta de cobro_${p.nombre}.docx`)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
