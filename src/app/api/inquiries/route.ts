import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Consumer inquiry / tour request. Inserted under the caller's session (RLS
// allows public insert). If the facility is claimed and Postmark is
// configured, the owner gets an email notification; otherwise inquiries wait
// in the DB (and become a claim incentive).

const InquirySchema = z.object({
  facility_id: z.string().uuid(),
  contact_name: z.string().trim().min(1).max(200),
  contact_email: z.string().trim().email().max(320),
  contact_phone: z.string().trim().max(40).optional().or(z.literal("")),
  message: z.string().trim().min(1).max(4000),
  move_in_timeframe: z.string().trim().max(60).optional().or(z.literal("")),
  tour_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  tour_time_window: z.enum(["morning", "afternoon", "evening"]).optional().or(z.literal("")),
  tour_type: z.enum(["in_person", "video"]).optional().or(z.literal("")),
  website: z.string().max(0).optional(), // honeypot — bots fill it, humans can't see it
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const parsed = InquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid fields" }, { status: 400 });
  }
  const d = parsed.data;
  if (d.website) return NextResponse.json({ ok: true }); // honeypot hit — swallow

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from("inquiries").insert({
    facility_id: d.facility_id,
    consumer_id: user?.id ?? null,
    contact_name: d.contact_name,
    contact_email: d.contact_email,
    contact_phone: d.contact_phone || null,
    message: d.message,
    move_in_timeframe: d.move_in_timeframe || null,
    tour_date: d.tour_date || null,
    tour_time_window: d.tour_time_window || null,
    tour_type: d.tour_type || null,
  });
  if (error) {
    console.error("inquiry insert:", error.message);
    return NextResponse.json({ error: "could not save" }, { status: 500 });
  }

  // Owner notification — only for claimed facilities, only when configured.
  void notifyOwner(d.facility_id, d).catch((e) =>
    console.error("inquiry notify:", (e as Error).message),
  );

  return NextResponse.json({ ok: true });
}

async function notifyOwner(facilityId: string, d: z.infer<typeof InquirySchema>) {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM_EMAIL;
  if (!token || !from) return;

  const supabase = await createClient();
  const { data: f } = await supabase
    .from("facilities")
    .select("name, owner_id")
    .eq("id", facilityId)
    .single();
  if (!f?.owner_id) return;
  const { data: owner } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", f.owner_id)
    .single();
  if (!owner?.email) return;

  const tour =
    d.tour_date || d.tour_time_window
      ? `\nRequested tour: ${d.tour_date ?? "any date"} (${d.tour_time_window ?? "any time"}, ${
          d.tour_type === "video" ? "video" : "in person"
        })`
      : "";
  await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token,
    },
    body: JSON.stringify({
      From: from,
      To: owner.email,
      Subject: `New inquiry for ${f.name}`,
      TextBody:
        `You have a new inquiry for ${f.name} via SeniorNearMe.\n\n` +
        `From: ${d.contact_name} <${d.contact_email}>${d.contact_phone ? ` · ${d.contact_phone}` : ""}\n` +
        `${d.move_in_timeframe ? `Move-in timeframe: ${d.move_in_timeframe}\n` : ""}` +
        tour +
        `\n\n${d.message}\n\n— SeniorNearMe`,
      MessageStream: "outbound",
    }),
    signal: AbortSignal.timeout(10000),
  });
}
