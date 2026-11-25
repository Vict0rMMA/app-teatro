/**
 * Registros personales de horas (los de "Mis horas") y su comparación con el consolidado.
 *
 * Regla: el consolidado manda. Estos registros solo sirven para COMPARAR y avisar; nunca cambian
 * filas, horas, valores, centros de costos, cuenta ni proyecto de la cuenta de cobro. Todo lo de
 * aquí es código determinista: la IA no participa.
 */

export type RegistroPersonal = {
  fecha: string; // DD/MM/AAAA
  evento?: string;
  hora_inicio: string; // HH:MM ("" si no se anotó)
  hora_fin: string;
  horas: number;
};

export const MAX_HORAS_DIA = 8;

export type EstadoDia = "normal" | "limite" | "excedido";

/** Más de 8 h = excedido (rojo); 8 h exactas = límite (ámbar); el resto, normal. */
export function estadoDia(horas: number): EstadoDia {
  if (horas > MAX_HORAS_DIA) return "excedido";
  if (horas === MAX_HORAS_DIA) return "limite";
  return "normal";
}

/** Clases de Tailwind para pintar un día con horas en el calendario. */
export const COLOR_DIA: Record<EstadoDia, string> = {
  normal: "bg-fg/[0.07] text-fg font-semibold",
  limite: "bg-warn/20 text-warn font-semibold ring-1 ring-inset ring-warn/50",
  excedido: "bg-danger text-white font-semibold",
};

const fmtH = (h: number) => `${Number.isInteger(h) ? h : h.toLocaleString("es-CO", { maximumFractionDigits: 2 })} h`;

/** Aviso para un día; null si no hay nada que avisar. No bloquea el guardado. */
export function mensajeDia(horas: number): string | null {
  const e = estadoDia(horas);
  if (e === "excedido") return `Ese día te pasaste de ${MAX_HORAS_DIA} h (llevas ${fmtH(horas)}).`;
  if (e === "limite") return `Ese día llegaste al máximo de ${MAX_HORAS_DIA} h.`;
  return null;
}

/** "2026-10-05" → "05/10/2026" */
export const isoADia = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Suma de horas por fecha (DD/MM/AAAA). */
export function horasPorFecha(registros: Array<{ fecha: string; horas: number }>): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of registros) m[r.fecha] = (m[r.fecha] ?? 0) + (Number.isFinite(r.horas) ? r.horas : 0);
  return m;
}

/**
 * Adaptador: turnos de Mis horas (colección `workLogs`, ya filtrada por el usuario) → RegistroPersonal.
 * Los turnos sin horas se ignoran.
 */
export function workLogsARegistros(
  logs: Array<{ fecha: string; evento: string; llegada: string | null; salida: string | null; horas: number | null }>,
): RegistroPersonal[] {
  return logs
    .filter((l) => typeof l.horas === "number" && l.horas > 0 && /^\d{4}-\d{2}-\d{2}$/.test(l.fecha))
    .map((l) => ({
      fecha: isoADia(l.fecha),
      evento: l.evento || undefined,
      hora_inicio: l.llegada ?? "",
      hora_fin: l.salida ?? "",
      horas: l.horas as number,
    }));
}

export type EstadoComparacion = "coincide" | "diferente" | "solo_consolidado" | "solo_registro";

export type Comparacion = {
  fecha: string;
  horas_consolidado: number;
  horas_registro: number;
  estado: EstadoComparacion;
  excedido_8h_en_registro: boolean;
  mensaje: string;
};

const claveFecha = (f: string) => f.split("/").reverse().join("");

/**
 * Compara, día por día, el consolidado con los registros personales del mismo mes.
 * Solo informa: el resultado no se usa para calcular nada de la cuenta.
 */
export function comparar(
  filas: Array<{ fecha: string; horas: number }>,
  registros: RegistroPersonal[],
  mes: number,
  anio: number,
): Comparacion[] {
  const delMes = registros.filter((r) => {
    const [, mm, aa] = r.fecha.split("/").map(Number);
    return mm === mes && aa === anio;
  });
  const cons = horasPorFecha(filas);
  const reg = horasPorFecha(delMes);
  const fechas = [...new Set([...Object.keys(cons), ...Object.keys(reg)])].sort((a, b) => claveFecha(a).localeCompare(claveFecha(b)));

  return fechas.map((fecha) => {
    const hc = cons[fecha] ?? 0;
    const hr = reg[fecha] ?? 0;
    const enC = fecha in cons;
    const enR = fecha in reg;
    const excedido = hr > MAX_HORAS_DIA;

    let estado: EstadoComparacion;
    let mensaje: string;
    if (enC && !enR) {
      estado = "solo_consolidado";
      mensaje = `Está en el consolidado (${fmtH(hc)}) pero no en tu registro.`;
    } else if (!enC && enR) {
      estado = "solo_registro";
      mensaje = `Tienes ${fmtH(hr)} en tu registro y el consolidado no trae nada. No entra en la cuenta; tu registro queda como respaldo para reclamar.`;
    } else if (Math.abs(hc - hr) < 1e-9) {
      estado = "coincide";
      mensaje = `Coincide: ${fmtH(hc)}.`;
    } else if (hr > hc) {
      estado = "diferente";
      mensaje = `Tu registro tiene ${fmtH(hr)} y el consolidado ${fmtH(hc)}. En la cuenta va lo del consolidado; tu registro queda como respaldo para reclamar.`;
    } else {
      estado = "diferente";
      mensaje = `El consolidado tiene ${fmtH(hc)} y tu registro ${fmtH(hr)}. En la cuenta va lo del consolidado.`;
    }
    if (excedido) mensaje += ` Ese día te pasaste de ${MAX_HORAS_DIA} h en tu registro.`;

    return { fecha, horas_consolidado: hc, horas_registro: hr, estado, excedido_8h_en_registro: excedido, mensaje };
  });
}

/** Valida lo que manda el cliente (forma y tamaño); descarta lo que no cuadra. */
export function sanearRegistros(v: unknown): RegistroPersonal[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 1000)
    .filter(
      (r): r is RegistroPersonal =>
        !!r &&
        typeof r === "object" &&
        typeof (r as RegistroPersonal).fecha === "string" &&
        /^\d{2}\/\d{2}\/\d{4}$/.test((r as RegistroPersonal).fecha) &&
        typeof (r as RegistroPersonal).horas === "number" &&
        Number.isFinite((r as RegistroPersonal).horas) &&
        (r as RegistroPersonal).horas >= 0 &&
        (r as RegistroPersonal).horas <= 24,
    )
    .map((r) => ({
      fecha: r.fecha,
      evento: typeof r.evento === "string" ? r.evento.slice(0, 160) : undefined,
      hora_inicio: typeof r.hora_inicio === "string" ? r.hora_inicio.slice(0, 5) : "",
      hora_fin: typeof r.hora_fin === "string" ? r.hora_fin.slice(0, 5) : "",
      horas: r.horas,
    }));
}
