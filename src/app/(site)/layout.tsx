// Route group for content pages (home, facilities, claim, legal, browse):
// shared header + footer. /search stays chromeless app-mode.
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      <SiteFooter />
    </>
  );
}
