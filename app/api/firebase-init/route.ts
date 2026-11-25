import { NextResponse } from "next/server";

/**
 * Configuración pública de Firebase para la página de inicio de sesión de Google (/__/auth/handler)
 * cuando se sirve desde el dominio de la app. Firebase la busca en /__/firebase/init.json, que solo
 * existe con Firebase Hosting; aquí se entrega con los mismos datos públicos que ya van en la página.
 */
export function GET(req: Request) {
  const host = new URL(req.url).host;
  return NextResponse.json(
    {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: host,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
