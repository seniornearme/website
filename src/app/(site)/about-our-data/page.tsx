import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal";

export const metadata: Metadata = {
  title: "About Our Data",
  description:
    "Where SeniorNearMe's facility, inspection, photo, and review data comes from — and how to report an issue or request a removal.",
};

export default function AboutOurDataPage() {
  return (
    <LegalPage title="About Our Data" updated="July 2, 2026">
      <LegalSection heading="Licensing & inspection records">
        <p>
          Facility listings — names, addresses, license numbers, capacity, licensing status,
          administrators, and inspection/complaint histories — come from the California
          Department of Social Services, Community Care Licensing Division (CDSS CCLD)
          public records. We refresh this data periodically, but the state&apos;s{" "}
          <a
            href="https://www.ccld.dss.ca.gov/carefacilitysearch/"
            className="text-blue-600 hover:underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            Care Facility Search
          </a>{" "}
          is always the authoritative source. SeniorNearMe is not affiliated with the State
          of California.
        </p>
      </LegalSection>

      <LegalSection heading="Photos">
        <p>
          Photos on unclaimed listings are collected from the facility&apos;s own public
          website and are shown to help families see the facility. Each photo retains a
          record of its source. When an owner claims a listing, they control its photos
          entirely — choosing what is shown, hiding anything, and uploading their own.
        </p>
        <p className="font-medium">
          Facility owner? If you&apos;d like a photo removed or updated, email{" "}
          <a href="mailto:support@seniornearme.com" className="text-blue-600 hover:underline">
            support@seniornearme.com
          </a>{" "}
          with your facility name and license number and we&apos;ll act promptly — or{" "}
          <a href="/claim" className="text-blue-600 hover:underline">
            claim your listing
          </a>{" "}
          to manage photos yourself, free.
        </p>
      </LegalSection>

      <LegalSection heading="Descriptions & amenities">
        <p>
          Descriptions and amenity tags on unclaimed listings are derived from the
          facility&apos;s public website. They are labeled as such on each page — verify
          services and amenities directly with the facility.
        </p>
      </LegalSection>

      <section id="inspection-score">
        <h2 className="text-lg font-semibold">The Inspection Record Score</h2>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            Each facility&apos;s score (0–100) is simple, disclosed arithmetic over its
            official CDSS record — nothing subjective, nothing hidden:
          </p>
          <p className="rounded-lg bg-zinc-50 px-4 py-3 font-mono text-xs dark:bg-zinc-900">
            100 − 20 × Type A citations (max 3 counted) − 5 × Type B citations (max 4)
            − 12 × substantiated allegations (max 4), never below 0
          </p>
          <p>
            Type A citations are the state&apos;s most serious category — violations posing
            an immediate risk to residents&apos; health, safety, or personal rights — so they
            weigh the most. <span className="font-medium">Unsubstantiated complaints are
            never scored</span>: anyone can file a complaint, so only findings the state
            confirmed count against a facility. Facilities without inspection data yet are
            unrated rather than penalized.
          </p>
          <p>
            Tiers: 90–100 strong record · 70–89 minor issues · 50–69 mixed record · below
            50 significant citations. The score reflects a facility&apos;s regulatory record,
            not a judgment of care quality — always read the underlying reports and visit in
            person. Data refreshes weekly from CDSS.
          </p>
        </div>
      </section>

      <section id="pricing-estimates">
        <h2 className="text-lg font-semibold">Pricing estimates</h2>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            Unless a facility has published its own rates with us (badged
            &ldquo;Pricing provided by the facility&rdquo;), the cost shown is an estimate
            built from three public inputs:
          </p>
          <p className="rounded-lg bg-zinc-50 px-4 py-3 font-mono text-xs dark:bg-zinc-900">
            California median for assisted living ($7,350/mo, Genworth/CareScout Cost of
            Care Survey 2024) × county cost factor (Zillow Observed Rent Index, damped 50%
            because care costs vary less than housing) × a range for the facility&apos;s
            licensed capacity class
          </p>
          <p>
            Smaller board-and-care homes typically price below the survey median, which
            skews toward larger communities; large communities with tiered care price
            above it. The estimate reflects a private room — shared rooms typically run
            25&ndash;40% less. Actual rates depend on care needs and negotiation — treat
            the estimate as a starting point and confirm directly with the facility.
            Facility owners can replace the estimate with real room-type rates by claiming
            their listing, at no cost.
          </p>
        </div>
      </section>

      <LegalSection heading="Ratings & reviews">
        <p>
          Ratings and reviews shown on facility pages are provided live by Google and are
          not stored by us. They reflect Google users&apos; opinions, not ours.
        </p>
      </LegalSection>

      <LegalSection heading="Report an issue">
        <p>
          See something wrong — an incorrect address, a closed facility still listed, a
          mismatched photo? Email{" "}
          <a href="mailto:support@seniornearme.com" className="text-blue-600 hover:underline">
            support@seniornearme.com
          </a>{" "}
          with the facility name and page link. Corrections ship quickly.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
