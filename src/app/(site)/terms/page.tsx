import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of SeniorNearMe.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="July 2, 2026">
      <LegalSection heading="Agreement">
        <p>
          By using seniornearme.com you agree to these terms. If you don&apos;t agree,
          please don&apos;t use the site.
        </p>
      </LegalSection>

      <LegalSection heading="What SeniorNearMe is (and isn't)">
        <p>
          SeniorNearMe is a directory of licensed senior care facilities in California,
          built from public licensing records and other public sources. It is an
          informational resource only. We are <span className="font-medium">not</span> a
          placement agency, a healthcare provider, or an advisor, and nothing on this site
          is medical, legal, or financial advice. Choosing a care facility is a significant
          decision — visit facilities in person, verify licensing directly with the
          California Department of Social Services, and consult professionals as needed.
        </p>
      </LegalSection>

      <LegalSection heading="Accuracy">
        <p>
          We work to keep information current, but licensing status, capacity, pricing,
          amenities, and availability change. Information is provided &quot;as is&quot;
          without warranties of any kind. Always confirm details directly with the facility
          and the state before making decisions.
        </p>
      </LegalSection>

      <LegalSection heading="Accounts & listing claims">
        <p>
          You must provide accurate information when creating an account or claiming a
          listing. Claiming a listing requires that you are genuinely affiliated with the
          facility; we verify claims and may reject or revoke them. Facility owners are
          responsible for the accuracy of content they add to their listings.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>
          Don&apos;t misuse the site: no scraping at scale, no attempting to access other
          users&apos; data, no submitting false claims or inquiries, no interfering with the
          service. We may suspend accounts that violate these terms.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, SeniorNearMe and its operators are not
          liable for indirect, incidental, or consequential damages arising from use of the
          site or reliance on its information. Our total liability for any claim is limited
          to $100.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law & changes">
        <p>
          These terms are governed by California law. We may update them; continued use
          after changes means you accept the updated terms. Questions:{" "}
          <a href="mailto:support@seniornearme.com" className="text-blue-600 hover:underline">
            support@seniornearme.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
