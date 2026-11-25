import { NextResponse } from "next/server";
import { handleError, requireAdmin, requireUser } from "@/lib/api";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    requireAdmin(user);

    const pageToken = new URL(req.url).searchParams.get("pageToken") || undefined;
    const result = await adminAuth().listUsers(100, pageToken);
    const profiles = await adminDb().getAll(...result.users.map((account) => adminDb().collection("users").doc(account.uid)));

    return NextResponse.json(
      {
        users: result.users.map((account, index) => ({
          uid: account.uid,
          email: account.email ?? "",
          nombre: profiles[index]?.data()?.nombre ?? account.displayName ?? "Sin completar perfil",
          emailVerificado: account.emailVerified,
          registradoEn: account.metadata.creationTime,
          ultimoIngreso: account.metadata.lastSignInTime || null,
          // Se actualiza cada vez que la app renueva la sesión (al abrirla y mientras se usa).
          ultimaActividad: account.metadata.lastRefreshTime || account.metadata.lastSignInTime || null,
          deshabilitado: account.disabled,
        })),
        nextPageToken: result.pageToken ?? null,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (err) {
    return handleError(err);
  }
}
