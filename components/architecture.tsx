"use client";
import { useEffect, useRef, useState } from "react";
import { Braces, Check, Code2, Database, Play, Radio } from "lucide-react";
import { Logo } from "@/components/logo";
const stages = [
  {
    name: "Your schema",
    detail: "prisma/schema.prisma",
    label: "01 / DEFINE",
    Icon: Database,
    status: "Define your models in Prisma.",
  },
  {
    name: "The contract",
    detail: "One shared source of truth",
    label: "02 / COMPILE",
    Icon: Braces,
    status: "Discover what your API can do.",
  },
  {
    name: "Your API",
    detail: "Hosted with NestJS",
    label: "03 / SERVE",
    Icon: Radio,
    status: "Serve the contract through NestJS.",
  },
  {
    name: "Your client",
    detail: "Typed. End to end.",
    label: "04 / CONNECT",
    Icon: Code2,
    status: "Generate a client that knows your API.",
  },
];
export function Architecture() {
  const [step, setStep] = useState(-1);
  const [run, setRun] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function trace() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRun((value) => value + 1);
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motionInput === "keyboard"
    ) {
      setStep(4);
      return;
    }
    setStep(0);
    for (let i = 1; i <= 4; i++)
      timers.current.push(setTimeout(() => setStep(i), i * 620));
  }
  return (
    <section
      className={`architecture ${step >= 0 ? "tracing" : ""}`}
      aria-label="How Aventara connects your stack"
    >
      <div className="diagram-caption">
        <span>
          <span className="tiny-cross">+</span> THE CONNECTED STACK
        </span>
        <span>SCHEMA TO CLIENT</span>
      </div>
      <div className="blueprint">
        <div className="blueprint-orbit orbit-one" aria-hidden="true" />
        <div className="blueprint-orbit orbit-two" aria-hidden="true" />
        <div className="blueprint-axis" aria-hidden="true" />
        <div
          className={`blueprint-center ${step >= 0 ? "center-connected" : ""}`}
        >
          <Logo icon />
          <span>AVENTARA</span>
        </div>
        <svg
          key={run}
          className="diagram-lines"
          viewBox="0 0 440 300"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M112 78 L220 150 L328 78 M112 222 L220 150 L328 222" />
          <path
            className="trace-line"
            d="M112 78 L220 150 L328 78 L220 150 L112 222 L220 150 L328 222"
          />
        </svg>
        {stages.map(({ name, detail, label, Icon }, i) => (
          <div
            className={`diagram-node node-${i} ${step >= i ? "node-lit" : ""} ${step === i ? "node-current" : ""}`}
            key={name}
          >
            <span className="node-number">{label}</span>
            <span className="node-title">
              <Icon size={15} />
              {name}
            </span>
            <span className="node-detail">{detail}</span>
          </div>
        ))}
      </div>
      <div className="diagram-footer">
        <span aria-live="polite">
          {step === 4 ? (
            <>
              <Check size={13} /> Connected by contract
            </>
          ) : step >= 0 ? (
            stages[step].status
          ) : (
            "One schema. Every layer connected."
          )}
        </span>
        <button onClick={trace} disabled={step >= 0 && step < 4}>
          <Play size={11} fill="currentColor" />{" "}
          {step === 4
            ? "Replay flow"
            : step >= 0
              ? "Connecting…"
              : "Trace the flow"}
        </button>
      </div>
    </section>
  );
}
