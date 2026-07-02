import Link from "next/link";

const LINKS = [
  { href: "/search", label: "Search the map" },
  { href: "/assisted-living", label: "Browse by city" },
  { href: "/claim", label: "Claim your facility" },
  { href: "/about-our-data", label: "About our data" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-zinc-600 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="mt-6 text-xs leading-relaxed text-zinc-500">
          Facility licensing, inspection, and complaint data from the California Department
          of Social Services, Community Care Licensing Division. SeniorNearMe is not
          affiliated with the State of California or with the facilities listed. Information
          is provided as a public resource — verify details directly with facilities.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          © {new Date().getFullYear()} SeniorNearMe ·{" "}
          <a href="mailto:support@seniornearme.com" className="hover:underline">
            support@seniornearme.com
          </a>
        </p>
      </div>
    </footer>
  );
}
