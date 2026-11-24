import { NextResponse } from "next/server";
import { handleError, requireUser } from "@/lib/api";
import { adminDb } from "@/lib/firebase/admin";
import { ownedEvent } from "@/lib/server-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Elimina la planilla con sus archivos y su personal. Las horas registradas se conservan. */
export async function DELETE(req: Request, { params }: { params: { eventId: string } }) {
  try {
    const user = await requireUser(req);
    const { ref } = await ownedEvent(user.uid, params.eventId);
    await adminDb().recursiveDelete(ref);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
