"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "./auth-provider";
import { IconClock, IconHistory, IconLogout, IconPlus, IconSettings, IconUsers } from "./icons";
import { ThemeToggle } from "./theme";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Nueva planilla", short: "Nueva", icon: IconPlus },
  { href: "/planillas", label: "Historial", short: "Historial", icon: IconHistory },
  { href: "/horas", label: "Mis horas", short: "Horas", icon: IconClock },
  { href: "/personal", label: "Personal", short: "Personal", icon: IconUsers },
  { href: "/ajustes", label: "Ajustes", short: "Ajustes", icon: IconSettings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function Logo() {
  return (
    <Image
      src="/logo-teatro.png"
      alt="Teatro Universidad de Medellín"
      width={110}
      height={30}
      priority
      className="h-6 w-auto dark:rounded dark:bg-white dark:px-1 dark:py-0.5"
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
    <div className="border-b border-warn/20 bg-warn/10 px-4 py-1.5 text-center text-xs text-warn">
      Sin conexión. Mis horas sigue funcionando y se sincroniza al volver.
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, user, signOut } = useSession();
  const initials = profile.nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-dvh md:pl-[232px]">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 hidden w-[232px] flex-col border-r border-border bg-surface md:flex">
        <div className="h-1 bg-brand" />
        <div className="flex h-16 items-center px-4">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="px-3 pb-3">
          <Link
            href="/"
            className="flex h-9 items-center justify-center gap-2 rounded-md bg-brand text-sm font-bold text-brand-fg transition-colors hover:bg-brand/90"
          >
            <IconPlus /> Nueva planilla
          </Link>
        </div>
        <p className="px-5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-faint">Menú</p>
        <nav className="flex-1 space-y-0.5 px-3 py-1">
          {NAV.slice(1).map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cx(
                  "relative flex h-9 items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
                  active ? "bg-subtle font-bold text-fg" : "text-muted hover:bg-subtle/60 hover:text-fg",
                )}
              >
                {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-brand" />}
                <Icon className={active ? "text-brand" : undefined} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-2">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{profile.nombre}</p>
              <p className="truncate text-[11px] text-faint">{user.email}</p>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between px-1">
            <button onClick={signOut} className="flex h-8 items-center gap-2 rounded-md px-1.5 text-[13px] text-muted hover:bg-subtle hover:text-fg">
              <IconLogout /> Salir
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Encabezado (móvil) */}
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-bg/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <Link href="/">
          <Logo />
        </Link>
        <div className="flex items-center">
          <ThemeToggle />
          <button onClick={signOut} aria-label="Cerrar sesión" className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-subtle">
            <IconLogout />
          </button>
        </div>
      </header>

      <OfflineBanner />
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-10">{children}</main>

      {/* Pestañas (móvil) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map(({ href, short, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cx("flex h-14 flex-col items-center justify-center gap-1 text-[11px]", active ? "text-fg" : "text-faint")}
            >
              <Icon width={18} height={18} className={active ? "text-brand" : undefined} />
              {short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
