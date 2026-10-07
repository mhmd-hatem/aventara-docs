import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  Code2,
  Database,
  Layers3,
  ShieldCheck,
} from "lucide-react";
import {
  LandingNav,
  SchemaShowcase,
  InstallCommand,
} from "@/components/landing-interactions";
import { Architecture } from "@/components/architecture";
import { QueryPlayground } from "@/components/query-playground";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { AVENTARA_VERSION } from "@/lib/release";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: "Aventara — Build the interesting part." },
  description:
    "Turn your Prisma schema into a typed API and a connected frontend. One contract across your stack, with Aventara.",
};

export default function Home() {
  return (
    <div className="landing">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <LandingNav />
      <main id="main-content" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-mesh" aria-hidden="true">
            <svg viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice">
              {Array.from({ length: 14 }, (_, i) => (
                <path
                  key={i}
                  d={`M ${-160 + i * 105} 810 C ${220 + i * 32} 430, ${660 + i * 19} 860, ${1540} ${75 + i * 44}`}
                />
              ))}
            </svg>
          </div>
          <div className="landing-hero-copy">
            <Link
              className="landing-release"
              href={`/docs/changelog#${AVENTARA_VERSION.replaceAll(".", "")}`}
            >
              <span className="pilot-dot" /> {AVENTARA_VERSION}
              <span className="release-divider" /> The pilot is open{" "}
              <ArrowUpRight size={13} />
            </Link>
            <h1 id="landing-title">
              Build the idea.
              <br />
              <span>
                Connect
                <br className="landing-title-break" /> the rest.
              </span>
            </h1>
            <p>
              Your Prisma schema. A typed API. A connected frontend. Aventara
              brings the layers together, so you can build what makes your app
              yours.
            </p>
            <div className="landing-actions">
              <Button asChild>
                <Link href="/docs/getting-started">
                  Start building <ArrowRight size={17} />
                </Link>
              </Button>
              <a className="landing-text-link" href="#playground">
                Try it first <span>↓</span>
              </a>
            </div>
            <InstallCommand />
            <span className="landing-hero-note">
              Made for TypeScript. Built around your schema.
            </span>
          </div>
          <SchemaShowcase />
          <div className="landing-hero-bottom">
            <span>LESS GLUE CODE. MORE POSSIBILITY.</span>
            <a href="#how-it-works">
              Explore the connection <ArrowRight size={14} />
            </a>
          </div>
        </section>
        <section className="landing-stack" aria-label="Supported stack">
          <p>
            A familiar stack.
            <br />
            <strong>A different starting point.</strong>
          </p>
          <span>
            <Braces /> TypeScript
          </span>
          <span>
            <Database /> Prisma 7
          </span>
          <span>
            <Layers3 /> NestJS 12
          </span>
          <span className="stack-databases">
            PostgreSQL <i /> SQLite
          </span>
        </section>
        <section
          className="landing-connection landing-section"
          id="how-it-works"
          aria-labelledby="connection-title"
        >
          <div className="landing-section-heading">
            <span className="landing-kicker">01 / THE BIG IDEA</span>
            <h2 id="connection-title">
              One schema.
              <br />
              <span>Every layer, in agreement.</span>
            </h2>
            <p>
              Describe your data once. Give your server and frontend a shared
              understanding of what’s possible.
            </p>
          </div>
          <div className="landing-connection-body">
            <Architecture />
            <div className="landing-steps">
              <div>
                <span>01</span>
                <section>
                  <h3>Start with what you know.</h3>
                  <p>
                    Your Prisma models become resources. Your configuration
                    decides what the API exposes.
                  </p>
                </section>
              </div>
              <div>
                <span>02</span>
                <section>
                  <h3>Let the contract connect it.</h3>
                  <p>
                    Aventara compiles the shape of your API. NestJS serves it
                    through a consistent HTTP protocol.
                  </p>
                </section>
              </div>
              <div>
                <span>03</span>
                <section>
                  <h3>Bring the types with you.</h3>
                  <p>
                    Generate a TypeScript client from that contract. Your
                    queries and their results stay connected.
                  </p>
                </section>
              </div>
              <Link className="landing-text-link" href="/docs/concepts">
                Meet the framework <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
        </section>
        <div className="landing-playground landing-section">
          <QueryPlayground />
        </div>
        <section
          className="landing-details landing-section"
          aria-labelledby="details-title"
        >
          <div className="landing-section-heading">
            <span className="landing-kicker">02 / ROOM TO MAKE IT YOURS</span>
            <h2 id="details-title">
              Connected by default.
              <br />
              <span>Yours by design.</span>
            </h2>
          </div>
          <div className="landing-detail-grid">
            <article className="landing-feature landing-feature-contract">
              <span className="landing-feature-icon">
                <ShieldCheck size={23} />
              </span>
              <h3>
                Your API.
                <br />
                Your boundaries.
              </h3>
              <p>
                Keep private fields private. Restrict operations. Add guards and
                hooks where your application needs them.
              </p>
              <div
                className="landing-field-preview"
                aria-label="Example of field restrictions"
              >
                <div>
                  <span>id</span>
                  <span>
                    <Check size={12} /> readable
                  </span>
                </div>
                <div>
                  <span>email</span>
                  <span>
                    <Check size={12} /> readable
                  </span>
                </div>
                <div>
                  <span>passwordHash</span>
                  <span className="field-hidden">hidden from client</span>
                </div>
              </div>
              <Link
                className="landing-text-link"
                href="/docs/exposing-and-hiding-fields"
              >
                Shape your API <ArrowUpRight size={16} />
              </Link>
            </article>
            <article className="landing-feature landing-feature-client">
              <span className="landing-feature-icon">
                <Code2 size={23} />
              </span>
              <h3>
                A client that fits
                <br />
                your frontend.
              </h3>
              <p>
                Generated TypeScript you own. Use it in your app with no
                Aventara runtime dependency in the generated client.
              </p>
              <div className="landing-client-preview" aria-hidden="true">
                <span className="client-file">
                  <Code2 size={20} /> AvClient.ts <span>TS</span>
                </span>
                <div>
                  <span>React</span>
                  <span>Vue</span>
                  <span>Svelte</span>
                  <span>Your stack</span>
                </div>
              </div>
              <Link className="landing-text-link" href="/docs/frontend-client">
                Meet your client <ArrowUpRight size={16} />
              </Link>
            </article>
          </div>
          <div className="landing-fineprint">
            <span>
              <Braces size={16} /> Typed queries & results
            </span>
            <span>
              <Layers3 size={16} /> Transactions & nested writes
            </span>
            <span>
              <ShieldCheck size={16} /> Guards & pipelines
            </span>
            <Link href="/docs/why-aventara">
              Why Aventara? <ArrowRight size={15} />
            </Link>
          </div>
        </section>
        <section
          className="landing-invitation"
          aria-labelledby="invitation-title"
        >
          <div className="landing-invitation-mark" aria-hidden="true">
            <Logo icon />
          </div>
          <span className="landing-kicker">YOUR NEXT PROJECT STARTS HERE</span>
          <h2 id="invitation-title">
            Build the
            <br />
            <span>interesting part.</span>
          </h2>
          <p>Start with a schema. See where it takes you.</p>
          <div className="landing-actions">
            <Button asChild>
              <Link href="/docs/getting-started">
                Create your first API <ArrowRight size={17} />
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/docs/introduction">
                Read the docs <ArrowUpRight size={16} />
              </Link>
            </Button>
          </div>
          <div className="landing-pilot-note">
            <span className="pilot-dot" />
            <p>
              In pilot. Built with your feedback.
              <br />
              <Link href="/docs/roadmap">See what’s next</Link>
              <span> · </span>
              <a href="https://github.com/mhmd-hatem/aventara-docs/issues/new/choose">
                Tell us what you need
              </a>
            </p>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div>
          <Link href="/" aria-label="Aventara home">
            <Logo />
          </Link>
          <p>A connected stack. Room to create.</p>
        </div>
        <nav aria-label="Footer">
          <Link href="/docs/introduction">Documentation</Link>
          <Link href="/docs/changelog">Changelog</Link>
          <a href="https://github.com/mhmd-hatem/aventara-docs">GitHub</a>
          <Link href="/docs/license">License</Link>
        </nav>
        <span>AVENTARA / {AVENTARA_VERSION}</span>
      </footer>
    </div>
  );
}
