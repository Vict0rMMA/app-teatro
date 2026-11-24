"use client";

import { GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, type AuthProvider } from "firebase/auth";
import { useState } from "react";
import { authMessage } from "@/lib/auth-errors";
import { firebaseAuth } from "@/lib/firebase/client";
import { IconGoogle } from "./icons";
import { useToast } from "./toast";
import { Button } from "./ui";

function IconMicrosoft() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden>
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

function providerFor(kind: "google" | "microsoft"): AuthProvider {
  if (kind === "google") {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    return p;
  }
  const p = new OAuthProvider("microsoft.com");
  // "common": cuentas personales (Outlook/Hotmail) y de trabajo o universidad.
  p.setCustomParameters({ prompt: "select_account", tenant: "common" });
  return p;
}

function OAuthButton({ kind, label }: { kind: "google" | "microsoft"; label: string }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    const provider = providerFor(kind);
    try {
      await signInWithPopup(firebaseAuth(), provider);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(firebaseAuth(), provider);
        return;
      }
      if (code === "auth/operation-not-allowed") {
        toast.error(`El ingreso con ${kind === "google" ? "Google" : "Microsoft"} aún no está activado`, "Usa tu correo y contraseña mientras tanto.");
      } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        toast.error("No se pudo iniciar sesión", authMessage(err));
      }
      setLoading(false);
    }
  }

  return (
    <Button className="w-full" onClick={go} loading={loading} icon={kind === "google" ? <IconGoogle /> : <IconMicrosoft />}>
      {label}
    </Button>
  );
}

/** Google (Gmail) y Microsoft (Outlook/Hotmail). Sin SMS: tiene costo. */
export function OAuthButtons({ verb = "Continuar" }: { verb?: string }) {
  return (
    <div className="space-y-2">
      <OAuthButton kind="google" label={`${verb} con Google`} />
      <OAuthButton kind="microsoft" label={`${verb} con Microsoft`} />
    </div>
  );
}

export function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-faint">
      <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
    </div>
  );
}
