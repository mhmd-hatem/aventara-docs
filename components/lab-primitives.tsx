"use client";
import { useId, useRef, type ReactNode } from "react";
import { Code2, Database, Play } from "lucide-react";
export type DemoViewValue = "preview" | "code" | "schema";
const views = [
  { value: "preview", label: "Preview", Icon: Play },
  { value: "code", label: "Code", Icon: Code2 },
  { value: "schema", label: "ORM Schema", Icon: Database },
] as const;
/** Small, safe token renderer for generated demo code. Text is always escaped by React. */
export function DemoCode({ code }: { code: string }) {
  const token =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|@[a-zA-Z]+|\b(?:const|await|import|from|return|model|Int|String)\b|\b\d+\b|\/\/[^\n]*)/g;
  return (
    <pre className="demo-code">
      <code>
        {code.split("\n").map((line, i) => (
          <span className="demo-line" key={i}>
            <span className="demo-line-number" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              {line.split(token).map((part, j) => (
                <span
                  key={j}
                  className={
                    part.startsWith("//")
                      ? "token-comment"
                      : /^["'@]/.test(part)
                        ? "token-string"
                        : /^(const|await|import|from|return|model|Int|String)$/.test(
                              part,
                            )
                          ? "token-keyword"
                          : /^\d+$/.test(part)
                            ? "token-number"
                            : undefined
                  }
                >
                  {part}
                </span>
              ))}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}
export function DemoView({
  value,
  onChange,
  children,
}: {
  value: DemoViewValue;
  onChange: (value: DemoViewValue) => void;
  children: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div
        className="demo-tabs"
        data-view={value}
        ref={ref}
        role="tablist"
        aria-label="Example view"
      >
        {views.map(({ value: tab, label, Icon }, i) => {
          return (
            <button
              key={tab}
              role="tab"
              id={`${id}-${tab}`}
              aria-controls={`${id}-panel`}
              aria-selected={value === tab}
              tabIndex={value === tab ? 0 : -1}
              onClick={() => onChange(tab)}
              onKeyDown={(e) => {
                if (
                  ["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? views.length - 1
                        : (i +
                            (e.key === "ArrowRight" ? 1 : -1) +
                            views.length) %
                          views.length;
                  onChange(views[next].value);
                  (ref.current?.children[next] as HTMLButtonElement)?.focus();
                }
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </div>
      <div
        key={value}
        className="demo-panel"
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${value}`}
        tabIndex={0}
      >
        {children}
      </div>
    </>
  );
}
