import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-sm font-medium text-blue-600">404</p>
        <h1 className="mt-2 text-3xl font-semibold">Page not found</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          The page you&apos;re looking for doesn&apos;t exist — the facility may have been
          removed, or the link may be outdated.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/search"
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Search the map
          </Link>
          <Link
            href="/assisted-living"
            className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Browse by city
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
