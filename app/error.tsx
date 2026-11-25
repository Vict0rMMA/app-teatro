"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Si una pantalla falla en el navegador, en vez de la página blanca de Next ("Application error")
 * se muestra esto, con opción de reintentar. El detalle queda en la consola para revisarlo.
 */
export default function ErrorDePantalla({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[pantalla]", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-2xl font-bold tracking-tight">Algo falló al mostrar esta pantalla</h1>
      <p className="mt-2 text-sm text-muted">Tus datos están bien. Intenta de nuevo; si sigue pasando, recarga la página.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => {
            try {
              sessionStorage.clear(); // copias guardadas de una versión anterior
            } catch {
              /* sin almacenamiento */
            }
            reset();
          }}
          className="h-10 rounded-ctl bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-brand-hover"
        >
          Volver a intentar
        </button>
        <Link href="/planillas" className="inline-flex h-10 items-center rounded-ctl border border-border px-4 text-sm font-medium hover:bg-surface">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
