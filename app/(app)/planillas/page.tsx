"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/auth-provider";
import { IconChevron, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button, EmptyState, Input, Modal, PageHeader, Select, Skeleton, Stat, StatRow } from "@/components/ui";
import { apiJson } from "@/lib/firebase/client";
import { watchEvents, type EventDoc } from "@/lib/data";
import { MESES, fechaCorta, formatCOP, normalize, formatDuracion } from "@/lib/format";

export default function HistorialPage() {
  const { user } = useSession();
  const [events, setEvents] = useState<EventDoc[] | null>(null);
  const [q, setQ] = useState("");
  const [mes, setMes] = useState("");
  const toast = useToast();
  const [aBorrar, setABorrar] = useState<EventDoc | null>(null);
  const [borrando, setBorrando] = useState(false);

  // Borra la planilla completa: el evento, su personal y las horas guardadas en Mis horas.
  async function borrar() {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      await apiJson(`/api/planillas/${aBorrar.id}`, { method: "DELETE" });
      toast.success("Planilla eliminada", aBorrar.nombre);
      setABorrar(null);
    } catch (e) {
      toast.error("No se pudo eliminar", (e as Error).message);
    } finally {
      setBorrando(false);
    }
  }

  useEffect(() => watchEvents(user.uid, setEvents, () => setEvents([])), [user.uid]);

  const meses = useMemo(() => [...new Set((events ?? []).map((e) => e.fecha.slice(0, 7)))], [events]);
  const filtered = useMemo(
    () =>
      (events ?? []).filter((e) => (!mes || e.fecha.startsWith(mes)) && (!q || normalize(e.nombre).includes(normalize(q)))),
    [events, q, mes],
  );
  const totals = filtered.reduce(
    (a, e) => ({ horas: a.horas + (e.totalHoras ?? 0), valor: a.valor + (e.totalPagado ?? 0), aforo: a.aforo + (e.aforo ?? 0) }),
    { horas: 0, valor: 0, aforo: 0 },
  );

  const esteMes = new Date().toLocaleDateString("en-CA").slice(0, 7);
  const delMes = (events ?? []).filter((e) => e.fecha.startsWith(esteMes)).length;
  const contexto =
    events === null
      ? "Cargando…"
      : events.length === 0
        ? "Aquí quedan las planillas que generes."
        : `${delMes === 1 ? "1 evento" : `${delMes} eventos`} este mes · ${events.length} en total`;

  return (
    <>
      <PageHeader
        title="Historial"
        description={contexto}
        action={
          <Link href="/">
            <Button variant="primary" icon={<IconPlus />}>
              Nueva planilla
            </Button>
          </Link>
        }
      />

      {events === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="border-y border-border">
          <EmptyState
            title="Aún no tienes planillas"
            description="Genera la primera: sube el registro del evento."
            action={
              <Link href="/">
                <Button variant="primary">Nueva planilla</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <StatRow className="mb-8">
            <Stat label="Eventos" value={filtered.length} />
            <Stat label="Horas del personal" value={formatDuracion(totals.horas)} />
            <Stat label="Pagado al personal" value={formatCOP(totals.valor)} className="col-span-2 lg:col-span-1" />
          </StatRow>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <Input className="pl-9" placeholder="Buscar evento" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select className="sm:w-48" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes">
              <option value="">Todos los meses</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {MESES[Number(m.slice(5)) - 1]} {m.slice(0, 4)}
                </option>
              ))}
            </Select>
          </div>
          <div className="border-y border-border">
            {filtered.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-muted">Ningún evento coincide con la búsqueda.</p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((e) => (
                  <li key={e.id} className="group flex items-center transition-colors duration-100 hover:bg-subtle/40">
                    <Link href={`/planillas/${e.id}`} className="flex min-w-0 flex-1 items-center gap-4 px-1 py-3.5 sm:px-2">
                      <div className="tabular w-16 shrink-0 text-[13px] text-muted">{fechaCorta(e.fecha)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium">{e.nombre}</p>
                        <p className="tabular text-xs text-muted">
                          {e.staffCount} personas · {formatDuracion(e.totalHoras)} · aforo {e.aforo ?? "—"}
                        </p>
                      </div>
                      <div className="tabular hidden w-28 text-right text-[13px] sm:block">{formatCOP(e.totalPagado)}</div>
                      <IconChevron className="text-faint" />
                    </Link>
                    <button
                      onClick={() => setABorrar(e)}
                      className="mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-ctl text-faint transition-colors duration-100 hover:bg-danger/10 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      aria-label={`Eliminar la planilla ${e.nombre}`}
                      title="Eliminar planilla"
                    >
                      <IconTrash width={15} height={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      <Modal
        open={!!aBorrar}
        onClose={() => !borrando && setABorrar(null)}
        title="Eliminar planilla"
        footer={
          <>
            <Button onClick={() => setABorrar(null)} disabled={borrando}>
              Cancelar
            </Button>
            <Button variant="danger" loading={borrando} onClick={borrar}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Se borra todo lo de <span className="font-medium text-fg">{aBorrar?.nombre}</span>
          {aBorrar ? ` (${fechaCorta(aBorrar.fecha)})` : ""}: la planilla, la lista de personal y las horas que se guardaron en Mis horas para
          este evento. No se puede deshacer.
        </p>
      </Modal>
    </>
  );
}
