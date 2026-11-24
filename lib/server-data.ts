import "server-only";
import { HttpError } from "./api";
import { adminDb } from "./firebase/admin";
import type { EventoGuardado, StaffGuardado } from "./planillas-evento";

/** Carga un evento (y su personal) verificando que pertenezca al usuario. */
export async function ownedEvent(uid: string, eventId: string) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(eventId)) throw new HttpError(404, "Planilla no encontrada.", "NO_ENCONTRADO");
  const ref = adminDb().collection("events").doc(eventId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.uid !== uid) throw new HttpError(404, "Planilla no encontrada.", "NO_ENCONTRADO");
  return { ref, data: snap.data() as EventoGuardado };
}

export async function eventStaff(eventId: string): Promise<StaffGuardado[]> {
  const s = await adminDb().collection("events").doc(eventId).collection("staff").orderBy("orden").get();
  return s.docs.map((d) => d.data() as StaffGuardado);
}

/** Firma del perfil: PNG en base64 dentro de users/{uid}.firma. */
export async function loadFirma(uid: string): Promise<Buffer | null> {
  const b64 = (await adminDb().collection("users").doc(uid).get()).data()?.firma as string | undefined;
  return b64 ? Buffer.from(b64, "base64") : null;
}

/** Borra todos los documentos de una colección que pertenecen al usuario (con sus subcolecciones). */
export async function deleteOwned(collection: string, uid: string) {
  const db = adminDb();
  const snap = await db.collection(collection).where("uid", "==", uid).get();
  for (const doc of snap.docs) await db.recursiveDelete(doc.ref);
  return snap.size;
}
