"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/auth-provider";
import { IconChevron, IconPlus, IconSearch } from "@/components/icons";
import { Button, EmptyState, Input, PageHeader, Select, Skeleton, Stat, StatRow } from "@/components/ui";
import { watchEvents, type EventDoc } from "@/lib/data";
import { MESES, fechaCorta, formatCOP, normalize, formatDuracion } from "@/lib/format";

export default function HistorialPage() {
  const { user } = useSession();
  const [events, setEvents] = useState<EventDoc[] | null>(null);
  const [q, setQ] = useState("");
  const [mes, setMes] = useState("");

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
                  <li key={e.id}>
                    <Link href={`/planillas/${e.id}`} className="flex items-center gap-4 px-1 py-3.5 transition-colors duration-100 hover:bg-subtle/40 sm:px-2">
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
