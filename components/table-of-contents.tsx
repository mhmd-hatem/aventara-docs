"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, List } from "lucide-react";
export function TableOfContents({
  items,
}: {
  items: { title: ReactNode; url: string; depth: number }[];
}) {
  const [active, setActive] = useState("");
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const headings = items
      .filter((item) => item.depth > 1 && item.depth < 4)
      .map((item) => ({
        url: item.url,
        element: document.getElementById(item.url.slice(1)),
      }))
      .filter((item) => item.element !== null);
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = headings[0]?.url ?? "";
      for (const heading of headings) {
        if (heading.element!.getBoundingClientRect().top > 130) break;
        current = heading.url;
      }
      if (
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 2
      ) {
        current = headings.at(-1)?.url ?? current;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [items]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const reveal = () => {
      const link = nav.querySelector<HTMLElement>('[aria-current="location"]');
      if (!link || !nav.clientHeight) return;
      const bounds = nav.getBoundingClientRect();
      const target = link.getBoundingClientRect();
      const padding = 12;
      const offset =
        target.top < bounds.top + padding
          ? target.top - bounds.top - padding
          : target.bottom > bounds.bottom - padding
            ? target.bottom - bounds.bottom + padding
            : 0;
      if (!offset) return;
      // Scroll only the list: revealing a heading must never move the article.
      nav.scrollTo({
        top: nav.scrollTop + offset,
        behavior:
          window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
          document.documentElement.dataset.motionInput === "keyboard"
            ? "instant"
            : "smooth",
      });
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [active]);
  return (
    <aside className="toc">
      <div className="toc-title">
        <List size={14} /> On this page
      </div>
      <nav ref={navRef} aria-label="On this page">
        {items
          .filter((i) => i.depth > 1 && i.depth < 4)
          .map((i) => (
            <a
              key={i.url}
              href={i.url}
              aria-current={active === i.url ? "location" : undefined}
              className={`${active === i.url ? "toc-active" : ""} ${i.depth === 3 ? "toc-nested" : ""}`}
            >
              {i.title}
            </a>
          ))}
      </nav>
      <a className="back-top" href="#main-content">
        <ArrowUp size={13} /> Back to top
      </a>
      <div className="toc-note">
        <span className="pilot-dot" />
        <strong>Building in the open</strong>
        <p>You’re reading the pilot docs. APIs may evolve before 1.0.</p>
      </div>
    </aside>
  );
}
