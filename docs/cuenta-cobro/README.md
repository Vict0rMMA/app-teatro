# Cuenta de cobro

Dónde quedó cada parte del paquete original (`paquete-cuenta-cobro`):

| Paquete | En el proyecto |
|---|---|
| `integracion/lib/cuenta-cobro.ts` | `lib/cuenta-cobro.ts` (validación y Word, sin IA) |
| `integracion/lib/prompt.ts` | `lib/prompt.ts` (solo extracción) |
| `integracion/app/api/cuenta-cobro/**` | `app/api/cuenta-cobro/**` (con sesión y límite por hora) |
| `integracion/components/CuentaCobro.tsx` | `components/CuentaCobro.tsx` + página `app/(app)/cuenta-cobro` |
| `integracion/plantilla/cuenta_cobro_base.docx` | `plantilla/cuenta_cobro_base.docx` |
| `pruebas/test.ts` | `tests/cuenta-cobro.test.ts` |
| `pruebas/consolidado_octubre_victor.tsv` | `samples/real/` (no se sube: datos personales) |
| `documentos/*.pdf`, `FORMATO_CUENTA_DE_COBRO.docx` | `samples/real/cuenta-cobro/` (no se suben: documentos internos) |
| `documentos/reglas_cuenta_de_cobro.md` | aquí: `reglas_cuenta_de_cobro.md` |
| `prompt/system_prompt.md` | aquí: `system_prompt.md` |
| `README.md` | aquí: `paquete-original.md` |

Nuevo (no venía en el paquete): `lib/registros.ts` compara el consolidado con Mis horas y marca los días con más de 8 h.
