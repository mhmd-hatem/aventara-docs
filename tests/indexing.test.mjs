import test from "node:test";
import assert from "node:assert/strict";
import { indexingEnabled } from "../lib/indexing.mjs";
test("production launch is indexable; local and previews remain excluded", () => {
  assert.equal(indexingEnabled({ VERCEL_ENV: "production" }), true);
  assert.equal(
    indexingEnabled({ VERCEL_ENV: "production", AVENTARA_INDEXING: "enabled" }),
    true,
  );
  assert.equal(
    indexingEnabled({
      VERCEL_ENV: "production",
      AVENTARA_INDEXING: "disabled",
    }),
    false,
  );
  assert.equal(
    indexingEnabled({ VERCEL_ENV: "preview", AVENTARA_INDEXING: "enabled" }),
    false,
  );
  assert.equal(indexingEnabled({ AVENTARA_INDEXING: "enabled" }), false);
});
