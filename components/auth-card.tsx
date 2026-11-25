import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { EscenarioFondo, EscenarioTelon } from "./escenario";

/**
 * Pantallas de acceso. Escritorio: columna roja de marca a la izquierda y, a la derecha, un
 * escenario: el telón se recoge a los lados, el foco enciende y el formulario queda bajo la luz en
 * una tarjeta de vidrio oscuro. En móvil el escenario ocupa toda la pantalla. Siempre oscuro.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(360px,34%)_1fr]">
      <aside className="hidden flex-col bg-[#c8201a] p-12 text-white lg:flex">
        <Link href="/" className="w-fit rounded-ctl bg-white px-3 py-2">
          <Image src="/logo-teatro-udem.png" alt="Teatro Universidad de Medellín" width={252} height={80} className="h-14 w-auto" priority />
        </Link>
        <div className="mt-auto max-w-md">
          <p className="text-[12px] uppercase tracking-[0.14em] text-white/70">Teatro Gabriel Obregón Botero</p>
          <p className="mt-4 text-[36px] font-bold leading-[1.1] tracking-tight">Antes de que suba el telón, la sala ya está lista.</p>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/75">Planillas, llaves, colillas y horas de los coordinadores de eventos.</p>
        </div>
        <p className="mt-16 text-xs text-white/60">Universidad de Medellín</p>
      </aside>

      {/* La clase "dark" fija los colores oscuros solo dentro del escenario. */}
      <div className="dark relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#070404] text-fg">
        <EscenarioFondo />

        <Link href="/" className="relative z-40 ml-6 mt-[calc(92px+env(safe-area-inset-top))] w-fit rounded-ctl bg-white px-2.5 py-1.5 lg:hidden">
          <Image src="/logo-teatro-udem.png" alt="Teatro Universidad de Medellín" width={151} height={48} className="h-8 w-auto" priority />
        </Link>

        <main className="relative z-10 flex flex-1 items-center justify-center px-5 pb-16 pt-8 lg:pt-24">
          <div className="escena-tarjeta w-full max-w-[400px] p-7 sm:p-8">
            <div className="escena-entra">
              <h1 className="text-[28px] font-bold leading-[1.1] tracking-tight">{title}</h1>
              {description && <p className="mt-2 text-sm text-muted">{description}</p>}
              <div className="mt-7">{children}</div>
              {footer && <div className="mt-7 border-t border-white/10 pt-5 text-sm text-muted">{footer}</div>}
            </div>
          </div>
        </main>

        <footer className="relative z-10 px-6 pb-6 text-center text-xs text-muted">
          <Link href="/privacidad" className="hover:text-fg">
            Aviso de privacidad
          </Link>
        </footer>

        <EscenarioTelon />
      </div>
    </div>
  );
}
