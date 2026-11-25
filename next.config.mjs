/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Identifica cada despliegue: la app abierta lo compara para actualizarse sola (components/actualizador.tsx).
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()) },
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
