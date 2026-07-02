import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How SeniorNearMe collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="July 2, 2026">
      <LegalSection heading="What this covers">
        <p>
          This policy describes how SeniorNearMe (&quot;we&quot;, &quot;us&quot;) handles
          information when you use seniornearme.com. The short version: we collect the
          minimum needed to run a facility directory, we don&apos;t sell your personal
          information, and you can ask us to delete your data at any time.
        </p>
      </LegalSection>

      <LegalSection heading="Information we collect">
        <p>
          <span className="font-medium">Account information.</span> If you create an
          account, we store your email address and, if you claim a facility listing, the
          name, phone number, and role you provide for verification.
        </p>
        <p>
          <span className="font-medium">Inquiries.</span> If you contact a facility through
          our site, we store the message and contact details you provide so the facility can
          respond.
        </p>
        <p>
          <span className="font-medium">Usage data.</span> Standard server logs and
          privacy-respecting analytics (page views, approximate region). We do not build
          advertising profiles.
        </p>
        <p>
          <span className="font-medium">Facility information</span> shown on this site
          (names, addresses, licensing and inspection records) is public-record data about
          licensed businesses, not personal data about our users. See{" "}
          <a href="/about-our-data" className="text-blue-600 hover:underline">
            About our data
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="How we use information">
        <p>
          To operate the directory, verify listing claims, deliver inquiries to facilities,
          keep the service secure, and improve it. We use cookies only for authentication
          (keeping you signed in) — not for cross-site tracking.
        </p>
      </LegalSection>

      <LegalSection heading="Sharing">
        <p>
          We share information with service providers who host our infrastructure (e.g.,
          database, hosting, email delivery), with a facility when you send it an inquiry,
          and when required by law. We do not sell personal information.
        </p>
        <p>
          Facility detail pages load ratings and reviews from Google — Google&apos;s own{" "}
          <a
            href="https://policies.google.com/privacy"
            className="text-blue-600 hover:underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            privacy policy
          </a>{" "}
          applies to that content.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights (including CCPA)">
        <p>
          California residents have the right to know what personal information we hold,
          request its deletion, and not be discriminated against for exercising those
          rights. We extend the same rights to all users: email{" "}
          <a href="mailto:support@seniornearme.com" className="text-blue-600 hover:underline">
            support@seniornearme.com
          </a>{" "}
          and we&apos;ll respond within 30 days. We do not sell personal information, so
          there is nothing to opt out of.
        </p>
      </LegalSection>

      <LegalSection heading="Data retention & security">
        <p>
          Account data is kept while your account is active and deleted on request. Data is
          stored with access controls and encrypted in transit. No system is perfectly
          secure — use a unique email and report anything suspicious.
        </p>
      </LegalSection>

      <LegalSection heading="Changes & contact">
        <p>
          We&apos;ll update this page when the policy changes and adjust the date above.
          Questions:{" "}
          <a href="mailto:support@seniornearme.com" className="text-blue-600 hover:underline">
            support@seniornearme.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
