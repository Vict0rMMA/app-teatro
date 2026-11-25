import { NextResponse } from "next/server";
import { HttpError, handleError, requireAdmin, requireUser } from "@/lib/api";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "private, no-store, max-age=0" };
const DIA = 24 * 60 * 60 * 1000;

/**
 * Administración: datos de cuenta (no de trabajo) y totales generales de la app.
 * Nunca devuelve eventos, personal, horas, pagos ni la imagen de la firma.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    requireAdmin(user);

    const pageToken = new URL(req.url).searchParams.get("pageToken") || undefined;
    const result = await adminAuth().listUsers(100, pageToken);
    const profiles = result.users.length
      ? await adminDb().getAll(...result.users.map((account) => adminDb().collection("users").doc(account.uid)))
      : [];

    // Totales de toda la app (solo números): planillas generadas este mes.
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const planillasMes = (await adminDb().collection("events").where("createdAt", ">=", inicioMes).count().get()).data().count;

    const ahora = Date.now();
    const users = result.users.map((account, index) => {
      const perfil = profiles[index]?.data();
      const actividad = account.metadata.lastRefreshTime || account.metadata.lastSignInTime || null;
      return {
        uid: account.uid,
        email: account.email ?? "",
        nombre: perfil?.nombre ?? account.displayName ?? "Sin completar perfil",
        emailVerificado: account.emailVerified,
        registradoEn: account.metadata.creationTime,
        ultimoIngreso: account.metadata.lastSignInTime || null,
        ultimaActividad: actividad,
        deshabilitado: account.disabled,
        // Cómo entra: Google o correo y contraseña.
        acceso: account.providerData.map((p) => (p.providerId === "google.com" ? "Google" : p.providerId === "password" ? "Correo" : p.providerId)),
        perfilCompleto: !!perfil?.nombre,
        tieneFirma: !!perfil?.firma,
        activo7d: !!actividad && ahora - new Date(actividad).getTime() < 7 * DIA,
      };
    });

    return NextResponse.json(
      {
        users,
        nextPageToken: result.pageToken ?? null,
        resumen: {
          cuentas: users.length,
          activas7d: users.filter((u) => u.activo7d).length,
          desactivadas: users.filter((u) => u.deshabilitado).length,
          planillasMes,
        },
      },
      { headers: NO_CACHE },
    );
  } catch (err) {
    return handleError(err, new URL(req.url).pathname);
  }
}

/** Desactiva o reactiva una cuenta. No permite desactivar la propia. */
export async function PATCH(req: Request) {
  try {
    const user = await requireUser(req);
    requireAdmin(user);
    const body = (await req.json().catch(() => null)) as { uid?: string; deshabilitado?: boolean } | null;
    if (!body?.uid || typeof body.deshabilitado !== "boolean") throw new HttpError(400, "Datos inválidos.");
    if (body.uid === user.uid) throw new HttpError(400, "No puedes desactivar tu propia cuenta.", "PROPIA_CUENTA");

    await adminAuth().updateUser(body.uid, { disabled: body.deshabilitado });
    // Al desactivar, se cierran sus sesiones abiertas.
    if (body.deshabilitado) await adminAuth().revokeRefreshTokens(body.uid);
    return NextResponse.json({ ok: true }, { headers: NO_CACHE });
  } catch (err) {
    return handleError(err, new URL(req.url).pathname);
  }
}
