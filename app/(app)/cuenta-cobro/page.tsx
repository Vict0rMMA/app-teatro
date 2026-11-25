"use client";

import { useEffect, useMemo, useState } from "react";
import CuentaCobro from "@/components/CuentaCobro";
import { useSession } from "@/components/auth-provider";
import { PageHeader } from "@/components/ui";
import { watchWorkLogs, type WorkLog } from "@/lib/data";
import { workLogsARegistros } from "@/lib/registros";

export default function CuentaCobroPage() {
  const { user } = useSession();
  const [logs, setLogs] = useState<WorkLog[] | null>(null);

  // watchWorkLogs ya filtra por uid: solo los registros del usuario logueado.
  useEffect(() => watchWorkLogs(user.uid, setLogs), [user.uid]);
  const registros = useMemo(() => (logs ? workLogsARegistros(logs) : null), [logs]);

  const dia = new Date().getDate();
  const contexto =
    dia === 25
      ? "Hoy es el último día para enviarla (se reciben hasta el 25)."
      : dia < 25
        ? `Se reciben hasta el día 25: te ${25 - dia === 1 ? "queda 1 día" : `quedan ${25 - dia} días`} este mes.`
      : "El plazo de este mes cerró el día 25. La próxima va hasta el 25 del mes que viene.";

  return (
    <>
      <PageHeader eyebrow="Cuenta de cobro" title="Arma tu cuenta del mes" description={contexto} />
      <CuentaCobro registros={registros} pdfDisponible={process.env.NEXT_PUBLIC_PDF_CONVERTER_ENABLED === "true"} />
    </>
  );
}
