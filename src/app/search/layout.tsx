// The map keeps app-mode (no footer), but gets the site header so users can
// always navigate back — it's a primary destination via /search?city= links.
// Fixed-viewport flex column: header on top, map fills the remainder exactly.
import { SiteHeader } from "@/components/site-header";

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <SiteHeader />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
