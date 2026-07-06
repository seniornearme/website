// Owner-only download of a compliance form pre-filled with the facility's
// identity fields. Serves the repaired fillable copies in /public/forms —
// fields stay editable so the owner completes the rest on their computer.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COMPLIANCE_FORM_MAP } from "@/lib/compliance-forms";
import { prefillForm, type FacilityIdentity } from "@/lib/form-prefill";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const form = COMPLIANCE_FORM_MAP.get(key);
  if (!form) return NextResponse.json({ error: "unknown form" }, { status: 404 });

  const facilityId = request.nextUrl.searchParams.get("facility");
  if (!facilityId) return NextResponse.json({ error: "facility required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { data: f } = await supabase
    .from("facilities")
    .select("owner_id,name,license_number,street_address,city,zip,phone,administrator,licensee")
    .eq("id", facilityId)
    .single();
  if (!f || f.owner_id !== user.id) {
    return NextResponse.json({ error: "not your facility" }, { status: 403 });
  }

  // the repaired fillable copy is a static asset — fetch it from our own origin
  const pdfRes = await fetch(new URL(`/forms/${key}.pdf`, request.nextUrl.origin), {
    cache: "force-cache",
  });
  if (!pdfRes.ok) return NextResponse.json({ error: "form file missing" }, { status: 404 });

  const { bytes } = await prefillForm(key, await pdfRes.arrayBuffer(), f as FacilityIdentity);
  const filename = `${(form.code ?? form.key).replace(/\s+/g, "_")}_${f.license_number ?? "form"}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
