import { cleanSpaces, diffHoras, normalize, parseFechaEs, parseHora, parseMoney, parseNumber } from "../format";
import { RegistroError, type Cargo, type Registro, type StaffRow, type StaffRowRaw } from "./types";

export type Column = keyof StaffRowRaw;

/** Identifica la columna a partir del texto del encabezado. */
export function columnFor(header: string): Column | null {
  const h = normalize(header).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!h) return null;
  if (h.includes("NOMBRE")) return "nombre";
  if (h.includes("CEDULA") || h.includes("DOCUMENTO")) return "cedula";
  if (h.startsWith("UBI")) return "ubi";
  if (h.includes("LLEGADA")) return "llegada";
  if (h.includes("SALIDA")) return "salida";
  if (h.includes("TOTAL") || h === "HORAS") return "horas";
  if (h.includes("VALOR") || h.includes("PAGAD")) return "valor";
  if (h.includes("TELEFONO") || h.includes("CELULAR")) return "telefono";
  if (h.includes("CARGO")) return "cargo";
  if (h === "PP") return "pp";
  if (h.includes("DESEMP")) return "desempeno";
  if (h === "CC") return "cc";
  if (h.includes("OBSERV")) return "observacion";
  if (h === "N" || h === "NO" || h === "NRO" || h === "N0") return "n";
  return null;
}

function toCargo(v: string): Cargo {
  const t = v.toUpperCase().replace(/[^A-Z]/g, "");
  if (t === "C" || t === "AC" || t === "A") return t;
  if (t.startsWith("COORD")) return "C";
  return "";
}

/** Construye una fila a partir de un mapa columna -> texto. Devuelve null si no es una fila de personal. */
export function buildRow(cells: Partial<Record<Column, string>>, fallbackN: number): StaffRowRaw | null {
  const get = (c: Column) => cleanSpaces(cells[c] ?? "");
  const nombre = get("nombre");
  if (!nombre || /nombre\s+completo/i.test(nombre)) return null;
  const nText = get("n");
  if (nText && !/^\d{1,3}$/.test(nText)) return null;
  const llegada = parseHora(get("llegada"));
  const salida = parseHora(get("salida"));
  const horas = parseNumber(get("horas")) ?? diffHoras(llegada, salida);
  return {
    n: nText ? Number(nText) : fallbackN,
    nombre,
    cedula: get("cedula").replace(/[^\d]/g, ""),
    telefono: get("telefono").replace(/[^\d+]/g, ""),
    ubi: get("ubi"),
    llegada,
    salida,
    horas,
    valor: parseMoney(get("valor")),
    cargo: toCargo(get("cargo")),
    pp: get("pp"),
    desempeno: get("desempeno"),
    cc: get("cc"),
    observacion: get("observacion"),
  };
}

const HORA_RE = "(\\d{1,2}(?:\\s*[:.]\\s*\\d{2})?\\s*(?:[ap]\\.?\\s*m\\.?)?)";

/** Extrae evento, fecha y horas del texto de encabezado (líneas separadas por \n). */
export function parseHeader(text: string) {
  const plain = text.replace(/[ \t ]+/g, " ");
  const stop = "(?=FECHA\\s*:|HORA\\s+(?:DE\\s+|DEL\\s+)?(?:CITACI|EVENTO)|\\n|$)";
  const evento = plain.match(new RegExp(`NOMBRE\\s+DEL\\s+EVENTO\\s*:?\\s*([^\\n]+?)\\s*${stop}`, "i"))?.[1] ?? "";
  const fechaTexto = plain.match(new RegExp(`FECHA\\s*:?\\s*([^\\n]+?)\\s*${stop}`, "i"))?.[1] ?? "";
  const cit = plain.match(new RegExp(`HORA\\s+(?:DE\\s+)?CITACI[OÓ]N\\s*:?\\s*${HORA_RE}`, "i"))?.[1];
  const ev = plain.match(new RegExp(`HORA\\s+(?:DEL?\\s+)?EVENTO\\s*:?\\s*${HORA_RE}`, "i"))?.[1];
  return {
    evento: cleanSpaces(evento),
    fechaTexto: cleanSpaces(fechaTexto),
    fecha: fechaTexto ? parseFechaEs(fechaTexto) : null,
    horaCitacion: parseHora(cit),
    horaEvento: parseHora(ev),
  };
}

export function finalizeRegistro(headerText: string, rows: StaffRowRaw[]): Registro {
  if (!rows.length) {
    throw new RegistroError("SIN_PERSONAL", "La tabla de personal está vacía: no se encontró ninguna persona registrada.");
  }
  const h = parseHeader(headerText);
  const warnings: string[] = [];
  if (!h.evento) warnings.push("No se encontró el nombre del evento.");
  if (!h.fecha) warnings.push("No se pudo leer la fecha del evento.");
  if (!h.horaCitacion) warnings.push("No se encontró la hora de citación.");
  if (!h.horaEvento) warnings.push("No se encontró la hora del evento.");
  return { ...h, staff: rows, warnings };
}

/** Quita cédula y teléfono antes de que los datos salgan del servidor. */
export function sanitizeRegistro(r: Registro): Registro<StaffRow> {
  return {
    ...r,
    staff: r.staff.map(({ cedula: _c, telefono: _t, ...rest }) => rest),
  };
}
