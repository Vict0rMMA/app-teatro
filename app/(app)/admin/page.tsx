"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/auth-provider";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui";

interface AccountRow {
  uid: string;
  email: string;
  nombre: string;
  emailVerificado: boolean;
  registradoEn: string;
  ultimoIngreso: string | null;
  deshabilitado: boolean;
}

interface UsersResponse {
  users: AccountRow[];
  nextPageToken: string | null;
  error?: string;
}

const fecha = (value: string | null) =>
  value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Nunca";

export default function AdminPage() {
  const { user } = useSession();
  const [users, setUsers] = useState<AccountRow[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (token?: string) => {
    setLoading(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const query = token ? `?pageToken=${encodeURIComponent(token)}` : "";
      const res = await fetch(`/api/admin/users${query}`, { headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store" });
      const data = (await res.json()) as UsersResponse;
      if (!res.ok) throw new Error(data.error || "No se pudo cargar la lista de cuentas.");
      setUsers((current) => (token ? [...current, ...data.users] : data.users));
      setNextPageToken(data.nextPageToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la lista de cuentas.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader title="Administración" description="Cuentas registradas y su actividad de inicio de sesión." />
      {error ? (
        <Card>
          <EmptyState icon={<span aria-hidden>!</span>} title="No se pudo abrir la administración" description={error} />
        </Card>
      ) : loading && users.length === 0 ? (
        <Skeleton className="h-48 w-full" />
      ) : users.length === 0 ? (
        <Card><EmptyState icon={<span aria-hidden>◎</span>} title="No hay cuentas registradas" description="Cuando alguien cree una cuenta aparecerá aquí." /></Card>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">{users.length} cuentas cargadas. Solo se muestran datos de cuenta y actividad.</p>
          <Card>
            <ul className="divide-y divide-border">
              {users.map((account) => (
                <li key={account.uid} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_190px_190px] sm:items-center sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.nombre}</p>
                    <p className="truncate text-xs text-muted">{account.email || "Sin correo"}</p>
                    <div className="mt-1 flex gap-1.5">
                      <Badge tone={account.emailVerificado ? "ok" : "warn"}>{account.emailVerificado ? "Correo verificado" : "Pendiente"}</Badge>
                      {account.deshabilitado && <Badge tone="warn">Desactivada</Badge>}
                    </div>
                  </div>
                  <p className="text-xs text-muted"><span className="font-medium text-fg">Registro:</span> {fecha(account.registradoEn)}</p>
                  <p className="text-xs text-muted"><span className="font-medium text-fg">Último ingreso:</span> {fecha(account.ultimoIngreso)}</p>
                </li>
              ))}
            </ul>
          </Card>
          {nextPageToken && (
            <div className="mt-4 text-center">
              <Button variant="secondary" loading={loading} onClick={() => void load(nextPageToken)}>Cargar más cuentas</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
