"use client";

import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { firestore } from "./firebase/client";
import { DEFAULTS, LUGARES_INICIALES, type Defaults, type GenerateInput } from "./schemas";

export interface Profile {
  nombre: string;
  /** PNG en base64 (máx. 150 KB) */
  firma: string | null;
  defaults?: Partial<Defaults>;
  privacidadAceptadaEn?: Timestamp;
  createdAt?: Timestamp;
}

export interface WorkPlace {
  id: string;
  nombre: string;
  uid: string;
}

export interface WorkLog {
  id: string;
  uid: string;
  eventId: string | null;
  evento: string;
  placeId: string;
  fecha: string;
  llegada: string | null;
  salida: string | null;
  horas: number | null;
  valor: number | null;
  origen: "archivo" | "manual";
  /** coordinador para quien se trabajó (opcional) */
  paraQuien?: string | null;
  pendiente?: boolean;
}

export interface EventDoc {
  id: string;
  uid: string;
  nombre: string;
  evento: string;
  fecha: string;
  horaCitacion: string;
  horaEvento: string;
  salida: string;
  aforo: number | null;
  notaLlaves: string;
  evaluacion: GenerateInput["evaluacion"];
  observaciones: string;
  objetosPerdidos: string;
  whatsapp: string;
  sinFirma?: boolean;
  firmaEvento?: string | null;
  staffCount: number;
  totalHoras: number;
  totalPagado: number;
  createdAt?: Timestamp;
}

export interface StaffDoc {
  id: string;
  eventId: string;
  evento: string;
  fecha: string;
  orden: number;
  nombre: string;
  nombreNorm: string;
  cargo: "C" | "AC" | "A" | "";
  llegada: string | null;
  salida: string | null;
  horas: number | null;
  valor: number | null;
  pp: string;
  desempeno: string;
  observacion?: string;
  ubi?: string;
}

const db = () => firestore();

// ---------- Perfil ----------

export function watchProfile(uid: string, cb: (p: Profile | null) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    doc(db(), "users", uid),
    (s) => cb(s.exists() ? (s.data() as Profile) : null),
    (e) => onError?.(e),
  );
}

/** Crea el perfil y los lugares de trabajo iniciales (primer ingreso). */
export async function createProfile(uid: string, nombre: string, firma: string | null) {
  const batch = writeBatch(db());
  batch.set(doc(db(), "users", uid), {
    nombre: nombre.trim(),
    firma,
    defaults: DEFAULTS,
    privacidadAceptadaEn: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  const existing = await getDocs(query(collection(db(), "workPlaces"), where("uid", "==", uid), limit(1)));
  if (existing.empty) {
    LUGARES_INICIALES.forEach((nombre, i) => {
      batch.set(doc(collection(db(), "workPlaces")), {
        uid,
        nombre,
        // Orden estable: el teatro primero.
        createdAt: new Date(Date.now() + i),
      });
    });
  }
  await batch.commit();
}

export function updateProfile(uid: string, data: Partial<Profile>) {
  return updateDoc(doc(db(), "users", uid), data);
}

/** Guarda (o quita, con null) la firma en base64 dentro del perfil. */
export function setFirma(uid: string, base64: string | null) {
  return updateDoc(doc(db(), "users", uid), { firma: base64, updatedAt: serverTimestamp() });
}

// ---------- Lugares de trabajo ----------

export function watchPlaces(uid: string, cb: (p: WorkPlace[]) => void) {
  return onSnapshot(
    query(collection(db(), "workPlaces"), where("uid", "==", uid), orderBy("createdAt", "asc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkPlace, "id">) }))),
  );
}

export function addPlace(uid: string, nombre: string) {
  return setDoc(doc(collection(db(), "workPlaces")), { uid, nombre: nombre.trim(), createdAt: new Date() });
}

export function renamePlace(id: string, nombre: string) {
  return updateDoc(doc(db(), "workPlaces", id), { nombre: nombre.trim() });
}

export async function placeInUse(uid: string, placeId: string) {
  const s = await getDocs(query(collection(db(), "workLogs"), where("uid", "==", uid), where("placeId", "==", placeId), limit(1)));
  return !s.empty;
}

export function deletePlace(id: string) {
  return deleteDoc(doc(db(), "workPlaces", id));
}

// ---------- Mis horas ----------

export function watchWorkLogs(uid: string, cb: (logs: WorkLog[]) => void) {
  return onSnapshot(
    query(collection(db(), "workLogs"), where("uid", "==", uid), orderBy("fecha", "desc")),
    { includeMetadataChanges: true },
    (s) =>
      cb(
        s.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<WorkLog, "id">),
          pendiente: d.metadata.hasPendingWrites,
        })),
      ),
  );
}

export type WorkLogInput = Omit<WorkLog, "id" | "uid" | "pendiente">;

/**
 * Guarda sin esperar al servidor: con la caché persistente la escritura queda en cola
 * si no hay conexión y se sincroniza sola al volver.
 */
export function saveWorkLog(uid: string, data: WorkLogInput, id?: string) {
  const r = id ? doc(db(), "workLogs", id) : doc(collection(db(), "workLogs"));
  const payload = { ...data, uid, updatedAt: serverTimestamp(), ...(id ? {} : { createdAt: serverTimestamp() }) };
  const write = id ? updateDoc(r, payload) : setDoc(r, payload);
  return { id: r.id, synced: write };
}

export function deleteWorkLog(id: string) {
  return deleteDoc(doc(db(), "workLogs", id));
}

// ---------- Eventos y personal ----------

export function watchEvents(uid: string, cb: (events: EventDoc[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    query(collection(db(), "events"), where("uid", "==", uid), orderBy("fecha", "desc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventDoc, "id">) }))),
    (e) => onError?.(e),
  );
}

export function watchEvent(id: string, cb: (e: EventDoc | null) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    doc(db(), "events", id),
    (s) => cb(s.exists() ? ({ id: s.id, ...(s.data() as Omit<EventDoc, "id">) }) : null),
    (e) => onError?.(e),
  );
}

/**
 * Personal de un evento. Las reglas solo permiten listar documentos propios, así que la
 * consulta debe filtrar por uid; el orden se aplica aquí para no necesitar otro índice.
 */
export async function getStaff(eventId: string, uid: string): Promise<StaffDoc[]> {
  const s = await getDocs(query(collection(db(), "events", eventId, "staff"), where("uid", "==", uid)));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StaffDoc, "id">) })).sort((a, b) => a.orden - b.orden);
}

/** Todo el personal de todos los eventos del usuario (para la búsqueda por persona). */
export async function getAllStaff(uid: string): Promise<StaffDoc[]> {
  const s = await getDocs(query(collectionGroup(db(), "staff"), where("uid", "==", uid), orderBy("fecha", "desc")));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StaffDoc, "id">) }));
}
