"use client";
import { productTheme } from "@/lib/product-theme";
import { ProductSwitcher } from "@/components/product-switcher";
import { primarySection, type Product } from "@/lib/products";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowUpRight,
  BookOpen,
  FlaskConical,
  ChevronDown,
  ChevronRight,
  Code2,
  Compass,
  Database,
  FolderCode,
  Globe2,
  Layers3,
  LifeBuoy,
  Menu,
  Moon,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  SquareTerminal,
  Sun,
  Terminal,
  Workflow,
} from "lucide-react";
import { SiteBrand } from "@/components/site-brand";
import { Button } from "@/components/ui/button";
import { SearchDialog } from "@/components/search";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
const icons: Record<string, typeof Compass> = {
  compass: Compass,
  terminal: Terminal,
  folder: FolderCode,
  layers: Layers3,
  settings: Settings2,
  database: Database,
  workflow: Workflow,
  code: Code2,
  server: Server,
  globe: Globe2,
  square: SquareTerminal,
  life: LifeBuoy,
  shield: ShieldCheck,
};
function SidebarGroup({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return (
    <div className="nav-group" data-open={open}>
      <button
        type="button"
        className="nav-group-trigger"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        {title}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      <div
        id={contentId}
        className="nav-group-content"
        inert={!open}
        aria-hidden={!open}
      >
        <div className="nav-group-links">{children}</div>
      </div>
    </div>
  );
}
function Sidebar({
  product,
  onNavigate,
}: {
  product: Product;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    // Scroll only the navigation pane, leaving the reader's page position intact.
    const frame = requestAnimationFrame(() => {
      const container = nav.current;
      const active = container?.querySelector('[aria-current="page"]');
      if (!container || !active) return;
      const bounds = container.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      if (item.bottom > bounds.bottom)
        container.scrollTop += item.bottom - bounds.bottom + 12;
      else if (item.top < bounds.top)
        container.scrollTop -= bounds.top - item.top + 12;
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  return (
    <>
      <div className="sidebar-context">
        <BookOpen size={16} />
        <span>{product.name} docs</span>
        <span className="sidebar-pilot" title="Release candidate">
          RC
        </span>
      </div>
      <nav
        key={pathname}
        ref={nav}
        aria-label="Documentation pages"
        className="sidebar-nav"
      >
        {product.navigation.map((group) => (
          <SidebarGroup
            key={group.title}
            title={group.title}
            defaultOpen={group.items.some(
              ([slug]) => pathname === `/${product.id}/docs/${slug}`,
            )}
          >
            {group.items.map(([slug, title, icon]) => {
              const Icon = icons[icon] ?? Code2;
              const active = pathname === `/${product.id}/docs/${slug}`;
              return (
                <Link
                  key={slug}
                  href={`/${product.id}/docs/${slug}`}
                  className={active ? "nav-link active" : "nav-link"}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <Icon size={16} strokeWidth={1.65} />
                  <span>{title}</span>
                  {slug === "getting-started" && (
                    <span className="nav-hint">Start here</span>
                  )}
                  {active && <span className="active-dot" />}
                </Link>
              );
            })}
          </SidebarGroup>
        ))}
      </nav>
      <Link
        className="sidebar-playground"
        href={`/${product.id}/llms.txt`}
        onClick={onNavigate}
      >
        <span className="sidebar-playground-icon">
          <BookOpen size={18} />
        </span>
        <span>
          Docs for your tools<small>Read the Markdown index</small>
        </span>
        <ArrowUpRight size={15} />
      </Link>
      <div className="sidebar-bottom">
        <span className="pilot-dot" />
        <span>{product.currentVersion}</span>
        <Link
          href={`/${product.id}/docs/${product.overviewSlug}${product.statusAnchor ? `#${product.statusAnchor}` : ""}`}
          onClick={onNavigate}
        >
          Release status <ArrowUpRight size={12} />
        </Link>
      </div>
    </>
  );
}
export function DocsShell({
  children,
  product,
}: {
  children: React.ReactNode;
  product: Product;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const section = primarySection(product, pathname);
  return (
    <div className="product-scope" style={productTheme(product)}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-brand">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={21} />
          </Button>
          <Link href="/" aria-label="Aventara home">
            <SiteBrand />
          </Link>
          <span className="header-divider" />
          <ProductSwitcher current={product.id} />
        </div>
        <nav className="header-nav" aria-label="Primary">
          {product.primaryNavigation.map((item) => (
            <Link
              key={item.section}
              data-active={section === item.section}
              aria-current={section === item.section ? "page" : undefined}
              href={`/${product.id}${item.href}`}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="Search documentation"
          >
            <Search size={16} />
            <span>Search {product.name}</span>
            <kbd>⌘ K</kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle color theme"
            title="Toggle Moonlit Frost / Aurora Ink"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            <Sun className="dark-theme-icon" size={19} />
            <Moon className="light-theme-icon" size={18} />
          </Button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <Sidebar product={product} />
        </aside>
        <div className="page-area" key={pathname}>
          {children}
          <footer className="site-footer">
            <span>Crafted for a connected stack.</span>
            <span>
              Aventara {product.name} <span className="footer-dot">·</span>{" "}
              {product.currentVersion}
            </span>
            {product.licenseSlug && (
              <Link href={`/${product.id}/docs/${product.licenseSlug}`}>
                License <ArrowUpRight size={12} />
              </Link>
            )}
          </footer>
        </div>
      </div>
      <SearchDialog
        key={product.id}
        product={product}
        open={searchOpen}
        onOpenChange={setSearchOpen}
      />
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          className="mobile-sidebar product-scope"
          style={productTheme(product)}
        >
          <DialogTitle className="sr-only">
            Documentation navigation
          </DialogTitle>
          <DialogDescription className="sr-only">
            Browse Aventara documentation pages.
          </DialogDescription>
          <Link href="/" onClick={() => setMobileOpen(false)}>
            <SiteBrand />
          </Link>
          <nav aria-label="Primary" className="mobile-primary-nav">
            {product.primaryNavigation.map((item) => (
              <Link
                key={item.section}
                className="nav-link"
                aria-current={section === item.section ? "page" : undefined}
                href={`/${product.id}${item.href}`}
                onClick={() => setMobileOpen(false)}
              >
                {item.title}
              </Link>
            ))}
          </nav>
          <Sidebar product={product} onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
