import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "./theme";

/** Rejilla fina que se desvanece hacia los bordes. */
function Grid({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
        backgroundSize: "44px 44px",
        maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 75%)",
      }}
    />
  );
}

/** Panel de marca: negro, blanco y rojo institucional de la Universidad de Medellín. */
function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-[#0a0a0b] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
      <Grid className="text-white/[0.06]" />
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#c8201a] opacity-40 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 right-[-120px] h-[460px] w-[460px] rounded-full bg-[#e3342b] opacity-25 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-[#c8201a]/60 to-transparent" />

      <Link href="/" className="relative inline-flex w-fit rounded-md bg-white px-2.5 py-1.5 shadow-[0_8px_30px_-8px_rgba(200,32,26,0.6)]">
        <Image src="/logo-teatro.png" alt="Teatro Universidad de Medellín" width={150} height={42} className="h-8 w-auto" priority />
      </Link>

      <div className="relative max-w-xl">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          <span className="h-1.5 w-1.5 rounded-full bg-[#e3342b]" />
          Teatro Gabriel Obregón Botero
        </p>
        <h2 className="text-[2.5rem] font-semibold leading-[1.08] tracking-tight xl:text-5xl">
          Planillas, registro y horas.
          <span className="block text-[#ef4a40]">En un solo lugar.</span>
        </h2>
        <ul className="mt-8 space-y-3 text-sm text-white/65">
          {[
            "Sube el registro de personal y obtén las 4 planillas listas.",
            "Llegadas, salidas y pagos calculados en vivo.",
            "Tus horas por mes y por lugar, siempre a mano.",
          ].map((t) => (
            <li key={t} className="flex gap-3">
              <span className="mt-[7px] h-px w-4 shrink-0 bg-[#e3342b]" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-white/40">Universidad de Medellín · Ciencia y Libertad</p>
    </aside>
  );
}

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
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      <div className="relative flex min-h-dvh flex-col overflow-hidden">
        {/* Resplandor rojo y rejilla del lado del formulario */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-260px] h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand/25 blur-[110px] dark:bg-brand/30 lg:bg-brand/10 lg:dark:bg-brand/15" />
        <Grid className="text-fg/[0.05]" />

        <header className="relative flex items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="lg:invisible">
            <Image
              src="/logo-teatro.png"
              alt="Teatro Universidad de Medellín"
              width={110}
              height={30}
              className="h-[26px] w-auto rounded bg-white px-1 py-0.5"
              priority
            />
          </Link>
          <ThemeToggle />
        </header>

        <main className="relative flex flex-1 items-start justify-center px-5 pb-16 pt-[7vh] lg:items-center lg:pt-0">
          <div className="w-full max-w-[380px] animate-fade-up rounded-2xl border border-border/80 bg-surface/80 p-6 shadow-pop backdrop-blur-xl sm:p-8">
            <div className="mb-1 h-1 w-8 rounded-full bg-brand" />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-6 text-center text-[13px] text-muted">{footer}</div>}
          </div>
        </main>

        <footer className="relative px-5 pb-6 text-center text-xs text-faint">
          <Link href="/privacidad" className="hover:text-muted">
            Aviso de privacidad
          </Link>
        </footer>
      </div>
    </div>
  );
}
