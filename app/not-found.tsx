import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="font-mono text-sm text-faint">404</p>
        <h1 className="mt-2 text-lg font-semibold">Esta página no existe</h1>
        <Link href="/" className="mt-4 inline-block text-sm text-muted underline underline-offset-4 hover:text-fg">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
