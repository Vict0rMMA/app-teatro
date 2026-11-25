"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { watchPermisos } from "@/lib/data";
import { esAdminEmail, rutaInicial, seccionDeRuta, TODAS, type Seccion } from "@/lib/permisos";
import { useSession } from "./auth-provider";

type Permisos = { secciones: Seccion[]; esAdmin: boolean; puede: (s: Seccion) => boolean };
const Ctx = createContext<Permisos | null>(null);

export function usePermisos(): Permisos {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePermisos fuera de GuardaPermisos");
  return c;
}

/**
 * Aplica los permisos de la cuenta en vivo (permisos/{uid}): pantalla de "pendiente" si aún no tiene,
 * y bloqueo de las secciones no habilitadas aunque se entre por enlace directo. El servidor y las
 * reglas de Firestore también lo exigen; esto es la parte visible.
 */
export function GuardaPermisos({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const esAdmin = esAdminEmail(user.email, process.env.NEXT_PUBLIC_ADMIN_EMAIL);
  const [secciones, setSecciones] = useState<Seccion[] | null | undefined>(undefined);

  useEffect(() => {
    if (esAdmin) return;
    return watchPermisos(user.uid, setSecciones, () => setSecciones(null));
  }, [user.uid, esAdmin]);

  // Sin permisos guardados = acceso completo (por defecto). El administrador quita secciones después.
  const efectivas = esAdmin || secciones === null ? TODAS : secciones;
  const seccion = seccionDeRuta(pathname);
  const permitido = !!efectivas && (seccion === null ? pathname !== "/admin" || esAdmin : efectivas.includes(seccion));

  // Enlace directo a una sección no habilitada: a la primera que sí tenga.
  useEffect(() => {
    if (!efectivas || !efectivas.length || permitido) return;
    const destino = rutaInicial(efectivas);
    if (destino && destino !== pathname) router.replace(destino);
  }, [efectivas, permitido, pathname, router]);

  if (efectivas === undefined) return <Cargando />;
  if (!efectivas.length) return <Pendiente />;
  if (!permitido) return <Cargando />;

  return <Ctx.Provider value={{ secciones: efectivas, esAdmin, puede: (s) => efectivas.includes(s) }}>{children}</Ctx.Provider>;
}

function Cargando() {
  return (
    <div role="status" aria-label="Cargando" className="grid min-h-dvh place-items-center bg-bg">
      <span className="block h-[3px] w-32 overflow-hidden rounded-full bg-border">
        <span className="block h-full w-1/3 animate-barra rounded-full bg-brand" />
      </span>
    </div>
  );
}

/** Solo si el administrador le quitó todas las secciones. */
function Pendiente() {
  const { profile, signOut } = useSession();
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6">
      <div className="w-full max-w-md">
        <Image
          src="/logo-teatro-udem.png"
          alt="Teatro Universidad de Medellín"
          width={189}
          height={60}
          className="h-10 w-auto dark:rounded-ctl dark:bg-white dark:px-2 dark:py-1.5"
        />
        <h1 className="mt-8 text-2xl font-bold tracking-tight">
          Tu cuenta no tiene secciones habilitadas
        </h1>
        <p className="mt-2 text-sm text-muted">
          Hola{profile.nombre ? `, ${profile.nombre.split(" ")[0]}` : ""}. El administrador debe habilitarte las secciones que vas a usar. Esta
          pantalla se actualiza sola cuando te dé acceso.
        </p>
        <button onClick={signOut} className="mt-6 h-10 rounded-ctl border border-border px-4 text-sm font-medium hover:bg-surface">
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}
