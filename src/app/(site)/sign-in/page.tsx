import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to SeniorNearMe to claim and manage your facility listing.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: next } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(next && next.startsWith("/") ? next : "/account");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        We&apos;ll email you a secure sign-in link — no password needed.
      </p>
      <SignInForm next={next && next.startsWith("/") ? next : "/account"} />
    </main>
  );
}
