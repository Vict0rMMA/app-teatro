"use client";

import { sendPasswordResetEmail } from "firebase/auth";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { Button, Field, Input } from "@/components/ui";
import { authMessage } from "@/lib/auth-errors";
import { firebaseAuth } from "@/lib/firebase/client";

export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await sendPasswordResetEmail(firebaseAuth(), email.trim());
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // No revelamos si el correo existe.
      if (code === "auth/user-not-found") setSent(true);
      else setError(authMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Recupera tu contraseña"
      description={sent ? undefined : "Te enviaremos un enlace para crear una nueva."}
      footer={
        <Link href="/login" className="font-medium text-fg hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-box border border-border bg-surface p-4 text-sm">
          Si existe una cuenta con <span className="font-medium">{email}</span>, te llegará un correo con el enlace en unos minutos.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Correo" error={error}>
            {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Enviar enlace
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
