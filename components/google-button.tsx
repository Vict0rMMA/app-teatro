"use client";

import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { useState } from "react";
import { authMessage } from "@/lib/auth-errors";
import { firebaseAuth } from "@/lib/firebase/client";
import { IconGoogle } from "./icons";
import { useToast } from "./toast";
import { Button } from "./ui";

export function GoogleButton({ label = "Continuar con Google" }: { label?: string }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(firebaseAuth(), provider);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(firebaseAuth(), provider);
        return;
      }
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        toast.error("No se pudo entrar con Google", authMessage(err));
      }
      setLoading(false);
    }
  }

  return (
    <Button className="w-full" onClick={go} loading={loading} icon={<IconGoogle />}>
      {label}
    </Button>
  );
}

export function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-faint">
      <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
    </div>
  );
}
