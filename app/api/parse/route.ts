import { NextResponse } from "next/server";
import { handleError, HttpError, rateLimit, requireSeccion, requireUser } from "@/lib/api";
import { MAX_UPLOAD_BYTES, parseRegistro, RegistroError, sanitizeRegistro } from "@/lib/registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Lee el registro de personal (.docx o .pdf) en memoria. El archivo no se guarda y la
 * respuesta no incluye cédulas ni teléfonos.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await requireSeccion(user, "planillas");
    await rateLimit(user.uid, "parse", 60, 60 * 60 * 1000);

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No se recibió ningún archivo.", "SIN_ARCHIVO");
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "El archivo supera el máximo de 10 MB.", "MUY_GRANDE");
    if (!/\.(docx|pdf)$/i.test(file.name)) {
      throw new HttpError(415, "Solo se aceptan archivos .docx o .pdf.", "TIPO_NO_PERMITIDO");
    }

    try {
      const registro = await parseRegistro(file.name, Buffer.from(await file.arrayBuffer()));
      return NextResponse.json(sanitizeRegistro(registro));
    } catch (err) {
      if (err instanceof RegistroError) {
        // El cliente muestra el formulario manual con estos datos.
        throw new HttpError(422, err.message, err.code, { manual: true });
      }
      throw err;
    }
  } catch (err) {
    return handleError(err, new URL(req.url).pathname);
  }
}
