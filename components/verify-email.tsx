"use client";

import { sendEmailVerification } from "firebase/auth";
import { useState } from "react";
import { firebaseAuth } from "@/lib/firebase/client";
import { useAuth } from "./auth-provider";
import { AuthCard } from "./auth-card";
import { useToast } from "./toast";
import { Button } from "./ui";

export function VerifyEmail() {
  const { user, refreshUser, signOut } = useAuth();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  async function resend() {
    if (!user) return;
    setSending(true);
    try {
      await sendEmailVerification(user);
      toast.success("Correo enviado", `Revisa ${user.email} (también la carpeta de spam).`);
    } catch {
      toast.error("No se pudo enviar", "Espera un minuto e intenta de nuevo.");
    } finally {
      setSending(false);
    }
  }

  async function check() {
    setChecking(true);
    await refreshUser();
    setChecking(false);
    if (!firebaseAuth().currentUser?.emailVerified) toast.info("Aún no aparece verificado", "Abre el enlace del correo y vuelve a intentar.");
  }

  return (
    <AuthCard title="Verifica tu correo" description={<>Te enviamos un enlace a <span className="font-medium text-fg">{user?.email}</span>. Ábrelo para activar tu cuenta.</>}>
      <div className="space-y-2">
        <Button variant="primary" className="w-full" onClick={check} loading={checking}>
          Ya lo verifiqué
        </Button>
        <Button className="w-full" onClick={resend} loading={sending}>
          Reenviar correo
        </Button>
        <Button variant="ghost" className="w-full" onClick={signOut}>
          Usar otra cuenta
        </Button>
      </div>
    </AuthCard>
  );
}
