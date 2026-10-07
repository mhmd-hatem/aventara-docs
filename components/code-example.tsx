"use client";
import { useRef, useState } from "react";
import { Braces, Check, Code2, Terminal } from "lucide-react";
import { CopyButton } from "@/components/code-block";
export type Example = {
  title: string;
  filename: string;
  code: string;
  html: string;
};
export function CodeExample({ examples }: { examples: Example[] }) {
  const [tab, setTab] = useState(0);
  const tablist = useRef<HTMLDivElement>(null);
  const current = examples[tab];
  return (
    <div className="example-window">
      <div
        className="example-tabs"
        ref={tablist}
        role="tablist"
        aria-label="Aventara code examples"
      >
        {examples.map((example, i) => {
          const Icon = [Terminal, Braces, Code2][i];
          return (
            <button
              key={example.title}
              id={`example-tab-${i}`}
              role="tab"
              aria-selected={tab === i}
              aria-controls={`example-panel-${i}`}
              tabIndex={tab === i ? 0 : -1}
              onClick={() => setTab(i)}
              onKeyDown={(e) => {
                let next = i;
                if (e.key === "ArrowRight") next = (i + 1) % examples.length;
                else if (e.key === "ArrowLeft")
                  next = (i + examples.length - 1) % examples.length;
                else if (e.key === "Home") next = 0;
                else if (e.key === "End") next = examples.length - 1;
                else return;
                e.preventDefault();
                setTab(next);
                (tablist.current?.children[next] as HTMLButtonElement)?.focus();
              }}
            >
              <Icon size={14} />
              {example.title}
            </button>
          );
        })}
        <span className="example-language">TypeScript first</span>
      </div>
      <div
        role="tabpanel"
        id={`example-panel-${tab}`}
        aria-labelledby={`example-tab-${tab}`}
        tabIndex={0}
      >
        <div className="example-filename">
          <span>
            <span className="file-dot" />
            {current.filename}
          </span>
          <CopyButton value={current.code} />
        </div>
        <div
          className="example-code"
          dangerouslySetInnerHTML={{ __html: current.html }}
        />
      </div>
      <div className="example-status">
        <span>
          <Check size={13} />{" "}
          {tab === 0
            ? "A familiar NestJS project. Ready for your schema."
            : tab === 1
              ? "Your models define your Resources."
              : "Arguments and results, typed from your contract."}
        </span>
        <span className="status-format">
          {tab === 0 ? "SHELL" : tab === 1 ? "PRISMA" : "TYPESCRIPT"}
        </span>
      </div>
    </div>
  );
}
