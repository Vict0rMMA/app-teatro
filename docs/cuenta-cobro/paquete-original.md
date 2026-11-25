# Cuenta de cobro: módulo para app-teatro

La IA extrae las filas del consolidado (foto, captura o texto pegado). El código valida todo y genera el Word sobre la plantilla oficial.

```
documentos/
  FORMATO_CUENTA_DE_COBRO.docx        plantilla oficial (octubre)
  Instructivo_Cuenta_de_Cobro.pdf     cómo llenarla
  Instructivo_Envio_Cuenta_Cobro.pdf  reglas del buzón (asunto ≤ 60, día 25, PDF editable…)
  reglas_cuenta_de_cobro.md           reglas del grupo + lecciones
prompt/
  system_prompt.md                    prompt del modelo (extracción → JSON)
integracion/                          copiar a la raíz del proyecto Next.js
  app/api/cuenta-cobro/route.ts         POST: imagen/texto → JSON + validación
  app/api/cuenta-cobro/generar/route.ts POST: JSON + datos personales → .docx
  lib/cuenta-cobro.ts                   validación + generación del Word (sin IA)
  lib/prompt.ts                         prompt embebido
  components/CuentaCobro.tsx            sección lista para usar (Tailwind)
  plantilla/cuenta_cobro_base.docx      plantilla normalizada que usa el código
pruebas/
  consolidado_octubre_victor.tsv      caso real: 28 filas, 128 h, $1.280.000
  test.ts                             prueba de validación y generación
```

## Instalación
```bash
npm i @anthropic-ai/sdk jszip
```
`.env.local` (y en Vercel → Settings → Environment Variables):
```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5-5
```
Usa la sección en cualquier página protegida:
```tsx
import CuentaCobro from "@/components/CuentaCobro";
export default function Page() { return <CuentaCobro />; }
```
Protege `/api/cuenta-cobro` y `/api/cuenta-cobro/generar` con la sesión de tu `/login`.

## Flujo
1. El usuario pega el texto o la captura (Ctrl+V), o sube una foto del Excel.
2. `/api/cuenta-cobro` llama al modelo con `system_prompt.md`. El modelo solo extrae y marca alertas.
3. `validar()` revisa sin IA:
   - que inicio → fin cuadre con las horas
   - que horas × valor cuadre con el total
   - máximo 8 h por día
   - horarios cruzados
   - fechas fuera del mes
   - filas duplicadas
   - subtotales por centro de costos y total
   - que el asunto tenga 60 caracteres o menos
4. El usuario completa celular, dirección, ciudad, firma y, si es reenvío, la fecha y el consecutivo con A.
5. `/api/cuenta-cobro/generar` vuelve a validar en el servidor y devuelve el .docx.
6. El usuario exporta a PDF desde Word y envía con las instrucciones que muestra la pantalla.

## Notas
- Vercel no puede convertir a PDF (no tiene LibreOffice), por eso se descarga el .docx y se exporta a PDF desde Word.
- Si la universidad cambia la plantilla, hay que normalizarla otra vez antes de reemplazar `plantilla/cuenta_cobro_base.docx`, para que los textos rojos queden en un solo bloque. Pásamela y te la dejo lista.
- El código copia los textos tal cual vienen del consolidado, sin corregir tildes. Eso es a propósito: la regla es que todo coincida con el consolidado.
