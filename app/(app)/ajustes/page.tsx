"use client";

import { getDownloadURL, ref } from "firebase/storage";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/components/auth-provider";
import { FirmaInput } from "@/components/firma-input";
import { filenameFrom, saveBlob, usePlaces } from "@/components/hooks";
import { IconCheck, IconDownload, IconPencil, IconPlus, IconTrash, IconX } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, Field, Input, Modal, PageHeader, Textarea } from "@/components/ui";
import { addPlace, deleteFirma, deletePlace, placeInUse, renamePlace, updateProfile, uploadFirma } from "@/lib/data";
import { apiFetch, apiJson, storage } from "@/lib/firebase/client";
import { DEFAULTS } from "@/lib/schemas";

export default function AjustesPage() {
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="space-y-5">
        <PerfilCard />
        <DefaultsCard />
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
  const [firma, setFirma] = useState<Blob | null>(null);
  const [firmaUrl, setFirmaUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile.firmaPath) return setFirmaUrl(null);
    getDownloadURL(ref(storage(), profile.firmaPath))
      .then(setFirmaUrl)
      .catch(() => setFirmaUrl(null));
  }, [profile.firmaPath]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (nombre.trim().split(/\s+/).length < 2) return toast.error("Escribe tu nombre y al menos un apellido.");
    setSaving(true);
    try {
      const firmaPath = firma ? await uploadFirma(user.uid, firma) : profile.firmaPath;
      await updateProfile(user.uid, { nombre: nombre.trim(), firmaPath });
      setFirma(null);
      toast.success("Perfil actualizado");
    } catch {
      toast.error("No se pudo guardar el perfil");
    } finally {
      setSaving(false);
    }
  }

  async function quitarFirma() {
    if (firma) return setFirma(null);
    try {
      await deleteFirma(user.uid);
      await updateProfile(user.uid, { firmaPath: null });
      toast.success("Firma eliminada", "Las próximas planillas saldrán con el espacio en blanco.");
    } catch {
      toast.error("No se pudo quitar la firma");
    }
  }

  const dirty = nombre.trim() !== profile.nombre || !!firma;

  return (
    <Card>
      <CardHeader title="Perfil" description="Tu nombre y tu firma aparecen en LLAVES, COLILLAS y EVALUACIÓN." />
      <form onSubmit={save} className="grid gap-5 p-4 sm:p-5">
        <Field label="Nombre completo" hint="Igual que en los registros de personal, para encontrar tu fila automáticamente.">
          {(id) => <Input id={id} value={nombre} onChange={(e) => setNombre(e.target.value)} />}
        </Field>
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">Firma</p>
          <FirmaInput currentUrl={firmaUrl} value={firma} onChange={setFirma} onRemove={firma || firmaUrl ? quitarFirma : undefined} onError={(m) => toast.error(m)} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
            Guardar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DefaultsCard() {
  const { user, profile } = useSession();
  const toast = useToast();
  const [d, setD] = useState(profile.defaults ?? DEFAULTS);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile(user.uid, { defaults: { nota: d.nota.trim(), observaciones: d.observaciones.trim(), objetosPerdidos: d.objetosPerdidos.trim() } });
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
        <Field label="Nota">{(id) => <Textarea id={id} rows={2} value={d.nota} onChange={(e) => setD({ ...d, nota: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Observaciones">
            {(id) => <Textarea id={id} rows={2} value={d.observaciones} onChange={(e) => setD({ ...d, observaciones: e.target.value })} />}
          </Field>
          <Field label="Objetos perdidos">
            {(id) => <Textarea id={id} rows={2} value={d.objetosPerdidos} onChange={(e) => setD({ ...d, objetosPerdidos: e.target.value })} />}
          </Field>
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
