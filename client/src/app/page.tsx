import Link from "next/link";

const APP_NAME = "MyApp"; // change to your app's name

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-black dark:text-zinc-50">
      {/* Navbar */}
      <header className="border-b border-black/[.08] bg-white dark:border-white/[.145] dark:bg-black">
        <nav
          aria-label="Main"
          className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6"
        >
          <Link href="/" className="text-lg font-semibold tracking-tight">
            {APP_NAME}
          </Link>

          <div className="flex items-center gap-3 text-sm font-medium">
            <Link
              href="/login"
              className="rounded-full px-4 py-2 transition-colors hover:bg-black/[.04] dark:hover:bg-white/[.08]"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-zinc-900 px-4 py-2 text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-300"
            >
              Register
            </Link>
          </div>
        </nav>
      </header>

      {/* Centered welcome */}
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Welcome
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Log in to continue, or create an account to get started.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-black/[.08] bg-white py-6 text-center text-sm text-zinc-600 dark:border-white/[.145] dark:bg-black dark:text-zinc-400">
        © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
      </footer>
    </div>
  );
}
