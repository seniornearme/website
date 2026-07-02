"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { titleCase } from "@/lib/format";

export type ClaimFacility = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  street_address: string | null;
  license_number: string | null;
  owner_id: string | null;
};

type ExistingClaim = { id: string; status: string };

export function ClaimClient({
  userId,
  preselected,
}: {
  userId: string;
  preselected: ClaimFacility | null;
}) {
  const [facility, setFacility] = useState<ClaimFacility | null>(preselected);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClaimFacility[]>([]);
  const [existing, setExisting] = useState<ExistingClaim | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("owner");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");

  // search facilities as the user types
  useEffect(() => {
    if (facility || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const supabase = createClient();
      const q = query.trim();
      const { data } = await supabase
        .from("facilities")
        .select("id, name, slug, city, street_address, license_number, owner_id")
        .or(`name.ilike.%${q}%,license_number.eq.${/^\d+$/.test(q) ? q : "0"}`)
        .eq("status", "active")
        .limit(8);
      setResults((data as ClaimFacility[] | null) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [query, facility]);

  // when a facility is selected, check for an existing claim by this user
  useEffect(() => {
    if (!facility) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("facility_claims")
        .select("id, status")
        .eq("facility_id", facility.id)
        .eq("claimant_id", userId)
        .limit(1);
      setExisting((data?.[0] as ExistingClaim | undefined) ?? null);
    })();
  }, [facility, userId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!facility) return;
    setState("submitting");
    const supabase = createClient();
    const { error } = await supabase.from("facility_claims").insert({
      facility_id: facility.id,
      claimant_id: userId,
      claimant_name: name,
      claimant_phone: phone || null,
      claimant_role: role,
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else {
      setState("done");
    }
  }

  if (state === "done") {
    return (
      <div className="mt-8 rounded-xl border border-green-200 bg-green-50 p-6 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
        <p className="font-medium">Claim submitted</p>
        <p className="mt-1">
          We&apos;ll verify your affiliation with {titleCase(facility!.name)} and email you
          when it&apos;s approved. Track it on your{" "}
          <Link href="/account" className="underline">
            account page
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {/* Step 1: pick a facility */}
      {!facility ? (
        <div>
          <label htmlFor="facility-search" className="block text-sm font-medium">
            Find your facility
          </label>
          <input
            id="facility-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Facility name or license number…"
            className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900"
          />
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setFacility(r)}
                    className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{titleCase(r.name)}</span>
                      <span className="ml-2 text-sm text-zinc-500">
                        {[r.street_address && titleCase(r.street_address), r.city && titleCase(r.city)]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">#{r.license_number}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div>
          {/* Selected facility */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div>
              <div className="font-medium">{titleCase(facility.name)}</div>
              <div className="text-sm text-zinc-500">
                {[facility.street_address && titleCase(facility.street_address), facility.city && titleCase(facility.city)]
                  .filter(Boolean)
                  .join(", ")}{" "}
                · License #{facility.license_number}
              </div>
            </div>
            {!preselected && (
              <button
                type="button"
                onClick={() => { setFacility(null); setExisting(null); }}
                className="text-sm text-blue-600 hover:underline"
              >
                Change
              </button>
            )}
          </div>

          {facility.owner_id ? (
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              This listing has already been claimed. If you believe that&apos;s an error,
              contact us at support@seniornearme.com.
            </p>
          ) : existing ? (
            <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              You already have a <span className="font-medium">{existing.status}</span> claim
              for this facility.{" "}
              <Link href="/account" className="underline">
                View it on your account page
              </Link>
              .
            </p>
          ) : (
            /* Step 2: claim form */
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="claim-name" className="block text-sm font-medium">
                  Your full name
                </label>
                <input
                  id="claim-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <div>
                <label htmlFor="claim-phone" className="block text-sm font-medium">
                  Phone <span className="font-normal text-zinc-400">(for verification)</span>
                </label>
                <input
                  id="claim-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <div>
                <label htmlFor="claim-role" className="block text-sm font-medium">
                  Your role at the facility
                </label>
                <select
                  id="claim-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="owner">Owner / licensee</option>
                  <option value="administrator">Administrator</option>
                  <option value="manager">Manager</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {state === "error" && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={state === "submitting"}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                {state === "submitting" ? "Submitting…" : "Submit claim"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
