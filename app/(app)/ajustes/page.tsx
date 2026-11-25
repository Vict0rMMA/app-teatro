"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSession } from "@/components/auth-provider";
import { FirmaField } from "@/components/firma/firma-field";
import { filenameFrom, saveBlob, usePlaces } from "@/components/hooks";
import { IconCheck, IconDownload, IconLogout, IconPencil, IconPlus, IconTrash, IconX } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, Field, Input, Modal, PageHeader, Textarea } from "@/components/ui";
import { addPlace, deletePlace, placeInUse, renamePlace, setFirma, updateProfile } from "@/lib/data";
import { apiFetch, apiJson } from "@/lib/firebase/client";
import { formatMiles } from "@/lib/format";
import { withDefaults, type Defaults } from "@/lib/schemas";

export default function AjustesPage() {
  return (
    <>
      <PageHeader title="Ajustes" description="Tu perfil, los valores que se llenan solos y tus lugares de trabajo." />
      <div className="space-y-5">
        <CuentaMovil />
        <PerfilCard />
        <DefaultsCard />
        <UbicacionesCard />
        <CoordinadoresCard />
        <LugaresCard />
        <DatosCard />
      </div>
    </>
  );
}

function PerfilCard() {
  const { user, profile } = useSession();
  const toast = useToast();
  const [nombre, setNombre] = useState(profile.nombre);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (nombre.trim().split(/\s+/).length < 2) return toast.error("Escribe tu nombre y al menos un apellido.");
    setSaving(true);
    try {
      await updateProfile(user.uid, { nombre: nombre.trim() });
      toast.success("Perfil actualizado");
    } catch {
      toast.error("No se pudo guardar el perfil");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Perfil" description="Tu nombre y tu firma aparecen en LLAVES, COLILLAS y EVALUACIÓN." />
      <div className="grid gap-5 p-4 sm:p-5">
        <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Nombre completo" hint="Igual que en los registros de personal, para encontrar tu fila automáticamente." className="flex-1">
            {(id) => <Input id={id} value={nombre} onChange={(e) => setNombre(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" loading={saving} disabled={nombre.trim() === profile.nombre}>
            Guardar
          </Button>
        </form>
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">Firma</p>
          <FirmaField
            value={profile.firma ?? null}
            onSave={async (b64) => {
              try {
                await setFirma(user.uid, b64);
                toast.success("Firma guardada");
              } catch {
                toast.error("No se pudo guardar la firma");
              }
            }}
            onRemove={async () => {
              await setFirma(user.uid, null);
              toast.success("Firma eliminada", "Las próximas planillas saldrán con el espacio en blanco.");
            }}
          />
        </div>
      </div>
    </Card>
  );
}

function DefaultsCard() {
  const { user, profile } = useSession();
  const toast = useToast();
  const [d, setD] = useState<Defaults>(withDefaults(profile.defaults));
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Defaults, v: string) => setD({ ...d, [k]: v });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(d.valorHora) || d.valorHora < 0) return toast.error("El valor por hora no es válido.");
    setSaving(true);
    try {
      // Las ubicaciones se editan en su propia tarjeta: se conservan las actuales.
      await updateProfile(user.uid, {
        defaults: { ...d, ubicaciones: withDefaults(profile.defaults).ubicaciones, coordinadores: withDefaults(profile.defaults).coordinadores },
      });
      toast.success("Valores por defecto guardados");
    } catch {
      toast.error("No se pudieron guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Valores por defecto" description="Se rellenan solos en cada planilla nueva; puedes cambiarlos ahí mismo." />
      <form onSubmit={save} className="grid gap-4 p-4 sm:p-5">
        <Field label="Valor por hora" hint="VALOR PAGADO = horas × este valor.">
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              className="tabular sm:w-48"
              value={formatMiles(d.valorHora || "")}
              placeholder="10.000"
              onChange={(e) => setD({ ...d, valorHora: Number(e.target.value.replace(/\D/g, "")) || 0 })}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:w-96">
          <Field label="Apoyo (AC)" hint="horas sobre la base">
            {(id) => (
              <Input id={id} inputMode="decimal" className="tabular" value={String(d.extraAC)} onChange={(e) => setD({ ...d, extraAC: Number(e.target.value.replace(",", ".")) || 0 })} />
            )}
          </Field>
          <Field label="Coordinador (C)" hint="horas sobre la base">
            {(id) => (
              <Input id={id} inputMode="decimal" className="tabular" value={String(d.extraC)} onChange={(e) => setD({ ...d, extraC: Number(e.target.value.replace(",", ".")) || 0 })} />
            )}
          </Field>
        </div>
        <Field label="Nota (LLAVES y viñeta de EVALUACIÓN)">{(id) => <Textarea id={id} rows={2} value={d.nota} onChange={(e) => set("nota", e.target.value)} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reclamos y sugerencias del público">{(id) => <Textarea id={id} rows={2} value={d.reclamos} onChange={(e) => set("reclamos", e.target.value)} />}</Field>
          <Field label="Sugerencias del coordinador">{(id) => <Textarea id={id} rows={2} value={d.sugerencias} onChange={(e) => set("sugerencias", e.target.value)} />}</Field>
          <Field label="Observaciones (WhatsApp)">{(id) => <Textarea id={id} rows={2} value={d.observaciones} onChange={(e) => set("observaciones", e.target.value)} />}</Field>
          <Field label="Objetos perdidos (WhatsApp)">{(id) => <Textarea id={id} rows={2} value={d.objetosPerdidos} onChange={(e) => set("objetosPerdidos", e.target.value)} />}</Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={saving}>
            Guardar
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Significado de la columna UBI (letra → nombre). Solo informa: no cambia horas ni pagos. */
function UbicacionesCard() {
  const { user, profile } = useSession();
  const toast = useToast();
  const inicial = Object.entries(withDefaults(profile.defaults).ubicaciones).map(([letra, nombre]) => ({ letra, nombre }));
  const [rows, setRows] = useState(inicial.length ? inicial : [{ letra: "", nombre: "" }]);
  const [saving, setSaving] = useState(false);
  const setRow = (i: number, patch: Partial<{ letra: string; nombre: string }>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save(e: FormEvent) {
    e.preventDefault();
    const limpias = rows.map((r) => ({ letra: r.letra.trim().toUpperCase(), nombre: r.nombre.trim() })).filter((r) => r.letra && r.nombre);
    const letras = limpias.map((r) => r.letra);
    if (new Set(letras).size !== letras.length) return toast.error("Hay letras repetidas.");
    setSaving(true);
    try {
      await updateProfile(user.uid, { defaults: { ...withDefaults(profile.defaults), ubicaciones: Object.fromEntries(limpias.map((r) => [r.letra, r.nombre])) } });
      toast.success("Ubicaciones guardadas");
    } catch {
      toast.error("No se pudieron guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Ubicaciones (UBI)" description="Qué significa cada letra de la columna UBI. Se ve al pasar el cursor sobre la letra en el registro." />
      <form onSubmit={save} className="p-4 sm:p-5">
        <div className="space-y-2">
          <div className="grid grid-cols-[72px_1fr_32px] gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            <span>Letra</span>
            <span>Ubicación</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[72px_1fr_32px] items-center gap-2">
              <Input value={r.letra} maxLength={4} className="text-center font-bold uppercase" onChange={(e) => setRow(i, { letra: e.target.value.toUpperCase() })} aria-label={`Letra ${i + 1}`} />
              <Input value={r.nombre} maxLength={60} placeholder="Ej. Luneta centro" onChange={(e) => setRow(i, { nombre: e.target.value })} aria-label={`Ubicación ${i + 1}`} />
              <button
                type="button"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                className="grid h-8 w-8 place-items-center rounded text-faint hover:bg-subtle hover:text-danger"
                aria-label={`Quitar ubicación ${i + 1}`}
              >
                <IconTrash width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button type="button" size="sm" variant="ghost" icon={<IconPlus />} onClick={() => setRows([...rows, { letra: "", nombre: "" }])}>
            Agregar ubicación
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Guardar
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Coordinadores por grupo (OPC, TEATRO…) para "¿a quién le trabajaste?" en Mis horas. */
function CoordinadoresCard() {
  const { user, profile } = useSession();
  const toast = useToast();
  const inicial = Object.entries(withDefaults(profile.defaults).coordinadores).map(([grupo, nombres]) => ({ grupo, nombres: nombres.join("\n") }));
  const [grupos, setGrupos] = useState(inicial);
  const [saving, setSaving] = useState(false);
  const setG = (i: number, patch: Partial<{ grupo: string; nombres: string }>) => setGrupos(grupos.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  async function save(e: FormEvent) {
    e.preventDefault();
    const limpio = grupos
      .map((g) => ({ grupo: g.grupo.trim().toUpperCase(), nombres: g.nombres.split("\n").map((n) => n.trim()).filter(Boolean) }))
      .filter((g) => g.grupo && g.nombres.length);
    setSaving(true);
    try {
      await updateProfile(user.uid, { defaults: { ...withDefaults(profile.defaults), coordinadores: Object.fromEntries(limpio.map((g) => [g.grupo, g.nombres])) } });
      toast.success("Coordinadores guardados");
    } catch {
      toast.error("No se pudieron guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Coordinadores" description="Para elegir a quién le trabajaste en Mis horas. Un nombre por línea." />
      <form onSubmit={save} className="p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {grupos.map((g, i) => (
            <div key={i} className="space-y-2 rounded-ctl border border-border p-3">
              <div className="flex items-center gap-2">
                <Input value={g.grupo} maxLength={30} placeholder="Grupo (ej. OPC)" className="font-bold uppercase" onChange={(e) => setG(i, { grupo: e.target.value })} aria-label={`Grupo ${i + 1}`} />
                <button
                  type="button"
                  onClick={() => setGrupos(grupos.filter((_, j) => j !== i))}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded text-faint hover:bg-subtle hover:text-danger"
                  aria-label={`Quitar grupo ${i + 1}`}
                >
                  <IconTrash width={14} height={14} />
                </button>
              </div>
              <Textarea rows={5} value={g.nombres} placeholder={"Valeria Areiza\nValentina Maya"} onChange={(e) => setG(i, { nombres: e.target.value })} aria-label={`Coordinadores de ${g.grupo || "este grupo"}`} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button type="button" size="sm" variant="ghost" icon={<IconPlus />} onClick={() => setGrupos([...grupos, { grupo: "", nombres: "" }])}>
            Agregar grupo
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Guardar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function LugaresCard() {
  const { user } = useSession();
  const { places } = usePlaces(user.uid);
  const toast = useToast();
  const [nuevo, setNuevo] = useState("");
  const [editing, setEditing] = useState<{ id: string; nombre: string } | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    const n = nuevo.trim();
    if (!n) return;
    if (places?.some((p) => p.nombre.toLowerCase() === n.toLowerCase())) return toast.error("Ese lugar ya existe.");
    setNuevo("");
    addPlace(user.uid, n).catch(() => toast.error("No se pudo agregar el lugar"));
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (!editing?.nombre.trim()) return;
    renamePlace(editing.id, editing.nombre).catch(() => toast.error("No se pudo renombrar"));
    setEditing(null);
  }

  async function remove(id: string, nombre: string) {
    if (places && places.length <= 1) return toast.error("Debe quedar al menos un lugar de trabajo.");
    try {
      if (await placeInUse(user.uid, id)) {
        return toast.error(`"${nombre}" tiene horas registradas`, "Mueve esos registros a otro lugar en Mis horas antes de eliminarlo.");
      }
      await deletePlace(id);
      toast.success("Lugar eliminado");
    } catch {
      toast.error("No se pudo eliminar el lugar");
    }
  }

  return (
    <Card>
      <CardHeader title="Lugares de trabajo" description="Para clasificar tus horas. Las de un registro de personal van por defecto al Teatro." />
      <ul className="divide-y divide-border">
        {places?.map((p) => (
          <li key={p.id} className="flex items-center gap-2 px-4 py-2 sm:px-5">
            {editing?.id === p.id ? (
              <form onSubmit={rename} className="flex flex-1 items-center gap-2">
                <Input autoFocus value={editing.nombre} maxLength={60} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} className="h-8" />
                <Button type="submit" size="sm" icon={<IconCheck />} aria-label="Guardar nombre" />
                <Button type="button" size="sm" variant="ghost" icon={<IconX />} onClick={() => setEditing(null)} aria-label="Cancelar" />
              </form>
            ) : (
              <>
                <span className="flex-1 text-[13px]">{p.nombre}</span>
                <button onClick={() => setEditing({ id: p.id, nombre: p.nombre })} className="grid h-7 w-7 place-items-center rounded text-faint hover:bg-subtle hover:text-fg" aria-label={`Renombrar ${p.nombre}`}>
                  <IconPencil width={14} height={14} />
                </button>
                <button onClick={() => remove(p.id, p.nombre)} className="grid h-7 w-7 place-items-center rounded text-faint hover:bg-subtle hover:text-danger" aria-label={`Eliminar ${p.nombre}`}>
                  <IconTrash width={14} height={14} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2 border-t border-border p-4 sm:px-5">
        <Input placeholder="Nuevo lugar, ej. Teatro Pablo Tobón" value={nuevo} maxLength={60} onChange={(e) => setNuevo(e.target.value)} />
        <Button type="submit" icon={<IconPlus />} disabled={!nuevo.trim()}>
          Agregar
        </Button>
      </form>
    </Card>
  );
}

function DatosCard() {
  const { signOut } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function exportar() {
    setExporting(true);
    try {
      const res = await apiFetch("/api/account/export");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Error");
      saveBlob(await res.blob(), filenameFrom(res, "mis-datos.json"));
    } catch (e) {
      toast.error("No se pudo exportar", (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  async function eliminar() {
    setDeleting(true);
    try {
      await apiJson("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) });
      await signOut().catch(() => undefined);
      toast.success("Cuenta eliminada", "Borramos todos tus datos.");
      router.replace("/login");
    } catch (e) {
      toast.error("No se pudo eliminar la cuenta", (e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Tus datos"
        description={
          <>
            Derechos de acceso y supresión según la Ley 1581 de 2012.{" "}
            <Link href="/privacidad" className="underline underline-offset-2">
              Aviso de privacidad
            </Link>
          </>
        }
      />
      <div className="divide-y divide-border">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-[13px] font-medium">Exportar mis datos</p>
            <p className="text-[13px] text-muted">Perfil, lugares, horas, eventos y personal en un archivo JSON.</p>
          </div>
          <Button icon={<IconDownload />} onClick={exportar} loading={exporting}>
            Exportar JSON
          </Button>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-[13px] font-medium text-danger">Eliminar mi cuenta</p>
            <p className="text-[13px] text-muted">Borra la cuenta, la firma, las planillas, las horas y el personal. No se puede deshacer.</p>
          </div>
          <Button variant="danger" icon={<IconTrash />} onClick={() => setOpen(true)}>
            Eliminar cuenta
          </Button>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Eliminar cuenta"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="danger" disabled={confirm !== "ELIMINAR"} loading={deleting} onClick={eliminar}>
              Eliminar todo
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Se eliminarán de forma permanente tu cuenta y todos tus datos. Te recomendamos exportarlos antes. Escribe{" "}
          <span className="font-mono font-medium text-fg">ELIMINAR</span> para confirmar.
        </p>
        <Input className="mt-4" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </Modal>
    </Card>
  );
}

/** Solo en celular (en computador esto está en la barra lateral): cuenta, Administración y salir. */
function CuentaMovil() {
  const { user, profile, signOut } = useSession();
  const isAdmin = !!user.email && user.email.toLocaleLowerCase("en-US") === process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLocaleLowerCase("en-US");
  return (
    <Card className="md:hidden">
      <div className="flex items-center gap-3 p-4">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-brand-fg">
          {profile.nombre
            .trim()
            .split(/\s+/)
            .filter((_, i, a) => i === 0 || i === (a.length >= 4 ? 2 : 1))
            .map((w) => w[0] ?? "")
            .join("")
            .toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{profile.nombre}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
      </div>
      <div className="divide-y divide-border border-t border-border text-[15px]">
        {isAdmin && (
          <Link href="/admin" className="flex h-12 items-center justify-between px-4">
            Administración <span aria-hidden className="text-muted">›</span>
          </Link>
        )}
        <button onClick={signOut} className="flex h-12 w-full items-center gap-2 px-4 text-left text-brand">
          <IconLogout width={16} height={16} /> Cerrar sesión
        </button>
      </div>
    </Card>
  );
}
