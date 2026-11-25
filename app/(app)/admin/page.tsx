"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { SECCIONES, TODAS, type Seccion } from "@/lib/permisos";
import { Badge, Button, EmptyState, Modal, PageHeader, Skeleton, Stat, StatRow } from "@/components/ui";

interface AccountRow {
  uid: string;
  email: string;
  nombre: string;
  emailVerificado: boolean;
  registradoEn: string;
  ultimoIngreso: string | null;
  ultimaActividad: string | null;
  deshabilitado: boolean;
  acceso: string[];
  perfilCompleto: boolean;
  tieneFirma: boolean;
  esAdmin?: boolean;
  /** null = pendiente de permisos */
  secciones?: Seccion[] | null;
}

interface Resumen {
  cuentas: number;
  activas7d: number;
  desactivadas: number;
  pendientes?: number;
  planillasMes: number;
}

interface UsersResponse {
  users: AccountRow[];
  nextPageToken: string | null;
  resumen?: Resumen;
  error?: string;
}

const CACHE = "admin-cuentas-v3"; // cambia si cambia la forma de los datos guardados
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
  const toast = useToast();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cambiar, setCambiar] = useState<AccountRow | null>(null);
  const [guardando, setGuardando] = useState(false);

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
        if (!token && data.resumen) setResumen(data.resumen);
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

  // Permisos por sección: se guardan al marcar o desmarcar (cambio optimista; si falla, se revierte).
  const [guardandoPermisos, setGuardandoPermisos] = useState<string | null>(null);
  async function guardarSecciones(account: AccountRow, secciones: Seccion[]) {
    const antes = account.secciones ?? null;
    setUsers((cur) => cur?.map((u) => (u.uid === account.uid ? { ...u, secciones } : u)) ?? cur);
    setGuardandoPermisos(account.uid);
    try {
      const idToken = await user.getIdToken();
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid: account.uid, secciones }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
    } catch (e) {
      setUsers((cur) => cur?.map((u) => (u.uid === account.uid ? { ...u, secciones: antes } : u)) ?? cur);
      toast.error("No se guardaron los permisos", (e as Error).message);
    } finally {
      setGuardandoPermisos(null);
    }
  }

  async function aplicarCambio() {
    if (!cambiar) return;
    setGuardando(true);
    try {
      const idToken = await user.getIdToken();
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid: cambiar.uid, deshabilitado: !cambiar.deshabilitado }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
      toast.success(cambiar.deshabilitado ? "Cuenta reactivada" : "Cuenta desactivada", cambiar.nombre);
      setCambiar(null);
      void load();
    } catch (e) {
      toast.error("No se pudo cambiar la cuenta", (e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  const pendientes = (users ?? []).filter((u) => !u.esAdmin && u.uid !== user.uid && (u.secciones === null || u.secciones === undefined)).length;

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
          {resumen && (
            <StatRow className="mb-8">
              <Stat
                label="Cuentas"
                value={resumen.cuentas}
                sub={
                  pendientes
                    ? `${pendientes} pendiente${pendientes === 1 ? "" : "s"} de permisos`
                    : resumen.desactivadas
                      ? `${resumen.desactivadas} desactivada${resumen.desactivadas === 1 ? "" : "s"}`
                      : "todas activas"
                }
              />
              <Stat label="Activas" value={resumen.activas7d} sub="en los últimos 7 días" />
              <Stat label="En línea" value={activos} sub="últimos 10 minutos" />
              <Stat label="Planillas" value={resumen.planillasMes} sub="generadas este mes" />
            </StatRow>
          )}
          {pendientes > 0 && (
            <p className="mb-4 border-l-2 border-warn py-1 pl-4 text-[13px]">
              <span className="font-medium">{pendientes === 1 ? "1 cuenta espera" : `${pendientes} cuentas esperan`} permisos.</span>{" "}
              <span className="text-muted">Marca las secciones que puede usar; hasta entonces ve la pantalla de &quot;pendiente&quot;.</span>
            </p>
          )}
          {error && <p className="mb-3 text-xs text-warn">No se pudo actualizar: {error} Se reintenta solo.</p>}
          <div className="hidden border-b border-border px-2 pb-2 sm:grid sm:grid-cols-[minmax(0,1fr)_170px_150px_110px] sm:gap-4">
            <span className="th">Cuenta</span>
            <span className="th">Última vez</span>
            <span className="th">Registro</span>
            <span className="th text-right">Acción</span>
          </div>
          <ul className="divide-y divide-border border-b border-border">
            {ordenadas.map((account) => {
              const enLinea = ahora - ts(account.ultimaActividad) < ACTIVO_MS;
              return (
                <li key={account.uid} className={`grid gap-2 px-2 py-3 sm:grid-cols-[minmax(0,1fr)_170px_150px_110px] sm:items-center sm:gap-4 ${account.deshabilitado ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.nombre}</p>
                    <p className="truncate text-xs text-muted">{account.email || "Sin correo"}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      <Badge>{(account.acceso ?? []).join(" + ") || "Sin método"}</Badge>
                      <Badge tone={account.perfilCompleto ? "ok" : "warn"}>{account.perfilCompleto ? "Perfil listo" : "Sin perfil"}</Badge>
                      <Badge tone={account.tieneFirma ? "ok" : "neutral"}>{account.tieneFirma ? "Con firma" : "Sin firma"}</Badge>
                      {!account.emailVerificado && <Badge tone="warn">Correo sin verificar</Badge>}
                      {account.deshabilitado && <Badge tone="danger">Desactivada</Badge>}
                    </div>
                    <Permisos
                      account={account}
                      propia={account.uid === user.uid}
                      guardando={guardandoPermisos === account.uid}
                      onCambiar={(secciones) => guardarSecciones(account, secciones)}
                    />
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
                  <div className="sm:text-right">
                    {account.uid === user.uid ? (
                      <span className="text-xs text-muted">Tu cuenta</span>
                    ) : (
                      <Button size="sm" variant={account.deshabilitado ? "secondary" : "ghost"} onClick={() => setCambiar(account)}>
                        {account.deshabilitado ? "Reactivar" : "Desactivar"}
                      </Button>
                    )}
                  </div>
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
      <Modal
        open={!!cambiar}
        onClose={() => !guardando && setCambiar(null)}
        title={cambiar?.deshabilitado ? "Reactivar cuenta" : "Desactivar cuenta"}
        footer={
          <>
            <Button onClick={() => setCambiar(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button variant={cambiar?.deshabilitado ? "primary" : "danger"} loading={guardando} onClick={aplicarCambio}>
              {cambiar?.deshabilitado ? "Reactivar" : "Desactivar"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          {cambiar?.deshabilitado ? (
            <>
              <span className="font-medium text-fg">{cambiar?.nombre}</span> podrá volver a entrar a la app con su cuenta de siempre.
            </>
          ) : (
            <>
              <span className="font-medium text-fg">{cambiar?.nombre}</span> no podrá entrar a la app y se cerrarán sus sesiones abiertas. Sus datos no se borran: puedes reactivarla cuando quieras.
            </>
          )}
        </p>
      </Modal>
    </>
  );
}

/** Casillas de secciones de una cuenta. La propia (administradora) siempre tiene todo. */
function Permisos({
  account,
  propia,
  guardando,
  onCambiar,
}: {
  account: AccountRow;
  propia: boolean;
  guardando: boolean;
  onCambiar: (secciones: Seccion[]) => void;
}) {
  if (account.esAdmin || propia) {
    return <p className="mt-2 text-xs text-muted">Acceso completo (administradora)</p>;
  }
  const actuales = account.secciones ?? [];
  const pendiente = account.secciones === null || account.secciones === undefined;
  const alternar = (s: Seccion) => onCambiar(TODAS.filter((x) => (x === s ? !actuales.includes(s) : actuales.includes(x))));
  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {pendiente && <span className="mr-1 text-[12px] font-medium text-warn">● Pendiente</span>}
        {SECCIONES.map((s) => {
          const on = actuales.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              role="switch"
              aria-checked={on}
              disabled={guardando}
              onClick={() => alternar(s.id)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-ctl border px-2.5 text-[12px] font-medium transition-colors duration-100 disabled:opacity-60 ${
                on ? "border-brand/50 bg-brand-soft/60 text-fg" : "border-border text-muted hover:border-fg/30 hover:text-fg"
              }`}
            >
              <span aria-hidden className={`grid h-3.5 w-3.5 place-items-center rounded-[3px] border text-[10px] leading-none ${on ? "border-brand bg-brand text-brand-fg" : "border-border"}`}>
                {on ? "✓" : ""}
              </span>
              {s.label}
            </button>
          );
        })}
        {actuales.length < TODAS.length && (
          <button type="button" disabled={guardando} onClick={() => onCambiar(TODAS)} className="ml-1 text-[12px] text-brand underline-offset-2 hover:underline disabled:opacity-60">
            Dar todo
          </button>
        )}
      </div>
    </div>
  );
}
