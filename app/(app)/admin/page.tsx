"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { apiJson } from "@/lib/firebase/client";
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

  // Cuentas a las que se les quitaron todas las secciones (no pueden usar nada).
  const pendientes = (users ?? []).filter((u) => !u.esAdmin && u.uid !== user.uid && Array.isArray(u.secciones) && u.secciones.length === 0).length;

  const contexto = users
    ? `${users.length} ${users.length === 1 ? "cuenta" : "cuentas"} · ${activos} ${activos === 1 ? "activa" : "activas"} en los últimos 10 min${actualizado ? ` · actualizado ${hace(new Date(actualizado).toISOString(), ahora).toLowerCase()}` : ""}`
    : "Cargando cuentas…";

  return (
    <>
      <PageHeader title="Administración" description={contexto} />

      <Reportes ahora={ahora} />

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
                    ? `${pendientes} sin secciones`
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
              <span className="font-medium">{pendientes === 1 ? "1 cuenta no tiene" : `${pendientes} cuentas no tienen`} ninguna sección.</span>{" "}
              <span className="text-muted">No pueden usar la app hasta que les marques al menos una.</span>
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
                <li key={account.uid} className={`grid gap-3 px-2 py-4 sm:grid-cols-[minmax(0,1fr)_170px_150px_110px] sm:items-start sm:gap-4 ${account.deshabilitado ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <Iniciales nombre={account.nombre} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{account.nombre}</p>
                        <p className="truncate text-xs text-muted">{account.email || "Sin correo"}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-12">
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
                      <Button size="sm" variant={account.deshabilitado ? "secondary" : "ghost"} className={account.deshabilitado ? undefined : "text-muted hover:text-danger"} onClick={() => setCambiar(account)}>
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

/** Círculo con iniciales; el color sale del nombre (siempre el mismo para la misma persona). */
function Iniciales({ nombre }: { nombre: string }) {
  const partes = nombre.trim().split(/\s+/);
  const ini = ((partes[0]?.[0] ?? "") + (partes.length >= 3 ? partes[2]?.[0] ?? "" : partes[1]?.[0] ?? "")).toUpperCase() || "?";
  const colores = ["bg-[#c8201a]", "bg-[#2f6f9f]", "bg-[#5b7f3a]", "bg-[#8a5a9e]", "bg-[#b0712b]", "bg-[#3f7d78]"];
  const n = [...nombre].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (
    <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white ${colores[n % colores.length]}`}>
      {ini}
    </span>
  );
}

/** Interruptores de secciones de una cuenta. La propia (administradora) siempre tiene todo. */
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
    return (
      <p className="mt-3 flex items-center gap-1.5 pl-12 text-[12px] font-medium text-ok">
        <span aria-hidden>✓</span> Acceso completo · administradora
      </p>
    );
  }
  // Sin permisos guardados = todo (por defecto).
  const actuales = account.secciones ?? TODAS;
  const ninguna = actuales.length === 0;
  const alternar = (s: Seccion) => onCambiar(TODAS.filter((x) => (x === s ? !actuales.includes(s) : actuales.includes(x))));
  return (
    <div className="ml-12 mt-3 rounded-box border border-border bg-subtle/30 px-3.5 py-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          Secciones {ninguna && <span className="ml-1 normal-case tracking-normal text-warn">· no puede usar nada</span>}
        </p>
        {actuales.length < TODAS.length && (
          <button type="button" disabled={guardando} onClick={() => onCambiar(TODAS)} className="text-[12px] font-medium text-brand underline-offset-2 hover:underline disabled:opacity-60">
            Dar todo
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
        {SECCIONES.map((s) => {
          const on = actuales.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${s.label}: ${on ? "habilitada" : "deshabilitada"}`}
              disabled={guardando}
              onClick={() => alternar(s.id)}
              className="group flex items-center gap-2.5 text-left text-[13px] disabled:opacity-60"
            >
              <span aria-hidden className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150 ${on ? "bg-brand" : "bg-border"}`}>
                <span
                  className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-150 ${on ? "translate-x-[14px]" : ""}`}
                />
              </span>
              <span className={on ? "text-fg" : "text-muted group-hover:text-fg"}>{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Reporte {
  id: string;
  nombre: string;
  email: string;
  pagina: string;
  mensaje: string;
  navegador: string;
  fotos: number;
  resuelto: boolean;
  creado: number | null;
}

/** Reportes de problemas que envían las cuentas ("Reportar un problema"). Solo los ve la administradora. */
function Reportes({ ahora }: { ahora: number }) {
  const toast = useToast();
  const [lista, setLista] = useState<Reporte[] | null>(null);
  const [verResueltos, setVerResueltos] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await apiJson<{ reportes: Reporte[] }>("/api/reportes", { cache: "no-store" });
      setLista(r.reportes);
    } catch {
      setLista((l) => l ?? []);
    }
  }, []);

  useEffect(() => {
    void cargar();
    const t = window.setInterval(() => void cargar(), 60_000);
    return () => window.clearInterval(t);
  }, [cargar]);

  async function cambiar(id: string, cambio: { resuelto?: boolean; borrar?: boolean }) {
    setOcupado(id);
    try {
      await apiJson("/api/reportes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...cambio }) });
      setLista((l) => (l ? (cambio.borrar ? l.filter((x) => x.id !== id) : l.map((x) => (x.id === id ? { ...x, resuelto: !!cambio.resuelto } : x))) : l));
    } catch (e) {
      toast.error("No se pudo actualizar", (e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  if (!lista) return null;
  const pendientes = lista.filter((r) => !r.resuelto);
  const visibles = verResueltos ? lista : pendientes;

  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          Reportes de problemas
          {pendientes.length > 0 && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-[12px] font-bold text-brand-fg">{pendientes.length}</span>
          )}
        </h2>
        {lista.some((r) => r.resuelto) && (
          <button type="button" onClick={() => setVerResueltos((v) => !v)} className="text-[13px] text-muted underline-offset-2 hover:text-fg hover:underline">
            {verResueltos ? "Ocultar resueltos" : "Ver también los resueltos"}
          </button>
        )}
      </div>
      {visibles.length === 0 ? (
        <p className="border-y border-border py-5 text-[13px] text-muted">
          {lista.length ? "No hay reportes pendientes." : "Nadie ha reportado problemas. Cuando alguien use \u201cReportar un problema\u201d, aparece aquí."}
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {visibles.map((r) => (
            <li key={r.id} className={`flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between ${r.resuelto ? "opacity-60" : ""}`}>
              <div className="min-w-0">
                <p className="text-[13px]">
                  <span className="font-bold">{r.nombre || r.email || "Sin nombre"}</span>
                  <span className="text-muted">
                    {" "}
                    · {r.pagina || "—"} · {hace(r.creado ? new Date(r.creado).toISOString() : null, ahora)}
                  </span>
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{r.mensaje}</p>
                {r.fotos > 0 && <FotosReporte id={r.id} cantidad={r.fotos} />}
                <p className="mt-1.5 text-[12px] text-faint">
                  {r.email} · {r.navegador}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant={r.resuelto ? "secondary" : "primary"} loading={ocupado === r.id} onClick={() => cambiar(r.id, { resuelto: !r.resuelto })}>
                  {r.resuelto ? "Reabrir" : "Marcar resuelto"}
                </Button>
                {r.resuelto && (
                  <Button size="sm" variant="ghost" disabled={ocupado === r.id} onClick={() => cambiar(r.id, { borrar: true })}>
                    Borrar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Miniaturas de las fotos de un reporte; se cargan al abrir (no pesan en la lista). */
function FotosReporte({ id, cantidad }: { id: string; cantidad: number }) {
  const [fotos, setFotos] = useState<Array<string | null> | null>(null);
  const [grande, setGrande] = useState<string | null>(null);

  async function ver() {
    setFotos(Array(cantidad).fill(null));
    const datos = await Promise.all(
      Array.from({ length: cantidad }, (_, n) =>
        apiJson<{ data: string }>(`/api/reportes?foto=${id}&n=${n}`, { cache: "no-store" })
          .then((r) => `data:image/jpeg;base64,${r.data}`)
          .catch(() => ""),
      ),
    );
    setFotos(datos);
  }

  if (!fotos)
    return (
      <button type="button" onClick={ver} className="mt-2 text-[13px] font-bold text-brand underline-offset-2 hover:underline">
        Ver {cantidad === 1 ? "foto" : `${cantidad} fotos`}
      </button>
    );

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {fotos.map((f, i) =>
          f === null ? (
            <Skeleton key={i} className="h-24 w-36" />
          ) : f === "" ? (
            <p key={i} className="text-[12px] text-muted">No se pudo cargar la foto {i + 1}.</p>
          ) : (
            <button key={i} type="button" onClick={() => setGrande(f)} className="overflow-hidden rounded-ctl border border-border" aria-label={`Ampliar foto ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f} alt={`Foto ${i + 1} del reporte`} className="h-24 w-36 object-cover transition-opacity duration-100 hover:opacity-90" />
            </button>
          ),
        )}
      </div>
      <Modal open={!!grande} onClose={() => setGrande(null)} title="Foto del reporte" wide>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {grande && <img src={grande} alt="Foto del reporte" className="mx-auto max-h-[75vh] w-auto rounded-ctl" />}
      </Modal>
    </>
  );
}
