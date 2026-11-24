"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/auth-provider";
import { IconChevron, IconHistory, IconPlus, IconSearch } from "@/components/icons";
import { Button, Card, EmptyState, Input, PageHeader, Select, Skeleton, Stat } from "@/components/ui";
import { watchEvents, type EventDoc } from "@/lib/data";
import { MESES, fechaCorta, formatCOP, formatHoras, normalize } from "@/lib/format";

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

  return (
    <>
      <PageHeader
        title="Historial"
        description="Planillas generadas y personal de cada evento."
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
        <Card>
          <EmptyState
            icon={<IconHistory />}
            title="Aún no hay planillas"
            description="Cuando generes la primera, aparecerá aquí con sus archivos y su personal."
            action={
              <Link href="/">
                <Button variant="primary">Generar planilla</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Eventos" value={filtered.length} />
            <Stat label="Horas del personal" value={formatHoras(totals.horas)} />
            <Stat label="Pagado al personal" value={formatCOP(totals.valor)} />
          </div>
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
          <Card>
            {filtered.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-muted">Ningún evento coincide con la búsqueda.</p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((e) => (
                  <li key={e.id}>
                    <Link href={`/planillas/${e.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-subtle/50 sm:px-5">
                      <div className="w-16 shrink-0 text-[13px] text-muted tabular">{fechaCorta(e.fecha)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{e.nombre}</p>
                        <p className="tabular text-xs text-faint">
                          {e.staffCount} personas · {formatHoras(e.totalHoras)} h · aforo {e.aforo ?? "—"}
                        </p>
                      </div>
                      <div className="tabular hidden text-right text-[13px] sm:block">{formatCOP(e.totalPagado)}</div>
                      <IconChevron className="text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
