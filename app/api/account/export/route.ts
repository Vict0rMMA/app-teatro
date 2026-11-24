import { NextResponse } from "next/server";
import { handleError, requireUser } from "@/lib/api";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function plain(value: unknown): unknown {
  if (value && typeof value === "object") {
    if ("toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if (Array.isArray(value)) return value.map(plain);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

/** Exporta todos los datos del usuario en JSON (derecho de acceso, Ley 1581 de 2012). */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const db = adminDb();
    const byUid = (c: string) => db.collection(c).where("uid", "==", user.uid).get();

    const [profile, events, workLogs, workPlaces] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      byUid("events"),
      byUid("workLogs"),
      byUid("workPlaces"),
    ]);
    const eventos = await Promise.all(
      events.docs.map(async (e) => ({
        id: e.id,
        ...(plain(e.data()) as object),
        personal: (await e.ref.collection("staff").orderBy("orden").get()).docs.map((s) => plain(s.data())),
      })),
    );

    const data = {
      exportadoEl: new Date().toISOString(),
      cuenta: { uid: user.uid, email: user.email },
      perfil: plain(profile.data() ?? null),
      lugaresDeTrabajo: workPlaces.docs.map((d) => ({ id: d.id, ...(plain(d.data()) as object) })),
      horas: workLogs.docs.map((d) => ({ id: d.id, ...(plain(d.data()) as object) })),
      eventos,
    };
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="planillas-teatro-mis-datos.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
