"use client";
import { AVENTARA_VERSION } from "@/lib/release";
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
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { SearchDialog } from "@/components/search";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { navigation, primarySection } from "@/lib/navigation";
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
function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
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
        <span>Developer docs</span>
        <span className="sidebar-pilot">PILOT</span>
      </div>
      <nav
        key={pathname}
        ref={nav}
        aria-label="Documentation pages"
        className="sidebar-nav"
      >
        {navigation.map((group) => (
          <SidebarGroup
            key={group.title}
            title={group.title}
            defaultOpen={group.items.some(
              ([slug]) => pathname === `/docs/${slug}`,
            )}
          >
            {group.items.map(([slug, title, icon]) => {
              const Icon = icons[icon];
              const active = pathname === `/docs/${slug}`;
              return (
                <Link
                  key={slug}
                  href={`/docs/${slug}`}
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
        href="/docs/querying#playground"
        onClick={onNavigate}
      >
        <span className="sidebar-playground-icon">
          <FlaskConical size={18} />
        </span>
        <span>
          Learn by doing<small>Open the playground</small>
        </span>
        <ArrowUpRight size={15} />
      </Link>
      <div className="sidebar-bottom">
        <span className="pilot-dot" />
        <span>{AVENTARA_VERSION}</span>
        <Link href="/docs/introduction#status" onClick={onNavigate}>
          Release status <ArrowUpRight size={12} />
        </Link>
      </div>
    </>
  );
}
export function DocsShell({ children }: { children: React.ReactNode }) {
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
  const section = primarySection(pathname);
  return (
    <>
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
          <Link
            href="/docs/introduction"
            aria-label="Aventara documentation home"
          >
            <Logo />
          </Link>
          <span className="header-divider" />
          <span className="docs-label">docs</span>
        </div>
        <nav className="header-nav" aria-label="Primary">
          <Link data-active={section === "overview"} href="/docs/introduction">
            Overview
          </Link>
          <Link data-active={section === "guides"} href="/docs/querying">
            Guides
          </Link>
          <Link
            data-active={section === "reference"}
            href="/docs/config-reference"
          >
            Reference
          </Link>
        </nav>
        <div className="header-actions">
          <button
            className="search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="Search documentation"
          >
            <Search size={16} />
            <span>Search documentation</span>
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
          <Sidebar />
        </aside>
        <div className="page-area" key={pathname}>
          {children}
          <footer className="site-footer">
            <span>Crafted for a connected stack.</span>
            <span>
              Aventara Framework <span className="footer-dot">·</span>{" "}
              {AVENTARA_VERSION}
            </span>
            <Link href="/docs/license">
              License <ArrowUpRight size={12} />
            </Link>
          </footer>
        </div>
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="mobile-sidebar">
          <DialogTitle className="sr-only">
            Documentation navigation
          </DialogTitle>
          <DialogDescription className="sr-only">
            Browse Aventara documentation pages.
          </DialogDescription>
          <Link href="/docs/introduction" onClick={() => setMobileOpen(false)}>
            <Logo />
          </Link>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
