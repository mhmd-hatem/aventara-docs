import assert from "node:assert/strict";
import { readdir, readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

// Validate built artifacts and invoke compiled handlers in-process: no server or browser needed.
const root = resolve(".next/server/app");
const products = JSON.parse(await readFile(".generated/products.json", "utf8"));
const manifest = JSON.parse(await readFile(".generated/manifest.json", "utf8"));
async function walk(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : join(dir, e.name),
      ),
    )
  ).flat();
}
const files = await walk(root);
const decode = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x([\da-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const pages = new Map();
for (const file of files.filter((f) => f.endsWith(".html"))) {
  const path = file.slice(root.length, -5).replace(/\/index$/, "/") || "/";
  const html = await readFile(file, "utf8");
  pages.set(path, {
    html,
    ids: new Set(
      [...html.matchAll(/\bid="([^"]*)"/g)].map((m) => decode(m[1])),
    ),
    links: [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) =>
      decode(m[1]),
    ),
  });
}
let links = 0,
  anchors = 0;
const failures = [];
for (const [from, page] of pages)
  for (const href of page.links) {
    const url = new URL(href, `https://aventara.razor34.dev${from}`);
    if (url.origin !== "https://aventara.razor34.dev") continue;
    links++;
    let path = decodeURIComponent(url.pathname).replace(/\/$/, "") || "/";
    if (path === "/docs" || path.startsWith("/docs/"))
      path = "/framework" + path;
    for (const p of products) {
      if (path === `/${p.id}/docs`) path += `/${p.overviewSlug}`;
      const redirect = p.redirects?.find(
        (r) => path === `/${p.id}/docs/${r.from}`,
      );
      if (redirect) {
        const [slug, hash] = redirect.to.split("#");
        path = `/${p.id}/docs/${slug}`;
        if (hash) url.hash = hash;
      }
    }
    const target = pages.get(path);
    if (target) {
      if (url.hash) {
        anchors++;
        if (!target.ids.has(decodeURIComponent(url.hash.slice(1))))
          failures.push(`${from}: missing anchor ${path}${url.hash}`);
      }
    } else {
      try {
        await access(root + path + ".body");
      } catch {
        try {
          await access(resolve("public", "." + path));
        } catch {
          failures.push(`${from}: missing target ${path}`);
        }
      }
    }
  }
assert.deepEqual(failures, [], failures.slice(0, 20).join("\n"));
console.log(
  `${pages.size} rendered pages: ${links} internal links, ${anchors} anchors, zero broken.`,
);

const require = createRequire(import.meta.url);
async function handler(path) {
  const mod = await require(join(root, path, "route.js"));
  await mod.routeModule.ensureUserland();
  return mod.routeModule.userland.GET;
}
const search = await handler("[product]/api/search");
const raw = await handler("[product]/markdown/[slug]");
for (const p of products) {
  const full = await readFile(join(root, p.id, "llms-full.txt.body"), "utf8");
  const index = await readFile(join(root, p.id, "llms.txt.body"), "utf8");
  for (const slug of Object.keys(manifest[p.id].metadata)) {
    const draft = manifest[p.id].drafts[slug];
    if (draft) {
      assert.ok(!index.includes(`/${p.id}/markdown/${slug}`));
      assert.ok(
        !full.includes(
          `Source: [${manifest[p.id].drafts[slug].title}](/${p.id}/docs/${slug})`,
        ),
      );
      const response = await raw(new Request("https://docs.test/"), {
        params: Promise.resolve({ product: p.id, slug }),
      });
      assert.equal(
        response.status,
        404,
        `${p.id}/${slug} raw draft must not be served`,
      );
      assert.match(
        pages.get(`/${p.id}/docs/${slug}`).html,
        /name="robots" content="noindex, nofollow"/,
      );
    } else {
      assert.ok(
        index.includes(`/${p.id}/markdown/${slug}`),
        `${slug} missing from index`,
      );
      const markdown = await readFile(
        join(root, p.id, "markdown", slug + ".body"),
        "utf8",
      );
      assert.ok(markdown.length > 0);
      assert.ok(
        full.includes(markdown.trim()),
        `${slug} missing from full export`,
      );
    }
  }
  // Error names and plain-language message text must be searchable, without cross-product results.
  const queries =
    p.id === "framework"
      ? ["A2004", "CONFIG_REQUIRED", "Required property"]
      : ["ACCESS_OPTIONS_INVALID", "missing"];
  for (const query of queries) {
    const response = await search(
      new Request(
        `https://docs.test/${p.id}/api/search?query=${encodeURIComponent(query)}`,
      ),
      { params: Promise.resolve({ product: p.id }) },
    );
    assert.equal(response.status, 200);
    const results = await response.json();
    assert.ok(results.length, `No ${p.id} results for ${query}`);
    assert.ok(
      results.every((r) => r.url.startsWith(`/${p.id}/docs/`)),
      `${p.id} search leaked another product`,
    );
    assert.ok(
      results.every(
        (r) =>
          !Object.keys(manifest[p.id].drafts).some(
            (s) => r.url.split("#")[0] === `/${p.id}/docs/${s}`,
          ),
      ),
      "Draft present in search",
    );
    if (query === "A2004")
      assert.ok(
        results.some((r) => r.url === "/framework/docs/error-codes#a2004"),
        "Error code heading not findable",
      );
  }
  console.log(
    `${p.name}: Markdown exports complete; drafts excluded; search scoped and error queries passed.`,
  );
}
assert.equal(
  (
    await search(new Request("https://docs.test/?query=test"), {
      params: Promise.resolve({ product: "unknown" }),
    })
  ).status,
  404,
);
const errorSource = await readFile(
  "aventara-docs-content/47-error-codes.md",
  "utf8",
);
const codeHeadings = [
  ...errorSource.matchAll(/^#{2,6}\s+`([A-Z][A-Z0-9_]+)`\s*$/gm),
].map((m) => m[1].toLowerCase());
for (const code of codeHeadings)
  assert.ok(
    pages.get("/framework/docs/error-codes").ids.has(code),
    `Missing error anchor ${code}`,
  );
console.log(`${codeHeadings.length} published error-code anchors preserved.`);
const routes = JSON.parse(await readFile(".next/routes-manifest.json", "utf8"));
for (const host of [
  "aventara-framework.vercel.app",
  "aventara-docs.vercel.app",
])
  assert.ok(
    routes.redirects.some(
      (r) =>
        r.has?.some((h) => h.type === "host" && h.value === host) &&
        r.destination === "https://aventara.razor34.dev/framework/:path*" &&
        r.statusCode === 308,
    ),
  );
console.log("Both legacy-host redirects are present in the production build.");
