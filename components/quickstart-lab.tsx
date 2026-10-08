"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Code2,
  Database,
  FolderCode,
  LoaderCircle,
  Play,
  RotateCcw,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/code-block";
import { DemoCode } from "@/components/lab-primitives";
import { SchemaPreview } from "@/components/schema-preview";
import { userSchema } from "@/lib/demo-schemas";
import { AVENTARA_DIST_TAG } from "@/lib/release";
const steps = [
  {
    title: "Create your API",
    detail: "A familiar NestJS foundation.",
    Icon: FolderCode,
  },
  {
    title: "Bring it online",
    detail: "Prepare the database. Start the host.",
    Icon: Database,
  },
  {
    title: "Generate the client",
    detail: "Your contract, turned into TypeScript.",
    Icon: Code2,
  },
  {
    title: "Make a typed call",
    detail: "The first connection is the best one.",
    Icon: CheckCheck,
  },
];
export function QuickstartLab() {
  const [project, setProject] = useState("my-api");
  const [manager, setManager] = useState<"npm" | "pnpm">("npm");
  const [active, setActive] = useState(0);
  const [completed, setCompleted] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const valid = /^[a-z][a-z0-9-]{0,39}$/.test(project);
  const commands = [
    `${manager === "npm" ? "npx" : "pnpm dlx"} @aventara/cli@${AVENTARA_DIST_TAG} new ${project} --yes`,
    `cd ${project}\n${manager === "npm" ? "npx" : "pnpm exec"} prisma db push\n${manager} run start:dev`,
    `${manager === "npm" ? "npx" : "pnpm dlx"} @aventara/client@${AVENTARA_DIST_TAG} init`,
    'const ada = await avClient.User.create.one({\n  data: { email: "ada@example.com", name: "Ada" },\n  select: ["id", "email"],\n});',
  ];
  const outputs = [
    [
      "Scaffolding your NestJS project…",
      "Adding Prisma and Aventara…",
      `✓ ${project}/ is ready. Your schema lives in prisma/.`,
    ],
    [
      "Synchronizing the sample schema…",
      "Starting the NestJS host…",
      "✓ Contract available at /api/_contract",
    ],
    [
      "Reading the sample contract…",
      "Writing framework.client.ts and generating typed resources…",
      "✓ src/api/AvClient.ts is ready.",
    ],
    [
      "Validating the sample request…",
      "Creating Ada in the sample database…",
      '✓ { id: 1, email: "ada@example.com" }',
    ],
  ];
  function reset() {
    timers.current.forEach(clearTimeout);
    setActive(0);
    setCompleted(-1);
    setBusy(false);
    setLines([]);
  }
  function simulate() {
    if (!valid || busy) return;
    setBusy(true);
    setLines([]);
    const messages = outputs[active];
    const finish = () => {
      setLines(messages);
      setCompleted((n) => Math.max(n, active));
      setBusy(false);
    };
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motionInput === "keyboard"
    ) {
      finish();
      return;
    }
    messages.forEach((_, i) =>
      timers.current.push(
        setTimeout(() => setLines(messages.slice(0, i + 1)), (i + 1) * 260),
      ),
    );
    timers.current.push(setTimeout(finish, 850));
  }
  function selectStep(i: number) {
    if (!busy && i <= completed + 1) {
      setActive(i);
      setLines([]);
    }
  }
  return (
    <section className="setup-lab" aria-label="Interactive setup walkthrough">
      <div className="setup-banner">
        <span className="spark-icon">
          <Terminal size={17} />
        </span>
        <div>
          <strong>Take it for a spin.</strong>
          <span>Four steps. One connected stack.</span>
        </div>
        <span className="simulation-badge">
          <span /> Guided simulation
        </span>
        <button
          className="reset-demo"
          aria-label="Reset walkthrough"
          onClick={reset}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="setup-stepper" aria-label="Setup steps">
        {steps.map(({ title, Icon }, i) => (
          <button
            key={title}
            disabled={busy || i > completed + 1}
            aria-current={active === i ? "step" : undefined}
            onClick={() => selectStep(i)}
          >
            <span
              className={`step-number ${completed >= i ? "step-complete" : ""}`}
            >
              {completed >= i ? <Check size={15} /> : <Icon size={16} />}
            </span>
            <span>
              <small>STEP {i + 1}</small>
              {title}
            </span>
            <ArrowRight size={13} />
          </button>
        ))}
      </div>
      <div className="setup-stage" key={active}>
        <div className="setup-description">
          <span className="step-counter">
            0{active + 1} <span>/ 04</span>
          </span>
          <h2>{steps[active].title}</h2>
          <p>{steps[active].detail}</p>
          {active === 0 ? (
            <>
              <label className="control-label" htmlFor="demo-project">
                Project name
              </label>
              <input
                id="demo-project"
                className="project-input"
                value={project}
                disabled={busy}
                onChange={(e) => {
                  setProject(e.target.value);
                  setCompleted(-1);
                  setLines([]);
                }}
                maxLength={40}
                aria-invalid={!valid}
                aria-describedby={!valid ? "project-error" : undefined}
              />
              {!valid && (
                <small className="input-error" id="project-error">
                  Start with a lowercase letter. Use letters, numbers, and
                  hyphens.
                </small>
              )}
              <div
                className="manager-toggle"
                data-manager={manager}
                aria-label="Package manager"
              >
                {(["npm", "pnpm"] as const).map((pm) => (
                  <button
                    key={pm}
                    aria-pressed={manager === pm}
                    disabled={busy}
                    onClick={() => {
                      setManager(pm);
                      setCompleted(-1);
                      setLines([]);
                    }}
                  >
                    {pm}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="setup-context">
              <Check size={14} />
              {active === 2
                ? "Run this in your frontend project."
                : active === 3
                  ? "Import avClient from your generated client."
                  : `Continue inside ${project}/.`}
            </div>
          )}
          <div className="setup-actions">
            <Button onClick={simulate} disabled={!valid || busy}>
              {busy ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <Play size={13} fill="currentColor" />
              )}
              {busy
                ? "Simulating…"
                : completed >= active
                  ? "Run again"
                  : "Simulate this step"}
            </Button>
            {completed >= active && active < 3 && (
              <button
                className="next-step"
                onClick={() => selectStep(active + 1)}
              >
                Next step
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="simulation-terminal">
          <div className="terminal-bar">
            <span className="terminal-dots">
              <i />
              <i />
              <i />
            </span>
            <span>{active === 3 ? "first-call.ts" : "Terminal preview"}</span>
            <CopyButton value={commands[active]} />
          </div>
          <DemoCode code={commands[active]} />
          <div className="terminal-output" aria-live="polite">
            {lines.length ? (
              lines.map((line, i) => (
                <div
                  key={`${active}-${i}`}
                  className={line.startsWith("✓") ? "terminal-success" : ""}
                >
                  {line}
                </div>
              ))
            ) : (
              <span className="terminal-placeholder">
                Press simulate to see what happens.
                <span className="terminal-caret" />
              </span>
            )}
          </div>
          {completed === 3 && active === 3 && (
            <div className="setup-complete">
              <CheckCheck size={18} />
              <span>Your first typed call. Connected.</span>
            </div>
          )}
        </div>
      </div>
      <SchemaPreview code={userSchema}>
        <p>
          The starter’s <code>User</code> model is the foundation for the
          generated <code>avClient.User</code> resource.
        </p>
        <p className="schema-hint">
          {active === 0
            ? "The scaffold includes this model in prisma/schema.prisma."
            : active === 1
              ? "prisma db push synchronizes this schema with the sample database."
              : active === 2
                ? "The generated client reflects the fields exposed by the host’s contract."
                : "The database assigns id automatically. The call supplies email and name, then selects id and email."}
        </p>
      </SchemaPreview>
      <div className="setup-bottom">
        <span>
          <span className="pilot-dot" /> Illustrative output. Nothing is
          installed or executed.
        </span>
        <span>{completed + 1} of 4 explored</span>
      </div>
    </section>
  );
}
