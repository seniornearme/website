import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z"
              fill="#2563eb"
            />
            <path
              d="M9.2 12.6v-2.9l2.8-2 2.8 2v2.9h-1.9v-1.8h-1.8v1.8H9.2Z"
              fill="#fff"
            />
          </svg>
          SeniorNearMe
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/assisted-living"
            className="hidden rounded-lg px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 sm:block"
          >
            Browse cities
          </Link>
          <Link
            href="/search"
            className="rounded-lg px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            Map
          </Link>
          <Link
            href="/claim"
            className="rounded-lg px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            For owners
          </Link>
          {user ? (
            <Link
              href="/account"
              className="ml-1 rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Account
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className="ml-1 rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
