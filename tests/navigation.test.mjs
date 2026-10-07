import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { pages, primarySection } from "../lib/navigation.ts";

test("every published source page appears once in navigation", () => {
  const sourceSlugs = readdirSync(
    new URL("../aventara-docs-content/", import.meta.url),
  )
    .filter((file) => /^\d+-.*\.md$/.test(file))
    .map((file) => file.replace(/^\d+-/, "").replace(/\.md$/, ""))
    .sort();
  const navigationSlugs = pages.map((page) => page.slug);
  assert.equal(new Set(navigationSlugs).size, navigationSlugs.length);
  assert.deepEqual([...navigationSlugs].sort(), sourceSlugs);
});

test("new guides and references select the appropriate primary navigation", () => {
  assert.equal(primarySection("/docs/computed-fields"), "guides");
  assert.equal(primarySection("/docs/client-api-reference"), "reference");
  assert.equal(primarySection("/docs/contract-layers"), "overview");
});
