"use client";

/**
 * Borradores en el propio equipo (IndexedDB), para no perder lo que se está llenando si se
 * recarga o se cierra la pestaña. Nunca van al servidor. Caducan a las 12 horas y se borran al
 * terminar (generar) o al empezar de nuevo. IndexedDB guarda File/Blob tal cual (el registro
 * subido y la firma del evento), cosa que localStorage no puede.
 */

const DB = "planillas-teatro";
const STORE = "borradores";
const CADUCA_MS = 12 * 60 * 60 * 1000;

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, modo);
      const r = fn(t.objectStore(STORE));
      r.onsuccess = () => resolve(r.result as T);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

type Guardado<T> = { guardadoEn: number; datos: T };

export async function guardarBorrador<T>(clave: string, datos: T): Promise<void> {
  try {
    await tx("readwrite", (s) => s.put({ guardadoEn: Date.now(), datos } satisfies Guardado<T>, clave));
  } catch {
    /* modo privado o sin espacio: simplemente no se guarda */
  }
}

export async function leerBorrador<T>(clave: string): Promise<T | null> {
  try {
    const g = await tx<Guardado<T> | undefined>("readonly", (s) => s.get(clave));
    if (!g) return null;
    if (Date.now() - g.guardadoEn > CADUCA_MS) {
      await borrarBorrador(clave);
      return null;
    }
    return g.datos;
  } catch {
    return null;
  }
}

export async function borrarBorrador(clave: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(clave));
  } catch {
    /* nada que borrar */
  }
}
