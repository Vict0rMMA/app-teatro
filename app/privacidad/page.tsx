import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Aviso de privacidad" };

const contacto = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <Link href="/" className="text-[13px] text-muted hover:text-fg">
        ← Volver
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Aviso de privacidad</h1>
      <p className="mt-2 text-sm text-muted">Tratamiento de datos personales conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013 (Colombia).</p>

      <div className="mt-10 space-y-8 text-[14.5px] leading-relaxed text-fg/90 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-fg [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
        <section>
          <h2>Quién trata tus datos</h2>
          <p>
            Planillas Teatro es una herramienta independiente para coordinadores de eventos del Teatro Universidad de Medellín. No es un
            servicio oficial de la Universidad de Medellín. El responsable del tratamiento es el administrador de la aplicación
            {contacto ? (
              <>
                , con quien puedes comunicarte en <a className="underline underline-offset-2" href={`mailto:${contacto}`}>{contacto}</a>
              </>
            ) : null}
            .
          </p>
        </section>

        <section>
          <h2>Qué datos guardamos</h2>
          <ul>
            <li>Tu cuenta: correo electrónico y método de ingreso (correo o Google).</li>
            <li>El administrador puede consultar el nombre, correo, estado de verificación, fecha de registro y último ingreso de las cuentas para administrar el acceso a la aplicación.</li>
            <li>Tu perfil: nombre completo, firma (imagen, opcional) y textos por defecto.</li>
            <li>Tus horas: fecha, evento, lugar de trabajo, horario, horas y valor.</li>
            <li>
              Por cada evento: nombre, fecha, horarios, aforo, notas, evaluación, observaciones y la lista del personal con nombre,
              cargo, UBI, llegada, salida, horas, valor pagado, P.P, desempeño y observación.
            </li>
          </ul>
          <p className="mt-3">
            <strong>No guardamos</strong> el archivo de registro que subes, ni las cédulas ni los teléfonos del personal: se leen en memoria
            para completar el REGISTRO, que se te entrega una sola vez y se descarta.
          </p>
        </section>

        <section>
          <h2>Para qué los usamos</h2>
          <ul>
            <li>Generar las planillas de LLAVES, COLILLAS y EVALUACIÓN con tu nombre y tu firma.</li>
            <li>Llevar tu control de horas y pagos, y el historial de personal por evento.</li>
            <li>Proteger el servicio (límites de uso y verificación de la app).</li>
          </ul>
          <p className="mt-3">No vendemos ni compartimos tus datos con terceros para publicidad.</p>
        </section>

        <section>
          <h2>Datos de otras personas</h2>
          <p>
            La lista del personal incluye datos de terceros. Al subir un registro declaras que lo haces en ejercicio de tus funciones de
            coordinación y que tienes autorización para tratarlos con esta finalidad. Solo tú puedes ver esa información.
          </p>
        </section>

        <section>
          <h2>Dónde se almacenan</h2>
          <p>
            Los datos se guardan en Google Firebase (Authentication y Firestore) y la aplicación se ejecuta en Vercel. Los archivos de
            Word no se almacenan: se generan de nuevo cada vez que los descargas. Ambos
            proveedores actúan como encargados y pueden alojar la información fuera de Colombia, con niveles adecuados de protección. Cada
            cuenta está aislada: las reglas de seguridad impiden que un usuario lea datos de otro.
          </p>
        </section>

        <section>
          <h2>Tus derechos</h2>
          <ul>
            <li>Conocer, actualizar y rectificar tus datos (desde Ajustes).</li>
            <li>Acceder gratuitamente a todos tus datos: Ajustes → Exportar mis datos.</li>
            <li>Solicitar la supresión y revocar la autorización: Ajustes → Eliminar mi cuenta borra todo de inmediato.</li>
            <li>Solicitar prueba de la autorización otorgada y ser informado sobre el uso de tus datos.</li>
            <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</li>
          </ul>
        </section>

        <section>
          <h2>Autorización y vigencia</h2>
          <p>
            Al crear tu cuenta y aceptar este aviso autorizas el tratamiento descrito. Los datos se conservan mientras tengas la cuenta
            activa. Este aviso rige desde noviembre de 2026; si cambia, te lo informaremos dentro de la aplicación.
          </p>
        </section>
      </div>
    </main>
  );
}
