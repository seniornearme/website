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
        <div className="mt-14 grid gap-6 border-t border-zinc-100 pt-8 text-sm text-zinc-600 sm:grid-cols-3 dark:border-zinc-800 dark:text-zinc-400">
          <div>
            <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">7,900+</div>
            licensed assisted living facilities, from 6-bed care homes to large communities
          </div>
          <div>
            <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Official records</div>
            state inspection and complaint history on every listing
          </div>
          <div>
            <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Free</div>
            for families — no fees, no referral pressure, no selling your info
          </div>
        </div>
      </div>
    </main>
  );
}
