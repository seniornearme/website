import type { Metadata } from "next";
import Link from "next/link";
import { COMPLIANCE_LIBRARY } from "@/lib/compliance-forms";

export const metadata: Metadata = {
  title: "California RCFE Compliance Forms Library | SeniorNearMe",
  description:
    "Every CDSS form a California assisted living facility (RCFE) needs — licensing, staff, and resident forms with official PDF links, plus when each is required.",
  alternates: { canonical: "/compliance-forms" },
};

function frequencyText(f: { recurrence: { kind: string; months?: number } }): string {
  const r = f.recurrence;
  if (r.kind === "once") return "One-time / keep current";
  if (r.kind === "recurring")
    return r.months === 12 ? "Renews annually" : r.months === 6 ? "Every 6 months" : `Renews every ${r.months} months`;
  return "As needed (event-driven)";
}

export default function ComplianceFormsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold">RCFE compliance forms library</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        The California Department of Social Services (CDSS) forms and recurring requirements
        for a licensed Residential Care Facility for the Elderly, organized by what they
        cover. Each form links to the official CDSS PDF.
      </p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Facility owners:{" "}
        <Link href="/claim" className="font-medium text-blue-600 hover:underline">
          claim your listing
        </Link>{" "}
        to use the free compliance tracker with due-date reminders for everything below.
      </p>

      <div className="mt-8 space-y-10">
        {COMPLIANCE_LIBRARY.map((cat) => (
          <section key={cat.key}>
            <h2 className="text-lg font-semibold">{cat.label}</h2>
            {cat.per !== "facility" && (
              <p className="mt-0.5 text-xs text-zinc-500">
                Required for each {cat.per === "staff" ? "employee" : "resident"}.
              </p>
            )}
            <ul className="mt-3 space-y-3">
              {cat.forms.map((form) => (
                <li
                  key={form.key}
                  className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-medium">
                      {form.name}
                      {form.code && (
                        <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {form.code}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-zinc-400">{frequencyText(form)}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {form.description}
                  </p>
                  {form.url && (
                    <a
                      href={form.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-block text-xs font-medium text-blue-600 hover:underline"
                    >
                      {form.code ? `${form.code} — official PDF ↗` : "Official page ↗"}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-10 text-xs leading-relaxed text-zinc-400">
        Provided as a convenience, not legal advice. Requirements come from Title 22 of the
        California Code of Regulations and the Health &amp; Safety Code, and change over
        time — verify with your{" "}
        <a
          href="https://www.cdss.ca.gov/inforesources/community-care-licensing"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          CCLD regional office
        </a>{" "}
        or the{" "}
        <a
          href="https://www.cdss.ca.gov/inforesources/forms-brochures"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          CDSS forms library
        </a>
        .
      </p>
    </main>
  );
}
