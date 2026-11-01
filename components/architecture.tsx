"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Braces, Check, Code2, Database, Play, Radio } from "lucide-react";
import { architecturePaths } from "@/lib/diagram-geometry.mjs";
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
    detail: "NestJS or Next.js",
    label: "03 / SERVE",
    Icon: Radio,
    status: "Serve the contract through your host.",
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
  const [immediate, setImmediate] = useState(false);
  const blueprint = useRef<HTMLDivElement>(null);
  const center = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const [geometry, setGeometry] = useState<{
    width: number;
    height: number;
    branches: string[];
    journeys: string[];
  }>();
  useLayoutEffect(() => {
    const canvas = blueprint.current;
    const hub = center.current;
    if (!canvas || !hub) return;
    function measure() {
      if (
        !canvas ||
        !hub ||
        cards.current.length !== stages.length ||
        cards.current.some((card) => !card)
      )
        return;
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const local = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left - bounds.left,
          y: rect.top - bounds.top,
          width: rect.width,
          height: rect.height,
        };
      };
      setGeometry({
        width: bounds.width,
        height: bounds.height,
        ...architecturePaths(
          local(hub),
          cards.current.map((card) => local(card!)),
        ),
      });
    }
    measure();
    const observer = new ResizeObserver(measure);
    [canvas, hub, ...cards.current].forEach((element) => {
      if (element) observer.observe(element);
    });
    // Font loading can change card height without changing the outer diagram.
    let disposed = false;
    document.fonts.ready.then(() => {
      if (!disposed) measure();
    });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function trace() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRun((value) => value + 1);
    const skipMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motionInput === "keyboard";
    setImmediate(skipMotion);
    if (skipMotion) {
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
      data-flow-immediate={immediate}
      aria-label="How Aventara connects your stack"
    >
      <div className="diagram-caption">
        <span>
          <span className="tiny-cross">+</span> THE CONNECTED STACK
        </span>
        <span>SCHEMA TO CLIENT</span>
      </div>
      <div className="blueprint" ref={blueprint}>
        <div className="blueprint-orbit orbit-one" aria-hidden="true" />
        <div className="blueprint-orbit orbit-two" aria-hidden="true" />
        <div className="blueprint-axis" aria-hidden="true" />
        <div
          ref={center}
          className={`blueprint-center ${step >= 0 ? "center-connected" : ""}`}
        >
          <Logo icon />
          <span>AVENTARA</span>
        </div>
        {geometry && (
          <svg
            className="diagram-lines"
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            aria-hidden="true"
          >
            {geometry.branches.map((path, i) => (
              <path key={i} d={path} vectorEffect="non-scaling-stroke" />
            ))}
            {step >= 0 && (
              <g key={run}>
                {geometry.journeys.map((path, i) => (
                  <path
                    key={i}
                    className="flow-trace"
                    d={path}
                    pathLength={1}
                    vectorEffect="non-scaling-stroke"
                    style={{ animationDelay: `${i * 620}ms` }}
                  />
                ))}
              </g>
            )}
          </svg>
        )}
        {stages.map(({ name, detail, label, Icon }, i) => (
          <div
            ref={(element) => {
              cards.current[i] = element;
            }}
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
