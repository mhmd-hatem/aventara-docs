import Link from "next/link";
import { products } from "@/lib/products";
import { SiteBrand } from "@/components/site-brand";
export function SiteFooter() {
  return (
    <footer className="unified-footer">
      <Link href="/" aria-label="Aventara home">
        <SiteBrand />
      </Link>
      <span>Built around your schema. Made for your application.</span>
      <nav aria-label="Footer">
        {products
          .filter((p) => p.licenseSlug)
          .map((p) => (
            <Link key={p.id} href={`/${p.id}/docs/${p.licenseSlug}`}>
              {p.name} license
            </Link>
          ))}
        <a href="https://github.com/mhmd-hatem/aventara-docs/issues/new/choose">
          Feedback
        </a>
      </nav>
    </footer>
  );
}
