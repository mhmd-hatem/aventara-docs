import { productTheme } from "@/lib/product-theme";
import { ProductMark } from "@/components/product-mark";
import { ProductPitchDemo } from "@/components/product-pitch-demo";
import { Architecture } from "@/components/architecture";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { products, getProduct } from "@/lib/products";
import { ProductHeader } from "@/components/product-header";
import { SiteFooter } from "@/components/site-footer";
import { CopyButton } from "@/components/code-block";
import "@/app/landing.css";
import "@/app/product-pitch.css";
export function generateStaticParams() {
  return products.map((p) => ({ product: p.id }));
}
export const dynamicParams = false;
export async function generateMetadata({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  const { product } = await params;
  const p = getProduct(product);
  return {
    title: p?.name,
    description: p?.description,
    alternates: { canonical: `/${product}` },
  };
}
export default async function ProductHome({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  const { product: id } = await params;
  const p = getProduct(id);
  if (!p) notFound();
  const pitch = p.pitch;
  const installationSlug = p.navigation.some((g) =>
    g.items.some(([slug]) => slug === "installation"),
  )
    ? "installation"
    : p.overviewSlug;
  return (
    <div
      className={`product-home product-pitch product-scope ${p.accent}`}
      style={productTheme(p)}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <ProductHeader current={id} />
      <main id="main-content" tabIndex={-1}>
        <section
          className="pitch-hero unified-section"
          aria-labelledby="product-title"
        >
          <div className="pitch-hero-copy">
            <div className="pitch-product-identity">
              <ProductMark product={p} />
              <span>
                Aventara <strong>{p.name}</strong>
              </span>
              <span className="pitch-version">{p.currentVersion} · RC</span>
            </div>
            <span className="unified-eyebrow">{pitch.eyebrow}</span>
            <h1 id="product-title">
              {p.headline}
              <span>{pitch.heroAccent}</span>
            </h1>
            <p>{p.detail}</p>
            <div className="unified-hero-actions">
              <Link
                className="button button-primary"
                href={`/${id}/docs/${p.startSlug}`}
              >
                Start building <ArrowRight size={17} />
              </Link>
              <a className="button button-secondary" href="#possibilities">
                Explore {p.name} <ArrowDownIcon />
              </a>
            </div>
            <div className="pitch-hero-notes">
              <span className="pilot-dot" />
              Release candidate<span>·</span>
              <Link href={`/${id}/docs/${p.overviewSlug}`}>
                Read the documentation <ArrowUpRight size={12} />
              </Link>
            </div>
          </div>
          <ProductPitchDemo demo={pitch.demo} />
        </section>
        <div className="pitch-feature-ribbon" aria-label="Key capabilities">
          {p.features.map((f) => (
            <span key={f}>
              <Check size={14} />
              {f}
            </span>
          ))}
        </div>
        <section className="unified-section pitch-story" id="possibilities">
          <div className="pitch-story-intro">
            <span className="unified-eyebrow">{pitch.storyLabel}</span>
            <h2>{pitch.storyTitle}</h2>
            <p>{pitch.storyBody}</p>
          </div>
          <div className="pitch-capabilities">
            {pitch.capabilities.map((feature, i) => (
              <Link
                className="pitch-capability"
                href={`/${id}/docs/${feature.slug}`}
                key={feature.title}
              >
                <div className="pitch-capability-top">
                  <span>{feature.tag}</span>
                  <ArrowUpRight size={19} />
                </div>
                <div
                  className={`pitch-miniature miniature-${i % 4}`}
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                  <i />
                  <b />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
                <span className="pitch-capability-link">
                  Explore the guide <ArrowRight size={14} />
                </span>
              </Link>
            ))}
          </div>
        </section>
        <section className="unified-section pitch-workflow" id="how-it-works">
          <div className="unified-section-heading">
            <span className="unified-eyebrow">THE BIG PICTURE</span>
            <h2>{pitch.workflow.title}</h2>
            <p>{pitch.workflow.body}</p>
          </div>
          {pitch.workflow.kind === "architecture" ? (
            <Architecture />
          ) : (
            <div className="pitch-decision-flow">
              <div className="pitch-decision-core">
                <div className="pitch-core-orbit" />
                <ProductMark product={p} />
                <strong>Aventara {p.name}</strong>
                <span>Every decision follows your rules.</span>
              </div>
              <div className="pitch-decision-steps">
                {pitch.workflow.steps.map((step, i) => (
                  <article key={step.title}>
                    <span className="pitch-step-number">0{i + 1}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                    <ShieldCheck size={18} />
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
        <section className="unified-section pitch-start-section">
          <div className="pitch-install-copy">
            <span className="unified-eyebrow">MAKE IT YOURS</span>
            <h2>{pitch.ctaTitle}</h2>
            <p>{pitch.ctaBody}</p>
            <Link
              className="button button-primary"
              href={`/${id}/docs/${p.startSlug}`}
            >
              Build with {p.name} <ArrowRight size={17} />
            </Link>
          </div>
          <aside className="pitch-install-card">
            <div className="pitch-file-label">
              <span className="pilot-dot" />
              YOUR NEXT PROJECT
            </div>
            <ProductMark product={p} />
            <h3>
              A little setup.
              <br />A lot to build on.
            </h3>
            {p.install && (
              <div className="product-install">
                <code>{p.install}</code>
                <CopyButton value={p.install} />
              </div>
            )}
            <Link href={`/${id}/docs/${installationSlug}`}>
              Installation & requirements <ArrowUpRight size={14} />
            </Link>
          </aside>
        </section>
        {!!pitch.faq.length && (
          <section className="unified-section pitch-faq">
            <div>
              <span className="unified-eyebrow">A FEW GOOD QUESTIONS</span>
              <h2>
                Before you
                <br />
                start building.
              </h2>
              <Link
                className="unified-inline-link"
                href={`/${id}/docs/${p.overviewSlug}`}
              >
                Inside the documentation <ArrowRight size={15} />
              </Link>
            </div>
            <div>
              {pitch.faq.map((item) => (
                <details key={item.question}>
                  <summary>
                    {item.question}
                    <Plus size={17} />
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
        <div className="pitch-bottom-links">
          <Link href={`/${id}/docs/${p.overviewSlug}`}>
            Explore the documentation <ArrowUpRight size={14} />
          </Link>
          <Link href={`/${id}/llms.txt`}>
            Docs for your tools <ArrowUpRight size={14} />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
function ArrowDownIcon() {
  return <ArrowRight size={16} style={{ transform: "rotate(90deg)" }} />;
}
