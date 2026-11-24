import "server-only";
import { HttpError } from "./api";
import { adminBucket, adminDb } from "./firebase/admin";

export interface StoredFile {
  template: "LLAVES" | "COLILLAS" | "EVALUACION";
  name: string;
  path: string;
}

/** Carga un evento verificando que pertenezca al usuario. */
export async function ownedEvent(uid: string, eventId: string) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(eventId)) throw new HttpError(404, "Planilla no encontrada.", "NO_ENCONTRADO");
  const ref = adminDb().collection("events").doc(eventId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.uid !== uid) throw new HttpError(404, "Planilla no encontrada.", "NO_ENCONTRADO");
  return { ref, data: snap.data() as { nombre: string; fecha: string; files: StoredFile[] } };
}

export async function deleteStoragePrefix(prefix: string) {
  await adminBucket().deleteFiles({ prefix, force: true });
}

/** Borra todos los documentos de una colección que pertenecen al usuario. */
export async function deleteOwned(collection: string, uid: string) {
  const db = adminDb();
  const snap = await db.collection(collection).where("uid", "==", uid).get();
  for (const doc of snap.docs) await db.recursiveDelete(doc.ref);
  return snap.size;
}
