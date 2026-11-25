import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "./theme";

/**
 * Pantallas de acceso. Escritorio: columna roja plana a la izquierda y el formulario a la
 * derecha, con un reflector animado muy tenue. Móvil: franja roja con el logo arriba.
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
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(400px,42%)_1fr]">
      <aside className="hidden flex-col bg-[#c8201a] p-12 text-white lg:flex">
        <Link href="/" className="w-fit rounded-ctl bg-white px-3 py-2">
          <Image src="/logo-teatro.png" alt="Teatro Universidad de Medellín" width={240} height={66} className="h-14 w-auto" priority />
        </Link>
        <div className="mt-auto max-w-md">
          <p className="text-[12px] uppercase tracking-[0.14em] text-white/70">Teatro Gabriel Obregón Botero</p>
          <p className="mt-4 font-bold tracking-tight text-[40px] leading-[1.08] tracking-[-0.01em]">
            Antes de que suba el telón, la sala ya está lista.
          </p>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/75">
            Planillas, llaves, colillas y horas de los coordinadores de eventos.
          </p>
        </div>
        <p className="mt-16 text-xs text-white/60">Universidad de Medellín</p>
      </aside>

      <div className="relative isolate flex min-h-dvh flex-col">
        {/* Reflector sobre el escenario (solo escritorio, decorativo) */}
        <div aria-hidden className="escenario -z-10 hidden lg:block">
          <div className="foco" />
          <div className="foco-piso" />
        </div>
        <div className="flex items-center justify-between bg-[#c8201a] px-6 pb-5 pt-[calc(20px+env(safe-area-inset-top))] lg:hidden">
          <Link href="/" className="rounded-ctl bg-white px-2.5 py-1.5">
            <Image src="/logo-teatro.png" alt="Teatro Universidad de Medellín" width={180} height={50} className="h-10 w-auto" priority />
          </Link>
        </div>
        <header className="flex justify-end px-6 pt-5 sm:px-12">
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-start px-6 pb-16 pt-[4vh] sm:px-12 lg:items-center lg:pt-0">
          <div className="w-full max-w-[380px]">
            <h1 className="font-bold tracking-tight text-[30px] leading-[1.1] tracking-[-0.01em]">{title}</h1>
            {description && <p className="mt-2 text-sm text-muted">{description}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 border-t border-border pt-5 text-sm text-muted">{footer}</div>}
          </div>
        </main>

        <footer className="px-6 pb-6 text-xs text-muted sm:px-12">
          <Link href="/privacidad" className="hover:text-fg">
            Aviso de privacidad
          </Link>
        </footer>
      </div>
    </div>
  );
}
