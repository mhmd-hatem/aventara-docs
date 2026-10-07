import { AVENTARA_VERSION } from "@/lib/release";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Code2,
  Layers3,
  Terminal,
  Zap,
} from "lucide-react";
import { QueryPlayground } from "@/components/query-playground";
import { Button } from "@/components/ui/button";
import { Architecture } from "@/components/architecture";
export function Overview() {
  return (
    <>
      <section className="modern-hero homepage-hero">
        <div className="homepage-hero-copy">
          <div className="release-pill">
            <span className="pilot-dot" /> Meet Aventara{" "}
            <span className="release-pill-version">{AVENTARA_VERSION}</span>
            <ArrowUpRight size={12} />
          </div>
          <h1>
            Your schema.
            <br />
            An entire <span>API.</span>
          </h1>
          <p>
            A typed API. A connected frontend. All from the schema
            <br className="desktop-break" /> you already know. Build the
            interesting part.
          </p>
          <div className="modern-hero-actions">
            <Button asChild>
              <Link href="/docs/getting-started">
                Start building
                <ArrowRight size={17} />
              </Link>
            </Button>
            <a className="hero-play-link" href="#playground">
              <span>
                <PlayIcon />
              </span>
              Try it right here
            </a>
          </div>
          <div className="technology-strip">
            <span>
              <Braces size={14} /> TypeScript
            </span>
            <i />
            <span>
              <Layers3 size={14} /> Prisma
            </span>
            <i />
            <span>
              <Zap size={14} /> NestJS
            </span>
          </div>
        </div>
        <Architecture />
      </section>
      <QueryPlayground />
      <section className="discovery-cards" aria-label="Explore documentation">
        <Link className="discovery-card" href="/docs/getting-started">
          <span className="discovery-icon">
            <Terminal size={23} />
          </span>
          <span className="discovery-tag">YOUR FIRST API</span>
          <h3>
            Start small.
            <br />
            Ship something.
          </h3>
          <p>Go from an empty folder to your first typed call.</p>
          <span className="discovery-cta">
            Take the quickstart
            <ArrowRight size={15} />
          </span>
        </Link>
        <Link className="discovery-card card-cyan" href="/docs/concepts">
          <span className="discovery-icon">
            <Braces size={23} />
          </span>
          <span className="discovery-tag">THE BIG IDEA</span>
          <h3>
            One contract.
            <br />A shared language.
          </h3>
          <p>Meet the contract that keeps every layer in agreement.</p>
          <span className="discovery-cta">
            Explore the concepts
            <ArrowRight size={15} />
          </span>
        </Link>
        <Link className="discovery-card" href="/docs/frontend-client">
          <span className="discovery-icon">
            <Code2 size={23} />
          </span>
          <span className="discovery-tag">YOUR FRONTEND, CONNECTED</span>
          <h3>
            Types that
            <br />
            travel with you.
          </h3>
          <p>A generated client for any TypeScript frontend.</p>
          <span className="discovery-cta">
            Meet your client
            <ArrowRight size={15} />
          </span>
        </Link>
      </section>
    </>
  );
}
function PlayIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3 1.8v8.4L10 6 3 1.8Z" />
    </svg>
  );
}
