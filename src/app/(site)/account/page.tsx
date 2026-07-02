import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { titleCase } from "@/lib/format";

export const metadata: Metadata = { title: "Your account" };

type Claim = {
  id: string;
  status: "pending" | "verifying" | "approved" | "rejected";
  created_at: string;
  facilities: { name: string; slug: string; city: string | null } | null;
};

const STATUS_STYLE: Record<Claim["status"], string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  verifying: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?redirect=/account");

  const { data: claims } = await supabase
    .from("facility_claims")
    .select("id, status, created_at, facilities(name, slug, city)")
    .order("created_at", { ascending: false })
    .returns<Claim[]>();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your account</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{user.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Sign out
          </button>
        </form>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your listing claims</h2>
          <Link href="/claim" className="text-sm text-blue-600 hover:underline">
            Claim a facility
          </Link>
        </div>

        {claims?.length ? (
          <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {claims.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  {c.facilities ? (
                    <Link
                      href={`/facilities/${c.facilities.slug}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {titleCase(c.facilities.name)}
                    </Link>
                  ) : (
                    <span className="font-medium">Facility</span>
                  )}
                  {c.facilities?.city && (
                    <span className="ml-2 text-sm text-zinc-500">
                      {titleCase(c.facilities.city)}, CA
                    </span>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status]}`}
                >
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
            No claims yet. Own or manage a facility?{" "}
            <Link href="/claim" className="text-blue-600 hover:underline">
              Claim your listing
            </Link>{" "}
            to manage its photos and details.
          </p>
        )}
      </section>
    </main>
  );
}
