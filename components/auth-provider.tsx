"use client";

import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { watchProfile, type Profile } from "@/lib/data";
import { firebaseAuth } from "@/lib/firebase/client";
import { VerifyEmail } from "./verify-email";
import Image from "next/image";

interface AuthState {
  /** undefined mientras carga */
  user: User | null | undefined;
  /** undefined mientras carga, null si aún no hizo el onboarding */
  profile: Profile | null | undefined;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [, force] = useState(0);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let auth;
    try {
      auth = firebaseAuth();
    } catch (e) {
      setConfigError((e as Error).message);
      return;
    }
    auth.languageCode = "es";
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) setProfile(null);
    });
  }, []);

  // Si leer el perfil falla (red, token renovándose), se reintenta: nunca se asume "sin perfil",
  // porque eso mandaba a cuentas existentes a la pantalla de registro.
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    if (!user) return;
    setProfile(undefined);
    let t: number | undefined;
    const off = watchProfile(user.uid, setProfile, () => {
      t = window.setTimeout(() => setIntento((n) => n + 1), Math.min(1000 * 2 ** intento, 15000));
    });
    return () => {
      off();
      if (t) window.clearTimeout(t);
    };
  }, [user, intento]);

  const signOut = useCallback(async () => {
    await fbSignOut(firebaseAuth());
  }, []);

  const refreshUser = useCallback(async () => {
    const u = firebaseAuth().currentUser;
    if (!u) return;
    await u.reload();
    await u.getIdToken(true);
    setUser(firebaseAuth().currentUser);
    force((n) => n + 1);
  }, []);

  if (configError) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-md rounded-box border border-border bg-surface p-6">
          <p className="text-sm font-semibold">Falta configurar Firebase</p>
          <p className="mt-2 text-[13px] text-muted">{configError}</p>
          <p className="mt-3 text-[13px] text-muted">
            Copia <code className="font-mono text-fg">.env.example</code> a <code className="font-mono text-fg">.env.local</code>, completa los valores y reinicia el servidor.
          </p>
        </div>
      </div>
    );
  }

  return <Ctx.Provider value={{ user, profile, signOut, refreshUser }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}

/** Usuario y perfil garantizados (solo dentro de <RequireAuth needProfile>). */
export function useSession() {
  const { user, profile, ...rest } = useAuth();
  if (!user || !profile) throw new Error("useSession requiere sesión y perfil");
  return { user, profile, ...rest };
}

function FullScreenLoader() {
  return (
    <div role="status" aria-label="Cargando" className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-5">
        <Image
          src="/logo-teatro-udem.png"
          alt="Teatro Universidad de Medellín"
          width={189}
          height={60}
          priority
          className="h-10 w-auto dark:rounded-ctl dark:bg-white dark:px-2 dark:py-1.5"
        />
        <span className="block h-[3px] w-32 overflow-hidden rounded-full bg-border">
          <span className="block h-full w-1/3 animate-barra rounded-full bg-brand" />
        </span>
      </div>
    </div>
  );
}

/**
 * Protege las rutas privadas:
 * sin sesión → /login · correo sin verificar → aviso · sin perfil → /onboarding.
 */
export function RequireAuth({ children, needProfile = true }: { children: ReactNode; needProfile?: boolean }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const verified = !!user?.emailVerified;
  const loading = user === undefined || (!!user && verified && profile === undefined);

  useEffect(() => {
    if (user === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (user && verified && needProfile && profile === null) router.replace("/onboarding");
    else if (user && verified && !needProfile && profile) router.replace("/");
  }, [user, verified, profile, needProfile, router, pathname]);

  if (loading || user === null) return <FullScreenLoader />;
  if (!verified) return <VerifyEmail />;
  if (needProfile && !profile) return <FullScreenLoader />;
  if (!needProfile && profile) return <FullScreenLoader />;
  return <>{children}</>;
}

/** Para /login y /registro: si ya hay sesión, sale de ahí. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (user) {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    }
  }, [user, router]);
  if (user === undefined || user) return <FullScreenLoader />;
  return <>{children}</>;
}
