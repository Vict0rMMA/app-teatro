"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getToken, initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

/**
 * Dominio por el que pasa el inicio de sesión con Google: siempre el de Firebase
 * (<proyecto>.firebaseapp.com), que funciona en todos los navegadores. Se probó pasarlo por el dominio
 * de la app (/__/auth por proxy) y bloqueadores como el de Opera dejaban la ventana en blanco; se
 * descartó. Se ignora NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN a propósito.
 */
function dominioDeLogin(): string {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem("probar-login"); // marca del modo de prueba que ya no existe
    } catch {
      /* sin almacenamiento */
    }
  }
  return `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`;
}

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: dominioDeLogin(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let db: Firestore;
let appCheck: AppCheck | null = null;

function init() {
  if (app) return;
  if (!config.apiKey || !config.projectId) {
    throw new Error("Faltan las variables NEXT_PUBLIC_FIREBASE_* (ver .env.example).");
  }
  const fresh = !getApps().length;
  app = fresh ? initializeApp(config) : getApp();
  // Caché local persistente: "Mis horas" sigue funcionando sin conexión y sincroniza al volver.
  db = fresh
    ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
    : getFirestore(app);
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (siteKey && typeof window !== "undefined") {
    appCheck = initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
  }
}

export function firebaseAuth(): Auth {
  init();
  return getAuth(app);
}

export function firestore(): Firestore {
  init();
  return db;
}

/** fetch hacia /api con el ID token y el token de App Check. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  if (appCheck) {
    try {
      headers.set("X-Firebase-AppCheck", (await getToken(appCheck)).token);
    } catch {
      /* el servidor decide si App Check es obligatorio */
    }
  }
  return fetch(input, { ...init, headers });
}

/** Igual que apiFetch, pero lanza un Error con el mensaje del servidor si la respuesta no es 2xx. */
export async function apiJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error ?? `Error ${res.status}`) as Error & { code?: string; status?: number };
    err.code = body.code;
    err.status = res.status;
    throw err;
  }
  return body as T;
}
