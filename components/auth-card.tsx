import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "./theme";

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
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo-teatro.png" alt="Teatro Universidad de Medellín" width={110} height={30} className="h-[26px] w-auto dark:rounded dark:bg-white dark:px-1 dark:py-0.5" priority />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-[8vh]">
        <div className="w-full max-w-[360px] animate-fade-up">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-[13px] text-muted">{footer}</div>}
        </div>
      </main>
      <footer className="px-5 pb-6 text-center text-xs text-faint">
        <Link href="/privacidad" className="hover:text-muted">
          Aviso de privacidad
        </Link>
      </footer>
    </div>
  );
}
