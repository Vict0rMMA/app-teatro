import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { ServiceWorker } from "@/components/service-worker";
import { themeScript } from "@/components/theme";
import { ToastProvider } from "@/components/toast";
import "./globals.css";


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
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
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
