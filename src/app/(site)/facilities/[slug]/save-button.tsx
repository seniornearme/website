"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SaveButton({
  facilityId,
  slug,
  userId,
  initialSaved,
}: {
  facilityId: string;
  slug: string;
  userId: string | null;
  initialSaved: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!userId) {
      router.push(`/sign-in?redirect=${encodeURIComponent(`/facilities/${slug}`)}`);
      return;
    }
    setBusy(true);
    const supabase = createClient();
    if (saved) {
      const { error } = await supabase
        .from("saved_facilities")
        .delete()
        .eq("consumer_id", userId)
        .eq("facility_id", facilityId);
      if (!error) setSaved(false);
    } else {
      const { error } = await supabase
        .from("saved_facilities")
        .insert({ consumer_id: userId, facility_id: facilityId });
      if (!error) setSaved(true);
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
        saved
          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {saved ? "Saved" : "Save"}
      </span>
    </button>
  );
}
