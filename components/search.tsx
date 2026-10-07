"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, FileText, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { pages } from "@/lib/navigation";
type Result = { id: string; url: string; content: string; type: string };
export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?query=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Search failed");
        setResults(await response.json());
        setStatus("idle");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="search-dialog">
        <DialogTitle className="sr-only">Search documentation</DialogTitle>
        <DialogDescription className="sr-only">
          Search all Aventara guides, concepts, and reference pages.
        </DialogDescription>
        <div className="search-input-wrap">
          <Search size={21} />
          <input
            aria-label="Search documentation"
            placeholder="What would you like to build?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                list.current?.querySelector("a")?.focus();
              }
            }}
          />
        </div>
        <div
          className="search-results"
          ref={list}
          onKeyDown={(e) => {
            const links = Array.from(list.current?.querySelectorAll("a") ?? []);
            if (!links.length) return;
            const index = links.indexOf(
              document.activeElement as HTMLAnchorElement,
            );
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              links[
                (index + (e.key === "ArrowDown" ? 1 : links.length - 1)) %
                  links.length
              ]?.focus();
            }
          }}
        >
          {!query.trim() ? (
            <>
              <div className="search-label">A good place to start</div>
              {pages.slice(0, 4).map((p) => (
                <Link
                  onClick={() => onOpenChange(false)}
                  key={p.slug}
                  href={`/docs/${p.slug}`}
                >
                  <FileText size={17} />
                  <span>
                    {p.title}
                    <small>{p.group}</small>
                  </span>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </>
          ) : status === "loading" ? (
            <p role="status">
              <LoaderCircle size={17} className="spin" /> Searching the docs…
            </p>
          ) : status === "error" ? (
            <p role="alert">
              Search couldn’t load. Try again, or browse the navigation.
            </p>
          ) : results.length === 0 ? (
            <p role="status">
              No matches for “{query}”. Try “query”, “client”, or “contract”.
            </p>
          ) : (
            results.map((r) => (
              <Link key={r.id} href={r.url} onClick={() => onOpenChange(false)}>
                <FileText size={17} />
                <span>
                  <SearchHighlight text={r.content} />
                  <small>
                    {r.type === "page"
                      ? "Documentation"
                      : r.url
                          .split("/")
                          .pop()
                          ?.split("#")[0]
                          ?.replaceAll("-", " ")}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
            ))
          )}
        </div>
        <div className="search-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to navigate
          </span>
          <span>
            <kbd>esc</kbd> to close
          </span>
          <LogoText />
        </div>
      </DialogContent>
    </Dialog>
  );
}
function LogoText() {
  return <span className="search-brand">AVENTARA DOCS</span>;
}

function SearchHighlight({ text }: { text: string }) {
  return text
    .split(/(<mark>.*?<\/mark>)/g)
    .map((part, i) =>
      part.startsWith("<mark>") ? (
        <mark key={i}>{part.slice(6, -7)}</mark>
      ) : (
        part
      ),
    );
}
