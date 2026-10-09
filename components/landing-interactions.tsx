"use client";
import { useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  ArrowUpRight,
  Braces,
  Code2,
  Database,
  Menu,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { DemoCode } from "@/components/lab-primitives";

export function LandingNav() {
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <header className="landing-header">
      <Link href="/" aria-label="Aventara home">
        <Logo />
      </Link>
      <nav
        className={`landing-navigation ${open ? "is-open" : ""}`}
        id="landing-navigation"
        aria-label="Main navigation"
        onClick={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            document.getElementById("landing-menu-toggle")?.focus();
          }
        }}
      >
        <a href="#how-it-works">The framework</a>
        <a href="#possibilities">Possibilities</a>
        <a href="#coming-soon">Coming soon</a>
      </nav>
      <div className="landing-header-actions">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle color theme"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="dark-theme-icon" size={18} />
          <Moon className="light-theme-icon" size={18} />
        </Button>
        <Button asChild variant="secondary">
          <a href="#how-it-works">
            Explore <ArrowUpRight size={14} />
          </a>
        </Button>
        <Button
          className="landing-menu-toggle"
          variant="ghost"
          size="icon"
          id="landing-menu-toggle"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="landing-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={21} /> : <Menu size={21} />}
        </Button>
      </div>
    </header>
  );
}
const examples = {
  User: {
    schema:
      "model User {\n  id    Int     @id\n  email String  @unique\n  name  String?\n}",
    code: 'const users = await avClient.User.find.many({\n  select: ["id", "name"],\n  take: 3,\n});',
    result: "Array<{ id: number; name: string | null }>",
  },
  Post: {
    schema:
      "model Post {\n  id        Int     @id\n  title     String\n  published Boolean @default(false)\n}",
    code: 'const posts = await avClient.Post.find.many({\n  where: { published: true },\n  select: ["id", "title"],\n});',
    result: "Array<{ id: number; title: string }>",
  },
};
export function SchemaShowcase() {
  const [model, setModel] = useState<keyof typeof examples>("User");
  const example = examples[model];
  return (
    <div
      className="landing-showcase"
      aria-label="Schema to typed client example"
    >
      <div className="showcase-orbit showcase-orbit-one" aria-hidden="true" />
      <div className="showcase-orbit showcase-orbit-two" aria-hidden="true" />
      <svg
        className="showcase-wires"
        viewBox="0 0 620 610"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M200 188 C200 272 315 190 315 285 S455 280 455 370" />
        <path
          d="M200 188 C200 272 315 190 315 285 S455 280 455 370"
          className="showcase-signal"
          key={model}
        />
      </svg>
      <div className="showcase-source showcase-pane">
        <div className="showcase-toolbar">
          <span>
            <Database size={14} /> schema.prisma
          </span>
          <span className="showcase-caption">THE STARTING POINT</span>
        </div>
        <div
          className="showcase-models"
          role="group"
          aria-label="Choose an example model"
        >
          {(["User", "Post"] as const).map((name) => (
            <button
              key={name}
              aria-pressed={model === name}
              onClick={() => setModel(name)}
            >
              {name}
            </button>
          ))}
          <span>← try a model</span>
        </div>
        <div key={model} className="showcase-code">
          <DemoCode code={example.schema} />
        </div>
      </div>
      <div className="showcase-engine" aria-hidden="true">
        <div className="showcase-engine-core">
          <Logo icon />
        </div>
        <span>AVENTARA</span>
      </div>
      <span className="showcase-contract">
        <Braces size={13} /> One shared contract
      </span>
      <div className="showcase-client showcase-pane">
        <div className="showcase-toolbar">
          <span>
            <Code2 size={15} /> your-app.ts
          </span>
          <span className="showcase-typed">
            <span /> Typed by your API
          </span>
        </div>
        <div key={model} className="showcase-code">
          <DemoCode code={example.code} />
        </div>
        <div className="showcase-result" aria-live="polite">
          <span>INFERRED RESULT</span>
          <code>{example.result}</code>
        </div>
      </div>
      <span className="showcase-footnote">
        A concept preview. The next chapter is taking shape.
      </span>
    </div>
  );
}
