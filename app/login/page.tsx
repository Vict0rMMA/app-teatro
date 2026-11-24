"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { RedirectIfAuthed } from "@/components/auth-provider";
import { Divider, OAuthButtons } from "@/components/google-button";
import { Button, Field, Input } from "@/components/ui";
import { authMessage } from "@/lib/auth-errors";
import { firebaseAuth } from "@/lib/firebase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
    } catch (err) {
      setError(authMessage(err));
      setLoading(false);
    }
  }

  return (
    <RedirectIfAuthed>
      <AuthCard
        title="Inicia sesión"
        description="Genera tus planillas y lleva el control de tus horas."
        footer={
          <>
            ¿No tienes cuenta?{" "}
            <Link href="/registro" className="font-medium text-fg hover:underline">
              Regístrate
            </Link>
          </>
        }
      >
        <OAuthButtons />
        <Divider />
        <form onSubmit={submit} className="space-y-4">
          <Field label="Correo">
            {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Field label="Contraseña" error={error}>
            {(id) => (
              <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Entrar
          </Button>
          <p className="text-center">
            <Link href="/recuperar" className="text-[13px] text-muted hover:text-fg">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        </form>
      </AuthCard>
    </RedirectIfAuthed>
  );
}
