import PizZip from "pizzip";
import { handleError, HttpError, requireSeccion, requireUser } from "@/lib/api";
import { planillasDeEvento, registroDeEvento } from "@/lib/planillas-evento";
import { eventStaff, loadFirma, ownedEvent } from "@/lib/server-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const KEYS = { llaves: "LLAVES", colillas: "COLILLAS", evaluacion: "EVALUACION" } as const;

function attachment(name: string) {
  const ascii = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function send(buf: Buffer, type: string, name: string) {
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": type, "Content-Disposition": attachment(name), "Cache-Control": "private, no-store" },
  });
}

/**
 * Regenera y descarga una planilla guardada: llaves | colillas | evaluacion | registro | zip.
 * Los .docx no se almacenan; se arman con los datos del evento.
 */
export async function GET(req: Request, { params }: { params: { eventId: string; file: string } }) {
  try {
    const user = await requireUser(req);
    await requireSeccion(user, "planillas");
    const { data } = await ownedEvent(user.uid, params.eventId);
    const needsPlanillas = params.file !== "registro";
    const needsStaff = params.file === "registro" || params.file === "zip";
    const [firma, staff] = await Promise.all([needsPlanillas && !data.firmaEvento ? loadFirma(user.uid) : null, needsStaff ? eventStaff(params.eventId) : []]);

    if (params.file === "registro") {
      const r = registroDeEvento(data, staff);
      return send(r.buffer, DOCX, r.name);
    }

    const files = planillasDeEvento(data, firma);
    if (params.file === "zip") {
      const zip = new PizZip();
      for (const f of files) zip.file(f.name, f.buffer);
      const r = registroDeEvento(data, staff);
      zip.file(r.name, r.buffer);
      const base = files[0].name.replace(/-_LLAVES\.docx$/, "");
      return send(zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer, "application/zip", `PLANILLAS_${base}.zip`);
    }

    const template = KEYS[params.file as keyof typeof KEYS];
    const f = template && files.find((x) => x.template === template);
    if (!f) throw new HttpError(404, "Archivo no encontrado.", "NO_ENCONTRADO");
    return send(f.buffer, DOCX, f.name);
  } catch (err) {
    return handleError(err, new URL(req.url).pathname);
  }
}
