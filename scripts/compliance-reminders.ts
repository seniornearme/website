/**
 * Weekly compliance reminders: finds tracked items that are overdue or due
 * within the next 30 days, groups them per owner, and emails a digest.
 *
 * Email goes through Postmark when POSTMARK_SERVER_TOKEN is set; until then
 * the script logs what it WOULD send, so the pipeline is exercised end-to-end
 * and flipping on email is just adding the secret.
 *
 * Run:  npx tsx scripts/compliance-reminders.ts            # send/log digests
 *       npx tsx scripts/compliance-reminders.ts --dry-run  # never send
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { COMPLIANCE_FORM_MAP } from "../src/lib/compliance-forms";

config({ path: ".env.local" });

const DRY = process.argv.includes("--dry-run");
const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN;
const MAIL_FROM = process.env.MAIL_FROM ?? "reminders@seniornearme.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://website-one-sable-81.vercel.app";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type DueItem = {
  form_key: string;
  label: string | null;
  due_date: string;
  facilities: { id: string; name: string; owner_id: string | null } | null;
};

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30);

  const { data, error } = await supabase
    .from("compliance_items")
    .select("form_key, label, due_date, facilities!inner(id, name, owner_id)")
    .eq("applies", true)
    .not("due_date", "is", null)
    .lte("due_date", horizon.toISOString().slice(0, 10))
    .order("due_date");
  if (error) throw error;

  const items = (data as unknown as DueItem[]).filter((i) => i.facilities?.owner_id);
  if (!items.length) {
    console.log("No compliance items due within 30 days. Nothing to send.");
    return;
  }

  // one digest per owner
  const byOwner = new Map<string, DueItem[]>();
  for (const i of items) {
    const owner = i.facilities!.owner_id!;
    (byOwner.get(owner) ?? byOwner.set(owner, []).get(owner)!).push(i);
  }
  console.log(`${items.length} items due across ${byOwner.size} owner(s)\n`);

  for (const [ownerId, ownerItems] of byOwner) {
    const { data: user } = await supabase.auth.admin.getUserById(ownerId);
    const email = user?.user?.email;
    if (!email) { console.log(`  owner ${ownerId}: no email, skipped`); continue; }

    const lines = ownerItems.map((i) => {
      const form = COMPLIANCE_FORM_MAP.get(i.form_key);
      const name = form ? `${form.name}${form.code ? ` (${form.code})` : ""}` : i.form_key;
      const who = i.label ? ` — ${i.label}` : "";
      const status = i.due_date < today ? "OVERDUE" : `due ${i.due_date}`;
      return `• ${name}${who} at ${i.facilities!.name}: ${status}`;
    });
    const facilityId = ownerItems[0].facilities!.id;
    const body =
      `Your compliance checklist has ${ownerItems.length} item(s) needing attention:\n\n` +
      `${lines.join("\n")}\n\n` +
      `Review and update your tracker: ${APP_URL}/account/facilities/${facilityId}\n\n` +
      `— SeniorNearMe\nThis is a courtesy reminder, not legal advice.`;

    if (!POSTMARK_TOKEN || DRY) {
      console.log(`  would email ${email}:\n${body.split("\n").map((l) => `    ${l}`).join("\n")}\n`);
      continue;
    }

    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": POSTMARK_TOKEN,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        From: MAIL_FROM,
        To: email,
        Subject: `Compliance reminders: ${ownerItems.length} item(s) due`,
        TextBody: body,
        MessageStream: "outbound",
      }),
      signal: AbortSignal.timeout(15000),
    });
    console.log(`  ${email}: ${res.ok ? "sent" : `FAILED ${res.status}`}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
