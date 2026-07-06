"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CARE_TAXONOMY, sortCareFeatures } from "@/lib/care-taxonomy";

export function WebsiteConnect({
  facilityId,
  initialWebsite,
  websiteSource,
  photoCount,
}: {
  facilityId: string;
  initialWebsite: string | null;
  websiteSource: string | null;
  photoCount: number;
}) {
  const [website, setWebsite] = useState(initialWebsite ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const value = website.trim();
    const normalized = value && !/^https?:\/\//i.test(value) ? `https://${value}` : value;
    const supabase = createClient();
    const { error } = await supabase
      .from("facilities")
      .update({ website: normalized || null, website_source: normalized ? "owner" : null })
      .eq("id", facilityId);
    if (error) {
      setError(error.message);
      setState("error");
    } else {
      setWebsite(normalized);
      setState("saved");
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="font-semibold">Connect your website</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        We use your website to show photos, descriptions, and amenities on your listing.
        Saving a new address queues a fresh import — photos from your site appear within a
        day, and you control what&apos;s shown.
      </p>
      <form onSubmit={save} className="mt-4 flex gap-2">
        <input
          type="url"
          value={website}
          onChange={(e) => { setWebsite(e.target.value); setState("idle"); }}
          placeholder="https://yourfacility.com"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={state === "saving"}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Save"}
        </button>
      </form>
      {state === "saved" && (
        <p className="mt-2 text-sm text-green-700 dark:text-green-400">
          Saved — your site is queued for a content refresh.
        </p>
      )}
      {state === "error" && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-3 text-xs text-zinc-400">
        {photoCount > 0
          ? `${photoCount} photo${photoCount === 1 ? "" : "s"} on file`
          : "No photos on file yet"}
        {websiteSource ? ` · current website source: ${websiteSource.replace(/_/g, " ")}` : ""}
      </p>
    </section>
  );
}

export function CareFeaturesEditor({
  facilityId,
  initial,
  source,
}: {
  facilityId: string;
  initial: string[];
  source: string | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  function toggle(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setState("idle");
  }

  async function save() {
    setState("saving");
    const supabase = createClient();
    const { error } = await supabase
      .from("facilities")
      .update({ amenities: sortCareFeatures([...selected]), amenities_source: "owner" })
      .eq("id", facilityId);
    if (error) {
      setError(error.message);
      setState("error");
    } else {
      setState("saved");
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="font-semibold">Care &amp; amenities</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Check everything your facility offers — this is what visitors see on your listing.
        {source !== "owner" && initial.length > 0 &&
          " The current selections were detected from your website; saving replaces them with your choices."}
      </p>

      <div className="mt-4 space-y-5">
        {CARE_TAXONOMY.map((g) => (
          <fieldset key={g.key}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {g.label}
            </legend>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {g.features.map((ft) => (
                <label
                  key={ft.key}
                  className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(ft.key)}
                    onChange={() => toggle(ft.key)}
                    className="h-4 w-4 rounded border-zinc-300 accent-blue-600"
                  />
                  {ft.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={state === "saving"}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Save amenities"}
        </button>
        {state === "saved" && (
          <span className="text-sm text-green-700 dark:text-green-400">
            Saved — your listing is updated.
          </span>
        )}
        {state === "error" && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}

export function GoogleConnect({
  facilityId,
  connection,
}: {
  facilityId: string;
  connection: { status: string; google_email: string | null; connected_at: string } | null;
}) {
  const searchParams = useSearchParams();
  const justConnected = searchParams.get("google") === "connected";
  const errored = searchParams.get("google") === "error";
  const notConfigured = searchParams.get("google") === "not-configured";

  const STATUS_TEXT: Record<string, string> = {
    connected: "Connected — reviews are syncing.",
    pending_api_approval:
      "Connected. Review syncing activates once Google approves our Business Profile API access — no action needed from you.",
    error: "Connection error — try reconnecting.",
    revoked: "Access was revoked — reconnect to resume.",
  };

  return (
    <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="font-semibold">Connect your Google reviews</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Link the Google Business Profile you manage and we&apos;ll show your Google reviews
        on your listing — updated automatically, through Google&apos;s official access.
      </p>

      {connection && !errored ? (
        <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          <span className="font-medium">
            {connection.google_email ? `Connected as ${connection.google_email}` : "Connected"}
          </span>
          <p className="mt-0.5">{STATUS_TEXT[connection.status] ?? connection.status}</p>
        </div>
      ) : (
        <div className="mt-4">
          <a
            href={`/api/google-business/connect?facility=${facilityId}`}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
              <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8H1.2v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.2a12 12 0 0 0 0 10.8l4.1-3.1z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8L20.1 3A12 12 0 0 0 1.2 6.6l4.1 3.1A7.2 7.2 0 0 1 12 4.8z" />
            </svg>
            Connect with Google
          </a>
          {errored && (
            <p className="mt-2 text-sm text-red-600">
              Something went wrong connecting — please try again.
            </p>
          )}
          {notConfigured && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
              Google connection isn&apos;t configured on this environment yet.
            </p>
          )}
          {justConnected && (
            <p className="mt-2 text-sm text-green-700 dark:text-green-400">Connected!</p>
          )}
        </div>
      )}
    </section>
  );
}
