import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { titleCase } from "@/lib/format";
import { withDefaultFeatures } from "@/lib/care-taxonomy";
import { WebsiteConnect, GoogleConnect, CareFeaturesEditor, PricingEditor } from "./manage-client";
import { ComplianceTracker, type ComplianceItem } from "./compliance-client";

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
    .select("id, name, slug, street_address, city, zip, license_number, website, website_source, photos_synced_at, owner_id, amenities, amenities_source, price_min, price_max, price_shared_min, price_shared_max, pricing_source")
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

  const { data: complianceItems } = await supabase
    .from("compliance_items")
    .select("id, form_key, label, last_completed, due_date, applies, document_path")
    .eq("facility_id", id)
    .order("created_at");

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
        <PricingEditor
          facilityId={f.id}
          initial={{
            min: f.price_min,
            max: f.price_max,
            sharedMin: f.price_shared_min,
            sharedMax: f.price_shared_max,
          }}
          isOwnerSet={f.pricing_source === "owner"}
        />
        <CareFeaturesEditor
          facilityId={f.id}
          initial={withDefaultFeatures((f.amenities as string[] | null) ?? [], f.amenities_source)}
          source={f.amenities_source}
        />
        <ComplianceTracker
          facilityId={f.id}
          initialItems={(complianceItems as ComplianceItem[] | null) ?? []}
        />
      </div>
    </main>
  );
}
