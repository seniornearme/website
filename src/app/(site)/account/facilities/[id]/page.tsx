import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { titleCase } from "@/lib/format";
import { WebsiteConnect, GoogleConnect } from "./manage-client";

export const metadata: Metadata = { title: "Manage facility" };

export default async function ManageFacilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?redirect=/account/facilities/${id}`);

  const { data: f } = await supabase
    .from("facilities")
    .select("id, name, slug, street_address, city, zip, license_number, website, website_source, photos_synced_at, owner_id")
    .eq("id", id)
    .single();
  if (!f || f.owner_id !== user.id) notFound();

  const { data: connection } = await supabase
    .from("google_business_connections")
    .select("status, google_email, connected_at")
    .eq("facility_id", id)
    .maybeSingle();

  const { count: photoCount } = await supabase
    .from("facility_photos")
    .select("*", { count: "exact", head: true })
    .eq("facility_id", id);

  const address = [
    f.street_address ? titleCase(f.street_address) : null,
    [f.city ? titleCase(f.city) : null, "CA", f.zip].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <nav className="text-sm text-zinc-500">
        <Link href="/account" className="hover:underline">
          Your account
        </Link>{" "}
        / <span className="text-zinc-700 dark:text-zinc-300">Manage facility</span>
      </nav>

      <h1 className="mt-2 text-2xl font-semibold">{titleCase(f.name)}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {address} · License #{f.license_number} ·{" "}
        <Link href={`/facilities/${f.slug}`} className="text-blue-600 hover:underline">
          View public page
        </Link>
      </p>

      <div className="mt-8 space-y-6">
        <WebsiteConnect
          facilityId={f.id}
          initialWebsite={f.website}
          websiteSource={f.website_source}
          photoCount={photoCount ?? 0}
        />
        <GoogleConnect
          facilityId={f.id}
          connection={connection as { status: string; google_email: string | null; connected_at: string } | null}
        />
      </div>
    </main>
  );
}
