"use client";

import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/auth-provider";
import { GuardaPermisos } from "@/components/permisos";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <GuardaPermisos>
        <AppShell>{children}</AppShell>
      </GuardaPermisos>
    </RequireAuth>
  );
}
