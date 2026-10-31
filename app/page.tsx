import { ProductMark } from "@/components/product-mark";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Database,
  Braces,
  ShieldCheck,
  Fingerprint,
  Layers3,
} from "lucide-react";
import { ProductHeader } from "@/components/product-header";
import { SiteFooter } from "@/components/site-footer";
import { SchemaShowcase } from "@/components/landing-interactions";
import { Architecture } from "@/components/architecture";
import { CopyButton } from "@/components/code-block";
import { products } from "@/lib/products";
import { productTheme } from "@/lib/product-theme";
import "./landing.css";
export const metadata: Metadata = {
  title: { absolute: "Aventara — Your schema is the API." },
  description:
    "From your Prisma schema to a typed API and frontend client. Add schema-typed, per-row and per-field authorization with Aventara Access.",
  alternates: { canonical: "/" },
};
export default function Home() {
  return (
    <div className="unified-home">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <ProductHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="unified-hero" aria-labelledby="hero-title">
          <div className="unified-hero-grid" aria-hidden="true" />
          <div className="unified-hero-copy">
            <span className="unified-eyebrow">
              <span className="pilot-dot" /> THE AVENTARA STACK{" "}
              <span>/ RELEASE CANDIDATE</span>
            </span>
            <h1 id="hero-title">
              Your schema.
              <br />
              <span>Your API.</span>
              <span className="hero-period" aria-hidden="true">
                ↗
              </span>
            </h1>
            <p>
              From a Prisma schema and one configuration object to a typed HTTP
              API and a typed frontend client. Keep your data model. Skip the
              controllers.
            </p>
            <div className="unified-hero-actions">
              <Link className="button button-primary" href="/framework">
                Framework docs <ArrowRight size={17} />
              </Link>
              <Link className="button button-secondary" href="/access">
                Access docs <ArrowRight size={17} />
              </Link>
            </div>
            <div className="hero-foundations">
              <span>
                <Braces size={15} /> TypeScript
              </span>
              <span>
                <Database size={15} /> Prisma
              </span>
              <span>
                <Layers3 size={15} /> NestJS / Next.js
              </span>
            </div>
          </div>
          <SchemaShowcase />
          <div className="hero-baseline">
            <span>LESS REPETITION. MORE APPLICATION.</span>
            <a href="#products">
              Find your starting point <span>↓</span>
            </a>
          </div>
        </section>
        <section
          className="unified-products unified-section"
          id="products"
          aria-labelledby="products-title"
        >
          <div className="unified-section-heading">
            <span className="unified-eyebrow">01 / THE BUILDING BLOCKS</span>
            <h2 id="products-title">
              A shared foundation.
              <br />
              <span>Clear responsibilities.</span>
            </h2>
            <p>
              The framework builds your API. Access adds authorization when you
              need it. Start with the part your application needs.
            </p>
          </div>
          <div className="product-card-grid">
            {products.map((p, i) => (
              <article key={p.id} className={`product-card ${p.accent}`}>
                <div className="product-card-top">
                  <ProductMark product={p} />
                  <span className="product-release">
                    {p.currentVersion}
                    <span>Release candidate</span>
                  </span>
                  <span className="product-number">0{i + 1}</span>
                </div>
                <h3>
                  <Link href={`/${p.id}`}>
                    {p.name}
                    <ArrowUpRight size={28} />
                  </Link>
                </h3>
                <p>{p.description}</p>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}>
                      <Check size={15} />
                      {f}
                    </li>
                  ))}
                </ul>
                {p.install && (
                  <div className="product-install">
                    <code>{p.install}</code>
                    <CopyButton value={p.install} />
                  </div>
                )}
                <Link className="product-card-link" href={`/${p.id}`}>
                  Explore {p.name}
                  <ArrowRight size={18} />
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section
          className="unified-system unified-section"
          id="connected"
          aria-labelledby="system-title"
        >
          <div className="unified-section-heading">
            <span className="unified-eyebrow">02 / ONE SOURCE OF TRUTH</span>
            <h2 id="system-title">
              Keep the shape.
              <br />
              <span>Connect the layers.</span>
            </h2>
            <p>
              Your schema and configuration compile into contracts: the
              resources, fields and operations your API supports. Your host
              serves that contract. Your frontend gets a client generated from
              it.
            </p>
          </div>
          <div className="unified-system-diagram">
            <Architecture />
            <div className="system-footnote">
              <span>YOUR ORM STAYS YOURS</span>
              <p>
                Aventara extends Prisma. Your schema, Prisma client and
                migrations remain in your application.
              </p>
              <Link href="/framework/docs/concepts">
                Understand the contracts <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
        </section>
        <section
          className="unified-access unified-section"
          aria-labelledby="access-title"
        >
          <div className="unified-section-heading">
            <span className="unified-eyebrow">
              03 / A PLACE FOR EVERY DECISION
            </span>
            <h2 id="access-title">
              Identity meets
              <br />
              <span>permission.</span>
            </h2>
            <p>
              Access is optional. Better Auth signs users in and issues
              credentials. Access decides what those users may do. The framework
              enforces the decision and runs the operation.
            </p>
          </div>
          <div className="responsibility-flow">
            <article>
              <Fingerprint />
              <span>01 / IDENTITY</span>
              <h3>Better Auth</h3>
              <p>Who is making the request?</p>
              <small>Sessions · tokens · sign-in</small>
            </article>
            <ArrowRight className="flow-arrow" />
            <article className="responsibility-access">
              <ShieldCheck />
              <span>02 / AUTHORIZATION</span>
              <h3>Access</h3>
              <p>Which rows and fields may they use?</p>
              <small>Typed rules · grants · denies</small>
            </article>
            <ArrowRight className="flow-arrow" />
            <article>
              <Database />
              <span>03 / EXECUTION</span>
              <h3>Framework</h3>
              <p>Validate and run the operation.</p>
              <small>Contracts · pipelines · your data</small>
            </article>
          </div>
          <Link
            className="unified-inline-link"
            href="/access/docs/introduction"
          >
            See how Access fits <ArrowRight size={16} />
          </Link>
        </section>
        <section className="unified-start unified-section">
          <span className="unified-eyebrow">BUILD SOMETHING THAT IS YOURS</span>
          <h2>
            A schema is a<br />
            <span>good place to start.</span>
          </h2>
          <div className="unified-hero-actions">
            <Link
              className="button button-primary"
              href="/framework/docs/getting-started"
            >
              Build your first API <ArrowRight size={17} />
            </Link>
            <Link
              className="button authorization-cta"
              style={productTheme(products.find((p) => p.id === "access")!)}
              href="/access/docs/getting-started"
            >
              Add authorization <ArrowRight size={16} />
            </Link>
          </div>
          <p>
            Both products are release candidates. APIs may change before a
            stable release. Pin versions and read the upgrade guidance.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
