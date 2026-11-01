"use client";
import { useId, useState } from "react";
import { ArrowDown, Braces, Check, Code2, X } from "lucide-react";
import { DemoCode } from "@/components/lab-primitives";
export type PitchDemo = {
  label: string;
  scenarios: {
    label: string;
    file: string;
    source: string;
    outputFile: string;
    output: string;
    result: string;
    caption: string;
    status: string;
  }[];
};
export function ProductPitchDemo({ demo }: { demo: PitchDemo }) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const scenario = demo.scenarios[selected];
  if (!scenario) return null;
  return (
    <div className="pitch-demo">
      <div className="pitch-demo-heading">
        <span className="pitch-live-dot" />
        <span>{demo.label}</span>
        <Braces size={15} />
      </div>
      <div
        className="pitch-demo-tabs"
        role="tablist"
        aria-label="Explore examples"
      >
        {demo.scenarios.map((item, i) => (
          <button
            key={item.label}
            type="button"
            id={`${id}-tab-${i}`}
            role="tab"
            aria-selected={selected === i}
            aria-controls={`${id}-panel`}
            tabIndex={selected === i ? 0 : -1}
            onClick={() => setSelected(i)}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? demo.scenarios.length - 1
                    : (i +
                        (e.key === "ArrowRight" ? 1 : -1) +
                        demo.scenarios.length) %
                      demo.scenarios.length;
              setSelected(next);
              document.getElementById(`${id}-tab-${next}`)?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${selected}`}
        tabIndex={0}
      >
        <div className="pitch-demo-stage" key={selected}>
          <div className="pitch-file-label">
            <Code2 size={13} />
            {scenario.file}
            <span>INPUT</span>
          </div>
          <DemoCode code={scenario.source} />
          <div className="pitch-demo-bridge">
            <span />
            <ArrowDown size={15} />
            <span />
          </div>
          <div className="pitch-demo-output">
            <div className="pitch-file-label">
              <Braces size={13} />
              {scenario.outputFile}
              <span>{scenario.status}</span>
            </div>
            <DemoCode code={scenario.output} />
            <div
              className="pitch-result"
              data-refused={scenario.result.startsWith("DENY")}
            >
              {scenario.result.startsWith("DENY") ? (
                <X size={14} />
              ) : (
                <Check size={14} />
              )}
              <code>{scenario.result}</code>
            </div>
          </div>
          <p className="pitch-demo-caption">{scenario.caption}</p>
        </div>
      </div>
    </div>
  );
}
