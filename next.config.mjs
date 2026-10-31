import { createMDX } from "fumadocs-mdx/next";
import { readFileSync } from "node:fs";
import { indexingEnabled } from "./lib/indexing.mjs";
import { docsRedirects } from "./lib/redirects.mjs";
const products = JSON.parse(
  readFileSync(new URL("./content/products.json", import.meta.url), "utf8"),
);
const withMDX = createMDX();
export default withMDX({
  reactStrictMode: true,
  devIndicators: false,
  async headers() {
    return indexingEnabled()
      ? []
      : [
          {
            source: "/:path*",
            headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
          },
        ];
  },
  async redirects() {
    return docsRedirects(products);
  },
});
