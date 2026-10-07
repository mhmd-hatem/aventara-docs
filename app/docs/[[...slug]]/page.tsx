import { AVENTARA_VERSION } from "@/lib/release";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, Compass } from "lucide-react";
import { source } from "@/lib/source";
import { pages } from "@/lib/navigation";
import { QuickstartLab } from "@/components/quickstart-lab";
import { QueryPlayground } from "@/components/query-playground";
import { TransactionLab } from "@/components/transaction-lab";
import { Overview } from "@/components/overview";
import { CodeBlock } from "@/components/code-block";
import { IntroductionCode } from "@/components/introduction-code";
import { TableOfContents } from "@/components/table-of-contents";
import type { MDXComponents } from "mdx/types";
const components: MDXComponents = {
  h1: ({ id }) => <span id={id} className="heading-anchor" />,
  pre: CodeBlock,
  a: ({ href, children, ...props }) => {
    const url =
      href && !/^(https?:|mailto:|#|\/)/.test(href) ? `/docs/${href}` : href;
    return (
      <a
        href={url}
        {...props}
        className={
          url === "https://github.com/mhmd-hatem/aventara-docs/issues/new/choose"
            ? "button button-primary"
            : props.className
        }
      >
        {children}
      </a>
    );
  },
  table: (props) => (
    <div className="table-scroll">
      <table {...props} />
    </div>
  ),
};
export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  if (!slug) redirect("/docs/introduction");
  const page = source.getPage(slug);
  if (!page) notFound();
  const MDX = page.data.body;
  const currentIndex = pages.findIndex((p) => p.slug === slug[0]);
  const current = pages[currentIndex];
  const prev = pages[currentIndex - 1];
  const next = pages[currentIndex + 1];
  const intro = slug[0] === "introduction";
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={
        intro ? "main-content overview-page" : "main-content article-page"
      }
    >
      <div className="breadcrumb">
        <Compass size={14} />
        <ChevronRight size={12} />
        <span>{current?.group ?? "Documentation"}</span>
        <ChevronRight size={12} />
        <span className="breadcrumb-current">{page.data.title}</span>
        <span className="breadcrumb-version">v{AVENTARA_VERSION}</span>
      </div>
      {intro ? (
        <Overview />
      ) : (
        <header className="article-header">
          <span className="eyebrow">
            <span className="eyebrow-line" />
            {current?.group.toUpperCase()}
          </span>
          <h1>
            {slug[0] === "getting-started" ? (
              <>
                Your first API.
                <br />
                <span>Closer than you think.</span>
              </>
            ) : (
              page.data.title
            )}
          </h1>
          <p>{page.data.description}</p>
        </header>
      )}
      {slug[0] === "getting-started" && <QuickstartLab />}
      {slug[0] === "querying" && <QueryPlayground compact />}
      {slug[0] === "transactions" && <TransactionLab />}
      <div className="reading-layout">
        <div className="reading-main">
          {intro && (
            <div className="section-heading overview-section-title">
              <div>
                <span className="section-index">THE FRAMEWORK, EXPLAINED</span>
                <h2>Get to know Aventara.</h2>
              </div>
            </div>
          )}
          <article className="prose">
            <MDX
              components={
                intro ? { ...components, pre: IntroductionCode } : components
              }
            />
          </article>
          <div className="page-pagination">
            {prev ? (
              <Link href={`/docs/${prev.slug}`}>
                <span>
                  <ArrowLeft size={13} /> Previous
                </span>
                <strong>{prev.title}</strong>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/docs/${next.slug}`}>
                <span>
                  Up next <ArrowRight size={13} />
                </span>
                <strong>{next.title}</strong>
              </Link>
            )}
          </div>
        </div>
        <TableOfContents items={page.data.toc} />
      </div>
    </main>
  );
}
export function generateStaticParams() {
  return source.generateParams();
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = source.getPage(slug);
  return {
    title: page?.data.title ?? "Documentation",
    description: page?.data.description,
  };
}
