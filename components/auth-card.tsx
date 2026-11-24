import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "./theme";

/**
 * Pantallas de acceso: un bloque rojo institucional plano a la izquierda (escritorio)
 * y el formulario sobre fondo liso. Sin degradados ni adornos.
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
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(380px,40%)_1fr]">
      <aside className="hidden flex-col justify-between bg-[#c8201a] p-10 text-white lg:flex">
        <Link href="/" className="w-fit rounded bg-white px-2 py-1.5">
          <Image src="/logo-teatro.png" alt="Teatro Universidad de Medellín" width={150} height={42} className="h-8 w-auto" priority />
        </Link>
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-white/70">Teatro Gabriel Obregón Botero</p>
          <p className="mt-3 max-w-sm text-3xl font-bold leading-snug">Planillas y horas de los coordinadores de eventos.</p>
        </div>
        <p className="text-xs text-white/60">Universidad de Medellín</p>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <div className="h-1 bg-[#c8201a] lg:hidden" />
        <header className="flex items-center justify-between px-6 py-5 sm:px-10">
          <Link href="/" className="lg:invisible">
            <Image
              src="/logo-teatro.png"
              alt="Teatro Universidad de Medellín"
              width={110}
              height={30}
              className="h-7 w-auto dark:rounded dark:bg-white dark:px-1 dark:py-0.5"
              priority
            />
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-start justify-center px-6 pb-16 pt-[6vh] sm:px-10 lg:items-center lg:pt-0">
          <div className="w-full max-w-[360px] animate-fade-up">
            <h1 className="text-2xl font-bold">{title}</h1>
            {description && <p className="mt-2 text-sm text-muted">{description}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 text-sm text-muted">{footer}</div>}
          </div>
        </main>

        <footer className="px-6 pb-6 text-xs text-faint sm:px-10">
          <Link href="/privacidad" className="hover:text-muted">
            Aviso de privacidad
          </Link>
        </footer>
      </div>
    </div>
  );
}
