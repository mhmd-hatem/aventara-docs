import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const products = JSON.parse(
  readFileSync(new URL("../content/products.json", import.meta.url), "utf8"),
);
const manifest = JSON.parse(
  readFileSync(new URL("../.generated/manifest.json", import.meta.url), "utf8"),
);
for (const product of products)
  test(`${product.id}: every source page occurs once in its navigation`, () => {
    const slugs = [
      ...product.navigation.flatMap((g) => g.items.map(([slug]) => slug)),
      ...product.topPages.map((p) => p.slug),
    ];
    assert.equal(new Set(slugs).size, slugs.length);
    assert.deepEqual(
      slugs.sort(),
      Object.keys(manifest[product.id].metadata).sort(),
    );
    assert.ok(
      product.versions.find((v) => v.version === product.currentVersion),
    );
  });
test("AI guide is top navigation; policies remains a draft", () => {
  const framework = products.find((p) => p.id === "framework");
  assert.ok(framework.topPages.some((p) => p.slug === "ai-agents"));
  assert.ok(
    !framework.navigation.some((g) =>
      g.items.some(([slug]) => slug === "ai-agents"),
    ),
  );
  assert.ok(
    manifest.framework.drafts.policies.ids.includes("an-access-provider"),
  );
});
