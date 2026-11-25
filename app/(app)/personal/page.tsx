"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/auth-provider";
import { IconChevron, IconSearch } from "@/components/icons";
import { Badge, EmptyState, Input, PageHeader, Skeleton, cx } from "@/components/ui";
import { getAllStaff, type StaffDoc } from "@/lib/data";
import { fechaCorta, formatCOP, normalize, formatDuracion } from "@/lib/format";

interface Person {
  key: string;
  nombre: string;
  eventos: StaffDoc[];
  horas: number;
  valor: number;
  cargos: Set<string>;
}

export default function PersonalPage() {
  const { user } = useSession();
  const [staff, setStaff] = useState<StaffDoc[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    getAllStaff(user.uid)
      .then(setStaff)
      .catch(() => {
        setError(true);
        setStaff([]);
      });
  }, [user.uid]);

  const people = useMemo(() => {
    const m = new Map<string, Person>();
    for (const s of staff ?? []) {
      const key = s.nombreNorm || normalize(s.nombre);
      const p = m.get(key) ?? { key, nombre: s.nombre, eventos: [], horas: 0, valor: 0, cargos: new Set<string>() };
      p.eventos.push(s);
      p.horas += s.horas ?? 0;
      p.valor += s.valor ?? 0;
      if (s.cargo) p.cargos.add(s.cargo);
      m.set(key, p);
    }
    return [...m.values()].sort((a, b) => b.eventos.length - a.eventos.length || a.nombre.localeCompare(b.nombre));
  }, [staff]);

  const filtered = useMemo(() => {
    const t = normalize(q);
    return t ? people.filter((p) => p.key.includes(t)) : people;
  }, [people, q]);

  return (
    <>
      <PageHeader
        title="Personal"
        description={staff === null ? "Cargando…" : people.length ? `${people.length} personas en tus planillas. Busca a alguien para ver sus eventos, horas y pagos.` : "Quién ha trabajado contigo, evento por evento."}
      />

      {staff === null ? (
        <Skeleton className="h-48 w-full" />
      ) : people.length === 0 ? (
        <div className="border-y border-border">
          <EmptyState
            title={error ? "No se pudo cargar el personal" : "Aún no hay personal"}
            description={
              error
                ? "Revisa tu conexión. Si el problema sigue, el índice de Firestore puede estar creándose."
                : "La lista se arma sola con el registro de cada planilla que generes."
            }
          />
        </div>
      ) : (
        <>
          <div className="relative mb-3">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input className="pl-9" placeholder={`Buscar entre ${people.length} personas`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <div className="border-y border-border">
            {filtered.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-muted">Nadie con ese nombre.</p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.slice(0, 200).map((p) => {
                  const expanded = open === p.key;
                  return (
                    <li key={p.key}>
                      <button
                        onClick={() => setOpen(expanded ? null : p.key)}
                        aria-expanded={expanded}
                        className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors duration-100 hover:bg-subtle/40 sm:px-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.nombre}</p>
                          <p className="tabular text-xs text-muted">
                            {p.eventos.length} {p.eventos.length === 1 ? "evento" : "eventos"} · {formatDuracion(p.horas)}
                          </p>
                        </div>
                        <div className="hidden gap-3 sm:flex">
                          {[...p.cargos].map((c) => (
                            <Badge key={c} tone={c === "C" ? "brand" : "neutral"}>
                              {c}
                            </Badge>
                          ))}
                        </div>
                        <span className="tabular w-24 text-right text-[13px] font-medium">{formatCOP(p.valor)}</span>
                        <IconChevron className={cx("text-faint transition-transform duration-100", expanded && "rotate-90")} />
                      </button>
                      {expanded && (
                        <ul className="border-t border-border bg-subtle/40">
                          {p.eventos.map((s) => (
                            <li key={`${s.eventId}-${s.id}`}>
                              <Link href={`/planillas/${s.eventId}`} className="flex items-center gap-3 px-2 py-2 text-[13px] hover:bg-subtle sm:pl-6">
                                <span className="tabular w-20 shrink-0 text-muted">{fechaCorta(s.fecha)}</span>
                                <span className="min-w-0 flex-1 truncate">{s.evento}</span>
                                {s.cargo && <Badge>{s.cargo}</Badge>}
                                <span className="tabular w-20 whitespace-nowrap text-right">{formatDuracion(s.horas)}</span>
                                <span className="tabular w-20 text-right text-muted">{formatCOP(s.valor)}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
