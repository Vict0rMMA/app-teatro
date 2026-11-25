"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { RequireAuth, useAuth } from "@/components/auth-provider";
import { FirmaField } from "@/components/firma/firma-field";
import { useToast } from "@/components/toast";
import { Button, Field, Input } from "@/components/ui";
import { createProfile } from "@/lib/data";

function Onboarding() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const [nombre, setNombre] = useState(user?.displayName ?? "");
  const [firma, setFirma] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (nombre.trim().split(/\s+/).length < 2) return setError("Escribe tu nombre y al menos un apellido.");
    if (!acepta) return setError("Debes aceptar el aviso de privacidad para continuar.");
    setError(null);
    setSaving(true);
    try {
      const r = await createProfile(user.uid, nombre, firma);
      if (r === "ya-existia") toast.info("Ya tenías perfil", "Entraste con tus datos de siempre; no se cambió nada.");
      else toast.success("Listo", "Ya puedes generar tus planillas.");
    } catch {
      toast.error("No se pudo guardar", "Revisa tu conexión e intenta de nuevo.");
      setSaving(false);
    }
  }

  return (
    <AuthCard
      title="Configura tu perfil"
      description="Así apareces en las planillas. Puedes cambiarlo después en Ajustes."
      footer={
        <button onClick={signOut} className="hover:text-fg">
          Cerrar sesión ({user?.email})
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Nombre completo" hint="Tal como aparece en los registros de personal. Lo usamos para encontrar tu fila y tus horas.">
          {(id) => <Input id={id} autoComplete="name" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Laura Gómez Restrepo" />}
        </Field>
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">
            Firma <span className="font-normal text-faint">(opcional: dibújala o sube una foto)</span>
          </p>
          <FirmaField value={firma} onSave={setFirma} onRemove={() => setFirma(null)} />
        </div>
        <label className="flex items-start gap-2.5 text-[13px] text-muted">
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" />
          <span>
            Acepto el{" "}
            <Link href="/privacidad" target="_blank" className="text-fg underline underline-offset-2">
              aviso de privacidad
            </Link>
            .
          </span>
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" loading={saving}>
          Continuar
        </Button>
      </form>
    </AuthCard>
  );
}

export default function OnboardingPage() {
  return (
    <RequireAuth needProfile={false}>
      <Onboarding />
    </RequireAuth>
  );
}
