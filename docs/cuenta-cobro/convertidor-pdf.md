# Conversión fiel a PDF

La vista de impresión del navegador no conserva fielmente el diseño de Word. La ruta de descarga PDF entrega el DOCX generado a Gotenberg, que lo convierte con LibreOffice y conserva el tamaño de página y los encabezados/pies del formato.

## Desarrollo local

1. Instala Docker Desktop y copia `GOTENBERG_USERNAME` y `GOTENBERG_PASSWORD` a `.env.local`.
2. Inicia el convertidor desde la raíz del proyecto:

   ```powershell
   docker compose --env-file .env.local -f docker-compose.gotenberg.yml up -d
   ```

3. Configura en `.env.local`:

   ```env
   GOTENBERG_URL=http://127.0.0.1:3000
   NEXT_PUBLIC_PDF_CONVERTER_ENABLED=true
   ```

4. Reinicia Next.js. El módulo mostrará **Descargar PDF oficial**.

## Producción en Vercel

Gotenberg debe estar en un host que Vercel pueda alcanzar por HTTPS. Configura `GOTENBERG_URL`, `GOTENBERG_USERNAME`, `GOTENBERG_PASSWORD` y `NEXT_PUBLIC_PDF_CONVERTER_ENABLED=true` en las variables de entorno de Vercel y despliega de nuevo. Usa una instancia propia detrás de autenticación; los DOCX contienen datos personales. No uses la demostración pública ni expongas el convertidor sin autenticación.

La instancia se llama desde el servidor, después de autenticar al usuario, y el documento se envía en memoria para convertirlo. La aplicación no almacena el DOCX ni el PDF.

Gotenberg recibe el DOCX como `multipart/form-data` en `/forms/libreoffice/convert`; cada archivo conserva su tamaño de página si no se fuerza otro. Consulta [conversión LibreOffice](https://gotenberg.dev/docs/libreoffice/convert) y [seguridad de despliegue](https://gotenberg.dev/docs/operate/secure).
