"use client";

import { useState } from "react";
import { IconPencil, IconTrash } from "../icons";
import { Button, Modal } from "../ui";
import { FirmaEditor } from "./firma-editor";
import { blobToBase64 } from "./image-tools";

/** Muestra la firma actual (base64) y permite dibujarla, subirla, reemplazarla o quitarla. */
export function FirmaField({
  value,
  onSave,
  onRemove,
}: {
  value: string | null;
  onSave: (base64: string) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid h-20 w-44 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-white"
        aria-label={value ? "Cambiar firma" : "Agregar firma"}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`data:image/png;base64,${value}`} alt="Tu firma" className="max-h-16 max-w-[160px] object-contain" />
        ) : (
          <span className="text-[12px] text-zinc-400">Sin firma</span>
        )}
      </button>
      <div className="flex flex-col gap-1.5">
        <Button type="button" size="sm" icon={<IconPencil />} onClick={() => setOpen(true)}>
          {value ? "Cambiar firma" : "Agregar firma"}
        </Button>
        {value && onRemove && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={<IconTrash />}
            loading={removing}
            onClick={async () => {
              setRemoving(true);
              try {
                await onRemove();
              } finally {
                setRemoving(false);
              }
            }}
          >
            Quitar
          </Button>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Tu firma">
        {open && (
          <FirmaEditor
            onCancel={() => setOpen(false)}
            onSave={async (png) => {
              await onSave(await blobToBase64(png));
              setOpen(false);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
