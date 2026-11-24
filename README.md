# Planillas Teatro

Genera las planillas **LLAVES**, **COLILLAS** y **EVALUACIÓN** a partir del registro de personal (.docx o .pdf) y lleva el control de horas de cada coordinador del Teatro Universidad de Medellín.

Next.js 14 (App Router) · TypeScript · Tailwind · Firebase (Auth, Firestore, Storage) · docxtemplater · Vercel.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar variables
npm run dev                  # http://localhost:3000
npm test                     # parsers y generación de planillas
```

## Firebase (una vez)

1. Crear proyecto en https://console.firebase.google.com (plan **Blaze**: Storage lo exige en proyectos nuevos; el uso de este proyecto cabe en la cuota gratuita).
2. **Authentication** → Métodos de acceso: habilitar *Correo/contraseña* y *Google*. En *Configuración → Dominios autorizados* agregar el dominio de Vercel (`planillas-teatro.vercel.app` y el dominio propio si hay).
3. **Firestore Database** → Crear base de datos (modo producción, región `southamerica-east1` o `us-central1`).
4. **Storage** → Comenzar.
5. *Configuración del proyecto → Tus apps* → agregar app **Web** → copiar los valores a `NEXT_PUBLIC_FIREBASE_*`.
6. *Configuración del proyecto → Cuentas de servicio* → **Generar nueva clave privada** → copiar `project_id`, `client_email` y `private_key` a `FIREBASE_*`.
7. Publicar reglas e índices:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add            # elegir el proyecto
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
8. (Recomendado) **App Check**: registrar la app web con reCAPTCHA v3, poner la clave del sitio en `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, y cuando todo funcione activar *Aplicar* para Firestore y Storage y `APP_CHECK_ENFORCE=true`.

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Dónde se obtiene |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` `…_AUTH_DOMAIN` `…_PROJECT_ID` `…_STORAGE_BUCKET` `…_MESSAGING_SENDER_ID` `…_APP_ID` | App web de Firebase |
| `FIREBASE_PROJECT_ID` `FIREBASE_CLIENT_EMAIL` `FIREBASE_PRIVATE_KEY` | JSON de la cuenta de servicio |
| `FIREBASE_STORAGE_BUCKET` | Igual que `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` `APP_CHECK_ENFORCE` | App Check (opcional) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Contacto del aviso de privacidad |

`FIREBASE_PRIVATE_KEY` se pega completa, con los `\n`.

## Deploy

El deploy lo hace GitHub Actions (`.github/workflows/ci.yml`): en cada push corre lint, tipos y pruebas, y si pasan y la rama es `main`, publica en Vercel. El deploy automático por Git de Vercel está apagado en `vercel.json` para que nada se publique sin pasar las pruebas.

```bash
npm i -g vercel
vercel link                         # crea .vercel/project.json
cat .vercel/project.json            # orgId y projectId
```

En GitHub → *Settings → Secrets and variables → Actions* crear `VERCEL_TOKEN` (https://vercel.com/account/tokens), `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID`. Las variables de Firebase van en Vercel (el workflow las baja con `vercel pull`).

Deploy manual: `vercel --prod`.

## Plantillas

`templates/*.docx` son las plantillas originales del Teatro con marcadores de docxtemplater (`{{evento}}`, `{{fecha}}`, `{{horaEvento}}`, `{{horaCitacion}}`, `{{coordinador}}`, `{{nota}}`, `{{aforo}}`, `{{%firma}}`). Para regenerarlas desde los originales:

```bash
node scripts/build-templates.mjs ruta/a/originales   # LLAVES.docx, COLILLAS.docx, EVALUACION.docx
```

`samples/` contiene solo datos ficticios. `samples/real/` está en `.gitignore`.

## Privacidad

El archivo subido se procesa en memoria y no se guarda. Cédulas y teléfonos nunca salen del servidor ni se almacenan. Cada usuario puede exportar todos sus datos (JSON) o eliminar su cuenta desde Ajustes (Ley 1581 de 2012).
