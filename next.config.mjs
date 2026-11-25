/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
