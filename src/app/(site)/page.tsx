import Link from "next/link";
import { FacilitySearch } from "@/components/facility-search";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-3xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          SeniorNearMe
        </h1>
        <p className="mt-6 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Find licensed assisted living, RCFE, and senior care near you.
          California directory of every licensed facility, mapped and searchable.
        </p>
        <FacilitySearch />
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/search"
            className="rounded-full bg-black px-6 py-3 text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Search facilities
          </Link>
          <Link
            href="/claim"
            className="rounded-full border border-zinc-300 px-6 py-3 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Claim your facility
          </Link>
        </div>
        <p className="mt-6 text-sm text-zinc-500">
          Or{" "}
          <Link href="/assisted-living" className="text-blue-600 hover:underline">
            browse facilities by city
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
