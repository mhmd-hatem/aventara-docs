"use client";
import { type ReactNode } from "react";
import { Database } from "lucide-react";
import { CopyButton } from "@/components/code-block";
import { DemoCode } from "@/components/lab-primitives";

export function SchemaPreview({
  code,
  children,
}: {
  code: string;
  children: ReactNode;
}) {
  return (
    <section
      className="schema-preview"
      aria-label="Prisma schema for this simulation"
    >
      <div className="schema-context">
        <span className="lab-eyebrow">
          <Database size={14} /> THE DATA MODEL
        </span>
        <h3>It starts with your schema.</h3>
        <div className="schema-explanation">{children}</div>
        <span className="schema-caption">Model excerpt · read only</span>
      </div>
      <div className="schema-source">
        <div className="schema-toolbar">
          <span>prisma/schema.prisma</span>
          <CopyButton value={code} />
        </div>
        <DemoCode code={code} />
      </div>
    </section>
  );
}
