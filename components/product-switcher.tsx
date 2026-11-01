"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Layers3 } from "lucide-react";
import { ProductMark } from "@/components/product-mark";
import { products } from "@/lib/products";
export function ProductSwitcher({ current }: { current?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <div
      className="product-switcher"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        className="product-switcher-trigger"
        aria-expanded={open}
        aria-controls="product-options"
        onClick={() => setOpen(!open)}
      >
        <Layers3 size={16} />
        <span>
          {products.find((p) => p.id === current)?.name ?? "Products"}
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <nav
          id="product-options"
          className="product-options"
          aria-label="Choose a product"
        >
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/${p.id}`}
              aria-current={p.id === current ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <ProductMark product={p}/>
              <span>
                <strong>{p.name}</strong>
                <small>{p.description}</small>
              </span>
              {p.id === current && <Check size={16} />}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
