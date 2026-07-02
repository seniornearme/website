import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ClaimClient, type ClaimFacility } from "./claim-client";

export const metadata: Metadata = {
  title: "Claim your facility",
  description:
    "Own or manage a licensed care facility in California? Claim your free SeniorNearMe listing to manage photos, details, and inquiries.",
};

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string }>;
}) {
  const { facility: slug } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let preselected: ClaimFacility | null = null;
  if (slug) {
    const { data } = await supabase
      .from("facilities")
      .select("id, name, slug, city, street_address, license_number, owner_id")
      .eq("slug", slug)
      .single();
    preselected = (data as ClaimFacility | null) ?? null;
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold">Claim your facility listing</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Claiming is free. Once we verify you&apos;re affiliated with the facility, you can
        manage the listing&apos;s photos and details and receive inquiries from families.
      </p>

      {user ? (
        <ClaimClient userId={user.id} preselected={preselected} />
      ) : (
        <div className="mt-8 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <p className="text-sm">Sign in to claim a listing — it takes under a minute.</p>
          <Link
            href={`/sign-in?redirect=${encodeURIComponent(slug ? `/claim?facility=${slug}` : "/claim")}`}
            className="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Sign in to continue
          </Link>
        </div>
      )}

      <div className="mt-10 grid gap-4 text-sm text-zinc-600 dark:text-zinc-400 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-100 p-4 dark:border-zinc-800">
          <div className="font-medium text-zinc-900 dark:text-zinc-100">1. Find your facility</div>
          Search by name or license number.
        </div>
        <div className="rounded-xl border border-zinc-100 p-4 dark:border-zinc-800">
          <div className="font-medium text-zinc-900 dark:text-zinc-100">2. Submit your claim</div>
          Tell us your role at the facility.
        </div>
        <div className="rounded-xl border border-zinc-100 p-4 dark:border-zinc-800">
          <div className="font-medium text-zinc-900 dark:text-zinc-100">3. Get verified</div>
          We confirm with the facility on record, then hand you the keys.
        </div>
      </div>
    </main>
  );
}
