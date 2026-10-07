"use client";
import { useRef, useState, type ComponentProps } from "react";
import { Check, Copy } from "lucide-react";
export function CopyButton({ value }: { value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  return (
    <button
      className="copy-button"
      aria-label={state === "copied" ? "Copied" : "Copy code"}
      title="Copy code"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
          setTimeout(() => setState("idle"), 1800);
        } catch {
          setState("error");
        }
      }}
    >
      {state === "copied" ? <Check size={15} /> : <Copy size={15} />}
      <span className={state === "error" ? "" : "sr-only"} role="status">
        {state === "copied"
          ? "Copied to clipboard"
          : state === "error"
            ? "Select code to copy"
            : ""}
      </span>
    </button>
  );
}
export function CodeBlock({ children, ...props }: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="mdx-code">
      <div className="mdx-code-toolbar">
        <span>
          {((props as Record<string, unknown>)["data-language"] as string) ||
            "Code"}
        </span>
        <button
          className="copy-button"
          aria-label="Copy code"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                ref.current?.textContent ?? "",
              );
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              setError(true);
            }
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <span className="sr-only" role="status">
          {copied
            ? "Copied to clipboard"
            : error
              ? "Could not copy. Select the code to copy manually."
              : ""}
        </span>
      </div>
      <pre ref={ref} {...props}>
        {children}
      </pre>
    </div>
  );
}
