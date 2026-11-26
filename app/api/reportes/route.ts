import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { HttpError, handleError, rateLimit, requireAdmin, requireUser } from "@/lib/api";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "private, no-store, max-age=0" };

const nuevoSchema = z.object({
  mensaje: z.string().trim().min(5, "Cuéntanos un poco más.").max(1000, "Máximo 1000 caracteres."),
  pagina: z.string().trim().max(120).default(""),
});

/** Quita cédulas y celulares que alguien escriba por error en el mensaje (nunca se guardan). */
function sinDatosPersonales(texto: string) {
  return texto.replace(/\+?\d[\d .-]{6,}\d/g, "[número oculto]");
}

/** Navegador y sistema en pocas palabras (sirve para reproducir el error). */
function navegador(ua: string) {
  const so = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : "Otro";
  const nav = /OPR\/|Opera/i.test(ua) ? "Opera" : /Edg\//i.test(ua) ? "Edge" : /Chrome\//i.test(ua) ? "Chrome" : /Firefox\//i.test(ua) ? "Firefox" : /Safari\//i.test(ua) ? "Safari" : "Otro";
  return `${nav} · ${so}`;
}

/** Cualquier cuenta: envía un reporte. Solo lo lee la administradora. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const [, body] = await Promise.all([rateLimit(user.uid, "reportes", 10, 60 * 60 * 1000), req.json().catch(() => null)]);
    if (!body) throw new HttpError(400, "Solicitud inválida.");
    const input = nuevoSchema.parse(body);
    const perfil = await adminDb().collection("users").doc(user.uid).get();
    await adminDb()
      .collection("reportes")
      .add({
        uid: user.uid,
        nombre: String(perfil.data()?.nombre ?? "").slice(0, 120),
        email: user.email ?? "",
        pagina: input.pagina,
        mensaje: sinDatosPersonales(input.mensaje),
        navegador: navegador(req.headers.get("user-agent") ?? ""),
        resuelto: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    return NextResponse.json({ ok: true }, { headers: NO_CACHE });
  } catch (err) {
    return handleError(err, "POST /api/reportes");
  }
}

/** Administradora: últimos reportes. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    requireAdmin(user);
    const snap = await adminDb().collection("reportes").orderBy("createdAt", "desc").limit(50).get();
    const reportes = snap.docs.map((d) => {
      const r = d.data();
      return {
        id: d.id,
        nombre: r.nombre as string,
        email: r.email as string,
        pagina: r.pagina as string,
        mensaje: r.mensaje as string,
        navegador: r.navegador as string,
        resuelto: !!r.resuelto,
        creado: (r.createdAt as Timestamp | undefined)?.toMillis() ?? null,
      };
    });
    return NextResponse.json({ reportes }, { headers: NO_CACHE });
  } catch (err) {
    return handleError(err, "GET /api/reportes");
  }
}

/** Administradora: marcar resuelto / pendiente, o borrar. */
export async function PATCH(req: Request) {
  try {
    const user = await requireUser(req);
    requireAdmin(user);
    const { id, resuelto, borrar } = z
      .object({ id: z.string().min(1).max(64), resuelto: z.boolean().optional(), borrar: z.boolean().optional() })
      .parse(await req.json().catch(() => ({})));
    const ref = adminDb().collection("reportes").doc(id);
    if (borrar) await ref.delete();
    else await ref.update({ resuelto: !!resuelto });
    return NextResponse.json({ ok: true }, { headers: NO_CACHE });
  } catch (err) {
    return handleError(err, "PATCH /api/reportes");
  }
}
