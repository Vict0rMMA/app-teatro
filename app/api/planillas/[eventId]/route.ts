import { NextResponse } from "next/server";
import { handleError, requireUser } from "@/lib/api";
import { adminDb } from "@/lib/firebase/admin";
import { ownedEvent } from "@/lib/server-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Elimina la planilla con todo lo conectado: su personal y las horas que generó en Mis horas. */
export async function DELETE(req: Request, { params }: { params: { eventId: string } }) {
  try {
    const user = await requireUser(req);
    const { ref } = await ownedEvent(user.uid, params.eventId);
    const db = adminDb();
    const logs = await db.collection("workLogs").where("uid", "==", user.uid).where("eventId", "==", params.eventId).get();
    const batch = db.batch();
    logs.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    await db.recursiveDelete(ref);
    return NextResponse.json({ ok: true, horasBorradas: logs.size });
  } catch (err) {
    return handleError(err);
  }
}
