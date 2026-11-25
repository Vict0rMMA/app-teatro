/**
 * Permisos por cuenta: qué secciones puede ver y usar cada persona.
 * Se guardan en Firestore en permisos/{uid} = { secciones: Seccion[] }. Solo el servidor (firebase-admin)
 * escribe ahí; cada persona puede leer el suyo. Sin documento = acceso completo (por defecto, quien entra
 * puede usar todo; el administrador quita secciones después). La administradora siempre tiene todo.
 */

export type Seccion = "planillas" | "horas" | "cobro" | "ajustes";

export const SECCIONES: Array<{ id: Seccion; label: string; rutas: string[] }> = [
  { id: "planillas", label: "Planillas e historial", rutas: ["/", "/planillas"] },
  { id: "horas", label: "Mis horas", rutas: ["/horas"] },
  { id: "cobro", label: "Cuenta de cobro", rutas: ["/cuenta-cobro"] },
  { id: "ajustes", label: "Ajustes", rutas: ["/ajustes"] },
];

export const TODAS: Seccion[] = SECCIONES.map((s) => s.id);

export function esSeccion(v: unknown): v is Seccion {
  return typeof v === "string" && (TODAS as string[]).includes(v);
}

/** Limpia lo que llega (solo secciones válidas, sin repetir, en orden). */
export function sanearSecciones(v: unknown): Seccion[] {
  const set = new Set(Array.isArray(v) ? v.filter(esSeccion) : []);
  return TODAS.filter((s) => set.has(s));
}

/** Sección a la que pertenece una ruta de la app; null = libre (por ejemplo, Administración o 404). */
export function seccionDeRuta(pathname: string): Seccion | null {
  for (const s of SECCIONES) {
    for (const r of s.rutas) {
      if (r === "/" ? pathname === "/" : pathname === r || pathname.startsWith(`${r}/`)) return s.id;
    }
  }
  return null;
}

/** Primera ruta a la que la persona sí puede entrar (para redirigir). */
export function rutaInicial(secciones: Seccion[]): string | null {
  const s = SECCIONES.find((x) => secciones.includes(x.id));
  return s ? (s.id === "planillas" ? "/planillas" : s.rutas[0]) : null;
}

/**
 * Cuentas creadas antes de que existieran los permisos: conservan acceso completo aunque aún no
 * tengan documento (Administración se lo crea la primera vez que se abre). Las nuevas quedan pendientes.
 */
export const PERMISOS_DESDE = Date.parse("2026-11-25T16:00:00Z");
export function cuentaAnterior(creationTime: string | null | undefined): boolean {
  const t = creationTime ? Date.parse(creationTime) : NaN;
  return Number.isFinite(t) && t < PERMISOS_DESDE;
}

export function esAdminEmail(email: string | null | undefined, admin: string | null | undefined): boolean {
  const a = admin?.trim().toLocaleLowerCase("en-US");
  return !!a && !!email && email.toLocaleLowerCase("en-US") === a;
}
