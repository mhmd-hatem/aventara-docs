import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Compass,
  Clock3,
} from "lucide-react";
import { getSource, getDrafts, publishedPages } from "@/lib/source";
import { getProduct, products } from "@/lib/products";
import { productLink } from "@/lib/content-links.mjs";
import { CodeBlock } from "@/components/code-block";
import { TableOfContents } from "@/components/table-of-contents";
import { IntroductionCode } from "@/components/introduction-code";
import type { MDXComponents } from "mdx/types";
type Params = Promise<{ product: string; slug?: string[] }>;
export default async function DocsPage({ params }: { params: Params }) {
  const { product: id, slug } = await params;
  const product = getProduct(id);
  if (!product) notFound();
  if (!slug?.length) redirect(`/${id}/docs/${product.overviewSlug}`);
  const source = getSource(id)!;
  const page = source.getPage(slug);
  const draft = slug.length === 1 ? getDrafts(id)[slug[0]] : undefined;
  if (!page && !draft) notFound();
  if (draft)
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="main-content article-page"
      >
        <header className="article-header">
          <span className="eyebrow">
            <Clock3 size={16} /> Under review
          </span>
          <h1>{draft.title}</h1>
          <p>
            This guide is awaiting maintainer review. Its draft is not
            published.
          </p>
        </header>
        <div className="prose">
          <p>
            Explore the published{" "}
            <Link href={`/${id}/docs/${product.overviewSlug}`}>
              {product.name} overview
            </Link>{" "}
            while this guide is being reviewed.
          </p>
        </div>
        {draft.ids.map((anchor) => (
          <span id={anchor} key={anchor} className="heading-anchor" />
        ))}
      </main>
    );
  if (!page) notFound();
  const sequence = publishedPages(product).filter(
    (p) => (p.section === "ai") === (slug[0] === "ai-agents"),
  );
  const index = sequence.findIndex((p) => p.slug === slug[0]);
  const current = sequence[index],
    prev = sequence[index - 1],
    next = sequence[index + 1];
  const MDX = page.data.body;
  const components: MDXComponents = {
    h1: ({ id }) => <span id={id} className="heading-anchor" />,
    pre:
      id === "framework" && slug[0] === "introduction"
        ? IntroductionCode
        : CodeBlock,
    a: ({ href, ...props }) => <a href={productLink(href, id)} {...props} />,
    table: (props) => (
      <div className="table-scroll">
        <table {...props} />
      </div>
    ),
  };
  return (
    <main id="main-content" tabIndex={-1} className="main-content article-page">
      <div className="breadcrumb">
        <Compass size={14} />
        <Link href={`/${id}`}>{product.name}</Link>
        <ChevronRight size={12} />
        <span>{current?.group ?? "Documentation"}</span>
        <ChevronRight size={12} />
        <span className="breadcrumb-current">{page.data.title}</span>
        <span className="breadcrumb-version">v{product.currentVersion}</span>
      </div>
      <header className="article-header">
        <span className="eyebrow">
          <span className="eyebrow-line" />
          {current?.group}
        </span>
        <h1>{page.data.title}</h1>
        <p>{page.data.description}</p>
        <a
          className="article-markdown-link"
          href={`/${id}/markdown/${slug[0]}`}
        >
          Read as Markdown <ArrowRight size={13} />
        </a>
      </header>
      <div className="reading-layout">
        <div className="reading-main">
          <article className="prose">
            <MDX components={components} />
          </article>
          <div className="page-pagination">
            {prev ? (
              <Link href={`/${id}/docs/${prev.slug}`}>
                <span>
                  <ArrowLeft size={13} /> Previous
                </span>
                <strong>{prev.title}</strong>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/${id}/docs/${next.slug}`}>
                <span>
                  Up next <ArrowRight size={13} />
                </span>
                <strong>{next.title}</strong>
              </Link>
            )}
          </div>
        </div>
        <TableOfContents
          items={page.data.toc}
          maxDepth={slug[0] === "error-codes" ? 4 : 3}
        />
      </div>
    </main>
  );
}
export function generateStaticParams() {
  return products.flatMap((p) => [
    { product: p.id, slug: [] },
    ...getSource(p.id)!
      .generateParams()
      .map((params) => ({ ...params, product: p.id })),
    ...Object.keys(getDrafts(p.id)).map((slug) => ({
      product: p.id,
      slug: [slug],
    })),
  ]);
}
export async function generateMetadata({ params }: { params: Params }) {
  const { product: id, slug } = await params;
  const product = getProduct(id);
  const page = getSource(id)?.getPage(slug);
  const draft = slug?.length === 1 ? getDrafts(id)[slug[0]] : undefined;
  return {
    title: `${page?.data.title ?? draft?.title ?? "Documentation"} · ${product?.name ?? "Aventara"}`,
    description: page?.data.description,
    ...(draft ? { robots: { index: false, follow: false } } : {}),
    alternates: {
      canonical: `/${id}/docs/${slug?.join("/") || product?.overviewSlug || "introduction"}`,
    },
  };
}
