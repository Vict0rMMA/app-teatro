export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const MINUSCULAS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "en", "a", "para", "por", "con", "al", "o"]);

/** Quita tildes, pasa a minúsculas y colapsa espacios. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** "RED DE ESCUELAS" -> "Red de Escuelas". Respeta siglas cortas con dígitos (D2, XV). */
export function titleCase(text: string): string {
  return cleanSpaces(text)
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (i > 0 && MINUSCULAS.has(w)) return w;
      if (/^[ivxlcdm]+$/.test(w) && w.length <= 4) return w.toUpperCase();
      if (/\d/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Convierte "18 DE NOVIEMBRE 2026", "05 NOVIEMBRE DE 2026", "1 de noviembre del 2026" en "2026-11-18". */
export function parseFechaEs(text: string): string | null {
  const t = normalize(text);
  const m = t.match(/(\d{1,2})\s*(?:de\s+)?([a-z]+)\s*(?:de\s+|del\s+)?(\d{4})/);
  if (m) {
    const mes = MESES.findIndex((x) => normalize(x) === m[2] || normalize(x).startsWith(m[2].slice(0, 3)));
    const d = Number(m[1]);
    if (mes >= 0 && d >= 1 && d <= 31) return `${m[3]}-${pad(mes + 1)}-${pad(d)}`;
  }
  const n = t.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (n) return `${n[3]}-${pad(Number(n[2]))}-${pad(Number(n[1]))}`;
  return null;
}

function partes(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d, date: new Date(Date.UTC(y, m - 1, d)) };
}

export function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(partes(v).date.getTime());
}

/** "18 de Noviembre del 2026" (formato de LLAVES) */
export function fechaLlaves(iso: string): string {
  const { y, m, d } = partes(iso);
  return `${pad(d)} de ${MESES[m - 1]} del ${y}`;
}

/** "18 de Noviembre" */
export function fechaDiaMes(iso: string): string {
  const { m, d } = partes(iso);
  return `${pad(d)} de ${MESES[m - 1]}`;
}

export function diaSemana(iso: string): string {
  return DIAS[partes(iso).date.getUTCDay()];
}

/** "Martes 18 de Noviembre" — sin cero a la izquierda, para el mensaje de WhatsApp. */
export function fechaWhatsapp(iso: string): string {
  const { m, d } = partes(iso);
  return `${diaSemana(iso)} ${d} de ${MESES[m - 1]}`;
}

export function fechaCorta(iso: string): string {
  const { y, m, d } = partes(iso);
  return `${d} ${MESES[m - 1].slice(0, 3).toLowerCase()} ${y}`;
}

/** Acepta "6:00 PM", "3:30PM", "10:30 p.m.", "5 30 pm", "18:00". Devuelve "HH:mm" en 24 h. */
export function parseHora(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = normalize(text).replace(/\./g, "");
  const m = t.match(/(\d{1,2})(?:\s*[:h\s]\s*(\d{2}))?\s*(am|pm|a m|p m)?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const mer = m[3]?.replace(/\s/g, "");
  if (h > 23 || min > 59) return null;
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return `${pad(h)}:${pad(min)}`;
}

/** "19:30" -> "7:30 PM" */
export function hora12(hhmm: string | null | undefined, lower = false): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const mer = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const out = `${h12}:${pad(m)} ${mer}`;
  return lower ? out.toLowerCase() : out;
}

/** Diferencia en horas entre dos "HH:mm"; si la salida es menor, cruza medianoche. */
export function diffHoras(llegada: string | null, salida: string | null): number | null {
  if (!llegada || !salida) return null;
  const [h1, m1] = llegada.split(":").map(Number);
  const [h2, m2] = salida.split(":").map(Number);
  let mins = h2 * 60 + m2 - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

/** "$60.000" -> 60000 ; "60,000" -> 60000 */
export function parseMoney(text: string | null | undefined): number | null {
  if (!text) return null;
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

/** "6", "6,5", "6.5" -> número */
export function parseNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(",", ".").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function formatCOP(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString("es-CO");
}

/**
 * Lee una duración en horas: "5", "5,5", "5.5", "5:30", "5h30", "5 h 30 min", "30 min".
 * Devuelve horas con decimales (5:30 → 5,5) o null si no se entiende.
 */
export function parseDuracion(text: string | null | undefined): number | null {
  if (text == null) return null;
  const t = normalize(String(text)).replace(/\s+/g, "");
  if (!t) return null;
  let m = t.match(/^(\d{1,2})(?::|h|hr|hrs|horas?)(\d{1,2})(?:m|min|minutos?)?$/);
  if (m) return Number(m[2]) < 60 ? Math.round((Number(m[1]) + Number(m[2]) / 60) * 100) / 100 : null;
  m = t.match(/^(\d{1,3})(?:m|min|minutos?)$/);
  if (m) return Math.round((Number(m[1]) / 60) * 100) / 100;
  m = t.match(/^(\d{1,2}(?:[.,]\d{1,2})?)(?:h|hr|hrs|horas?)?$/);
  if (m) return Number(m[1].replace(",", "."));
  return null;
}

/** Para mostrar en la app: 5 → "5 h", 5,5 → "5 h 30 min", 0,5 → "30 min". */
export function formatDuracion(n: number | null | undefined): string {
  if (n == null) return "—";
  const total = Math.round(Math.abs(n) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const sign = n < 0 ? "−" : "";
  if (!m) return `${sign}${h} h`;
  return h ? `${sign}${h} h ${m} min` : `${sign}${m} min`;
}

/** Para los campos editables: 5 → "5", 5,5 → "5:30". */
export function duracionCampo(n: number | null | undefined): string {
  if (n == null) return "";
  const total = Math.round(n * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}:${String(m).padStart(2, "0")}` : String(h);
}

/** Para los documentos de Word (TOTAL HORAS), sin decimales: 5 → "5", 5 h 30 min → "5:30". */
export function formatHoras(n: number | null | undefined): string {
  if (n == null) return "—";
  return duracionCampo(n);
}

/** Nombre de evento apto para archivo, con tildes y ñ: "Grados – Mañana" -> "GRADOS_MAÑANA" */
export function eventoArchivo(evento: string): string {
  return cleanSpaces(evento)
    .normalize("NFC")
    .toUpperCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .trim()
    .replace(/ +/g, "_");
}

export function nombresArchivo(evento: string, iso: string) {
  const base = `${fechaDiaMes(iso).replace(/ /g, "_")}_${eventoArchivo(evento)}`;
  return {
    llaves: `${base}-_LLAVES.docx`,
    colillas: `${base}-COLILLAS.docx`,
    evaluacion: `${base}-EVALUACION.docx`,
    registro: `REGISTRO_${eventoArchivo(evento)}.docx`,
  };
}

export function mensajeWhatsapp(input: {
  fecha: string;
  evento: string;
  aforo: number | null;
  observaciones: string;
  objetosPerdidos: string;
}): string {
  return [
    `*${fechaWhatsapp(input.fecha)}: ${titleCase(input.evento)}*`,
    "",
    `*Aforo:* ${input.aforo ?? "____"} personas`,
    "",
    `*Observaciones:* ${cleanSpaces(input.observaciones)}`,
    "",
    `*Objetos perdidos:* ${cleanSpaces(input.objetosPerdidos)}`,
  ].join("\n");
}

/** Puntaje de coincidencia entre el nombre del perfil y el de la tabla (0..1). */
export function nameScore(perfil: string, fila: string): number {
  const a = normalize(perfil).split(" ").filter(Boolean);
  const b = new Set(normalize(fila).split(" ").filter(Boolean));
  if (!a.length || !b.size) return 0;
  const shared = a.filter((t) => b.has(t)).length;
  if (shared < Math.min(2, a.length, b.size)) return 0;
  return shared / Math.min(a.length, b.size);
}

export function findBestNameMatch<T extends { nombre: string }>(perfil: string, rows: T[]): number {
  let best = -1;
  let bestScore = 0.66;
  rows.forEach((r, i) => {
    const s = nameScore(perfil, r.nombre);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  });
  return best;
}
