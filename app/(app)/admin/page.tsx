"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/auth-provider";
import { Badge, Button, EmptyState, PageHeader, Skeleton } from "@/components/ui";

interface AccountRow {
  uid: string;
  email: string;
  nombre: string;
  emailVerificado: boolean;
  registradoEn: string;
  ultimoIngreso: string | null;
  ultimaActividad: string | null;
  deshabilitado: boolean;
}

interface UsersResponse {
  users: AccountRow[];
  nextPageToken: string | null;
  error?: string;
}

const CACHE = "admin-cuentas";
const CADA_MS = 30_000;
const ACTIVO_MS = 10 * 60_000;

const fechaHora = (value: string | null) =>
  value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Nunca";

function hace(value: string | null, ahora: number) {
  if (!value) return "Nunca";
  const min = Math.max(0, Math.round((ahora - new Date(value).getTime()) / 60_000));
  if (min < 1) return "Ahora mismo";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Ayer" : `Hace ${d} días`;
}

const ts = (v: string | null) => (v ? new Date(v).getTime() : 0);

export default function AdminPage() {
  const { user } = useSession();
  const [users, setUsers] = useState<AccountRow[] | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(sessionStorage.getItem(CACHE) ?? "null");
    } catch {
      return null;
    }
  });
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState("");
  const [ahora, setAhora] = useState(() => Date.now());
  const [actualizado, setActualizado] = useState<number | null>(null);
  const extra = useRef(false); // si se cargaron más páginas, el refresco automático no las borra

  const load = useCallback(
    async (token?: string) => {
      try {
        const idToken = await user.getIdToken();
        const query = token ? `?pageToken=${encodeURIComponent(token)}` : "";
        const res = await fetch(`/api/admin/users${query}`, { headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store" });
        const data = (await res.json()) as UsersResponse;
        if (!res.ok) throw new Error(data.error || "No se pudo cargar la lista de cuentas.");
        setError("");
        setActualizado(Date.now());
        setNextPageToken(data.nextPageToken);
        if (token) {
          extra.current = true;
          setUsers((cur) => [...(cur ?? []), ...data.users.filter((u) => !(cur ?? []).some((c) => c.uid === u.uid))]);
        } else {
          setUsers((cur) => {
            if (!extra.current || !cur) return data.users;
            const nuevos = new Map(data.users.map((u) => [u.uid, u]));
            return [...data.users, ...cur.filter((c) => !nuevos.has(c.uid))];
          });
          sessionStorage.setItem(CACHE, JSON.stringify(data.users));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la lista de cuentas.");
      }
    },
    [user],
  );

  // Primera carga y refresco automático: cada 30 s con la pestaña visible y al volver a ella.
  useEffect(() => {
    void load();
    const tick = () => {
      setAhora(Date.now());
      if (document.visibilityState === "visible") void load();
    };
    const id = window.setInterval(tick, CADA_MS);
    const alVolver = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [load]);

  const ordenadas = useMemo(() => [...(users ?? [])].sort((a, b) => ts(b.ultimaActividad) - ts(a.ultimaActividad)), [users]);
  const activos = ordenadas.filter((u) => ahora - ts(u.ultimaActividad) < ACTIVO_MS).length;

  const contexto = users
    ? `${users.length} ${users.length === 1 ? "cuenta" : "cuentas"} · ${activos} ${activos === 1 ? "activa" : "activas"} en los últimos 10 min${actualizado ? ` · actualizado ${hace(new Date(actualizado).toISOString(), ahora).toLowerCase()}` : ""}`
    : "Cargando cuentas…";

  return (
    <>
      <PageHeader title="Administración" description={contexto} />

      {error && !users?.length ? (
        <div className="border-y border-border">
          <EmptyState title="No se pudo abrir la administración" description={error} />
        </div>
      ) : users === null ? (
        <div className="divide-y divide-border border-y border-border">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-6 px-2 py-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="hidden h-3 w-32 sm:block" />
              <Skeleton className="hidden h-3 w-32 sm:block" />
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="border-y border-border">
          <EmptyState title="Aún no hay cuentas" description="Cuando alguien se registre, aparece aquí." />
        </div>
      ) : (
        <>
          {error && <p className="mb-3 text-xs text-warn">No se pudo actualizar: {error} Se reintenta solo.</p>}
          <div className="hidden border-b border-border px-2 pb-2 sm:grid sm:grid-cols-[minmax(0,1fr)_200px_180px] sm:gap-4">
            <span className="th">Cuenta</span>
            <span className="th">Última vez</span>
            <span className="th">Registro</span>
          </div>
          <ul className="divide-y divide-border border-b border-border">
            {ordenadas.map((account) => {
              const enLinea = ahora - ts(account.ultimaActividad) < ACTIVO_MS;
              return (
                <li key={account.uid} className="grid gap-2 px-2 py-3 sm:grid-cols-[minmax(0,1fr)_200px_180px] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.nombre}</p>
                    <p className="truncate text-xs text-muted">{account.email || "Sin correo"}</p>
                    <div className="mt-1 flex gap-3">
                      {!account.emailVerificado && <Badge tone="warn">Correo sin verificar</Badge>}
                      {account.deshabilitado && <Badge tone="danger">Desactivada</Badge>}
                    </div>
                  </div>
                  <div className="text-[13px]" title={`Último inicio de sesión: ${fechaHora(account.ultimoIngreso)}`}>
                    <p className="flex items-center gap-1.5 font-medium">
                      {enLinea && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />}
                      {hace(account.ultimaActividad, ahora)}
                      {enLinea && <span className="sr-only">(activa)</span>}
                    </p>
                    <p className="tabular text-xs text-muted">{fechaHora(account.ultimaActividad)}</p>
                  </div>
                  <p className="tabular text-xs text-muted">
                    <span className="sm:hidden">Registro: </span>
                    {fechaHora(account.registradoEn)}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">
            &quot;Última vez&quot; es cuando la app renovó la sesión de esa cuenta: al abrirla y mientras la usa. La lista se actualiza sola cada 30 segundos.
          </p>
          {nextPageToken && (
            <div className="mt-4 text-center">
              <Button
                variant="secondary"
                loading={cargandoMas}
                onClick={async () => {
                  setCargandoMas(true);
                  await load(nextPageToken);
                  setCargandoMas(false);
                }}
              >
                Cargar más cuentas
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
