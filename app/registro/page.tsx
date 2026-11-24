"use client";

import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { RedirectIfAuthed } from "@/components/auth-provider";
import { GoogleButton } from "@/components/google-button";
import { Button, Field, Input } from "@/components/ui";
import { authMessage } from "@/lib/auth-errors";
import { firebaseAuth } from "@/lib/firebase/client";

export default function RegistroPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (!acepta) return setError("Debes aceptar el aviso de privacidad.");
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
      await sendEmailVerification(cred.user);
    } catch (err) {
      setError(authMessage(err));
      setLoading(false);
    }
  }

  return (
    <RedirectIfAuthed>
      <AuthCard
        title="Crea tu cuenta"
        description="Para coordinadores de eventos del Teatro Universidad de Medellín."
        footer={
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-fg hover:underline">
              Inicia sesión
            </Link>
          </>
        }
      >
        <GoogleButton verb="Registrarme" />
        <form onSubmit={submit} className="space-y-4">
          <Field label="Correo">
            {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Field label="Contraseña" hint="Mínimo 8 caracteres.">
            {(id) => (
              <Input id={id} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
          </Field>
          <label className="flex items-start gap-2.5 text-[13px] text-muted">
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" />
            <span>
              Acepto el{" "}
              <Link href="/privacidad" target="_blank" className="text-fg underline underline-offset-2">
                aviso de privacidad
              </Link>{" "}
              y el tratamiento de mis datos según la Ley 1581 de 2012.
            </span>
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Crear cuenta
          </Button>
        </form>
      </AuthCard>
    </RedirectIfAuthed>
  );
}
