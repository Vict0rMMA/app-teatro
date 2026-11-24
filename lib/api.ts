import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { adminAppCheck, adminAuth, adminDb } from "./firebase/admin";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface AuthedUser {
  uid: string;
  email?: string;
}

/** Verifica el ID token de Firebase (y App Check si está activo) en cada route handler. */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Inicia sesión para continuar.", "NO_AUTH");

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token, true);
  } catch {
    throw new HttpError(401, "Tu sesión expiró. Vuelve a iniciar sesión.", "TOKEN_INVALIDO");
  }
  if (!decoded.email_verified) {
    throw new HttpError(403, "Verifica tu correo antes de usar la app.", "EMAIL_NO_VERIFICADO");
  }

  const appCheckToken = req.headers.get("x-firebase-appcheck");
  const enforce = process.env.APP_CHECK_ENFORCE === "true";
  if (appCheckToken || enforce) {
    try {
      if (!appCheckToken) throw new Error();
      await adminAppCheck().verifyToken(appCheckToken);
    } catch {
      throw new HttpError(401, "No se pudo verificar la app (App Check). Recarga la página.", "APP_CHECK");
    }
  }
  return { uid: decoded.uid, email: decoded.email };
}

/**
 * Límite por usuario con ventana deslizante, guardado en Firestore para que funcione
 * entre instancias serverless. Las reglas impiden que el cliente lea o escriba "rateLimits".
 */
export async function rateLimit(uid: string, bucket: string, limit: number, windowMs: number) {
  const ref = adminDb().collection("rateLimits").doc(`${uid}_${bucket}`);
  const now = Date.now();
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const hits: number[] = ((snap.data()?.hits as number[]) ?? []).filter((t) => t > now - windowMs);
    if (hits.length >= limit) {
      const retry = Math.ceil((hits[0] + windowMs - now) / 60000);
      throw new HttpError(
        429,
        `Llegaste al límite de ${limit} por hora. Intenta de nuevo en ${retry} min.`,
        "RATE_LIMIT",
      );
    }
    hits.push(now);
    tx.set(ref, { uid, hits, updatedAt: now });
  });
}

export function handleError(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, code: err.code, ...err.extra }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return NextResponse.json(
      { error: `Dato inválido en "${first.path.join(".")}": ${first.message}`, code: "VALIDACION" },
      { status: 400 },
    );
  }
  console.error(err);
  return NextResponse.json({ error: "Ocurrió un error inesperado. Intenta de nuevo.", code: "INTERNO" }, { status: 500 });
}
