"use client";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Sun, ArrowUpRight } from "lucide-react";
import { SiteBrand } from "@/components/site-brand";
import { ProductSwitcher } from "@/components/product-switcher";
import { getProduct } from "@/lib/products";
import { Button } from "@/components/ui/button";
export function ProductHeader({ current }: { current?: string }) {
  const product = current ? getProduct(current) : undefined;
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <header className="unified-header">
      <Link href="/" aria-label="Aventara home">
        <SiteBrand />
      </Link>
      <ProductSwitcher current={current} />
      <nav className="unified-header-links" aria-label="Main navigation">
        {product ? (
          <>
            <a href="#possibilities">Features</a>
            <a href="#how-it-works">How it works</a>
            <Link href={`/${product.id}/docs/${product.overviewSlug}`}>
              Documentation
            </Link>
          </>
        ) : (
          <>
            <Link href="/#products">Documentation</Link>
            <Link href="/#connected">How it connects</Link>
          </>
        )}
        <a href="https://github.com/mhmd-hatem/aventara-docs/issues/new/choose">
          Feedback <ArrowUpRight size={12} />
        </a>
      </nav>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle color theme"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        <Sun className="dark-theme-icon" size={18} />
        <Moon className="light-theme-icon" size={18} />
      </Button>
    </header>
  );
}
