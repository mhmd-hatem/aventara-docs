import { createMDX } from "fumadocs-mdx/next";
import { readFileSync } from "node:fs";
import { docsRedirects } from "./lib/redirects.mjs";
const products = JSON.parse(
  readFileSync(new URL("./content/products.json", import.meta.url), "utf8"),
);
const withMDX = createMDX();
export default withMDX({
  reactStrictMode: true,
  devIndicators: false,
  async headers() {
    return process.env.AVENTARA_INDEXING === "enabled"
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
