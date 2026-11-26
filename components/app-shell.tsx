"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { rutaInicial, type Seccion } from "@/lib/permisos";
import { useSession } from "./auth-provider";
import { usePermisos } from "./permisos";
import { IconClock, IconHistory, IconLogout, IconPlus, IconReceipt, IconSettings, IconUsers } from "./icons";
import { ReportarProblema } from "./reportar";
import { ThemeToggle } from "./theme";
import { cx } from "./ui";

const NAV: Array<{ href: string; label: string; icon: typeof IconClock; seccion?: Seccion; admin?: boolean }> = [
  { href: "/planillas", label: "Historial", icon: IconHistory, seccion: "planillas" },
  { href: "/horas", label: "Mis horas", icon: IconClock, seccion: "horas" },
  { href: "/cuenta-cobro", label: "Cuenta de cobro", icon: IconReceipt, seccion: "cobro" },
  { href: "/ajustes", label: "Ajustes", icon: IconSettings, seccion: "ajustes" },
  { href: "/admin", label: "Administración", icon: IconUsers, admin: true },
];

/** "Víctor Manuel Monsalve Aguilar" → "Víctor Monsalve" (nombre y primer apellido). */
function nombreCorto(nombre: string) {
  const p = nombre.trim().split(/\s+/);
  if (p.length >= 4) return `${p[0]} ${p[2]}`;
  return p.slice(0, 2).join(" ");
}

function iniciales(nombre: string) {
  return nombreCorto(nombre)
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-teatro-udem.png"
      alt="Teatro Universidad de Medellín"
      width={151}
      height={48}
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
  const { esAdmin: isAdmin, puede, secciones } = usePermisos();
  // Solo las secciones habilitadas para esta cuenta (la administradora ve todo).
  const nav = NAV.filter((n) => (n.admin ? isAdmin : !n.seccion || puede(n.seccion)));
  const inicio = rutaInicial(secciones) ?? "/";
  // Administración vive dentro de Ajustes en el celular: la pestaña Ajustes queda activa también ahí.
  const ajustesActivo = ["/ajustes", "/admin"].some((h) => isActive(pathname, h));
  const todas: Array<{ href: string; label: string; icon: typeof IconClock; seccion: Seccion } | "nueva"> = [
    { href: "/planillas", label: "Historial", icon: IconHistory, seccion: "planillas" },
    { href: "/horas", label: "Horas", icon: IconClock, seccion: "horas" },
    "nueva",
    { href: "/cuenta-cobro", label: "Cobro", icon: IconReceipt, seccion: "cobro" },
    { href: "/ajustes", label: "Ajustes", icon: IconSettings, seccion: "ajustes" },
  ];
  const pestanas = todas.filter((t) => puede(t === "nueva" ? "planillas" : t.seccion));

  return (
    <div className="min-h-dvh md:pl-[208px]">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 hidden w-[208px] flex-col border-r border-border bg-bg md:flex">
        <div className="px-5 pb-7 pt-7">
          <Link href={inicio} aria-label="Inicio">
            <Logo className="h-9" />
          </Link>
        </div>
        <div className={cx("px-3 pb-6", !puede("planillas") && "hidden")}>
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className={cx(
              "flex h-10 w-full items-center justify-center gap-2 rounded-ctl text-[13px] font-bold text-brand-fg transition-colors duration-100",
              pathname === "/" ? "bg-brand-hover" : "bg-brand hover:bg-brand-hover",
            )}
          >
            <IconPlus width={15} height={15} /> Nueva planilla
          </Link>
        </div>
        <nav className="flex-1 px-3" aria-label="Secciones">
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-faint">Menú</p>
          <ul className="space-y-0.5">
            {nav.map(({ href, label, icon: Icon, admin }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href} className={cx(admin && "mt-3 border-t border-border pt-3")}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "relative flex h-9 items-center gap-3 rounded-ctl px-3 text-[14px] transition-colors duration-100",
                      active ? "bg-subtle font-bold text-fg" : "font-bold text-fg/70 hover:bg-subtle/60 hover:text-fg",
                    )}
                  >
                    {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand" />}
                    <Icon width={17} height={17} strokeWidth={1.9} className={active ? "text-brand" : ""} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-border px-3 py-3">
          <div className="flex items-center gap-2.5 rounded-ctl px-2 py-1.5" title={`${profile.nombre} · ${user.email ?? ""}`}>
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-subtle text-[12px] font-bold text-fg">
              {iniciales(profile.nombre)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-tight">{nombreCorto(profile.nombre)}</p>
              <p className="truncate text-[11px] leading-tight text-muted">{user.email}</p>
            </div>
          </div>
          <div className="mt-1 px-1">
            <ReportarProblema className="w-full" />
          </div>
          <div className="flex items-center justify-between px-1">
            <button
              onClick={signOut}
              className="flex h-8 items-center gap-2 rounded-ctl px-2 text-[13px] text-muted transition-colors duration-100 hover:bg-subtle hover:text-fg"
            >
              <IconLogout width={15} height={15} />
              Cerrar sesión
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Encabezado (móvil) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <Link href={inicio} aria-label="Inicio">
          <Logo className="h-7" />
        </Link>
        <div className="flex items-center gap-1">
          <ReportarProblema compacto />
          <ThemeToggle />
          {/* Sin Ajustes no hay dónde cerrar sesión en el celular: botón aquí. */}
          {!puede("ajustes") && (
            <button onClick={signOut} aria-label="Cerrar sesión" className="grid h-8 w-8 place-items-center rounded-ctl text-muted hover:bg-subtle hover:text-fg">
              <IconLogout width={16} height={16} />
            </button>
          )}
        </div>
      </header>

      <OfflineBanner />
      <main className="mx-auto w-full max-w-[1080px] px-4 pb-32 pt-7 sm:px-8 md:pb-16 md:pt-12">{children}</main>

      {/* Pestañas (móvil): solo las secciones habilitadas; el + central si tiene Planillas. */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${pestanas.length}, minmax(0, 1fr))` }}
      >
        {pestanas.map((t) =>
          t === "nueva" ? (
            <div key="nueva" className="grid place-items-center">
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
          ) : (
            <Tab key={t.href} {...t} active={t.href === "/ajustes" ? ajustesActivo : isActive(pathname, t.href)} />
          ),
        )}
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
