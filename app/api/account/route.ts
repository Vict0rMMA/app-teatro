import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, requireUser } from "@/lib/api";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { deleteOwned } from "@/lib/server-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Elimina la cuenta y todos sus datos (derecho de supresión, Ley 1581 de 2012). */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    // El cliente debe enviar { confirm: "ELIMINAR" }: evita borrados por una llamada accidental.
    z.object({ confirm: z.literal("ELIMINAR") }).parse(await req.json().catch(() => ({})));

    for (const c of ["events", "workLogs", "workPlaces", "rateLimits", "reportes", "reporteFotos"]) await deleteOwned(c, user.uid);
    await adminDb().recursiveDelete(adminDb().collection("users").doc(user.uid)); // incluye la firma
    await adminAuth().deleteUser(user.uid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, new URL(req.url).pathname);
  }
}
