"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else {
      setState("sent");
    }
  }

  if (state === "sent") {
    return (
      <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
        <p className="font-medium">Check your email</p>
        <p className="mt-1">
          We sent a sign-in link to <span className="font-medium">{email}</span>. The link
          expires in one hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label className="block text-sm font-medium" htmlFor="email">
        Email address
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {state === "error" && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="text-xs text-zinc-500">
        New here? The link creates your account automatically.
      </p>
    </form>
  );
}
