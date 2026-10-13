import { createMDX } from "fumadocs-mdx/next";
const withMDX = createMDX();
export default withMDX({
  reactStrictMode: true,
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/docs/restricting-operations",
        destination: "/docs/exposure#operations",
        permanent: true,
      },
    ];
  },
});
