import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareContent } from "../scripts/prepare-content.mjs";
import { resolveContentSource } from "../scripts/content-sources.mjs";
import { productLink } from "../lib/content-links.mjs";
import { docsRedirects } from "../lib/redirects.mjs";

test("links preserve product boundaries, queries and fragments", () => {
  assert.equal(
    productLink("/docs/error-codes#a2004", "framework"),
    "/framework/docs/error-codes#a2004",
  );
  assert.equal(
    productLink("/docs/rules?from=docs#typed-comparisons", "access"),
    "/access/docs/rules?from=docs#typed-comparisons",
  );
  for (const host of [
    "aventara-framework.vercel.app",
    "aventara-docs.vercel.app",
  ])
    assert.equal(
      productLink(`https://${host}/docs/error-codes#a4002`, "access"),
      "/framework/docs/error-codes#a4002",
    );
  assert.equal(
    productLink(
      "https://aventara.razor34.dev/framework/docs/policies",
      "access",
    ),
    "/framework/docs/policies",
  );
  assert.equal(
    productLink("/access/docs/rules", "framework"),
    "/access/docs/rules",
  );
  assert.equal(productLink("#heading", "access"), "#heading");
  assert.equal(
    productLink("https://example.com/docs/foo", "access"),
    "https://example.com/docs/foo",
  );
});
test("legacy hosts redirect to the canonical framework prefix", () => {
  const rules = docsRedirects([
    {
      id: "framework",
      redirects: [
        { from: "restricting-operations", to: "exposure#operations" },
      ],
    },
  ]);
  assert.equal(rules.filter((r) => r.has).length, 2);
  for (const rule of rules.filter((r) => r.has)) {
    assert.equal(
      rule.destination,
      "https://aventara.razor34.dev/framework/:path*",
    );
    assert.equal(rule.permanent, true);
  }
  assert.ok(
    rules.some(
      (r) =>
        r.source === "/framework/docs/restricting-operations" &&
        r.destination === "/framework/docs/exposure#operations",
    ),
  );
});
test("a third product is content-only and drafts never enter the collection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aventara-product-test-"));
  try {
    const content = join(dir, "docs");
    await mkdir(content);
    await writeFile(
      join(content, "01-introduction.md"),
      "---\ntitle: Fixture\n---\n# Fixture\nHello.",
    );
    await writeFile(
      join(content, "02-draft.md"),
      "---\ntitle: Draft\n---\n<!-- DRAFT: pending review -->\n# Draft\n## Stable Anchor\nSecret draft text.",
    );
    await writeFile(join(content, "_site-notes.md"), "Internal notes");
    const registry = [
      {
        id: "fixture",
        name: "Fixture",
        currentVersion: "0.0.1",
        versions: [
          { version: "0.0.1", source: { kind: "local", path: content } },
        ],
        navigation: [
          {
            title: "Start",
            section: "overview",
            items: [
              ["introduction", "Intro", "code"],
              ["draft", "Draft", "code"],
            ],
          },
        ],
      },
    ];
    const file = join(dir, "products.json");
    await writeFile(file, JSON.stringify(registry));
    const output = join(dir, "generated");
    const manifest = await prepareContent({ registry: file, output });
    const config = await readFile(join(output, "source.config.ts"), "utf8");
    assert.ok(config.includes("01-introduction.md"));
    assert.ok(!config.includes("02-draft.md"));
    assert.ok(!config.includes("_site-notes"));
    assert.deepEqual(manifest.fixture.drafts.draft.ids, [
      "draft",
      "stable-anchor",
    ]);
    const [product] = JSON.parse(
      await readFile(join(output, "products.json"), "utf8"),
    );
    assert.equal(product.startSlug, "introduction");
    assert.equal(product.overviewSlug, "introduction");
    assert.equal(product.licenseSlug, "");
    assert.deepEqual(product.theme, { light: {}, dark: {} });
    assert.deepEqual(product.topPages, []);
    assert.equal(product.primaryNavigation[0].href, "/docs/introduction");
    assert.ok(!JSON.stringify(product).includes(content));
    // An explicit publication hold survives removal of the editorial draft marker.
    registry[0].unpublishedPages = ["draft"];
    await writeFile(file, JSON.stringify(registry));
    await writeFile(
      join(content, "02-draft.md"),
      "---\ntitle: Draft\n---\n# Draft\n## Stable Anchor\nStill awaiting approval.",
    );
    const held = await prepareContent({ registry: file, output });
    assert.ok(held.fixture.drafts.draft);
    assert.ok(
      !(await readFile(join(output, "source.config.ts"), "utf8")).includes(
        "02-draft.md",
      ),
    );

    assert.ok(
      (await readFile(join(output, "collections.ts"), "utf8")).includes(
        '"fixture": product0',
      ),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("GitHub source uses repo/ref/path and reads only numbered documents", async () => {
  const calls = [];
  const source = {
    kind: "github",
    repo: "test/docs",
    ref: "release/1",
    path: "docs",
    tokenEnv: "TEST_TOKEN",
  };
  const dir = await resolveContentSource(source, {
    env: { TEST_TOKEN: "fixture-token" },
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => [
          { name: "01-introduction.md", type: "file" },
          { name: "README.md", type: "file" },
        ],
        text: async () => "# Fixture",
      };
    },
  });
  try {
    assert.equal(
      await readFile(join(dir, "01-introduction.md"), "utf8"),
      "# Fixture",
    );
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.url.includes("ref=release%2F1")));
    assert.equal(
      calls[0].options.headers.Authorization,
      "Bearer fixture-token",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
