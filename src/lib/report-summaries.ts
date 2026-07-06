/**
 * Extract per-report summaries from official CCLD report documents.
 *
 * Reports are LIC809 evaluation / complaint-investigation forms served as
 * HTML. We pull two things deterministically (no LLM): the TYPE OF VISIT
 * field ("Annual", "Complaint Investigation", "Prelicensing"...) and the
 * opening of the inspector's narrative, which states the reason for the
 * visit. Public state records — storable and quotable.
 *
 * Filled lazily via next/server `after()` when a facility page is viewed and
 * rows lack summarized_at; failures stay unset and retry on a later view.
 */
import { createClient } from "@supabase/supabase-js";

const REPORT_URL = (license: string, index: number) =>
  `https://www.ccld.dss.ca.gov/transparencyapi/api/FacilityReports?facNum=${license}&inx=${index}`;

export function reportUrl(license: string, index: number): string {
  return REPORT_URL(license, index);
}

function htmlToLines(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const LABEL = /^[A-Z][A-Z /()'&-]{3,}:?$/; // form field labels like "MET WITH:"

function extract(html: string): { visitType: string | null; summary: string | null } {
  const lines = htmlToLines(html);

  // TYPE OF VISIT: value follows on subsequent line(s) until the next label.
  let visitType: string | null = null;
  const tIdx = lines.findIndex((l) => /^TYPE OF VISIT/i.test(l));
  if (tIdx >= 0) {
    const parts: string[] = [];
    for (let i = tIdx + 1; i < Math.min(tIdx + 4, lines.length); i++) {
      if (LABEL.test(lines[i]) && !/^(UNANNOUNCED|ANNOUNCED)$/i.test(lines[i])) break;
      parts.push(lines[i]);
    }
    visitType = parts.join(" ").trim() || null;
    if (visitType) visitType = visitType.replace(/\s+/g, " ").slice(0, 80);
  }

  // Narrative: after the NARRATIVE header, skipping the line-number gutter.
  let summary: string | null = null;
  const nIdx = lines.findIndex((l) => /^NARRATIVE$/i.test(l));
  if (nIdx >= 0) {
    const body: string[] = [];
    for (let i = nIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^\d{1,3}$/.test(l)) continue; // gutter numbers
      if (/^(NAME OF LICENSING|SUPERVISOR'S NAME|LICENSING PROGRAM ANALYST SIGNATURE|ESTIMATED DAYS)/i.test(l)) break;
      body.push(l);
      if (body.join(" ").length > 1200) break;
    }
    const text = body.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      const first = text.split(/(?<=[.!?])\s+/)[0] ?? "";
      summary = first.length > 240 ? `${first.slice(0, 237)}…` : first;
    }
  }

  return { visitType, summary };
}

type PendingReport = { id: string; report_index: number };

/** Fetch + parse + store summaries for a facility's unsummarized reports. */
export async function summarizeFacilityReports(
  license: string,
  pending: PendingReport[],
): Promise<void> {
  if (!pending.length) return;
  // service client: writes bypass RLS (no owner writes to this table)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const CONC = 3;
  for (let i = 0; i < pending.length; i += CONC) {
    await Promise.all(
      pending.slice(i, i + CONC).map(async (r) => {
        try {
          const res = await fetch(REPORT_URL(license, r.report_index), {
            signal: AbortSignal.timeout(12000),
            cache: "no-store",
          });
          if (!res.ok) return;
          const { visitType, summary } = extract(await res.text());
          if (!visitType && !summary) return;
          await supabase
            .from("facility_reports")
            .update({
              visit_type: visitType,
              summary,
              summarized_at: new Date().toISOString(),
            })
            .eq("id", r.id);
        } catch {
          /* retry on a later page view */
        }
      }),
    );
  }
}
