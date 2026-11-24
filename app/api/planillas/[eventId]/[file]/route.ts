import PizZip from "pizzip";
import { HttpError, handleError, requireUser } from "@/lib/api";
import { adminBucket } from "@/lib/firebase/admin";
import { ownedEvent } from "@/lib/server-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const KEYS = { llaves: "LLAVES", colillas: "COLILLAS", evaluacion: "EVALUACION" } as const;

function attachment(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Descarga una planilla (llaves | colillas | evaluacion) o las tres en .zip. */
export async function GET(req: Request, { params }: { params: { eventId: string; file: string } }) {
  try {
    const user = await requireUser(req);
    const { data } = await ownedEvent(user.uid, params.eventId);
    const bucket = adminBucket();

    if (params.file === "zip") {
      const zip = new PizZip();
      for (const f of data.files) {
        const [buf] = await bucket.file(f.path).download();
        zip.file(f.name, buf);
      }
      const base = data.files[0]?.name.replace(/-_?LLAVES\.docx$/, "") ?? "planillas";
      const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
      return new Response(new Uint8Array(out), {
        headers: { "Content-Type": "application/zip", "Content-Disposition": attachment(`${base}.zip`), "Cache-Control": "private, no-store" },
      });
    }

    const template = KEYS[params.file as keyof typeof KEYS];
    const f = template && data.files.find((x) => x.template === template);
    if (!f) throw new HttpError(404, "Archivo no encontrado.", "NO_ENCONTRADO");
    const [buf] = await bucket.file(f.path).download();
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": DOCX, "Content-Disposition": attachment(f.name), "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return handleError(err);
  }
}
