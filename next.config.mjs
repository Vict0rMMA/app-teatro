/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "firebase-admin"],
    outputFileTracingIncludes: {
      "/api/generate": ["./templates/**/*"],
    },
  },
};

export default nextConfig;
