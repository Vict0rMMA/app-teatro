import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { ServiceWorker } from "@/components/service-worker";
import { themeScript } from "@/components/theme";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Serif solo para h1, nombre del evento y totales.
const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif", display: "swap", axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: "Planillas Teatro", template: "%s · Planillas Teatro" },
  description: "Planillas y control de horas para coordinadores del Teatro Universidad de Medellín.",
  applicationName: "Planillas Teatro",
  appleWebApp: { capable: true, title: "Planillas", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF7F2" },
    { media: "(prefers-color-scheme: dark)", color: "#12100E" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${sans.variable} ${serif.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
