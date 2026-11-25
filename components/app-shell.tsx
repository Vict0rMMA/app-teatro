"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "./auth-provider";
import { IconClock, IconHistory, IconMore, IconPlus, IconReceipt } from "./icons";
import { ThemeToggle } from "./theme";
import { cx } from "./ui";

const NAV = [
  { href: "/planillas", label: "Historial" },
  { href: "/horas", label: "Mis horas" },
  { href: "/cuenta-cobro", label: "Cuenta de cobro" },
  { href: "/personal", label: "Personal" },
  { href: "/ajustes", label: "Ajustes" },
  { href: "/admin", label: "Administración", admin: true },
];

/** Pestañas del móvil: dos a cada lado del botón central. */
const TABS = [
  { href: "/planillas", label: "Historial", icon: IconHistory },
  { href: "/horas", label: "Horas", icon: IconClock },
  { href: "/cuenta-cobro", label: "Cobro", icon: IconReceipt },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-teatro.png"
      alt="Teatro Universidad de Medellín"
      width={150}
      height={42}
      priority
      className={cx("w-auto dark:rounded-ctl dark:bg-white dark:px-1.5 dark:py-1", className)}
    />
  );
}

function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="border-b border-warn/30 bg-warn/10 px-4 py-1.5 text-center text-xs text-warn">
      Sin conexión. Mis horas sigue funcionando y se sincroniza al volver.
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, user, signOut } = useSession();
  const [more, setMore] = useState(false);
  const isAdmin = !!user.email && user.email.toLocaleLowerCase("en-US") === process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLocaleLowerCase("en-US");
  const nav = NAV.filter((n) => !n.admin || isAdmin);
  const masActivo = ["/personal", "/ajustes", "/admin"].some((h) => isActive(pathname, h));

  useEffect(() => setMore(false), [pathname]);

  return (
    <div className="min-h-dvh md:pl-[208px]">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 hidden w-[208px] flex-col border-r border-border bg-bg md:flex">
        <div className="px-5 pb-6 pt-6">
          <Link href="/" aria-label="Inicio">
            <Logo className="h-9" />
          </Link>
        </div>
        <div className="px-5 pb-5">
          <Link
            href="/"
            className={cx(
              "inline-flex h-9 items-center gap-1.5 rounded-ctl border px-3 text-[13px] font-medium transition-colors duration-100",
              pathname === "/" ? "border-brand bg-brand text-brand-fg" : "border-brand/40 text-brand hover:border-brand hover:bg-brand-soft/60",
            )}
          >
            <IconPlus width={14} height={14} /> Nueva planilla
          </Link>
        </div>
        <nav className="flex-1 px-5" aria-label="Secciones">
          <ul className="space-y-0.5">
            {nav.map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group flex h-8 items-center gap-2.5 text-sm transition-colors duration-100",
                      active ? "font-medium text-fg" : "text-muted hover:text-fg",
                    )}
                  >
                    <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", active ? "bg-brand" : "bg-transparent group-hover:bg-border")} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-border px-5 py-4">
          <p className="truncate text-[13px] font-medium">{profile.nombre}</p>
          <p className="truncate text-[12px] text-muted">{user.email}</p>
          <div className="mt-2 flex items-center justify-between">
            <button onClick={signOut} className="text-[13px] text-muted underline-offset-2 hover:text-fg hover:underline">
              Cerrar sesión
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Encabezado (móvil) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <Link href="/" aria-label="Inicio">
          <Logo className="h-7" />
        </Link>
        <ThemeToggle />
      </header>

      <OfflineBanner />
      <main className="mx-auto w-full max-w-[1080px] px-4 pb-32 pt-7 sm:px-8 md:pb-16 md:pt-12">{children}</main>

      {/* Menú "Más" (móvil) */}
      {more && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-0 bg-[#1C1917]/30" />
          <div
            className="absolute inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] animate-dialog-in rounded-box border border-border bg-surface p-2 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            {nav
              .filter((n) => !TABS.some((t) => t.href === n.href))
              .map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={cx("flex h-11 items-center rounded-ctl px-3 text-[15px]", isActive(pathname, href) ? "font-medium text-fg" : "text-muted")}
                >
                  {label}
                </Link>
              ))}
            <div className="mt-1 border-t border-border px-3 pt-2">
              <p className="truncate text-[12px] text-muted">{user.email}</p>
              <button onClick={signOut} className="h-10 text-[15px] text-brand">
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pestañas (móvil) */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {TABS.slice(0, 2).map((t) => (
          <Tab key={t.href} {...t} active={isActive(pathname, t.href)} />
        ))}
        <div className="grid place-items-center">
          <Link
            href="/"
            aria-label="Nueva planilla"
            className={cx(
              "-mt-5 grid h-12 w-12 place-items-center rounded-full border-4 border-bg text-brand-fg transition-colors duration-100",
              pathname === "/" ? "bg-brand-hover" : "bg-brand",
            )}
          >
            <IconPlus width={20} height={20} />
          </Link>
        </div>
        <Tab {...TABS[2]} active={isActive(pathname, TABS[2].href)} />
        <button
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className={cx("relative flex h-[60px] flex-col items-center justify-center gap-1 text-[11px]", masActivo || more ? "text-fg" : "text-muted")}
        >
          {masActivo && <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 bg-brand" />}
          <IconMore width={20} height={20} />
          Más
        </button>
      </nav>
    </div>
  );
}

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof IconClock; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx("relative flex h-[60px] flex-col items-center justify-center gap-1 text-[11px]", active ? "font-medium text-fg" : "text-muted")}
    >
      {active && <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 bg-brand" />}
      <Icon width={20} height={20} />
      {label}
    </Link>
  );
}
