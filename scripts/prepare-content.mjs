import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { frontmatter } from "fumadocs-core/content/md/frontmatter";
import GithubSlugger from "github-slugger";
import { resolveContentSource, readContentFiles } from "./content-sources.mjs";

export async function prepareContent({
  registry = "content/products.json",
  output = ".generated",
  root = process.cwd(),
  sourceOptions = {},
} = {}) {
  const products = JSON.parse(await readFile(resolve(root, registry), "utf8"));
  const ids = new Set();
  const exports = [];
  const imports = [];
  const mapping = [];
  const manifest = {};
  const publicProducts = [];
  for (const [i, product] of products.entries()) {
    if (!/^[a-z][a-z0-9-]*$/.test(product.id) || ids.has(product.id))
      throw new Error(`Invalid/duplicate product: ${product.id}`);
    ids.add(product.id);
    const version = product.versions.find(
      (v) => v.version === product.currentVersion,
    );
    if (!version)
      throw new Error(`No source for ${product.id} ${product.currentVersion}`);
    const dir = await resolveContentSource(version.source, {
      root,
      ...sourceOptions,
    });
    const files = await readContentFiles(dir);
    const publicFiles = [];
    const drafts = {};
    const metadata = {};
    for (const file of files) {
      const slug = file.name.replace(/^\d+-/, "").replace(/\.md$/, "");
      const parsed = frontmatter(file.raw);
      metadata[slug] = {
        title: parsed.data.title,
        description: parsed.data.description || "",
      };
      if (/<!--\s*DRAFT\b/i.test(parsed.content)) {
        const slugger = new GithubSlugger();
        const ids = [];
        let fence = false;
        for (const line of parsed.content.split("\n")) {
          if (/^\s*(```|~~~)/.test(line)) fence = !fence;
          if (!fence && /^#{1,6}\s/.test(line))
            ids.push(
              slugger.slug(
                line
                  .replace(/^#+\s+/, "")
                  .replace(/[`*_]/g, "")
                  .trim(),
              ),
            );
        }
        drafts[slug] = { title: parsed.data.title, ids };
      } else publicFiles.push(file.name);
    }
    const listed = [
      ...product.navigation.flatMap((g) => g.items.map((x) => x[0])),
      ...(product.topPages ?? []).map((p) => p.slug),
    ];
    const actual = files.map((f) =>
      f.name.replace(/^\d+-/, "").replace(/\.md$/, ""),
    );
    if (
      new Set(listed).size !== listed.length ||
      listed.length !== actual.length ||
      actual.some((s) => !listed.includes(s))
    )
      throw new Error(
        `Navigation must list every source page exactly once: ${product.id}`,
      );
    const name = `product${i}`;
    exports.push(
      `export const ${name} = defineDocs({ dir: ${JSON.stringify(dir)}, docs: { files: ${JSON.stringify(publicFiles)}, postprocess: { includeProcessedMarkdown: true }, mdxOptions: applyMdxPreset({ remarkPlugins: [[remarkProductLinks, { product: ${JSON.stringify(product.id)} }]] }) } });`,
    );
    imports.push(name);
    mapping.push(`${JSON.stringify(product.id)}: ${name}`);
    manifest[product.id] = { drafts, metadata };
    const published = actual.filter((slug) => !drafts[slug]);
    if (!published.length) throw new Error(`No published pages: ${product.id}`);
    const overviewSlug =
      product.overviewSlug ??
      (published.includes("introduction") ? "introduction" : published[0]);
    const startSlug =
      product.startSlug ??
      (published.includes("getting-started")
        ? "getting-started"
        : overviewSlug);
    for (const slug of [overviewSlug, startSlug]) {
      if (!published.includes(slug))
        throw new Error(`Landing page is not published: ${product.id}/${slug}`);
    }
    publicProducts.push({
      headline: product.name,
      detail: product.description ?? "",
      description: "",
      accent: "iris",
      pitch: {
        eyebrow: "BUILD WITH AVENTARA",
        heroAccent: product.description ?? "",
        storyLabel: "BUILT FOR YOUR APPLICATION",
        storyTitle: `Meet Aventara ${product.name}.`,
        storyBody: product.description ?? "",
        capabilities: (product.features ?? []).map((title, i) => ({
          tag: `0${i + 1} / CAPABILITY`,
          title,
          body: "",
          slug: overviewSlug,
        })),
        workflow: {
          kind: "steps",
          title: "From idea to application.",
          body: product.description ?? "",
          steps: [],
        },
        demo: { label: "EXPLORE", scenarios: [] },
        ctaTitle: `Start building with ${product.name}.`,
        ctaBody: product.description ?? "",
        faq: [],
      },
      features: [],
      install: "",
      statusAnchor: "",
      logo: { light: "", dark: "" },
      theme: { light: {}, dark: {} },
      topPages: [],
      primaryNavigation: product.navigation
        .filter(
          (g, index, groups) =>
            g.items.some(([slug]) => !drafts[slug]) &&
            groups.findIndex(
              (other) =>
                other.section === g.section &&
                other.items.some(([slug]) => !drafts[slug]),
            ) === index,
        )
        .map((g) => ({
          section: g.section,
          title: g.title,
          href: `/docs/${g.items.find(([slug]) => !drafts[slug])[0]}`,
        })),
      ...product,
      overviewSlug,
      startSlug,
      licenseSlug: published.includes("license") ? "license" : "",
      versions: product.versions.map((v) => ({ version: v.version })),
      navigation: product.navigation.map((g) => ({
        ...g,
        items: g.items.map(([slug, title, icon]) => [
          slug,
          metadata[slug]?.title || title,
          icon,
        ]),
      })),
    });
  }
  const out = resolve(root, output);
  await mkdir(out, { recursive: true });
  await writeFile(
    resolve(out, "source.config.ts"),
    `import { defineDocs, applyMdxPreset } from 'fumadocs-mdx/config';\nimport { remarkProductLinks } from ${JSON.stringify(resolve(root, "lib/content-links.mjs"))};\n${exports.join("\n")}\n`,
  );
  await writeFile(
    resolve(out, "collections.ts"),
    `import { ${imports.join(", ")} } from 'collections/server';\nexport const collections = { ${mapping.join(", ")} };\n`,
  );
  await writeFile(
    resolve(out, "products.json"),
    JSON.stringify(publicProducts, null, 2) + "\n",
  );
  await writeFile(
    resolve(out, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    `Prepared ${products.length} product sources; draft bodies excluded.`,
  );
  return manifest;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await prepareContent();
