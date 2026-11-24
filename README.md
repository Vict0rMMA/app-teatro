# Planillas Teatro

Genera el **REGISTRO** completado y las planillas **LLAVES**, **COLILLAS** y **EVALUACIÓN** a partir del registro de personal (.docx o .pdf), y lleva el control de horas de cada coordinador del Teatro Universidad de Medellín.

Next.js 14 (App Router) · TypeScript · Tailwind · Firebase Auth + Firestore (plan **Spark**, costo cero) · docxtemplater · Vercel.

- Producción: https://app-teatro-zeta.vercel.app
- Firebase: proyecto `forma-ai-victor` (nombre visible "Planillas Teatro")

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar variables
npm run dev                  # http://localhost:3000
npm test                     # parsers, cálculo y generación de planillas
```

## Costo cero (Spark)

- No se usa Firebase Storage. La firma se guarda como PNG en base64 en `users/{uid}.firma` (máx. 150 KB, recortada y comprimida en el navegador).
- Los .docx no se guardan: el evento guarda sus datos (aforo, horas, notas, evaluación, personal sin cédula ni teléfono) y los archivos se regeneran al descargar.
- El REGISTRO completo (con cédulas y teléfonos) se entrega una sola vez al generar; en el historial se regenera sin esos datos.
- Login: Google y correo/contraseña. Sin SMS.

## Firebase

1. **Authentication → Método de acceso**: Correo/contraseña y Google (ambos activos).
2. **Authentication → Configuración → Dominios autorizados**: `app-teatro-zeta.vercel.app` y `localhost` (ya agregados).
3. Reglas e índices:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes --project forma-ai-victor
   ```
4. (Opcional) **App Check** con reCAPTCHA v3: poner la clave en `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` y, cuando funcione, `APP_CHECK_ENFORCE=true`.

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Dónde se obtiene |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` `…_AUTH_DOMAIN` `…_PROJECT_ID` `…_MESSAGING_SENDER_ID` `…_APP_ID` | App web de Firebase |
| `FIREBASE_PROJECT_ID` `FIREBASE_CLIENT_EMAIL` `FIREBASE_PRIVATE_KEY` | Clave de la cuenta de servicio (`FIREBASE_PRIVATE_KEY` completa, con los `\n`) |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` `APP_CHECK_ENFORCE` | App Check (opcional) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Contacto del aviso de privacidad |

## Deploy

Vercel está conectado al repo: cada push a `main` despliega. El build corre `npm test && npm run build` (`vercel.json`), así que **si una prueba falla no se publica**. GitHub Actions corre lint, tipos y pruebas en cada push.

Manual: `vercel --prod`.

## Plantillas

`templates/*.docx` son las plantillas del Teatro con marcadores de docxtemplater (`{{evento}}`, `{{fecha}}`, `{{horaEvento}}`, `{{horaCitacion}}`, `{{coordinador}}`, `{{nota}}`, `{{aforo}}`, `{{%firma}}`, `{{#notas}}`, `{{#personal}}`…). Para regenerarlas desde los originales:

```bash
node scripts/build-templates.mjs ruta/a/originales   # LLAVES, COLILLAS, EVALUACION y REGISTRO .docx
```

`samples/` contiene solo datos ficticios. `samples/real/` está en `.gitignore`.

## Reglas del registro

- SALIDA igual para todos = citación + horas del grupo más numeroso (editable).
- LLEGADA = SALIDA − horas de cada persona. VALOR = horas × valor por hora (Ajustes, por defecto $10.000).
- P.P y DESEMP = 5 por defecto. Sin horas en el archivo: C 6 h, AC 5 h, resto 4 h (con aviso).
- Nombre, cédula, teléfono, UBI y cargo del archivo no se modifican.

## Pruebas manuales del lienzo de firma

Marcar cada combinación antes de publicar cambios en `components/firma/`:

| Dispositivo | Navegador | Entrada | Verificar |
| --- | --- | --- | --- |
| iPad | Safari, Chrome | dedo, Apple Pencil | no hace scroll al firmar; la palma no pinta con el lápiz; grosor varía con la presión |
| iPhone | Safari, Chrome | dedo | sin zoom por doble toque; sin menú al mantener pulsado |
| Mac | Safari, Chrome, Firefox | mouse, trackpad | trazo suave; deshacer y borrar |
| Tablet Android (Samsung, Xiaomi, Lenovo, Huawei) | Chrome, Samsung Internet, Firefox | dedo, S Pen | palma ignorada con S Pen; presión del S Pen |
| Celular Android | Chrome, Samsung Internet | dedo | girar la pantalla no borra el trazo |
| Tablet Windows / Chromebook | Chrome, Edge | lápiz, táctil, mouse | presión con lápiz; redimensionar ventana conserva el trazo |

En todos: la vista previa sale con fondo transparente y recortada; "Subir imagen" quita el fondo con el control deslizante; "Tomar foto" abre la cámara en el celular; el PNG guardado pesa menos de 150 KB.

## Privacidad

El archivo subido se procesa en memoria y no se guarda. Cédulas y teléfonos nunca se almacenan. Cada usuario puede exportar todos sus datos (JSON) o eliminar su cuenta desde Ajustes (Ley 1581 de 2012).
