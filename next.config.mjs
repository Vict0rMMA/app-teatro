/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Identifica cada despliegue: la app abierta lo compara para actualizarse sola (components/actualizador.tsx).
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()) },
  // Inicio de sesión con Google por el dominio de la app (no por <proyecto>.firebaseapp.com):
  // /__/auth/* se reenvía a Firebase. Se activa poniendo NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = dominio de la app
  // y agregando https://<dominio>/__/auth/handler como URI de redirección en el cliente OAuth de Google Cloud.
  async rewrites() {
    const proyecto = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!proyecto) return [];
    return [
      { source: "/__/auth/:path*", destination: `https://${proyecto}.firebaseapp.com/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `https://${proyecto}.firebaseapp.com/__/firebase/:path*` },
    ];
  },
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "firebase-admin"],
    // Las rutas que generan .docx leen /templates en tiempo de ejecución.
    outputFileTracingIncludes: {
      "/api/generate": ["./templates/**/*"],
      "/api/planillas/[eventId]/[file]": ["./templates/**/*"],
      "/api/cuenta-cobro/generar": ["./plantilla/**/*"],
    },
  },
};

export default nextConfig;
