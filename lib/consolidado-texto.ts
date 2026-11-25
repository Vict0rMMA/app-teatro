/**
 * Lee las celdas del consolidado pegadas desde Excel (columnas separadas por tabulador) SIN IA:
 * instantáneo, gratis y exacto. Devuelve null si el texto no parece la tabla del consolidado; en
 * ese caso la ruta usa Gemini. Copia los datos tal cual (sin corregir tildes ni códigos) y solo
 * avisa: horas ambiguas, proyecto o valor hora fuera del patrón, persona no encontrada.
 */
import type { Alerta, Extraccion, Fila } from "./cuenta-cobro";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const limpiar = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const soloDigitos = (s: string | undefined) => (s ?? "").replace(/\D/g, "");

type Col = "nombre" | "cedula" | "dependencia" | "fecha" | "evento" | "labor" | "inicio" | "fin" | "horas" | "valor_hora" | "total" | "centro" | "cuenta" | "proyecto";

/** Orden estándar del consolidado (cuando se pegan filas sin la cabecera). */
const ORDEN: Col[] = ["nombre", "cedula", "dependencia", "fecha", "evento", "labor", "inicio", "fin", "horas", "valor_hora", "total", "centro", "cuenta", "proyecto"];

function columnaDe(titulo: string): Col | null {
  const t = sinTildes(titulo);
  if (!t) return null;
  if (t.includes("CENTRO")) return "centro";
  if (t.includes("PROYECT")) return "proyecto";
  if (t.includes("CUENTA")) return "cuenta";
  if (t.includes("CEDULA")) return "cedula";
  if (t.includes("NOMBRE")) return "nombre";
  if (t.includes("FACULTAD") || t.includes("DEPENDENCIA")) return "dependencia";
  if (t.includes("FECHA")) return "fecha";
  if (t.includes("EVENTO") && !t.includes("PAGAR")) return "evento";
  if (t.includes("LABOR")) return "labor";
  if (t.includes("INICIO")) return "inicio";
  if (t.includes("FINAL") || t === "HORA FIN" || t.startsWith("HORA FI")) return "fin";
  if (t.includes("VALOR")) return "valor_hora";
  if (t.includes("TOTAL") && (t.includes("PAGAR") || t.includes("PAGO"))) return "total";
  if (t.includes("HORAS")) return "horas";
  return null;
}

/** "7:00AM", "6:00 a.m", "4:30 p. m.", "5.30PM", "18:30" → "HH:MM" (24 h) o null. */
export function hora24(texto: string): string | null {
  const m = /^(\d{1,2})[:.](\d{2})\s*(?:([ap])\.?\s*m?\.?)?$/i.exec(texto.trim().toLowerCase().replace(/\s+/g, " "));
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  if (m[3]) {
    if (h > 12) return null;
    h = h % 12;
    if (m[3] === "p") h += 12;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
const cambiarAmPm = (h: string) => `${String((Number(h.slice(0, 2)) + 12) % 24).padStart(2, "0")}${h.slice(2)}`;

/** "2/10/2026" → "02/10/2026" */
function fechaDMA(texto: string): string | null {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto.trim());
  if (!m) return null;
  return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
}

function moda<T>(xs: T[]): T | undefined {
  const c = new Map<T, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** ¿El nombre o la cédula de la fila corresponde a la persona buscada? */
function esLaPersona(buscada: string, nombre: string, cedula: string): boolean {
  const b = sinTildes(buscada);
  if (!b) return true;
  if (/^\d{5,12}$/.test(b.replace(/\D/g, "")) && b.replace(/\D/g, "") === cedula) return true;
  const palabras = b.split(" ").filter((w) => w.length > 2);
  const n = sinTildes(nombre);
  return palabras.length > 0 && palabras.filter((w) => n.includes(w)).length >= Math.min(2, palabras.length);
}

export function leerConsolidadoTexto(texto: string, persona?: string): Extraccion | null {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.split("\t"))
    .filter((c) => c.some((x) => x.trim()));
  if (!lineas.length || !lineas.some((c) => c.length >= 10)) return null;

  // Cabecera: la primera fila que nombra al menos fecha, evento y horas.
  let mapa: Partial<Record<Col, number>> | null = null;
  let inicio = 0;
  for (let i = 0; i < Math.min(lineas.length, 6); i++) {
    const m: Partial<Record<Col, number>> = {};
    lineas[i].forEach((t, j) => {
      const c = columnaDe(t);
      if (c && m[c] === undefined) m[c] = j;
    });
    if (m.fecha !== undefined && m.evento !== undefined && (m.horas !== undefined || m.inicio !== undefined)) {
      mapa = m;
      inicio = i + 1;
      break;
    }
  }
  if (!mapa) mapa = Object.fromEntries(ORDEN.map((c, i) => [c, i])) as Record<Col, number>;
  const col = (fila: string[], c: Col) => (mapa![c] === undefined ? "" : limpiar(fila[mapa![c]!]));

  const alertas: Alerta[] = [];
  type Cruda = Fila & { _nombre: string; _cedula: string };
  const crudas: Cruda[] = [];
  for (const fila of lineas.slice(inicio)) {
    const fecha = fechaDMA(col(fila, "fecha"));
    if (!fecha) continue; // títulos, subtotales o filas vacías
    const horas = Number(col(fila, "horas").replace(",", "."));
    let ini = hora24(col(fila, "inicio"));
    let fin = hora24(col(fila, "fin"));
    if (!ini || !fin || !Number.isFinite(horas)) return null; // no es la tabla esperada: que lo lea Gemini
    crudas.push({
      _nombre: col(fila, "nombre"),
      _cedula: soloDigitos(col(fila, "cedula")),
      dependencia: col(fila, "dependencia"),
      fecha,
      evento: col(fila, "evento"),
      labor: col(fila, "labor"),
      hora_inicio: ini,
      hora_fin: fin,
      horas,
      valor_hora: Number(soloDigitos(col(fila, "valor_hora"))),
      total: Number(soloDigitos(col(fila, "total"))),
      centro_costos: col(fila, "centro"),
      cuenta: soloDigitos(col(fila, "cuenta")) || col(fila, "cuenta"),
      proyecto: soloDigitos(col(fila, "proyecto")) || col(fila, "proyecto"),
    });
  }
  if (!crudas.length) return null;

  // Solo las filas de la persona (si el Excel trae varias).
  let mias = crudas.filter((f) => esLaPersona(persona ?? "", f._nombre, f._cedula));
  if (!mias.length) {
    const nombres = new Set(crudas.map((f) => sinTildes(f._nombre)));
    if (nombres.size === 1) {
      mias = crudas;
      alertas.push({ tipo: "persona_no_encontrada", fila: null, mensaje: `El nombre del consolidado (${crudas[0]._nombre}) no coincide con "${persona}". Se usaron sus filas; confirma que eres tú.` });
    } else {
      return {
        persona: { nombre: persona ?? "", cedula: "" },
        mes: 0,
        anio: 0,
        filas: [],
        alertas: [{ tipo: "persona_no_encontrada", fila: null, mensaje: `No hay filas de "${persona}" en el consolidado.` }],
      };
    }
  }

  // Horas ambiguas: si inicio→fin no da las horas, probar cambiando a.m./p.m. (ej. 8:00 AM–12:00 AM con 4 h).
  const filas: Fila[] = mias.map((f, i) => {
    const { _nombre, _cedula, ...fila } = f;
    void _nombre;
    void _cedula;
    const dura = (a: string, b: string) => (aMin(b) - aMin(a)) / 60;
    if (dura(fila.hora_inicio, fila.hora_fin) !== fila.horas) {
      const candidatos: Array<[string, string]> = [
        [fila.hora_inicio, cambiarAmPm(fila.hora_fin)],
        [cambiarAmPm(fila.hora_inicio), fila.hora_fin],
      ];
      const bueno = candidatos.find(([a, b]) => dura(a, b) === fila.horas);
      if (bueno) {
        alertas.push({ tipo: "hora_ambigua", fila: i, mensaje: `${fila.fecha} ${fila.evento}: la hora venía ambigua; se usó ${bueno[0]}–${bueno[1]} para que dé ${fila.horas} h.` });
        [fila.hora_inicio, fila.hora_fin] = bueno;
      }
    }
    return fila;
  });

  // Datos fuera del patrón: solo se avisan, no se cambian.
  const proyectoComun = moda(filas.map((f) => f.proyecto));
  const valorComun = moda(filas.map((f) => f.valor_hora));
  filas.forEach((f, i) => {
    if (f.proyecto !== proyectoComun) alertas.push({ tipo: "dato_inusual", fila: i, mensaje: `${f.fecha} ${f.evento}: PROYECTO ${f.proyecto} es distinto al de las demás filas (${proyectoComun}). Confírmalo con la coordinadora.` });
    if (f.valor_hora !== valorComun) alertas.push({ tipo: "dato_inusual", fila: i, mensaje: `${f.fecha} ${f.evento}: VALOR HORA ${f.valor_hora} distinto al usual (${valorComun}).` });
  });

  // Mes y año: los más frecuentes en las fechas (la validación avisa si alguna fila es de otro mes).
  const [mes, anio] = (moda(filas.map((f) => f.fecha.slice(3))) ?? "00/0000").split("/").map(Number);
  return {
    persona: { nombre: mias[0]._nombre || persona || "", cedula: mias[0]._cedula },
    mes,
    anio,
    filas,
    alertas,
  };
}
