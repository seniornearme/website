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
